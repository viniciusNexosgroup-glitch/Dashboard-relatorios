import axios from 'axios'
import { prisma } from './prisma'

const GOOGLE_API_BASE = 'https://googleads.googleapis.com/v20'

export async function getGoogleAdsAccessToken(refreshToken: string): Promise<string> {
  const res = await axios.post('https://oauth2.googleapis.com/token', {
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  })
  return res.data.access_token
}

export async function syncGoogleAccount(adAccountId: string) {
  const account = await prisma.adAccount.findUnique({ where: { id: adAccountId } })
  if (!account || !account.refreshToken) throw new Error('Conta Google Ads não encontrada')

  const accessToken = await getGoogleAdsAccessToken(account.refreshToken)
  const customerId = account.accountId.replace(/-/g, '')

  const syncLog = await prisma.syncLog.create({
    data: { adAccountId, status: 'RUNNING' },
  })

  try {
    const query = `
      SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        metrics.cost_micros,
        metrics.impressions,
        metrics.clicks,
        metrics.ctr,
        metrics.average_cpc,
        metrics.average_cpm,
        metrics.conversions,
        metrics.conversions_value,
        metrics.cost_per_conversion,
        metrics.conversion_rate,
        segments.date
      FROM campaign
      WHERE segments.date DURING LAST_30_DAYS
        AND campaign.status != 'REMOVED'
      ORDER BY segments.date DESC
    `

    const res = await axios.post(
      `${GOOGLE_API_BASE}/customers/${customerId}/googleAds:search`,
      { query },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'developer-token': process.env.GOOGLE_DEVELOPER_TOKEN,
          ...(process.env.GOOGLE_MANAGER_CUSTOMER_ID && {
            'login-customer-id': process.env.GOOGLE_MANAGER_CUSTOMER_ID,
          }),
        },
      }
    )

    const rows = res.data.results || []
    let recordsSynced = 0

    for (const row of rows) {
      const campaign = row.campaign
      const metrics = row.metrics
      const date = new Date(row.segments.date)

      const dbCampaign = await prisma.campaign.upsert({
        where: { adAccountId_externalId: { adAccountId, externalId: String(campaign.id) } },
        update: { name: campaign.name, status: campaign.status },
        create: {
          adAccountId,
          externalId: String(campaign.id),
          name: campaign.name,
          status: campaign.status,
        },
      })

      const spend = (metrics.costMicros || 0) / 1_000_000
      const clicks = metrics.clicks || 0
      const conversions = metrics.conversions || 0
      const roas =
        metrics.conversionsValue && spend > 0 ? metrics.conversionsValue / spend : null

      await prisma.dailyMetric.upsert({
        where: { id: `${dbCampaign.id}-${row.segments.date}` },
        update: {
          spend,
          impressions: metrics.impressions || 0,
          clicks,
          ctr: (metrics.ctr || 0) * 100,
          cpc: (metrics.averageCpc || 0) / 1_000_000,
          cpm: (metrics.averageCpm || 0) / 1_000_000,
          conversions,
          costPerConv: (metrics.costPerConversion || 0) / 1_000_000,
          convRate: (metrics.conversionRate || 0) * 100,
          roas,
        },
        create: {
          id: `${dbCampaign.id}-${row.segments.date}`,
          campaignId: dbCampaign.id,
          date,
          spend,
          impressions: metrics.impressions || 0,
          clicks,
          ctr: (metrics.ctr || 0) * 100,
          cpc: (metrics.averageCpc || 0) / 1_000_000,
          cpm: (metrics.averageCpm || 0) / 1_000_000,
          conversions,
          costPerConv: (metrics.costPerConversion || 0) / 1_000_000,
          convRate: (metrics.conversionRate || 0) * 100,
          roas,
        },
      })
      recordsSynced++
    }

    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: { status: 'SUCCESS', recordsSynced, finishedAt: new Date() },
    })

    return { success: true, recordsSynced }
  } catch (error: any) {
    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: { status: 'ERROR', errorMessage: error.message, finishedAt: new Date() },
    })
    throw error
  }
}

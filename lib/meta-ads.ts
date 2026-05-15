import axios from 'axios'
import { prisma } from './prisma'

const META_API_BASE = 'https://graph.facebook.com/v19.0'

interface MetaMetrics {
  spend: string
  impressions: string
  reach: string
  clicks: string
  ctr: string
  cpc: string
  cpm: string
  frequency: string
  actions?: { action_type: string; value: string }[]
  cost_per_action_type?: { action_type: string; value: string }[]
  purchase_roas?: { action_type: string; value: string }[]
}

function parseActions(
  actions: { action_type: string; value: string }[] | undefined,
  type: string
): number {
  return parseFloat(actions?.find((a) => a.action_type === type)?.value || '0')
}

export async function syncMetaAccount(adAccountId: string) {
  const account = await prisma.adAccount.findUnique({
    where: { id: adAccountId },
  })
  if (!account || !account.accessToken) throw new Error('Conta Meta não encontrada')

  const token = account.accessToken
  const accountExternalId = account.accountId

  const syncLog = await prisma.syncLog.create({
    data: { adAccountId, status: 'RUNNING' },
  })

  try {
    const campaignsRes = await axios.get(
      `${META_API_BASE}/${accountExternalId}/campaigns`,
      {
        params: {
          access_token: token,
          fields: 'id,name,status,objective',
          limit: 200,
        },
      }
    )

    const campaigns = campaignsRes.data.data || []
    let recordsSynced = 0

    for (const campaign of campaigns) {
      const dbCampaign = await prisma.campaign.upsert({
        where: { adAccountId_externalId: { adAccountId, externalId: campaign.id } },
        update: { name: campaign.name, status: campaign.status, objective: campaign.objective },
        create: {
          adAccountId,
          externalId: campaign.id,
          name: campaign.name,
          status: campaign.status,
          objective: campaign.objective,
        },
      })

      const insightsRes = await axios.get(`${META_API_BASE}/${campaign.id}/insights`, {
        params: {
          access_token: token,
          fields:
            'spend,impressions,reach,clicks,ctr,cpc,cpm,frequency,actions,cost_per_action_type,purchase_roas',
          time_increment: 1,
          date_preset: 'last_30d',
          limit: 100,
        },
      })

      const insights: MetaMetrics[] = insightsRes.data.data || []
      for (const day of insights as any[]) {
        const date = new Date(day.date_start)
        const leads = parseActions(day.actions, 'lead')
        const conversions = parseActions(day.actions, 'offsite_conversion.fb_pixel_purchase')
        const spend = parseFloat(day.spend || '0')
        const costPerLead = leads > 0 ? spend / leads : null
        const costPerConv = conversions > 0 ? spend / conversions : null
        const roas = parseFloat(day.purchase_roas?.[0]?.value || '0') || null

        await prisma.dailyMetric.upsert({
          where: {
            id: `${dbCampaign.id}-${day.date_start}`,
          },
          update: {
            spend,
            impressions: parseInt(day.impressions || '0'),
            reach: parseInt(day.reach || '0'),
            clicks: parseInt(day.clicks || '0'),
            ctr: parseFloat(day.ctr || '0'),
            cpc: parseFloat(day.cpc || '0'),
            cpm: parseFloat(day.cpm || '0'),
            frequency: parseFloat(day.frequency || '0'),
            leads,
            conversions,
            costPerLead,
            costPerConv,
            roas,
          },
          create: {
            id: `${dbCampaign.id}-${day.date_start}`,
            campaignId: dbCampaign.id,
            date,
            spend,
            impressions: parseInt(day.impressions || '0'),
            reach: parseInt(day.reach || '0'),
            clicks: parseInt(day.clicks || '0'),
            ctr: parseFloat(day.ctr || '0'),
            cpc: parseFloat(day.cpc || '0'),
            cpm: parseFloat(day.cpm || '0'),
            frequency: parseFloat(day.frequency || '0'),
            leads,
            conversions,
            costPerLead,
            costPerConv,
            roas,
          },
        })
        recordsSynced++
      }
    }

    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: { status: 'SUCCESS', recordsSynced, finishedAt: new Date() },
    })

    return { success: true, recordsSynced }
  } catch (error: any) {
    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status: 'ERROR',
        errorMessage: error.message,
        finishedAt: new Date(),
      },
    })
    throw error
  }
}

export async function getMetaLongLivedToken(shortToken: string): Promise<string> {
  const res = await axios.get(`${META_API_BASE}/oauth/access_token`, {
    params: {
      grant_type: 'fb_exchange_token',
      client_id: process.env.META_APP_ID,
      client_secret: process.env.META_APP_SECRET,
      fb_exchange_token: shortToken,
    },
  })
  return res.data.access_token
}

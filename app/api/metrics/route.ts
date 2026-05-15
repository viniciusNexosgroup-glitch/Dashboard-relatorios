import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getDateRange } from '@/lib/utils'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const clientId = searchParams.get('clientId')
  const period = searchParams.get('period') || 'last30days'

  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })

  const { start, end } = getDateRange(period)

  const adAccounts = await prisma.adAccount.findMany({
    where: { clientId },
    include: {
      campaigns: {
        include: {
          dailyMetrics: {
            where: { date: { gte: start, lte: end } },
          },
        },
      },
    },
  })

  // Aggregate all metrics
  let totalSpend = 0
  let totalImpressions = 0
  let totalReach = 0
  let totalClicks = 0
  let totalLeads = 0
  let totalConversions = 0
  let totalCtr = 0
  let totalCpc = 0
  let totalCpl = 0
  let totalRoas = 0
  let roasCount = 0
  let metricCount = 0

  const byPlatform: Record<string, any> = {}
  const campaignMap: Map<string, any> = new Map()
  const dailyMap: Map<string, any> = new Map()

  for (const account of adAccounts) {
    const platform = account.platform
    if (!byPlatform[platform]) {
      byPlatform[platform] = { spend: 0, impressions: 0, clicks: 0, ctr: 0, leads: 0, conversions: 0, ctrCount: 0 }
    }

    for (const campaign of account.campaigns) {
      let campSpend = 0, campImpressions = 0, campClicks = 0, campLeads = 0, campConversions = 0
      let campCtr = 0, campCpc = 0, campRoas = 0, campRoasCount = 0, campCount = 0

      for (const m of campaign.dailyMetrics) {
        totalSpend += m.spend
        totalImpressions += m.impressions
        totalReach += m.reach
        totalClicks += m.clicks
        totalLeads += m.leads
        totalConversions += m.conversions
        totalCtr += m.ctr
        totalCpc += m.cpc
        metricCount++

        byPlatform[platform].spend += m.spend
        byPlatform[platform].impressions += m.impressions
        byPlatform[platform].clicks += m.clicks
        byPlatform[platform].leads += m.leads
        byPlatform[platform].conversions += m.conversions
        byPlatform[platform].ctr += m.ctr
        byPlatform[platform].ctrCount++

        if (m.roas) { totalRoas += m.roas; roasCount++ }

        campSpend += m.spend
        campImpressions += m.impressions
        campClicks += m.clicks
        campLeads += m.leads
        campConversions += m.conversions
        campCtr += m.ctr
        campCpc += m.cpc
        if (m.roas) { campRoas += m.roas; campRoasCount++ }
        campCount++

        // Group by date for chart
        const dateKey = m.date.toISOString().substring(0, 10)
        if (!dailyMap.has(dateKey)) dailyMap.set(dateKey, { date: dateKey, spend: 0, clicks: 0, leads: 0, conversions: 0 })
        const d = dailyMap.get(dateKey)!
        d.spend += m.spend
        d.clicks += m.clicks
        d.leads += m.leads
        d.conversions += m.conversions
      }

      campaignMap.set(campaign.id, {
        name: campaign.name,
        platform,
        status: campaign.status,
        spend: campSpend,
        impressions: campImpressions,
        clicks: campClicks,
        leads: campLeads,
        conversions: campConversions,
        ctr: campCount > 0 ? campCtr / campCount : 0,
        cpc: campCount > 0 ? campCpc / campCount : 0,
        roas: campRoasCount > 0 ? campRoas / campRoasCount : null,
      })
    }
  }

  // Calculate platform CTR averages
  for (const p of Object.values(byPlatform)) {
    p.ctr = p.ctrCount > 0 ? p.ctr / p.ctrCount : 0
    delete p.ctrCount
  }

  const avgCtr = metricCount > 0 ? totalCtr / metricCount : 0
  const avgCpc = metricCount > 0 ? totalCpc / metricCount : 0
  const avgCpl = totalLeads > 0 ? totalSpend / totalLeads : 0
  const avgRoas = roasCount > 0 ? totalRoas / roasCount : null

  const campaigns = Array.from(campaignMap.values()).sort((a, b) => b.spend - a.spend)
  const chartData = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date))

  return NextResponse.json({
    summary: {
      totalSpend,
      totalImpressions,
      totalReach,
      totalClicks,
      totalLeads,
      totalConversions,
      avgCtr,
      avgCpc,
      avgCpl,
      avgRoas,
    },
    byPlatform,
    campaigns,
    chartData,
  })
}

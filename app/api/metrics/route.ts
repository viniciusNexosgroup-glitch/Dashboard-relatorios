import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getDateRange } from '@/lib/utils'
import { getResultByObjective } from '@/lib/result-by-objective'

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
          dailyMetrics: { where: { date: { gte: start, lte: end } } },
          adSets: {
            include: {
              ads: {
                include: {
                  dailyMetrics: { where: { date: { gte: start, lte: end } } },
                },
              },
            },
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
  let totalMsgConv = 0
  let totalConversions = 0
  let totalCtr = 0
  let totalCpc = 0
  let totalRoas = 0
  let roasCount = 0
  let metricCount = 0

  const byPlatform: Record<string, any> = {}
  const campaignMap: Map<string, any> = new Map()
  const dailyMap: Map<string, any> = new Map()

  for (const account of adAccounts) {
    const platform = account.platform
    if (!byPlatform[platform]) {
      byPlatform[platform] = { spend: 0, impressions: 0, clicks: 0, ctr: 0, leads: 0, msgConversations: 0, conversions: 0, ctrCount: 0 }
    }

    for (const campaign of account.campaigns) {
      let campSpend = 0, campImpressions = 0, campReach = 0, campClicks = 0, campLinkClicks = 0
      let campLeads = 0, campMsgConv = 0, campConversions = 0, campProfileVisits = 0, campLandingPageViews = 0
      let campCtr = 0, campCpc = 0, campRoas = 0, campRoasCount = 0, campCount = 0

      for (const m of campaign.dailyMetrics) {
        const msgConv = (m as any).msgConversations || 0
        totalSpend += m.spend
        totalImpressions += m.impressions
        totalReach += m.reach
        totalClicks += m.clicks
        totalLeads += m.leads
        totalMsgConv += msgConv
        totalConversions += m.conversions
        totalCtr += m.ctr
        totalCpc += m.cpc
        metricCount++

        byPlatform[platform].spend += m.spend
        byPlatform[platform].impressions += m.impressions
        byPlatform[platform].clicks += m.clicks
        byPlatform[platform].leads += m.leads
        byPlatform[platform].msgConversations += msgConv
        byPlatform[platform].conversions += m.conversions
        byPlatform[platform].ctr += m.ctr
        byPlatform[platform].ctrCount++

        if (m.roas) { totalRoas += m.roas; roasCount++ }

        campSpend += m.spend
        campImpressions += m.impressions
        campReach += m.reach
        campClicks += m.clicks
        campLinkClicks += (m as any).linkClicks || 0
        campLeads += m.leads
        campMsgConv += msgConv
        campConversions += m.conversions
        campProfileVisits += (m as any).profileVisits || 0
        campLandingPageViews += (m as any).landingPageViews || 0
        campCtr += m.ctr
        campCpc += m.cpc
        if (m.roas) { campRoas += m.roas; campRoasCount++ }
        campCount++

        // Group by date for chart
        const dateKey = m.date.toISOString().substring(0, 10)
        if (!dailyMap.has(dateKey)) dailyMap.set(dateKey, { date: dateKey, spend: 0, clicks: 0, leads: 0, msgConversations: 0, conversions: 0, costPerMsg: 0 })
        const d = dailyMap.get(dateKey)!
        d.spend += m.spend
        d.clicks += m.clicks
        d.leads += m.leads
        d.msgConversations += msgConv
        d.conversions += m.conversions
      }

      if (campSpend > 0 || campImpressions > 0) {
        const { count: resultCount, label: resultLabel } = getResultByObjective(campaign.objective, {
          leads: campLeads,
          msgConv: campMsgConv,
          conversions: campConversions,
          profileVisits: campProfileVisits,
          landingPageViews: campLandingPageViews,
          linkClicks: campLinkClicks,
        })
        campaignMap.set(campaign.id, {
          name: campaign.name,
          platform,
          status: campaign.status,
          objective: campaign.objective,
          spend: campSpend,
          impressions: campImpressions,
          reach: campReach,
          clicks: campClicks,
          linkClicks: campLinkClicks,
          leads: campLeads,
          msgConversations: campMsgConv,
          conversions: campConversions,
          resultCount,
          resultLabel,
          ctr: campCount > 0 ? campCtr / campCount : 0,
          cpc: campCount > 0 ? campCpc / campCount : 0,
          roas: campRoasCount > 0 ? campRoas / campRoasCount : null,
        })
      }
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
  const avgCostPerMsg = totalMsgConv > 0 ? totalSpend / totalMsgConv : 0
  const avgRoas = roasCount > 0 ? totalRoas / roasCount : null

  const campaigns = Array.from(campaignMap.values()).sort((a, b) => b.spend - a.spend)
  const chartData = Array.from(dailyMap.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({ ...d, costPerMsg: d.msgConversations > 0 ? d.spend / d.msgConversations : 0 }))

  // Aggregate ad-level metrics (use parent campaign's objective)
  const adMap: Map<string, any> = new Map()
  for (const account of adAccounts) {
    for (const campaign of account.campaigns) {
      for (const adSet of (campaign as any).adSets || []) {
        for (const ad of adSet.ads || []) {
          let adSpend = 0, adImpressions = 0, adReach = 0, adClicks = 0, adLinkClicks = 0
          let adLeads = 0, adMsgConv = 0, adConversions = 0, adProfileVisits = 0, adLandingPageViews = 0
          let adCtr = 0, adCpc = 0, adCount = 0
          for (const m of ad.dailyMetrics) {
            adSpend += m.spend; adImpressions += m.impressions; adReach += m.reach
            adClicks += m.clicks; adLinkClicks += (m as any).linkClicks || 0
            adLeads += m.leads; adMsgConv += (m as any).msgConversations || 0; adConversions += m.conversions
            adProfileVisits += (m as any).profileVisits || 0; adLandingPageViews += (m as any).landingPageViews || 0
            adCtr += m.ctr; adCpc += m.cpc; adCount++
          }
          if (adSpend > 0 || adImpressions > 0) {
            const { count: adResultCount, label: adResultLabel } = getResultByObjective(campaign.objective, {
              leads: adLeads,
              msgConv: adMsgConv,
              conversions: adConversions,
              profileVisits: adProfileVisits,
              landingPageViews: adLandingPageViews,
              linkClicks: adLinkClicks,
            })
            adMap.set(ad.id, {
              name: ad.name,
              status: ad.status,
              thumbnailUrl: ad.thumbnailUrl || null,
              platform: account.platform,
              campaignName: campaign.name,
              spend: adSpend, impressions: adImpressions, reach: adReach,
              clicks: adClicks, linkClicks: adLinkClicks, leads: adLeads, msgConversations: adMsgConv, conversions: adConversions,
              resultCount: adResultCount,
              resultLabel: adResultLabel,
              ctr: adCount > 0 ? adCtr / adCount : 0,
              cpc: adCount > 0 ? adCpc / adCount : 0,
            })
          }
        }
      }
    }
  }
  // Group by campaign first (alphabetical), then by spend (highest first) within each campaign
  const ads = Array.from(adMap.values()).sort((a, b) => {
    const camp = a.campaignName.localeCompare(b.campaignName, 'pt-BR')
    if (camp !== 0) return camp
    return b.spend - a.spend
  })

  return NextResponse.json({
    summary: {
      totalSpend,
      totalImpressions,
      totalReach,
      totalClicks,
      totalLeads,
      totalMsgConv,
      totalConversions,
      avgCtr,
      avgCpc,
      avgCpl,
      avgCostPerMsg,
      avgRoas,
    },
    byPlatform,
    campaigns,
    ads,
    chartData,
  })
}

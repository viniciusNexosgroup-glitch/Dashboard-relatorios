import { prisma } from './prisma'
import { getResultByObjective } from './result-by-objective'

// Single source of truth: agrega dados do cliente + período e monta o ReportData
// usado por TODOS os endpoints (Gerar PDF, Enviar WhatsApp, Cron Mensal).
// Garante que os 3 lugares geram o MESMO PDF com os MESMOS dados.

export interface BuildReportInput {
  clientId: string
  start: Date
  end: Date
}

export async function buildReportData(input: BuildReportInput) {
  const { clientId, start, end } = input

  const client = await prisma.client.findUnique({ where: { id: clientId } })
  if (!client) throw new Error('Cliente não encontrado')

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

  let totalSpend = 0, totalImpressions = 0, totalReach = 0, totalClicks = 0
  let totalLeads = 0, totalMsgConv = 0, totalConversions = 0
  let sumCtr = 0, sumCpc = 0, sumRoas = 0, roasCount = 0, count = 0

  const campaigns: any[] = []
  const ads: any[] = []

  for (const account of adAccounts) {
    for (const campaign of account.campaigns) {
      let cs = 0, ci = 0, cReach = 0, cc = 0, cLinkClicks = 0
      let cl = 0, cMsg = 0, ccv = 0, cProfileVisits = 0, cLandingPageViews = 0
      let ctrSum = 0, cpcSum = 0, roas = 0, rc = 0, cnt = 0

      for (const m of campaign.dailyMetrics) {
        const msg = (m as any).msgConversations || 0
        totalSpend += m.spend; cs += m.spend
        totalImpressions += m.impressions; ci += m.impressions
        totalReach += m.reach; cReach += m.reach
        totalClicks += m.clicks; cc += m.clicks
        totalLeads += m.leads; cl += m.leads
        totalMsgConv += msg; cMsg += msg
        totalConversions += m.conversions; ccv += m.conversions
        cLinkClicks += (m as any).linkClicks || 0
        cProfileVisits += (m as any).profileVisits || 0
        cLandingPageViews += (m as any).landingPageViews || 0
        sumCtr += m.ctr; ctrSum += m.ctr
        sumCpc += m.cpc; cpcSum += m.cpc
        if (m.roas) { sumRoas += m.roas; roas += m.roas; roasCount++; rc++ }
        count++; cnt++
      }

      if (cnt > 0 && (cs > 0 || ci > 0)) {
        const { count: resultCount, label: resultLabel } = getResultByObjective(campaign.objective, {
          leads: cl, msgConv: cMsg, conversions: ccv,
          profileVisits: cProfileVisits, landingPageViews: cLandingPageViews, linkClicks: cLinkClicks,
        })
        campaigns.push({
          name: campaign.name,
          platform: account.platform,
          objective: campaign.objective,
          spend: cs,
          impressions: ci,
          reach: cReach,
          clicks: cc,
          leads: cl,
          msgConversations: cMsg,
          conversions: ccv,
          resultCount,
          resultLabel,
          ctr: cnt > 0 ? ctrSum / cnt : 0,
          cpc: cnt > 0 ? cpcSum / cnt : 0,
          roas: rc > 0 ? roas / rc : null,
        })
      }

      for (const adSet of (campaign as any).adSets || []) {
        for (const ad of adSet.ads || []) {
          let aSpend = 0, aImp = 0, aReach = 0, aClicks = 0, aLinkClicks = 0
          let aLeads = 0, aMsg = 0, aConv = 0, aProfileVisits = 0, aLandingPageViews = 0
          for (const m of ad.dailyMetrics) {
            aSpend += m.spend; aImp += m.impressions; aReach += m.reach; aClicks += m.clicks
            aLinkClicks += (m as any).linkClicks || 0
            aLeads += m.leads; aMsg += (m as any).msgConversations || 0; aConv += m.conversions
            aProfileVisits += (m as any).profileVisits || 0
            aLandingPageViews += (m as any).landingPageViews || 0
          }
          if (aSpend > 0 || aImp > 0) {
            const { count: adResultCount, label: adResultLabel } = getResultByObjective(campaign.objective, {
              leads: aLeads, msgConv: aMsg, conversions: aConv,
              profileVisits: aProfileVisits, landingPageViews: aLandingPageViews, linkClicks: aLinkClicks,
            })
            ads.push({
              name: ad.name,
              platform: account.platform,
              campaignName: campaign.name,
              thumbnailUrl: ad.thumbnailUrl || null,
              spend: aSpend,
              reach: aReach,
              clicks: aClicks,
              leads: aLeads,
              msgConversations: aMsg,
              conversions: aConv,
              resultCount: adResultCount,
              resultLabel: adResultLabel,
            })
          }
        }
      }
    }
  }

  campaigns.sort((a, b) => b.spend - a.spend)
  // Ads agrupados por campanha (alfabético), dentro de cada por gasto
  ads.sort((a, b) => {
    const camp = a.campaignName.localeCompare(b.campaignName, 'pt-BR')
    if (camp !== 0) return camp
    return b.spend - a.spend
  })

  return {
    client: { name: client.name, company: client.company },
    period: { start, end },
    summary: {
      totalSpend,
      totalImpressions,
      totalReach,
      totalClicks,
      totalLeads,
      totalMsgConv,
      totalConversions,
      avgCtr: count > 0 ? sumCtr / count : 0,
      avgCpc: count > 0 ? sumCpc / count : 0,
      avgCpl: totalLeads > 0 ? totalSpend / totalLeads : 0,
      avgCostPerMsg: totalMsgConv > 0 ? totalSpend / totalMsgConv : 0,
      avgRoas: roasCount > 0 ? sumRoas / roasCount : null,
    },
    campaigns,
    ads,
  }
}

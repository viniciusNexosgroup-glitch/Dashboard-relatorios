import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateReportPDF } from '@/lib/pdf-generator'
import { sendDocumentMessage } from '@/lib/evolution-api'
import { syncMetaAccount } from '@/lib/meta-ads'
import { syncGoogleAccount } from '@/lib/google-ads'
import { formatDate, getDateRange } from '@/lib/utils'

export const maxDuration = 300

type ResultMetrics = {
  leads: number
  msgConv: number
  conversions: number
  profileVisits: number
  landingPageViews: number
  linkClicks: number
}

function getResultByObjective(
  objective: string | null | undefined,
  m: ResultMetrics
): { count: number; label: string } {
  const obj = (objective || '').toUpperCase()
  if (obj === 'MESSAGES' || obj === 'OUTCOME_MESSAGES')
    return { count: m.msgConv, label: 'Conversas por mensagem' }
  if (obj === 'OUTCOME_ENGAGEMENT' || obj === 'POST_ENGAGEMENT' || obj === 'PAGE_LIKES' || obj === 'ENGAGEMENT') {
    if (m.msgConv > 0) return { count: m.msgConv, label: 'Conversas por mensagem' }
    if (m.profileVisits > 0) return { count: m.profileVisits, label: 'Visitas ao perfil' }
    return { count: 0, label: 'Engajamento' }
  }
  if (obj === 'LEAD_GENERATION' || obj === 'OUTCOME_LEADS')
    return { count: m.leads, label: 'Leads' }
  if (obj === 'LINK_CLICKS' || obj === 'TRAFFIC' || obj === 'OUTCOME_TRAFFIC') {
    if (m.landingPageViews > 0) return { count: m.landingPageViews, label: 'Visitas à pág. de destino' }
    return { count: m.linkClicks, label: 'Cliques no link' }
  }
  if (obj === 'CONVERSIONS' || obj === 'OUTCOME_SALES' || obj === 'PRODUCT_CATALOG_SALES' || obj === 'CATALOG_SALES') {
    if (m.conversions > 0) return { count: m.conversions, label: 'Conversões' }
    if (m.msgConv > 0) return { count: m.msgConv, label: 'Conversas por mensagem' }
    return { count: 0, label: 'Conversões' }
  }
  if (obj === 'REACH' || obj === 'BRAND_AWARENESS' || obj === 'OUTCOME_AWARENESS') {
    if (m.profileVisits > 0) return { count: m.profileVisits, label: 'Visitas ao perfil' }
    return { count: 0, label: 'Alcance' }
  }
  if (m.msgConv > 0) return { count: m.msgConv, label: 'Conversas por mensagem' }
  if (m.conversions > 0) return { count: m.conversions, label: 'Conversões' }
  if (m.profileVisits > 0) return { count: m.profileVisits, label: 'Visitas ao perfil' }
  if (m.landingPageViews > 0) return { count: m.landingPageViews, label: 'Visitas à pág. de destino' }
  if (m.linkClicks > 0) return { count: m.linkClicks, label: 'Cliques no link' }
  if (m.leads > 0) return { count: m.leads, label: 'Leads' }
  return { count: 0, label: '' }
}

// Called on day 1 of each month: syncs all accounts, then sends the previous month's report.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── 1. Sync all active accounts FIRST so reports go out with fresh data ──
  const allAccounts = await prisma.adAccount.findMany({ where: { active: true } })
  const syncResults: any[] = []
  for (const account of allAccounts) {
    try {
      if (account.platform === 'META') await syncMetaAccount(account.id)
      else await syncGoogleAccount(account.id)
      syncResults.push({ accountId: account.id, platform: account.platform, status: 'synced' })
    } catch (err: any) {
      syncResults.push({ accountId: account.id, platform: account.platform, status: 'sync_error', error: err.message })
    }
  }

  // ── 2. Now generate and send the previous month's report ──
  const { start, end } = getDateRange('lastMonth')
  const periodLabel = `${formatDate(start)} a ${formatDate(end)}`

  const clients = await prisma.client.findMany({
    where: { active: true },
    include: {
      adAccounts: {
        where: { active: true },
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
      },
    },
  })

  const statuses: any[] = []

  for (const client of clients) {
    if (!client.whatsappGroup) {
      statuses.push({ clientId: client.id, status: 'GROUP_NOT_CONFIGURED' })
      await prisma.whatsappSend.create({
        data: { clientId: client.id, groupId: '', message: '', status: 'GROUP_NOT_CONFIGURED' },
      })
      continue
    }

    if (!client.adAccounts.length) {
      statuses.push({ clientId: client.id, status: 'ACCOUNT_DISCONNECTED' })
      await prisma.whatsappSend.create({
        data: { clientId: client.id, groupId: client.whatsappGroup, message: '', status: 'ACCOUNT_DISCONNECTED' },
      })
      continue
    }

    try {
      let totalSpend = 0, totalImpressions = 0, totalReach = 0, totalClicks = 0
      let totalLeads = 0, totalMsgConv = 0, totalConversions = 0
      let sumCtr = 0, sumCpc = 0, sumRoas = 0, roasCount = 0, count = 0
      const campaigns: any[] = []
      const ads: any[] = []

      for (const account of client.adAccounts) {
        for (const campaign of account.campaigns) {
          let cs = 0, ci = 0, cc = 0, cLinkClicks = 0
          let cl = 0, cMsg = 0, ccv = 0, cProfileVisits = 0, cLandingPageViews = 0
          let ctrSum = 0, cpcSum = 0, roas = 0, rc = 0, cnt = 0

          for (const m of campaign.dailyMetrics) {
            const msg = (m as any).msgConversations || 0
            totalSpend += m.spend; cs += m.spend
            totalImpressions += m.impressions; ci += m.impressions
            totalReach += m.reach
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
              name: campaign.name, platform: account.platform, objective: campaign.objective,
              spend: cs, impressions: ci, clicks: cc,
              leads: cl, msgConversations: cMsg, conversions: ccv,
              resultCount, resultLabel,
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
                  name: ad.name, platform: account.platform, campaignName: campaign.name,
                  thumbnailUrl: ad.thumbnailUrl || null,
                  spend: aSpend, reach: aReach, clicks: aClicks,
                  leads: aLeads, msgConversations: aMsg, conversions: aConv,
                  resultCount: adResultCount, resultLabel: adResultLabel,
                })
              }
            }
          }
        }
      }

      campaigns.sort((a, b) => b.spend - a.spend)
      ads.sort((a, b) => {
        const camp = a.campaignName.localeCompare(b.campaignName, 'pt-BR')
        if (camp !== 0) return camp
        return b.spend - a.spend
      })

      const pdfBuffer = await generateReportPDF({
        client: { name: client.name, company: client.company },
        period: { start, end },
        summary: {
          totalSpend, totalImpressions, totalReach, totalClicks,
          totalLeads, totalMsgConv, totalConversions,
          avgCtr: count > 0 ? sumCtr / count : 0,
          avgCpc: count > 0 ? sumCpc / count : 0,
          avgCpl: totalLeads > 0 ? totalSpend / totalLeads : 0,
          avgCostPerMsg: totalMsgConv > 0 ? totalSpend / totalMsgConv : 0,
          avgRoas: roasCount > 0 ? sumRoas / roasCount : null,
        },
        campaigns,
        ads,
      })

      const filename = `relatorio-mensal-${client.company.replace(/\s/g, '-')}.pdf`
      const caption = `📊 *Relatório Mensal – ${client.company}*\n📅 ${periodLabel}\n\nOlá! Segue o relatório de performance do mês anterior. Qualquer dúvida, estou à disposição.`

      await sendDocumentMessage(client.whatsappGroup, pdfBuffer.toString('base64'), filename, caption)

      const report = await prisma.report.create({
        data: {
          clientId: client.id,
          title: `Relatório Mensal ${client.company} - ${periodLabel}`,
          periodStart: start,
          periodEnd: end,
          status: 'READY',
        },
      })

      await prisma.whatsappSend.create({
        data: {
          clientId: client.id,
          reportId: report.id,
          groupId: client.whatsappGroup,
          message: caption,
          status: 'SENT',
          sentAt: new Date(),
        },
      })

      statuses.push({ clientId: client.id, company: client.company, status: 'SENT' })
    } catch (err: any) {
      await prisma.whatsappSend.create({
        data: {
          clientId: client.id,
          groupId: client.whatsappGroup || '',
          message: '',
          status: 'ERROR',
          errorMessage: err.message,
        },
      })
      statuses.push({ clientId: client.id, status: 'ERROR', error: err.message })
    }
  }

  return NextResponse.json({
    sync: { synced: syncResults.filter((r) => r.status === 'synced').length, errors: syncResults.filter((r) => r.status === 'sync_error').length, details: syncResults },
    reports: { processed: statuses.length, statuses },
  })
}

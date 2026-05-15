import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateReportPDF } from '@/lib/pdf-generator'
import { sendDocumentMessage } from '@/lib/evolution-api'

// Called on day 1 of each month
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)

  const clients = await prisma.client.findMany({
    where: { active: true },
    include: {
      adAccounts: {
        where: { active: true },
        include: {
          campaigns: {
            include: { dailyMetrics: { where: { date: { gte: start, lte: end } } } },
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
      let totalSpend = 0, totalImpressions = 0, totalClicks = 0, totalLeads = 0, totalConversions = 0
      let sumCtr = 0, sumCpc = 0, sumRoas = 0, roasCount = 0, count = 0
      const campaigns: any[] = []

      for (const account of client.adAccounts) {
        for (const campaign of account.campaigns) {
          let cs = 0, ci = 0, cc = 0, cl = 0, ccv = 0, ctr = 0, cpc = 0, roas = 0, rc = 0, cnt = 0
          for (const m of campaign.dailyMetrics) {
            totalSpend += m.spend; cs += m.spend; totalImpressions += m.impressions; ci += m.impressions
            totalClicks += m.clicks; cc += m.clicks; totalLeads += m.leads; cl += m.leads
            totalConversions += m.conversions; ccv += m.conversions
            sumCtr += m.ctr; ctr += m.ctr; sumCpc += m.cpc; cpc += m.cpc
            if (m.roas) { sumRoas += m.roas; roas += m.roas; roasCount++; rc++ }
            count++; cnt++
          }
          if (cnt > 0) campaigns.push({ name: campaign.name, platform: account.platform, spend: cs, impressions: ci, clicks: cc, leads: cl, conversions: ccv, ctr: ctr / cnt, cpc: cpc / cnt, roas: rc > 0 ? roas / rc : null })
        }
      }
      campaigns.sort((a, b) => b.spend - a.spend)

      const pdfBuffer = await generateReportPDF({
        client: { name: client.name, company: client.company },
        period: { start, end },
        summary: {
          totalSpend, totalImpressions, totalClicks, totalLeads, totalConversions,
          avgCtr: count > 0 ? sumCtr / count : 0,
          avgCpc: count > 0 ? sumCpc / count : 0,
          avgCpl: totalLeads > 0 ? totalSpend / totalLeads : 0,
          avgRoas: roasCount > 0 ? sumRoas / roasCount : null,
        },
        campaigns,
      })

      const periodLabel = `${start.toLocaleDateString('pt-BR')} a ${end.toLocaleDateString('pt-BR')}`
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

  return NextResponse.json({ processed: statuses.length, statuses })
}

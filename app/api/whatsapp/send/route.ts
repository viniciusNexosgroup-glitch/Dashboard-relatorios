import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getDateRange, formatDate } from '@/lib/utils'
import { generateReportPDF } from '@/lib/pdf-generator'
import { sendDocumentMessage, sendTextMessage } from '@/lib/evolution-api'
import { whatsappSendSchema, parseJson } from '@/lib/validators'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = await parseJson(req, whatsappSendSchema)
  if ('error' in parsed) return parsed.error
  const { clientId, period } = parsed.data
  const { start, end } = getDateRange(period || 'last30days')

  const client = await prisma.client.findUnique({ where: { id: clientId } })
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  if (!client.whatsappGroup)
    return NextResponse.json({ error: 'Grupo de WhatsApp não configurado' }, { status: 400 })

  // Fetch data and generate PDF
  const adAccounts = await prisma.adAccount.findMany({
    where: { clientId },
    include: {
      campaigns: {
        include: {
          dailyMetrics: { where: { date: { gte: start, lte: end } } },
          adSets: {
            include: {
              ads: {
                include: { dailyMetrics: { where: { date: { gte: start, lte: end } } } },
              },
            },
          },
        },
      },
    },
  })

  let totalSpend = 0, totalLeads = 0, totalConversions = 0, totalClicks = 0, totalImpressions = 0
  let sumCtr = 0, sumCpc = 0, sumRoas = 0, roasCount = 0, count = 0
  const campaigns: any[] = []
  const ads: any[] = []

  for (const account of adAccounts) {
    for (const campaign of account.campaigns) {
      let cs = 0, cc = 0, cl = 0, ccv = 0, ctr = 0, cpc = 0, roas = 0, rc = 0, cnt = 0, ci = 0
      for (const m of campaign.dailyMetrics) {
        totalSpend += m.spend; cs += m.spend
        totalImpressions += m.impressions; ci += m.impressions
        totalClicks += m.clicks; cc += m.clicks
        totalLeads += m.leads; cl += m.leads
        totalConversions += m.conversions; ccv += m.conversions
        sumCtr += m.ctr; ctr += m.ctr
        sumCpc += m.cpc; cpc += m.cpc
        if (m.roas) { sumRoas += m.roas; roas += m.roas; roasCount++; rc++ }
        count++; cnt++
      }
      if (cnt > 0) campaigns.push({ name: campaign.name, platform: account.platform, spend: cs, impressions: ci, clicks: cc, leads: cl, conversions: ccv, ctr: ctr / cnt, cpc: cpc / cnt, roas: rc > 0 ? roas / rc : null })

      for (const adSet of (campaign as any).adSets || []) {
        for (const ad of adSet.ads || []) {
          let as = 0, ar = 0, ac = 0, al = 0, acv = 0
          for (const m of ad.dailyMetrics) { as += m.spend; ar += m.reach; ac += m.clicks; al += m.leads; acv += m.conversions }
          if (as > 0 || ar > 0) ads.push({ name: ad.name, platform: account.platform, campaignName: campaign.name, thumbnailUrl: ad.thumbnailUrl || null, spend: as, reach: ar, clicks: ac, leads: al, conversions: acv })
        }
      }
    }
  }
  campaigns.sort((a, b) => b.spend - a.spend)
  ads.sort((a, b) => b.spend - a.spend)

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
    ads,
  })

  const base64 = pdfBuffer.toString('base64')
  const periodLabel = `${formatDate(start)} a ${formatDate(end)}`
  const filename = `relatorio-${client.company.replace(/\s/g, '-')}.pdf`
  const caption = `📊 *Relatório de Performance – ${client.company}*\n📅 Período: ${periodLabel}\n\nOlá! Segue o relatório de performance referente ao período selecionado. Qualquer dúvida, estou à disposição.`

  // Cria report antes do envio (status READY assim que o PDF foi gerado)
  const report = await prisma.report.create({
    data: {
      clientId,
      userId: (session.user as any).id,
      title: `Relatório ${client.company} - ${periodLabel}`,
      periodStart: start,
      periodEnd: end,
      status: 'READY',
    },
  })

  // Tenta enviar; registra status correto independente de sucesso ou falha,
  // pra ficar visível no Histórico de Envios.
  try {
    await sendDocumentMessage(client.whatsappGroup, base64, filename, caption)
    await prisma.whatsappSend.create({
      data: {
        clientId,
        reportId: report.id,
        groupId: client.whatsappGroup,
        message: caption,
        status: 'SENT',
        type: 'manual',
        sentAt: new Date(),
      },
    })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    await prisma.whatsappSend.create({
      data: {
        clientId,
        reportId: report.id,
        groupId: client.whatsappGroup,
        message: caption,
        status: 'ERROR',
        type: 'manual',
        errorMessage: err.message,
      },
    })
    return NextResponse.json(
      { error: 'Falha ao enviar pelo WhatsApp. Verifique o histórico.', detail: err.message },
      { status: 502 }
    )
  }
}

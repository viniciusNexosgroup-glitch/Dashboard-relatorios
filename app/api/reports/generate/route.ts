import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getDateRange } from '@/lib/utils'
import { generateReportPDF } from '@/lib/pdf-generator'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { clientId, period } = await req.json()
  const { start, end } = getDateRange(period || 'last30days')

  const client = await prisma.client.findUnique({ where: { id: clientId } })
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  // Fetch aggregated data for PDF
  const adAccounts = await prisma.adAccount.findMany({
    where: { clientId },
    include: {
      campaigns: {
        include: {
          dailyMetrics: { where: { date: { gte: start, lte: end } } },
        },
      },
    },
  })

  let totalSpend = 0, totalImpressions = 0, totalClicks = 0
  let totalLeads = 0, totalConversions = 0
  let sumCtr = 0, sumCpc = 0, sumRoas = 0, roasCount = 0, count = 0

  const campaigns: any[] = []

  for (const account of adAccounts) {
    for (const campaign of account.campaigns) {
      let cs = 0, ci = 0, cc = 0, cl = 0, ccv = 0, ctr = 0, cpc = 0, roas = 0, rc = 0, cnt = 0
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
      if (cnt > 0) {
        campaigns.push({
          name: campaign.name,
          platform: account.platform,
          spend: cs,
          impressions: ci,
          clicks: cc,
          leads: cl,
          conversions: ccv,
          ctr: cnt > 0 ? ctr / cnt : 0,
          cpc: cnt > 0 ? cpc / cnt : 0,
          roas: rc > 0 ? roas / rc : null,
        })
      }
    }
  }

  campaigns.sort((a, b) => b.spend - a.spend)

  const reportData = {
    client: { name: client.name, company: client.company },
    period: { start, end },
    summary: {
      totalSpend,
      totalImpressions,
      totalClicks,
      totalLeads,
      totalConversions,
      avgCtr: count > 0 ? sumCtr / count : 0,
      avgCpc: count > 0 ? sumCpc / count : 0,
      avgCpl: totalLeads > 0 ? totalSpend / totalLeads : 0,
      avgRoas: roasCount > 0 ? sumRoas / roasCount : null,
    },
    campaigns,
  }

  const pdfBuffer = await generateReportPDF(reportData)

  // Save report record
  await prisma.report.create({
    data: {
      clientId,
      userId: (session.user as any).id,
      title: `Relatório ${client.company} - ${start.toLocaleDateString('pt-BR')} a ${end.toLocaleDateString('pt-BR')}`,
      periodStart: start,
      periodEnd: end,
      status: 'READY',
    },
  })

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="relatorio-${client.company.replace(/\s/g, '-')}.pdf"`,
    },
  })
}

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateReportPDF } from '@/lib/pdf-generator'
import { sendDocumentMessage } from '@/lib/evolution-api'
import { formatDate, getDateRange } from '@/lib/utils'
import { buildReportData } from '@/lib/report-builder'

export const maxDuration = 300

// Called on day 1 of each month: sends the previous month's report.
// NÃO sincroniza as contas aqui — os crons das 08h/14h/20h já mantêm os dados frescos
// (no dia 1 às 09:30 o sync das 08h já rodou). Sincronizar tudo aqui gerava um pico de
// Disk IO que derrubava a instância do Supabase. Mantemos o envio leve: ler + PDF + WhatsApp.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── Generate and send the previous month's report ──
  const { start, end } = getDateRange('lastMonth')
  const periodLabel = `${formatDate(start)} a ${formatDate(end)}`

  const clients = await prisma.client.findMany({
    where: { active: true },
    include: { adAccounts: { where: { active: true } } },
  })

  const statuses: any[] = []

  // Randomized delay (60-120s) between sends to mimic human pacing and avoid WhatsApp throttling/ban
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
  const randomDelay = () => 60_000 + Math.floor(Math.random() * 60_000)

  const eligibleClients = clients.filter(
    (c) => c.whatsappGroup && c.adAccounts.length > 0 && c.reportsEnabled !== false
  )
  console.log(`[monthly-report] enviando para ${eligibleClients.length} clientes elegiveis, intervalo 60-120s entre cada um`)

  let sentCount = 0
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

    // Cliente com relatorios desativados pelo admin — pula sem registrar como erro
    if (client.reportsEnabled === false) {
      statuses.push({ clientId: client.id, company: client.company, status: 'REPORTS_DISABLED' })
      continue
    }

    try {
      // Single source of truth — mesma agregação usada em /api/reports/generate e /api/whatsapp/send
      const reportData = await buildReportData({ clientId: client.id, start, end })
      const pdfBuffer = await generateReportPDF(reportData)

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
      sentCount++

      // Pause between sends to avoid WhatsApp ban — skip after last successful send
      if (sentCount < eligibleClients.length) {
        const wait = randomDelay()
        console.log(`[monthly-report] enviado para ${client.company} (${sentCount}/${eligibleClients.length}). Aguardando ${Math.round(wait / 1000)}s antes do proximo...`)
        await sleep(wait)
      }
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
    reports: { processed: statuses.length, sent: sentCount, statuses },
  })
}

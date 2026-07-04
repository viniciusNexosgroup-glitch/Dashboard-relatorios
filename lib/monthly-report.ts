import { prisma } from './prisma'
import { generateReportPDF } from './pdf-generator'
import { sendDocumentMessage } from './evolution-api'
import { formatDate, getDateRange } from './utils'
import { buildReportData } from './report-builder'

// Envio do relatório mensal (mês anterior) para todos os clientes elegíveis.
//
// IDEMPOTENTE: pula clientes que já receberam o relatório DESTE período com
// sucesso — pode ser re-executado quantas vezes for preciso (dias 2-3 de
// catch-up, retry manual após falha, corte de request) sem duplicar envios.
//
// Chamado DIRETO pelo cron in-process (sem HTTP → sem limite de 300s) e pelo
// endpoint /api/cron/monthly-report (trigger manual/externo).

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const randomDelay = () => 60_000 + Math.floor(Math.random() * 60_000) // 60-120s anti-ban

export async function sendMonthlyReports(): Promise<{
  processed: number
  sent: number
  skippedAlreadySent: number
  statuses: any[]
}> {
  const { start, end } = getDateRange('lastMonth')
  const periodLabel = `${formatDate(start)} a ${formatDate(end)}`

  const clients = await prisma.client.findMany({
    where: { active: true },
    include: { adAccounts: { where: { active: true }, select: { id: true } } },
  })

  const statuses: any[] = []
  let sentCount = 0
  let skippedAlreadySent = 0

  const eligibleClients = clients.filter(
    (c) => c.whatsappGroup && c.adAccounts.length > 0 && c.reportsEnabled !== false
  )
  console.log(`[monthly-report] período ${periodLabel} — ${eligibleClients.length} clientes elegíveis`)

  for (const client of clients) {
    if (!client.whatsappGroup) {
      statuses.push({ clientId: client.id, status: 'GROUP_NOT_CONFIGURED' })
      continue
    }
    if (!client.adAccounts.length) {
      statuses.push({ clientId: client.id, status: 'ACCOUNT_DISCONNECTED' })
      continue
    }
    if (client.reportsEnabled === false) {
      statuses.push({ clientId: client.id, company: client.company, status: 'REPORTS_DISABLED' })
      continue
    }

    // Idempotência: já recebeu o relatório deste período com sucesso? Pula.
    const alreadySent = await prisma.whatsappSend.findFirst({
      where: {
        clientId: client.id,
        status: 'SENT',
        type: 'report',
        report: { periodStart: start, periodEnd: end },
      },
      select: { id: true },
    })
    if (alreadySent) {
      skippedAlreadySent++
      statuses.push({ clientId: client.id, company: client.company, status: 'ALREADY_SENT' })
      continue
    }

    try {
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
          type: 'report',
          sentAt: new Date(),
        },
      })

      statuses.push({ clientId: client.id, company: client.company, status: 'SENT' })
      sentCount++

      // Pausa anti-ban entre envios (pula após o último elegível)
      if (sentCount + skippedAlreadySent < eligibleClients.length) {
        const wait = randomDelay()
        console.log(`[monthly-report] enviado para ${client.company} (${sentCount} enviados). Aguardando ${Math.round(wait / 1000)}s...`)
        await sleep(wait)
      }
    } catch (err: any) {
      console.error(`[monthly-report] erro em ${client.company}:`, err.message)
      await prisma.whatsappSend.create({
        data: {
          clientId: client.id,
          groupId: client.whatsappGroup || '',
          message: '',
          status: 'ERROR',
          type: 'report',
          errorMessage: err.message,
        },
      }).catch(() => {})
      statuses.push({ clientId: client.id, company: client.company, status: 'ERROR', error: err.message })
    }
  }

  console.log(`[monthly-report] FIM: ${sentCount} enviados, ${skippedAlreadySent} já tinham recebido, ${statuses.length} processados`)
  return { processed: statuses.length, sent: sentCount, skippedAlreadySent, statuses }
}

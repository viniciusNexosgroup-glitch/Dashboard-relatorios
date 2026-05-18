import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getDateRange, formatDate } from '@/lib/utils'
import { generateReportPDF } from '@/lib/pdf-generator'
import { sendDocumentMessage } from '@/lib/evolution-api'
import { whatsappSendSchema, parseJson } from '@/lib/validators'
import { buildReportData } from '@/lib/report-builder'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = await parseJson(req, whatsappSendSchema)
  if ('error' in parsed) return parsed.error
  const { clientId, period } = parsed.data
  const { start, end } = getDateRange(period || 'last30days')

  // Carrega cliente + valida WhatsApp
  const client = await prisma.client.findUnique({ where: { id: clientId } })
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  if (!client.whatsappGroup)
    return NextResponse.json({ error: 'Grupo de WhatsApp não configurado' }, { status: 400 })

  // Usa MESMA lógica do /api/reports/generate — 1 só fonte da verdade pro PDF
  const reportData = await buildReportData({ clientId, start, end })

  const pdfBuffer = await generateReportPDF(reportData)

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

  // Tenta enviar; registra status no histórico independente de sucesso/falha
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

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getDateRange, formatDate } from '@/lib/utils'
import { generateReportPDF } from '@/lib/pdf-generator'
import { reportGenerateSchema, parseJson } from '@/lib/validators'
import { buildReportData } from '@/lib/report-builder'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = await parseJson(req, reportGenerateSchema)
  if ('error' in parsed) return parsed.error
  const { clientId, period } = parsed.data
  const { start, end } = getDateRange(period || 'last30days')

  // Single source of truth — mesma agregação usada no /api/whatsapp/send e no cron mensal
  const reportData = await buildReportData({ clientId, start, end })

  const pdfBuffer = await generateReportPDF(reportData)

  await prisma.report.create({
    data: {
      clientId,
      userId: (session.user as any).id,
      title: `Relatório ${reportData.client.company} - ${formatDate(start)} a ${formatDate(end)}`,
      periodStart: start,
      periodEnd: end,
      status: 'READY',
    },
  })

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="relatorio-${reportData.client.company.replace(/\s/g, '-')}.pdf"`,
    },
  })
}

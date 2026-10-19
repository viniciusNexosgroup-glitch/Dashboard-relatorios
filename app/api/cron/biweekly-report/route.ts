import { NextRequest, NextResponse } from 'next/server'
import { sendBiweeklyReports } from '@/lib/monthly-report'

export const maxDuration = 300

// Trigger manual/externo do relatório quinzenal (dias 01-15 do mês atual), só
// para clientes com biweeklyReportsEnabled. IDEMPOTENTE como o mensal: se o
// request for cortado no timeout, basta chamar de novo. O cron in-process
// (dias 16-18, 09:30) chama a mesma função DIRETO, sem HTTP.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await sendBiweeklyReports()

  return NextResponse.json({
    reports: {
      processed: result.processed,
      sent: result.sent,
      skippedAlreadySent: result.skippedAlreadySent,
      statuses: result.statuses,
    },
  })
}

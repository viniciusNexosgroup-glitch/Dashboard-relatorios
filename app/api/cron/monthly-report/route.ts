import { NextRequest, NextResponse } from 'next/server'
import { sendMonthlyReports } from '@/lib/monthly-report'

export const maxDuration = 300

// Trigger manual/externo do relatório mensal. O envio é IDEMPOTENTE (pula quem
// já recebeu o relatório do período), então pode ser chamado repetidamente:
// se o request for cortado no timeout (~300s), basta chamar de novo que ele
// continua de onde parou. O cron in-process (dias 1-3, 09:30) chama a mesma
// função DIRETO, sem HTTP — sem limite de tempo.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await sendMonthlyReports()

  return NextResponse.json({
    reports: {
      processed: result.processed,
      sent: result.sent,
      skippedAlreadySent: result.skippedAlreadySent,
      statuses: result.statuses,
    },
  })
}

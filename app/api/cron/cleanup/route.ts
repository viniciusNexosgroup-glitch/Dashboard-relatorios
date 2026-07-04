import { NextRequest, NextResponse } from 'next/server'
import { cleanOldData } from '@/lib/cleanup'

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await cleanOldData()

  return NextResponse.json({
    ok: true,
    metricsDeleted: result.metricsDeleted,
    syncLogsDeleted: result.syncLogsDeleted,
    metricsCutoff: result.metricsCutoff.toISOString(),
    syncLogCutoff: result.syncLogCutoff.toISOString(),
  })
}

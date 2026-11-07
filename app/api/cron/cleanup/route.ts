import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/auth'
import { cleanOldData } from '@/lib/cleanup'

export async function POST(req: NextRequest) {
  if (!isCronAuthorized(req)) {
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

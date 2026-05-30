import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const METRICS_RETENTION_DAYS = 90
const SYNC_LOG_RETENTION_DAYS = 30

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const metricsCutoff = new Date(now.getTime() - METRICS_RETENTION_DAYS * 24 * 60 * 60 * 1000)
  const syncLogCutoff = new Date(now.getTime() - SYNC_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000)

  const [metrics, logs] = await Promise.all([
    prisma.dailyMetric.deleteMany({ where: { date: { lt: metricsCutoff } } }),
    prisma.syncLog.deleteMany({ where: { startedAt: { lt: syncLogCutoff } } }),
  ])

  return NextResponse.json({
    ok: true,
    metricsDeleted: metrics.count,
    syncLogsDeleted: logs.count,
    metricsCutoff: metricsCutoff.toISOString(),
    syncLogCutoff: syncLogCutoff.toISOString(),
  })
}

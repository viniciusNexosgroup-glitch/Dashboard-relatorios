import { prisma } from './prisma'

// Política de retenção (Supabase free, 500 MB):
// - daily_metrics: 90 dias (cobre o filtro lastMonth, que alcança ~60 dias atrás)
// - sync_logs: 30 dias (histórico operacional suficiente)
export const METRICS_RETENTION_DAYS = 90
export const SYNC_LOG_RETENTION_DAYS = 30

export async function cleanOldData(): Promise<{
  metricsDeleted: number
  syncLogsDeleted: number
  metricsCutoff: Date
  syncLogCutoff: Date
}> {
  const now = Date.now()
  const metricsCutoff = new Date(now - METRICS_RETENTION_DAYS * 24 * 60 * 60 * 1000)
  const syncLogCutoff = new Date(now - SYNC_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000)

  const [metrics, logs] = await Promise.all([
    prisma.dailyMetric.deleteMany({ where: { date: { lt: metricsCutoff } } }),
    prisma.syncLog.deleteMany({ where: { startedAt: { lt: syncLogCutoff } } }),
  ])

  return {
    metricsDeleted: metrics.count,
    syncLogsDeleted: logs.count,
    metricsCutoff,
    syncLogCutoff,
  }
}

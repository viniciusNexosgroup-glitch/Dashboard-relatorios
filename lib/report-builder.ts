import { prisma } from './prisma'
import { computeClientMetrics } from './metrics'

// Monta o ReportData usado por TODOS os endpoints de PDF (Gerar PDF, Enviar
// WhatsApp, Cron Mensal). A agregação em si vive em UM só lugar —
// computeClientMetrics (lib/metrics.ts) — a mesma dos dashboards interno e
// compartilhado. Garante que dashboard e PDF nunca divergem.

export interface BuildReportInput {
  clientId: string
  start: Date
  end: Date
}

export async function buildReportData(input: BuildReportInput) {
  const { clientId, start, end } = input

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { name: true, company: true },
  })
  if (!client) throw new Error('Cliente não encontrado')

  const m = await computeClientMetrics({ clientId, start, end })

  return {
    client: { name: client.name, company: client.company },
    period: { start, end },
    byPlatform: m.byPlatform,
    summary: m.summary,
    campaigns: m.campaigns,
    ads: m.ads,
  }
}

import { prisma } from './prisma'
import { computeClientMetrics } from './metrics'
import { getClientGoogleSearchTerms, type GoogleSearchTerm } from './google-ads'
import { applyMetaPeriodReach } from './meta-ads'

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
  // Corrige o Alcance do Meta com o valor deduplicado do período (a soma diária infla)
  await applyMetaPeriodReach(m, clientId, start, end)

  // Termos de pesquisa do Google (o que os clientes digitaram) — só busca se
  // houve atividade no Google no período. É uma chamada AO VIVO na API do Google,
  // best-effort: qualquer falha aqui NUNCA derruba o relatório (fica sem a seção).
  let googleSearchTerms: GoogleSearchTerm[] = []
  if ((m.byPlatform?.GOOGLE?.spend || 0) > 0) {
    try {
      googleSearchTerms = await getClientGoogleSearchTerms(clientId, start, end)
    } catch (err) {
      console.error('[report-builder] falha ao buscar termos de pesquisa Google:', (err as Error).message)
    }
  }

  return {
    client: { name: client.name, company: client.company },
    period: { start, end },
    byPlatform: m.byPlatform,
    summary: m.summary,
    campaigns: m.campaigns,
    ads: m.ads,
    googleSearchTerms,
  }
}

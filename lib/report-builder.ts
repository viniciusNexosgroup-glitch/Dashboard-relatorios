import { prisma } from './prisma'
import { computeClientMetrics } from './metrics'
import { fetchGoogleSearchTerms, type GoogleSearchTerm } from './google-ads'

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

  // Termos de pesquisa do Google (o que os clientes digitaram) — só busca se
  // houve atividade no Google no período. É uma chamada AO VIVO na API do Google,
  // best-effort: qualquer falha aqui NUNCA derruba o relatório (fica sem a seção).
  let googleSearchTerms: GoogleSearchTerm[] = []
  if ((m.byPlatform?.GOOGLE?.spend || 0) > 0) {
    try {
      const googleAccounts = await prisma.adAccount.findMany({
        where: { clientId, platform: 'GOOGLE', active: true },
        select: { id: true },
      })
      const lists = await Promise.all(
        googleAccounts.map((a) => fetchGoogleSearchTerms(a.id, start, end, 15).catch(() => []))
      )
      // Reagrega entre contas (raro haver >1) e mantém os 12 mais pesquisados
      const merged = new Map<string, GoogleSearchTerm>()
      for (const t of lists.flat()) {
        const e = merged.get(t.term) || { term: t.term, impressions: 0, clicks: 0, conversions: 0, cost: 0 }
        e.impressions += t.impressions; e.clicks += t.clicks; e.conversions += t.conversions; e.cost += t.cost
        merged.set(t.term, e)
      }
      googleSearchTerms = Array.from(merged.values())
        .sort((a, b) => b.impressions - a.impressions)
        .slice(0, 12)
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

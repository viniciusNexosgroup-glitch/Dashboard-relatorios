// Helper compartilhado para classificar o tipo de resultado de uma campanha
// baseado no objetivo configurado no Meta Ads (e não pelo valor das métricas).
// Usado em metrics, reports/generate e monthly-report.

export type ResultMetrics = {
  leads: number
  msgConv: number
  conversions: number
  profileVisits: number
  landingPageViews: number
  linkClicks: number
}

export function getResultByObjective(
  objective: string | null | undefined,
  m: ResultMetrics
): { count: number; label: string } {
  const obj = (objective || '').toUpperCase()

  // Messaging objectives
  if (obj === 'MESSAGES' || obj === 'OUTCOME_MESSAGES') {
    return { count: m.msgConv, label: 'Conversas por mensagem' }
  }

  // Engagement (pode ser conversas ou perfil)
  if (obj === 'OUTCOME_ENGAGEMENT' || obj === 'POST_ENGAGEMENT' || obj === 'PAGE_LIKES' || obj === 'ENGAGEMENT') {
    if (m.msgConv > 0) return { count: m.msgConv, label: 'Conversas por mensagem' }
    if (m.profileVisits > 0) return { count: m.profileVisits, label: 'Visitas ao perfil' }
    return { count: 0, label: 'Engajamento' }
  }

  // Lead generation
  if (obj === 'LEAD_GENERATION' || obj === 'OUTCOME_LEADS') {
    return { count: m.leads, label: 'Leads' }
  }

  // Traffic / Link clicks
  if (obj === 'LINK_CLICKS' || obj === 'TRAFFIC' || obj === 'OUTCOME_TRAFFIC') {
    if (m.landingPageViews > 0) return { count: m.landingPageViews, label: 'Visitas à pág. de destino' }
    return { count: m.linkClicks, label: 'Cliques no link' }
  }

  // Conversions / Sales
  if (
    obj === 'CONVERSIONS' ||
    obj === 'OUTCOME_SALES' ||
    obj === 'PRODUCT_CATALOG_SALES' ||
    obj === 'CATALOG_SALES'
  ) {
    if (m.conversions > 0) return { count: m.conversions, label: 'Conversões' }
    if (m.msgConv > 0) return { count: m.msgConv, label: 'Conversas por mensagem' }
    return { count: 0, label: 'Conversões' }
  }

  // Awareness / Reach
  if (obj === 'REACH' || obj === 'BRAND_AWARENESS' || obj === 'OUTCOME_AWARENESS') {
    if (m.profileVisits > 0) return { count: m.profileVisits, label: 'Visitas ao perfil' }
    return { count: 0, label: 'Alcance' }
  }

  // Fallback heurístico (ignora "leads" como ruído)
  if (m.msgConv > 0) return { count: m.msgConv, label: 'Conversas por mensagem' }
  if (m.conversions > 0) return { count: m.conversions, label: 'Conversões' }
  if (m.profileVisits > 0) return { count: m.profileVisits, label: 'Visitas ao perfil' }
  if (m.landingPageViews > 0) return { count: m.landingPageViews, label: 'Visitas à pág. de destino' }
  if (m.linkClicks > 0) return { count: m.linkClicks, label: 'Cliques no link' }
  if (m.leads > 0) return { count: m.leads, label: 'Leads' }
  return { count: 0, label: '' }
}

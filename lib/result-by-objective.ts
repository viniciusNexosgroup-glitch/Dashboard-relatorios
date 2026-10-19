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
  instagramFollows?: number
  destinationType?: string | null
}

export const PROFILE_VISITS_LABEL = 'Visitas ao perfil'

// Campanha que leva as pessoas ao perfil do Instagram (ex: Tráfego/Reconhecimento
// com destino "Perfil do Instagram"). Usa o destino real do conjunto quando o sync
// já gravou; senão, heurística: sem conversas e com mais visitas ao perfil que à
// página de destino (campanhas de mensagem também geram visitas orgânicas ao perfil).
function isInstagramProfileCampaign(obj: string, m: ResultMetrics): boolean {
  if (m.destinationType) return m.destinationType.toUpperCase() === 'INSTAGRAM_PROFILE'
  const profileObjectives = [
    'LINK_CLICKS', 'TRAFFIC', 'OUTCOME_TRAFFIC',
    'REACH', 'BRAND_AWARENESS', 'OUTCOME_AWARENESS',
    'OUTCOME_ENGAGEMENT', 'POST_ENGAGEMENT', 'PAGE_LIKES', 'ENGAGEMENT',
  ]
  return profileObjectives.includes(obj) && m.msgConv === 0 && m.profileVisits > 0 && m.profileVisits > m.landingPageViews
}

export function getResultByObjective(
  objective: string | null | undefined,
  m: ResultMetrics
): { count: number; label: string; follows: number | null } {
  const obj = (objective || '').toUpperCase()

  // Campanha de perfil do Instagram: resultado = visitas ao perfil (+ seguidores ganhos)
  if (isInstagramProfileCampaign(obj, m)) {
    return { count: m.profileVisits, label: PROFILE_VISITS_LABEL, follows: m.instagramFollows || 0 }
  }

  const r = classify(obj, m)
  return { ...r, follows: null }
}

function classify(obj: string, m: ResultMetrics): { count: number; label: string } {
  // Visitas ao perfil NÃO entram aqui: só via isInstagramProfileCampaign (as demais
  // campanhas também acumulam visitas orgânicas ao perfil, que não são o resultado delas).

  // Messaging objectives
  if (obj === 'MESSAGES' || obj === 'OUTCOME_MESSAGES') {
    return { count: m.msgConv, label: 'Conversas por mensagem' }
  }

  // Engagement (conversas)
  if (obj === 'OUTCOME_ENGAGEMENT' || obj === 'POST_ENGAGEMENT' || obj === 'PAGE_LIKES' || obj === 'ENGAGEMENT') {
    if (m.msgConv > 0) return { count: m.msgConv, label: 'Conversas por mensagem' }
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
    return { count: 0, label: 'Alcance' }
  }

  // Fallback heurístico (ignora "leads" como ruído)
  if (m.msgConv > 0) return { count: m.msgConv, label: 'Conversas por mensagem' }
  if (m.conversions > 0) return { count: m.conversions, label: 'Conversões' }
  if (m.landingPageViews > 0) return { count: m.landingPageViews, label: 'Visitas à pág. de destino' }
  if (m.linkClicks > 0) return { count: m.linkClicks, label: 'Cliques no link' }
  if (m.leads > 0) return { count: m.leads, label: 'Leads' }
  return { count: 0, label: '' }
}

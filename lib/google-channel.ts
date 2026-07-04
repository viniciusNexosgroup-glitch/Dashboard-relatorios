// Tipo de campanha do Google Ads (campaign.advertising_channel_type) → rótulo/estilo.
// Fonte única — usada no dashboard interno (claro), compartilhado (escuro) e PDF.

export const GOOGLE_CHANNEL_LABEL: Record<string, string> = {
  SEARCH: 'Pesquisa',
  PERFORMANCE_MAX: 'Performance Max',
  DISPLAY: 'Display',
  SHOPPING: 'Shopping',
  VIDEO: 'Vídeo',
  SMART: 'Smart',
  DEMAND_GEN: 'Demand Gen',
  MULTI_CHANNEL: 'Multicanal',
}

// Tema claro (dashboard interno)
export const GOOGLE_CHANNEL_CLASS_LIGHT: Record<string, string> = {
  SEARCH: 'bg-blue-100 text-blue-700',
  PERFORMANCE_MAX: 'bg-orange-100 text-orange-700',
  DISPLAY: 'bg-purple-100 text-purple-700',
  SHOPPING: 'bg-cyan-100 text-cyan-700',
  VIDEO: 'bg-red-100 text-red-700',
  SMART: 'bg-green-100 text-green-700',
  DEMAND_GEN: 'bg-pink-100 text-pink-700',
  MULTI_CHANNEL: 'bg-gray-100 text-gray-600',
}

// Tema escuro (dashboard compartilhado do cliente)
export const GOOGLE_CHANNEL_CLASS_DARK: Record<string, string> = {
  SEARCH: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  PERFORMANCE_MAX: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
  DISPLAY: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  SHOPPING: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
  VIDEO: 'bg-red-500/10 text-red-400 border-red-500/30',
  SMART: 'bg-green-500/10 text-green-400 border-green-500/30',
  DEMAND_GEN: 'bg-pink-500/10 text-pink-400 border-pink-500/30',
  MULTI_CHANNEL: 'bg-slate-500/10 text-slate-300 border-slate-500/30',
}

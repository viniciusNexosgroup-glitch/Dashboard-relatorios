import axios from 'axios'

export type Group = { id: string; name: string; participants: number }

// Cache em memória do processo Node.js — compartilhado entre todos os requests deste server.
// fetchAllGroups da Evolution API é caro (segundos a minutos), grupos do WhatsApp mudam raramente.
const CACHE_TTL_MS = 30 * 60 * 1000  // 30 minutos
let cache: { data: Group[]; at: number } | null = null

function isFresh(): boolean {
  return !!cache && Date.now() - cache.at < CACHE_TTL_MS
}

export function getCachedGroups(): { data: Group[]; at: number } | null {
  return cache
}

export function clearGroupsCache() {
  cache = null
}

// Busca direto na Evolution API (sem usar cache)
async function fetchFromEvolution(): Promise<Group[]> {
  const url = process.env.EVOLUTION_API_URL
  const key = process.env.EVOLUTION_API_KEY
  const instance = process.env.EVOLUTION_INSTANCE_NAME || 'agencia'
  if (!url || !key) throw new Error('Evolution API não configurada')

  const res = await axios.get(
    `${url}/group/fetchAllGroups/${instance}?getParticipants=false`,
    { headers: { apikey: key }, timeout: 180_000 }
  )

  const groups: Group[] = (res.data || []).map((g: any) => ({
    id: g.id,
    name: g.subject || g.name || g.id,
    participants: g.size || 0,
  }))
  groups.sort((a, b) => a.name.localeCompare(b.name))
  return groups
}

// API principal: retorna do cache ou busca + cacheia
export async function getGroups(force = false): Promise<{ groups: Group[]; cached: boolean; stale?: boolean; error?: string }> {
  if (!force && isFresh()) {
    return { groups: cache!.data, cached: true }
  }
  try {
    const groups = await fetchFromEvolution()
    // Só cacheia se realmente tem dados — resposta vazia provavelmente é erro temporário
    if (groups.length > 0) {
      cache = { data: groups, at: Date.now() }
    }
    return { groups, cached: false }
  } catch (err: any) {
    console.error('[whatsapp-groups] Evolution API error:', err.message)
    // Degradação suave: se temos cache antigo, retorna ele com flag stale
    if (cache && cache.data.length > 0) {
      return { groups: cache.data, cached: true, stale: true, error: err.message }
    }
    return { groups: [], cached: false, error: err.message }
  }
}

// Pré-aquece o cache no startup do servidor (chamado pelo instrumentation/cron)
export async function warmGroupsCache(): Promise<{ ok: boolean; count: number; error?: string }> {
  try {
    const groups = await fetchFromEvolution()
    if (groups.length > 0) cache = { data: groups, at: Date.now() }
    return { ok: groups.length > 0, count: groups.length }
  } catch (err: any) {
    return { ok: false, count: 0, error: err.message }
  }
}

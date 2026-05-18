import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import axios from 'axios'

type Group = { id: string; name: string; participants: number }

// Cache em memória do processo Node.js (compartilhado entre requests do mesmo servidor)
const CACHE_TTL_MS = 5 * 60 * 1000  // 5 minutos
let cache: { data: Group[]; at: number } | null = null

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = process.env.EVOLUTION_API_URL
  const key = process.env.EVOLUTION_API_KEY
  const instance = process.env.EVOLUTION_INSTANCE_NAME || 'agencia'

  if (!url || !key) {
    return NextResponse.json({ groups: [], error: 'Evolution API não configurada' })
  }

  // Param ?force=1 ignora cache (botão Atualizar)
  const force = req.nextUrl.searchParams.get('force') === '1'
  const now = Date.now()
  if (!force && cache && now - cache.at < CACHE_TTL_MS) {
    return NextResponse.json({ groups: cache.data, cached: true, cachedAt: cache.at })
  }

  try {
    const res = await axios.get(
      `${url}/group/fetchAllGroups/${instance}?getParticipants=false`,
      { headers: { apikey: key }, timeout: 30_000 }
    )

    const groups: Group[] = (res.data || []).map((g: any) => ({
      id: g.id,
      name: g.subject || g.name || g.id,
      participants: g.size || 0,
    }))

    groups.sort((a, b) => a.name.localeCompare(b.name))

    // Atualiza cache
    cache = { data: groups, at: now }

    return NextResponse.json({ groups, cached: false })
  } catch (err: any) {
    // Em caso de erro, devolve cache stale se existir (degradação suave)
    if (cache) {
      return NextResponse.json({ groups: cache.data, cached: true, stale: true, error: err.message })
    }
    return NextResponse.json({ groups: [], error: err.message })
  }
}

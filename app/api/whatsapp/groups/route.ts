import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getGroups, clearGroupsCache } from '@/lib/whatsapp-groups-cache'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // ?force=1 ignora cache (botão "Atualizar")
  const force = req.nextUrl.searchParams.get('force') === '1'
  const result = await getGroups(force)
  return NextResponse.json(result)
}

// DELETE limpa o cache manualmente (debug)
export async function DELETE() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  clearGroupsCache()
  return NextResponse.json({ ok: true, message: 'Cache de grupos limpo' })
}

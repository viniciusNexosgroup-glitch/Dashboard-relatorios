import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import axios from 'axios'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = process.env.EVOLUTION_API_URL
  const key = process.env.EVOLUTION_API_KEY
  const instance = process.env.EVOLUTION_INSTANCE_NAME || 'agencia'

  if (!url || !key) {
    return NextResponse.json({ groups: [], error: 'Evolution API não configurada' })
  }

  try {
    const res = await axios.get(
      `${url}/group/fetchAllGroups/${instance}?getParticipants=false`,
      { headers: { apikey: key } }
    )

    const groups = (res.data || []).map((g: any) => ({
      id: g.id,
      name: g.subject || g.name || g.id,
      participants: g.size || 0,
    }))

    groups.sort((a: any, b: any) => a.name.localeCompare(b.name))

    return NextResponse.json({ groups })
  } catch (err: any) {
    return NextResponse.json({ groups: [], error: err.message })
  }
}

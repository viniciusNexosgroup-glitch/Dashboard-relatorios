import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { buildClientMoment, getMomentRange, setMomentGroup } from '@/lib/client-moment'
import { momentPatchSchema, momentQuerySchema, parseJson, parseQuery } from '@/lib/validators'

export const maxDuration = 120

// Tabela do Momento do Cliente para o período (consulta o Meta ao vivo para os criativos ativos)
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = parseQuery(req, momentQuerySchema)
  if ('error' in parsed) return parsed.error

  const { start, end } = getMomentRange(parsed.data.period || 'last7full')
  const rows = await buildClientMoment(start, end)
  return NextResponse.json({ start: start.toISOString(), end: end.toISOString(), rows })
}

// Liga/desliga a loja na tabela, salva a qualidade dos criativos ou troca o grupo de envio
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = await parseJson(req, momentPatchSchema)
  if ('error' in parsed) return parsed.error

  if ('group' in parsed.data) {
    await setMomentGroup(parsed.data.group)
    return NextResponse.json({ ok: true })
  }

  const { clientId, momentEnabled, creativeQuality } = parsed.data
  try {
    await prisma.client.update({
      where: { id: clientId },
      data: {
        ...(typeof momentEnabled === 'boolean' ? { momentEnabled } : {}),
        ...(creativeQuality !== undefined ? { creativeQuality } : {}),
      },
    })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    if (err.code === 'P2025') return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

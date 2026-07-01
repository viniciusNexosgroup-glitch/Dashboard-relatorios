import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// POST — gera (ou regenera) o token do dashboard publico do cliente.
// Body opcional { regenerate: true } troca o token, invalidando o link antigo.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  let regenerate = false
  try {
    const body = await req.json()
    regenerate = body?.regenerate === true
  } catch {
    // sem body — ok
  }

  const existing = await prisma.client.findUnique({ where: { id }, select: { shareToken: true } })
  if (!existing) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

  const shareToken = !regenerate && existing.shareToken ? existing.shareToken : randomUUID()

  const client = await prisma.client.update({
    where: { id },
    data: { shareToken },
    select: { id: true, shareToken: true },
  })
  return NextResponse.json(client)
}

// DELETE — revoga o link (remove o token). O link antigo passa a dar 404.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  try {
    await prisma.client.update({ where: { id }, data: { shareToken: null } })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    if (err.code === 'P2025') return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

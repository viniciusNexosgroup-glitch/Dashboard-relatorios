import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { clientBodySchema, parseJson } from '@/lib/validators'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const parsed = await parseJson(req, clientBodySchema)
  if ('error' in parsed) return parsed.error

  try {
    const client = await prisma.client.update({
      where: { id },
      data: {
        name: parsed.data.name,
        company: parsed.data.company,
        whatsappGroup: parsed.data.whatsappGroup || null,
        whatsappGroupName: parsed.data.whatsappGroupName || null,
        notes: parsed.data.notes || null,
        ...(typeof parsed.data.active === 'boolean' ? { active: parsed.data.active } : {}),
      },
    })
    return NextResponse.json(client)
  } catch (err: any) {
    if (err.code === 'P2025') return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  try {
    await prisma.client.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    if (err.code === 'P2025') return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

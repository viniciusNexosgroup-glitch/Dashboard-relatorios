import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { adAccountSchema, parseJson } from '@/lib/validators'
import { z } from 'zod'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = await parseJson(req, adAccountSchema)
  if ('error' in parsed) return parsed.error
  const body = parsed.data

  // Se vier __system__, usa o token do .env
  const accessToken =
    body.accessToken === '__system__'
      ? body.platform === 'GOOGLE'
        ? '__system__'
        : process.env.META_SYSTEM_USER_TOKEN || ''
      : body.accessToken || ''

  const refreshToken =
    body.refreshToken === '__system__'
      ? '__system__'
      : body.refreshToken || null

  try {
    const account = await prisma.adAccount.create({
      data: {
        clientId: body.clientId,
        platform: body.platform,
        accountId: body.accountId,
        accountName: body.accountName,
        accessToken,
        refreshToken,
      },
    })
    return NextResponse.json(account)
  } catch (err: any) {
    if (err.code === 'P2002') return NextResponse.json({ error: 'Conta já vinculada' }, { status: 409 })
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

const deleteSchema = z.object({ id: z.string().min(1) })

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = await parseJson(req, deleteSchema)
  if ('error' in parsed) return parsed.error

  try {
    await prisma.adAccount.delete({ where: { id: parsed.data.id } })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    if (err.code === 'P2025') return NextResponse.json({ error: 'Conta não encontrada' }, { status: 404 })
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

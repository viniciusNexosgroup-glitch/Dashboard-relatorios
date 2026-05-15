import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()

  // Se vier __system__, usa o token do .env
  const accessToken =
    body.accessToken === '__system__'
      ? body.platform === 'GOOGLE'
        ? '__system__'
        : process.env.META_SYSTEM_USER_TOKEN || ''
      : body.accessToken || ''

  const refreshToken =
    body.refreshToken === '__system__'
      ? process.env.GOOGLE_REFRESH_TOKEN || ''
      : body.refreshToken || null

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
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json()
  await prisma.adAccount.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}

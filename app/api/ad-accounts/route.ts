import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const account = await prisma.adAccount.create({
    data: {
      clientId: body.clientId,
      platform: body.platform,
      accountId: body.accountId,
      accountName: body.accountName,
      accessToken: body.accessToken || '',
      refreshToken: body.refreshToken || null,
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

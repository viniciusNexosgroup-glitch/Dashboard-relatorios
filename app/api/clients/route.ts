import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const clients = await prisma.client.findMany({
    include: { adAccounts: true },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json(clients)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const client = await prisma.client.create({
    data: {
      name: body.name,
      company: body.company,
      phone: body.phone,
      whatsappGroup: body.whatsappGroup || null,
      notes: body.notes || null,
    },
  })
  return NextResponse.json(client)
}

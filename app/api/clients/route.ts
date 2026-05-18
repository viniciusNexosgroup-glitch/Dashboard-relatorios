import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { clientBodySchema, parseJson } from '@/lib/validators'

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

  const parsed = await parseJson(req, clientBodySchema)
  if ('error' in parsed) return parsed.error

  try {
    const client = await prisma.client.create({
      data: {
        name: parsed.data.name,
        company: parsed.data.company,
        whatsappGroup: parsed.data.whatsappGroup || null,
        whatsappGroupName: parsed.data.whatsappGroupName || null,
        notes: parsed.data.notes || null,
        // active não setado: default true do schema
      },
    })
    return NextResponse.json(client)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

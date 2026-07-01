import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getDateRange } from '@/lib/utils'
import { computeClientMetrics } from '@/lib/metrics'

// Endpoint PUBLICO (sem auth) — alimenta o dashboard compartilhado.
// Acesso somente pelo token aleatorio do cliente; retorna apenas os dados daquele cliente.
const ALLOWED_PERIODS = new Set(['today', 'yesterday', 'last7days', 'last30days', 'thisMonth', 'lastMonth'])

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!token) return NextResponse.json({ error: 'Token ausente' }, { status: 400 })

  const client = await prisma.client.findUnique({
    where: { shareToken: token },
    select: { id: true, company: true, name: true, active: true },
  })
  if (!client || !client.active) {
    return NextResponse.json({ error: 'Dashboard não encontrado' }, { status: 404 })
  }

  const url = new URL(req.url)
  const periodParam = url.searchParams.get('period') || 'last30days'
  const period = ALLOWED_PERIODS.has(periodParam) ? periodParam : 'last30days'
  const { start, end } = getDateRange(period)

  const data = await computeClientMetrics({ clientId: client.id, start, end })

  return NextResponse.json({
    client: { company: client.company, name: client.name },
    period: { key: period, start: start.toISOString(), end: end.toISOString() },
    ...data,
  })
}

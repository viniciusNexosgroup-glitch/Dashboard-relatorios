import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDateRange } from '@/lib/utils'
import { computeClientMetrics } from '@/lib/metrics'
import { applyMetaPeriodReach } from '@/lib/meta-ads'
import { metricsQuerySchema, parseQuery } from '@/lib/validators'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = parseQuery(req, metricsQuerySchema)
  if ('error' in parsed) return parsed.error
  const { clientId, period } = parsed.data

  const { start, end } = getDateRange(period || 'last30days')
  const data = await computeClientMetrics({ clientId, start, end })
  // Corrige o Alcance do Meta com o valor deduplicado do período (a soma diária infla)
  await applyMetaPeriodReach(data, clientId, start, end)

  return NextResponse.json(data)
}

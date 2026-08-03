import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDateRange } from '@/lib/utils'
import { getClientGoogleSearchTerms } from '@/lib/google-ads'
import { metricsQuerySchema, parseQuery } from '@/lib/validators'

// Termos de pesquisa do Google para o dashboard interno. Endpoint SEPARADO do
// /api/metrics de propósito: é uma chamada AO VIVO na API do Google (não vem do
// banco), então fica isolado pra não pesar o carregamento das métricas nem o
// dashboard público do cliente. Best-effort: falha vira lista vazia, sem erro 500.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = parseQuery(req, metricsQuerySchema)
  if ('error' in parsed) return parsed.error
  const { clientId, period } = parsed.data

  const { start, end } = getDateRange(period || 'last30days')

  try {
    const terms = await getClientGoogleSearchTerms(clientId, start, end)
    return NextResponse.json({ terms })
  } catch (err) {
    console.error('[api/google-search-terms] falha:', (err as Error).message)
    return NextResponse.json({ terms: [] })
  }
}

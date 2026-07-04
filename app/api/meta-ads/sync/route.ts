import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { syncMetaAccount } from '@/lib/meta-ads'
import { syncBodySchema, parseJson } from '@/lib/validators'

export const maxDuration = 300 // 5 minutes

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = await parseJson(req, syncBodySchema)
  if ('error' in parsed) return parsed.error
  const { clientId } = parsed.data

  const accounts = await prisma.adAccount.findMany({
    where: {
      ...(clientId ? { clientId } : {}),
      platform: 'META',
      active: true,
    },
    select: { id: true },
  })

  const syncAll = async () => {
    const results = []
    for (const account of accounts) {
      try {
        const result = await syncMetaAccount(account.id)
        results.push({ accountId: account.id, ...result })
      } catch (err: any) {
        // Loga somente status + mensagem de erro do Meta. NÃO stringifica
        // a response completa (pode conter tokens / dados sensíveis em alguns erros).
        const metaErr = err.response?.data?.error
        console.error(
          `Sync failed for account ${account.id}:`,
          err.message,
          err.response?.status ? `(HTTP ${err.response.status})` : '',
          metaErr ? `Meta: ${metaErr.code || ''} ${metaErr.message || ''}`.trim() : ''
        )
        results.push({ accountId: account.id, success: false, error: err.message })
      }
    }
    return results
  }

  // Sem clientId = "Sincronizar Todos" (40+ contas, >5min) — roda em background
  // pra não morrer no requestTimeout de ~300s. O progresso aparece nos sync_logs.
  if (!clientId) {
    void syncAll().then((r) => console.log(`[sync-all META] concluído: ${r.length} contas`))
    return NextResponse.json({ started: accounts.length, background: true })
  }

  const results = await syncAll()
  return NextResponse.json({ results })
}

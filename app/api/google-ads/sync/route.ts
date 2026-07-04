import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { syncGoogleAccount } from '@/lib/google-ads'
import { syncBodySchema, parseJson } from '@/lib/validators'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = await parseJson(req, syncBodySchema)
  if ('error' in parsed) return parsed.error
  const { clientId } = parsed.data

  const accounts = await prisma.adAccount.findMany({
    where: {
      ...(clientId ? { clientId } : {}),
      platform: 'GOOGLE',
      active: true,
    },
    select: { id: true },
  })

  const syncAll = async () => {
    const results = []
    for (const account of accounts) {
      try {
        const result = await syncGoogleAccount(account.id)
        results.push({ accountId: account.id, ...result })
      } catch (err: any) {
        results.push({ accountId: account.id, success: false, error: err.message })
      }
    }
    return results
  }

  // Sem clientId = "Sincronizar Todos" — roda em background (ver rota do Meta)
  if (!clientId) {
    void syncAll().then((r) => console.log(`[sync-all GOOGLE] concluído: ${r.length} contas`))
    return NextResponse.json({ started: accounts.length, background: true })
  }

  const results = await syncAll()
  const failed = results.filter((r) => !r.success)
  return NextResponse.json(
    {
      results,
      ...(failed.length > 0 ? { error: failed.map((r) => r.error).join('; ') } : {}),
    },
    { status: failed.length > 0 ? 502 : 200 }
  )
}

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { refreshAccountFinancials } from '@/lib/meta-ads'
import { checkAndAlertLowBalances } from '@/lib/balance-alerts'

// Light endpoint: only refreshes balance/funding info for all META accounts (fast — seconds, not minutes).
export async function POST(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const accounts = await prisma.adAccount.findMany({
    where: { platform: 'META', active: true },
  })

  const results = await Promise.all(
    accounts.map(async (account) => {
      try {
        await refreshAccountFinancials(account.id)
        return { id: account.id, status: 'ok' }
      } catch (err: any) {
        return { id: account.id, status: 'error', error: err.message }
      }
    })
  )

  // Apos atualizar todos os saldos, verifica se algum cliente precisa de alerta
  const alerts = await checkAndAlertLowBalances()

  return NextResponse.json({ refreshed: results.length, results, alerts })
}

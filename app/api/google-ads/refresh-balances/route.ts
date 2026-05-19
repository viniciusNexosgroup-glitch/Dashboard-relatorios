import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { refreshGoogleAccountFinancials } from '@/lib/google-ads'

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const accounts = await prisma.adAccount.findMany({
    where: { platform: 'GOOGLE', active: true },
  })

  const results = await Promise.all(
    accounts.map(async (account) => {
      try {
        await refreshGoogleAccountFinancials(account.id)
        return { id: account.id, status: 'ok' }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Erro desconhecido'
        return { id: account.id, status: 'error', error: message }
      }
    })
  )

  return NextResponse.json({ refreshed: results.length, results })
}

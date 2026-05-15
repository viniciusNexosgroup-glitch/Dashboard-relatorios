import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { syncGoogleAccount } from '@/lib/google-ads'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { clientId } = await req.json()

  const accounts = await prisma.adAccount.findMany({
    where: { clientId, platform: 'GOOGLE', active: true },
  })

  const results = []
  for (const account of accounts) {
    try {
      const result = await syncGoogleAccount(account.id)
      results.push({ accountId: account.id, ...result })
    } catch (err: any) {
      results.push({ accountId: account.id, success: false, error: err.message })
    }
  }

  return NextResponse.json({ results })
}

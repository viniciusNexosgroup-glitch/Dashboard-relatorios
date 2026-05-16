import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { syncMetaAccount } from '@/lib/meta-ads'

export const maxDuration = 300 // 5 minutes

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { clientId } = body

  const accounts = await prisma.adAccount.findMany({
    where: {
      ...(clientId ? { clientId } : {}),
      platform: 'META',
      active: true,
    },
  })

  const results = []
  for (const account of accounts) {
    try {
      const result = await syncMetaAccount(account.id)
      results.push({ accountId: account.id, ...result })
    } catch (err: any) {
      console.error(`Sync failed for account ${account.id}:`, err.message)
      if (err.response?.data) {
        console.error('Meta API response:', JSON.stringify(err.response.data, null, 2))
      }
      results.push({ accountId: account.id, success: false, error: err.message })
    }
  }

  return NextResponse.json({ results })
}

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { syncMetaAccount } from '@/lib/meta-ads'
import { syncGoogleAccount } from '@/lib/google-ads'

// Called by cron at 08:00, 14:00, 20:00
// Protect with a secret header: Authorization: Bearer CRON_SECRET
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const accounts = await prisma.adAccount.findMany({
    where: { active: true },
  })

  const results: any[] = []

  for (const account of accounts) {
    try {
      if (account.platform === 'META') {
        await syncMetaAccount(account.id)
      } else {
        await syncGoogleAccount(account.id)
      }
      results.push({ id: account.id, platform: account.platform, status: 'success' })
    } catch (err: any) {
      results.push({ id: account.id, platform: account.platform, status: 'error', error: err.message })
    }
  }

  return NextResponse.json({ synced: results.length, results })
}

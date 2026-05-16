import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { DashboardView } from '@/components/dashboard/DashboardView'

export default async function DashboardPage() {
  await getServerSession(authOptions)

  const [clients, lastSyncGlobal, perClientSyncs] = await Promise.all([
    prisma.client.findMany({
      where: { active: true },
      include: {
        adAccounts: { select: { id: true, platform: true, accountName: true, active: true } },
      },
      orderBy: { company: 'asc' },
    }),
    prisma.syncLog.findFirst({
      where: { status: 'SUCCESS' },
      orderBy: { finishedAt: 'desc' },
    }),
    // Last successful sync per ad account → mapped to client
    prisma.syncLog.findMany({
      where: { status: 'SUCCESS' },
      orderBy: { finishedAt: 'desc' },
      distinct: ['adAccountId'],
      include: { adAccount: { select: { clientId: true } } },
    }),
  ])

  const lastSyncByClient: Record<string, string> = {}
  for (const log of perClientSyncs) {
    const clientId = log.adAccount.clientId
    if (!lastSyncByClient[clientId] && log.finishedAt) {
      lastSyncByClient[clientId] = log.finishedAt.toISOString()
    }
  }

  return (
    <DashboardView
      clients={clients}
      lastSync={lastSyncGlobal?.finishedAt?.toISOString() ?? null}
      lastSyncByClient={lastSyncByClient}
    />
  )
}

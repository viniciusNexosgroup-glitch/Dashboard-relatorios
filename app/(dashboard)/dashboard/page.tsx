import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { DashboardView } from '@/components/dashboard/DashboardView'

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)

  const [clients, lastSync] = await Promise.all([
    prisma.client.findMany({
      where: { active: true },
      include: {
        adAccounts: { select: { id: true, platform: true, accountName: true, active: true } },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.syncLog.findFirst({
      where: { status: 'SUCCESS' },
      orderBy: { finishedAt: 'desc' },
    }),
  ])

  return (
    <DashboardView
      clients={clients}
      lastSync={lastSync?.finishedAt?.toISOString() ?? null}
    />
  )
}

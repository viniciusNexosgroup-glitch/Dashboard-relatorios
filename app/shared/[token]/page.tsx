import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { prisma } from '@/lib/prisma'
import { getDateRange } from '@/lib/utils'
import { computeClientMetrics } from '@/lib/metrics'
import { SharedDashboard } from '@/components/shared/SharedDashboard'

export const dynamic = 'force-dynamic'

async function getClient(token: string) {
  return prisma.client.findUnique({
    where: { shareToken: token },
    select: { id: true, company: true, name: true, active: true },
  })
}

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params
  const client = await getClient(token)
  return { title: client ? `${client.company} — Dashboard` : 'Dashboard' }
}

export default async function SharedDashboardPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const client = await getClient(token)
  if (!client || !client.active) notFound()

  const defaultPeriod = 'last30days'
  const { start, end } = getDateRange(defaultPeriod)
  const data = await computeClientMetrics({ clientId: client.id, start, end })

  return (
    <SharedDashboard
      token={token}
      companyName={client.company}
      contactName={client.name}
      initialPeriod={defaultPeriod}
      initialData={{
        period: { key: defaultPeriod, start: start.toISOString(), end: end.toISOString() },
        ...data,
      }}
    />
  )
}

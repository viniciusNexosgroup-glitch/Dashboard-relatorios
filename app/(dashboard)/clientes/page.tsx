import { prisma } from '@/lib/prisma'
import { ClientsView } from '@/components/clients/ClientsView'

export default async function ClientesPage() {
  const clients = await prisma.client.findMany({
    include: {
      adAccounts: { select: { id: true, platform: true, accountName: true, active: true } },
      _count: { select: { reports: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return <ClientsView clients={clients} />
}

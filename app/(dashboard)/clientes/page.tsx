import { prisma } from '@/lib/prisma'
import { ClientsView } from '@/components/clients/ClientsView'

// Page renders straight from DB. Group names are stored in client.whatsappGroupName
// so we never block page render on the WhatsApp API.
export default async function ClientesPage() {
  const clients = await prisma.client.findMany({
    include: {
      adAccounts: { select: { id: true, platform: true, accountName: true, active: true } },
      _count: { select: { reports: true } },
    },
    orderBy: { company: 'asc' },
  })

  return <ClientsView clients={clients} />
}

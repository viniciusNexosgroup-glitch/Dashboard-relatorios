import { prisma } from '@/lib/prisma'
import { ShareLinksView } from '@/components/dashboard/ShareLinksView'

export default async function DashboardsPage() {
  const clients = await prisma.client.findMany({
    where: { active: true },
    select: { id: true, company: true, name: true, shareToken: true },
    orderBy: { company: 'asc' },
  })

  return <ShareLinksView clients={clients} />
}

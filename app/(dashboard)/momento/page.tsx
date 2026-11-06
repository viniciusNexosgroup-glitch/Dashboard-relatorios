import { prisma } from '@/lib/prisma'
import { getMomentGroup } from '@/lib/client-moment'
import { MomentoView } from '@/components/dashboard/MomentoView'

export default async function MomentoPage() {
  const [clients, group] = await Promise.all([
    prisma.client.findMany({
      where: { active: true },
      select: { id: true, company: true, momentEnabled: true },
    }),
    getMomentGroup(),
  ])

  return (
    <MomentoView
      clients={clients
        .map((c) => ({ id: c.id, company: c.company.trim(), momentEnabled: c.momentEnabled }))
        .sort((a, b) => a.company.localeCompare(b.company, 'pt-BR', { numeric: true, sensitivity: 'base' }))}
      group={group}
    />
  )
}

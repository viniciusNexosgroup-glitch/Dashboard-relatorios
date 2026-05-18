import { prisma } from '@/lib/prisma'
import { HistoricoView } from '@/components/dashboard/HistoricoView'

export default async function HistoricoPage() {
  const sends = await prisma.whatsappSend.findMany({
    include: {
      client: { select: { name: true, company: true } },
      report: { select: { title: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,  // ultimos 200
  })

  return (
    <HistoricoView
      sends={sends.map((s) => ({
        id: s.id,
        clientCompany: s.client?.company || null,
        clientName: s.client?.name || null,
        type: s.type,
        status: s.status,
        message: s.message,
        groupId: s.groupId,
        errorMessage: s.errorMessage,
        sentAt: s.sentAt?.toISOString() || null,
        createdAt: s.createdAt.toISOString(),
        reportTitle: s.report?.title || null,
      }))}
    />
  )
}

import { prisma } from '@/lib/prisma'
import { SaldosView } from '@/components/dashboard/SaldosView'

export default async function SaldosPage() {
  const accounts = await prisma.adAccount.findMany({
    where: { platform: 'META' },
    include: { client: { select: { name: true, company: true } } },
    orderBy: { balance: 'asc' },
  })

  return (
    <SaldosView
      accounts={accounts.map((a) => ({
        id: a.id,
        accountId: a.accountId,
        accountName: a.accountName,
        clientName: a.client?.company || null,
        clientResponsible: a.client?.name || null,
        balance: a.balance,
        amountSpent: a.amountSpent,
        spendCap: a.spendCap,
        currency: a.currency,
        accountStatus: a.accountStatus,
        fundingType: a.fundingType,
        fundingDisplay: a.fundingDisplay,
        active: a.active,
        balanceLastSync: a.balanceLastSync?.toISOString() ?? null,
      }))}
    />
  )
}

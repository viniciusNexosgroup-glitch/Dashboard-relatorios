import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { Sidebar } from '@/components/dashboard/Sidebar'
import { TopBar } from '@/components/dashboard/TopBar'
import { getMetaTokenExpiresAt } from '@/lib/meta-token'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  // Badge do token é informação secundária — se o banco estiver lento/instável,
  // não deve derrubar o dashboard inteiro. Falha silenciosa → badge mostra "não renovado".
  let tokenExpiresAt: Date | null = null
  try {
    tokenExpiresAt = await getMetaTokenExpiresAt()
  } catch (err) {
    console.error('[dashboard layout] falha ao buscar token expiry (DB?):', err)
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar user={session.user} tokenExpiresAt={tokenExpiresAt?.toISOString() ?? null} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}

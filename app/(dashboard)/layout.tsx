import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { AlertTriangle } from 'lucide-react'
import { authOptions } from '@/lib/auth'
import { Sidebar } from '@/components/dashboard/Sidebar'
import { TopBar } from '@/components/dashboard/TopBar'
import { getMetaTokenExpiresAt } from '@/lib/meta-token'
import { getCachedWhatsappHealth } from '@/lib/whatsapp-health'

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

  // Saúde do WhatsApp (do cache, rápido) — banner de alerta quando degradado.
  // É a rede de segurança PRINCIPAL: o app fica no ar mesmo com o WhatsApp fora,
  // então este banner é o canal que sempre chega no gestor.
  const waHealth = await getCachedWhatsappHealth().catch(() => null)

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar user={session.user} tokenExpiresAt={tokenExpiresAt?.toISOString() ?? null} />
        {waHealth && !waHealth.healthy && (
          <div className="bg-red-600 text-white px-6 py-3 flex items-start gap-3 shrink-0">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold">WhatsApp com problema — alertas e relatórios não estão chegando aos clientes.</p>
              <p className="text-red-100 mt-0.5">{waHealth.reason}</p>
            </div>
          </div>
        )}
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}

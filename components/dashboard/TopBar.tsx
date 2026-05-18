'use client'

import { signOut } from 'next-auth/react'
import { LogOut, Bell, KeyRound } from 'lucide-react'

interface Props {
  user?: { name?: string | null; email?: string | null }
  tokenExpiresAt?: string | null
}

const SP_TZ = 'America/Sao_Paulo'
function formatDateBR(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: SP_TZ, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso))
}

function getTokenStatus(iso: string | null | undefined) {
  if (!iso) return { color: 'bg-gray-100 text-gray-600 border-gray-200', label: 'Token Meta: não renovado ainda', days: null as number | null }
  const expiresAt = new Date(iso)
  const days = Math.floor((expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
  const formatted = formatDateBR(iso)
  if (days <= 0) return { color: 'bg-red-100 text-red-700 border-red-300', label: `Token Meta EXPIRADO em ${formatted}`, days }
  if (days < 7) return { color: 'bg-red-50 text-red-700 border-red-200', label: `Token Meta expira em ${days}d (${formatted})`, days }
  if (days < 21) return { color: 'bg-amber-50 text-amber-700 border-amber-200', label: `Token Meta: ${days}d (${formatted})`, days }
  return { color: 'bg-green-50 text-green-700 border-green-200', label: `Token Meta: ${days}d (${formatted})`, days }
}

export function TopBar({ user, tokenExpiresAt }: Props) {
  const token = getTokenStatus(tokenExpiresAt)

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0">
      <div>
        <div
          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium ${token.color}`}
          title={tokenExpiresAt ? `Renova automaticamente toda segunda 03:00 e antes de cada sync se faltar < 14 dias` : 'Aguardando primeira renovação'}
        >
          <KeyRound className="w-3.5 h-3.5" />
          <span>{token.label}</span>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <button className="text-gray-400 hover:text-gray-600 transition-colors" aria-label="Notificações">
          <Bell className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-sm font-medium text-gray-800">{user?.name}</p>
            <p className="text-xs text-gray-500">{user?.email}</p>
          </div>
          <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-sm font-medium">
            {user?.name?.[0]?.toUpperCase() || 'U'}
          </div>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="text-gray-400 hover:text-red-500 transition-colors"
            title="Sair"
            aria-label="Sair"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  )
}

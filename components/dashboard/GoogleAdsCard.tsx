'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'

interface Props {
  connectedEmail: string | null
  connectedAt: string | null
}

const SP_TZ = 'America/Sao_Paulo'
function formatDateBR(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: SP_TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

export function GoogleAdsCard({ connectedEmail, connectedAt }: Props) {
  const router = useRouter()
  const params = useSearchParams()
  const [disconnecting, setDisconnecting] = useState(false)
  const [flash, setFlash] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  useEffect(() => {
    const connected = params.get('google_connected')
    const error = params.get('google_error')
    if (connected === '1') setFlash({ type: 'success', message: 'Conta Google conectada com sucesso!' })
    else if (error) setFlash({ type: 'error', message: `Falha na conexão: ${error}` })
    if (connected || error) {
      // Limpa os params da URL sem recarregar
      const url = new URL(window.location.href)
      url.searchParams.delete('google_connected')
      url.searchParams.delete('google_error')
      window.history.replaceState({}, '', url)
      // Some o flash depois de 6s
      const t = setTimeout(() => setFlash(null), 6000)
      return () => clearTimeout(t)
    }
  }, [params])

  async function handleDisconnect() {
    if (!confirm('Desconectar a conta Google? Você precisará reconectar pra continuar usando Google Ads.')) return
    setDisconnecting(true)
    try {
      await fetch('/api/google-ads/oauth/disconnect', { method: 'POST' })
      router.refresh()
    } catch {}
    setDisconnecting(false)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-lg bg-red-100 flex items-center justify-center text-red-600 text-lg font-bold">
          G
        </div>
        <div>
          <h2 className="font-semibold text-gray-800">Google Ads</h2>
          <p className="text-xs text-gray-500">Conecte sua conta Google pra acessar contas de anúncios</p>
        </div>
      </div>

      {flash && (
        <div
          className={`mb-3 p-3 rounded-lg flex items-start gap-2 text-sm ${
            flash.type === 'success'
              ? 'bg-green-50 border border-green-200 text-green-800'
              : 'bg-red-50 border border-red-200 text-red-800'
          }`}
        >
          {flash.type === 'success' ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
          <span>{flash.message}</span>
        </div>
      )}

      {connectedEmail ? (
        <div className="space-y-3">
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-sm text-green-800">
              ✓ Conectado como <strong>{connectedEmail}</strong>
            </p>
            {connectedAt && (
              <p className="text-xs text-green-700 mt-0.5">Desde {formatDateBR(connectedAt)}</p>
            )}
          </div>
          <div className="flex gap-2">
            <a
              href="/api/google-ads/oauth/start"
              className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
            >
              Reconectar / Trocar de conta
            </a>
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="px-4 py-2 text-sm text-red-600 hover:bg-red-50 border border-red-200 rounded-lg disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {disconnecting && <Loader2 className="w-3 h-3 animate-spin" />}
              {disconnecting ? 'Desconectando...' : 'Desconectar'}
            </button>
          </div>
        </div>
      ) : (
        <div>
          <p className="text-sm text-gray-600 mb-3">Nenhuma conta Google conectada.</p>
          <a
            href="/api/google-ads/oauth/start"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors"
          >
            <span className="text-base">G</span>
            Conectar conta Google
          </a>
          <p className="text-xs text-gray-400 mt-2">
            Você será redirecionado pro Google pra autorizar acesso às suas contas de anúncios.
          </p>
        </div>
      )}
    </div>
  )
}

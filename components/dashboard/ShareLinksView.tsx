'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Link2, Copy, Check, RefreshCw, Trash2, ExternalLink, Plus } from 'lucide-react'

interface Client {
  id: string
  company: string
  name: string
  shareToken: string | null
}

interface Props {
  clients: Client[]
}

export function ShareLinksView({ clients }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const linkFor = (token: string) => `${origin}/shared/${token}`

  async function generate(id: string, regenerate = false) {
    setBusy(id)
    try {
      await fetch(`/api/clients/${id}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regenerate }),
      })
      router.refresh()
    } finally {
      setBusy(null)
    }
  }

  async function revoke(id: string) {
    if (!confirm('Revogar o link? O endereço atual deixará de funcionar.')) return
    setBusy(id)
    try {
      await fetch(`/api/clients/${id}/share`, { method: 'DELETE' })
      router.refresh()
    } finally {
      setBusy(null)
    }
  }

  async function copy(id: string, token: string) {
    try {
      await navigator.clipboard.writeText(linkFor(token))
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 1500)
    } catch {
      /* clipboard indisponivel */
    }
  }

  async function generateAll() {
    const missing = clients.filter((c) => !c.shareToken)
    if (missing.length === 0) return
    setBusy('all')
    try {
      await Promise.all(
        missing.map((c) =>
          fetch(`/api/clients/${c.id}/share`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          })
        )
      )
      router.refresh()
    } finally {
      setBusy(null)
    }
  }

  const missingCount = clients.filter((c) => !c.shareToken).length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboards dos Clientes</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Link público (somente leitura) para cada cliente acompanhar as métricas dele
          </p>
        </div>
        {missingCount > 0 && (
          <button
            onClick={generateAll}
            disabled={busy === 'all'}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {busy === 'all' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Gerar links de todos ({missingCount})
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        {clients.map((c) => (
          <div key={c.id} className="p-4 flex items-center gap-4 flex-wrap">
            <div className="min-w-48 flex-1">
              <p className="font-medium text-gray-800">{c.company}</p>
              <p className="text-xs text-gray-500">{c.name}</p>
            </div>

            {c.shareToken ? (
              <>
                <div className="flex-1 min-w-64 flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                  <Link2 className="w-4 h-4 text-gray-400 shrink-0" />
                  <input
                    readOnly
                    value={linkFor(c.shareToken)}
                    onFocus={(e) => e.currentTarget.select()}
                    className="flex-1 bg-transparent text-sm text-gray-600 outline-none"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => copy(c.id, c.shareToken!)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                  >
                    {copiedId === c.id ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copiedId === c.id ? 'Copiado' : 'Copiar'}
                  </button>
                  <a
                    href={linkFor(c.shareToken)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Abrir dashboard"
                    className="p-2 text-gray-400 hover:text-indigo-600 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                  <button
                    onClick={() => generate(c.id, true)}
                    disabled={busy === c.id}
                    title="Gerar novo link (invalida o atual)"
                    className="p-2 text-gray-400 hover:text-amber-600 disabled:opacity-50 transition-colors"
                  >
                    <RefreshCw className={`w-4 h-4 ${busy === c.id ? 'animate-spin' : ''}`} />
                  </button>
                  <button
                    onClick={() => revoke(c.id)}
                    disabled={busy === c.id}
                    title="Revogar link"
                    className="p-2 text-gray-400 hover:text-red-500 disabled:opacity-50 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </>
            ) : (
              <button
                onClick={() => generate(c.id)}
                disabled={busy === c.id}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors"
              >
                {busy === c.id ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                Gerar link
              </button>
            )}
          </div>
        ))}
        {clients.length === 0 && (
          <div className="p-12 text-center text-gray-400">Nenhum cliente ativo</div>
        )}
      </div>
    </div>
  )
}

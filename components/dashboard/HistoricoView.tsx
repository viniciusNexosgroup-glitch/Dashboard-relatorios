'use client'

import { useState } from 'react'
import { CheckCircle2, AlertCircle, MessageSquare, FileText, AlertTriangle, Filter as FilterIcon } from 'lucide-react'

interface Send {
  id: string
  clientCompany: string | null
  clientName: string | null
  type: string
  status: string
  message: string
  groupId: string
  errorMessage: string | null
  sentAt: string | null
  createdAt: string
  reportTitle: string | null
}

interface Props {
  sends: Send[]
}

const SP_TZ = 'America/Sao_Paulo'
function formatDateTime(iso: string): string {
  const d = new Date(iso)
  const date = new Intl.DateTimeFormat('pt-BR', { timeZone: SP_TZ, day: '2-digit', month: '2-digit', year: 'numeric' }).format(d)
  const time = new Intl.DateTimeFormat('pt-BR', { timeZone: SP_TZ, hour: '2-digit', minute: '2-digit' }).format(d)
  return `${date} às ${time}`
}

const typeMeta: Record<string, { label: string; color: string; Icon: any }> = {
  report: { label: 'Relatório', color: 'bg-indigo-100 text-indigo-700', Icon: FileText },
  low_balance_alert: { label: 'Alerta saldo baixo', color: 'bg-amber-100 text-amber-700', Icon: AlertTriangle },
  manual: { label: 'Manual', color: 'bg-gray-100 text-gray-700', Icon: MessageSquare },
}

const statusMeta: Record<string, { label: string; color: string; Icon: any }> = {
  SENT: { label: 'Enviado', color: 'bg-green-100 text-green-700', Icon: CheckCircle2 },
  ERROR: { label: 'Erro', color: 'bg-red-100 text-red-700', Icon: AlertCircle },
  PENDING: { label: 'Pendente', color: 'bg-gray-100 text-gray-600', Icon: MessageSquare },
  GROUP_NOT_CONFIGURED: { label: 'Sem grupo', color: 'bg-orange-100 text-orange-700', Icon: AlertCircle },
  ACCOUNT_DISCONNECTED: { label: 'Conta desconectada', color: 'bg-red-100 text-red-700', Icon: AlertCircle },
}

type Filter = 'all' | 'report' | 'low_balance_alert' | 'errors'

export function HistoricoView({ sends }: Props) {
  const [filter, setFilter] = useState<Filter>('all')
  const [expanded, setExpanded] = useState<string | null>(null)

  const filtered = sends.filter((s) => {
    if (filter === 'all') return true
    if (filter === 'errors') return s.status !== 'SENT'
    return s.type === filter
  })

  const counts = {
    all: sends.length,
    report: sends.filter((s) => s.type === 'report').length,
    low_balance_alert: sends.filter((s) => s.type === 'low_balance_alert').length,
    errors: sends.filter((s) => s.status !== 'SENT').length,
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Histórico de Envios</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Últimas {sends.length} mensagens enviadas via WhatsApp (relatórios, alertas, etc.)
        </p>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-2 flex-wrap">
        {([
          { value: 'all', label: 'Todas', count: counts.all },
          { value: 'report', label: 'Relatórios', count: counts.report },
          { value: 'low_balance_alert', label: 'Alertas de saldo', count: counts.low_balance_alert },
          { value: 'errors', label: 'Com erro', count: counts.errors },
        ] as { value: Filter; label: string; count: number }[]).map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === f.value
                ? f.value === 'errors' ? 'bg-red-600 text-white' : 'bg-indigo-600 text-white'
                : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            {f.label}
            <span className={`ml-1 text-xs ${filter === f.value ? 'text-white/70' : 'text-gray-400'}`}>
              ({f.count})
            </span>
          </button>
        ))}
      </div>

      {/* Lista */}
      <div className="space-y-2">
        {filtered.length === 0 && (
          <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-400">
            Nenhum envio nesta categoria.
          </div>
        )}
        {filtered.map((s) => {
          const tMeta = typeMeta[s.type] || typeMeta.manual
          const sMeta = statusMeta[s.status] || statusMeta.PENDING
          const TIcon = tMeta.Icon
          const SIcon = sMeta.Icon
          const isOpen = expanded === s.id
          return (
            <div
              key={s.id}
              className={`bg-white border rounded-xl overflow-hidden transition-colors ${s.status !== 'SENT' ? 'border-red-200' : 'border-gray-200'}`}
            >
              <button
                onClick={() => setExpanded(isOpen ? null : s.id)}
                className="w-full p-4 text-left hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${tMeta.color}`}>
                    <TIcon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="font-semibold text-gray-800 text-sm truncate">
                        {s.clientCompany || 'Cliente desconhecido'}
                      </p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${tMeta.color}`}>
                        {tMeta.label}
                      </span>
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${sMeta.color}`}>
                        <SIcon className="w-3 h-3" />
                        {sMeta.label}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">
                      {formatDateTime(s.sentAt || s.createdAt)}
                      {s.clientName && <span className="text-gray-400"> · {s.clientName}</span>}
                    </p>
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">{isOpen ? 'Recolher' : 'Detalhes'}</span>
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-gray-100 bg-gray-50/50 p-4 space-y-3 text-sm">
                  {s.errorMessage && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                      <p className="text-xs font-semibold text-red-700 mb-1">Erro:</p>
                      <p className="text-xs text-red-600 font-mono">{s.errorMessage}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 mb-1">Grupo WhatsApp:</p>
                    <p className="text-xs font-mono text-gray-700">{s.groupId || '—'}</p>
                  </div>
                  {s.reportTitle && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 mb-1">Relatório:</p>
                      <p className="text-xs text-gray-700">{s.reportTitle}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 mb-1">Mensagem:</p>
                    <pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans bg-white border border-gray-200 rounded p-3">
                      {s.message || '— (sem mensagem)'}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

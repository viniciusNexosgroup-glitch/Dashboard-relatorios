'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronUp, Download, Loader2, RefreshCw, Send } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

type Period = 'last7full' | 'thisMonth' | 'lastMonth'

const PERIODS: { value: Period; label: string }[] = [
  { value: 'last7full', label: 'Últimos 7 dias' },
  { value: 'thisMonth', label: 'Este mês' },
  { value: 'lastMonth', label: 'Mês passado' },
]

const QUALITIES = ['Ótimo', 'Bom', 'Regular', 'Ruim'] as const

const qualityColor: Record<string, string> = {
  'Ótimo': 'text-green-700 bg-green-50 border-green-200',
  'Bom': 'text-blue-700 bg-blue-50 border-blue-200',
  'Regular': 'text-amber-700 bg-amber-50 border-amber-200',
  'Ruim': 'text-red-700 bg-red-50 border-red-200',
}

interface Row {
  clientId: string
  company: string
  quality: string | null
  activeWhatsapp: number | null
  activeInstagram: number | null
  ranWhatsapp: number
  ranInstagram: number
  spend: number
  conversations: number
  cpl: number | null
  error?: string
}

interface Props {
  clients: { id: string; company: string; momentEnabled: boolean }[]
  group: { id: string; name: string } | null
}

// As fronteiras do período vêm ancoradas em meia-noite UTC — o dia certo é o componente UTC
const dayLabel = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/')
const errorMessage = (e: unknown) => (e instanceof Error ? e.message : 'Erro inesperado')

async function fetchMoment(period: Period): Promise<{ rows: Row[]; range: { start: string; end: string } } | { error: string }> {
  try {
    const res = await fetch(`/api/momento?period=${period}`)
    const data = await res.json()
    if (!res.ok) return { error: data.error || 'Erro ao carregar' }
    return { rows: data.rows, range: { start: data.start, end: data.end } }
  } catch (e) {
    return { error: errorMessage(e) }
  }
}

export function MomentoView({ clients: initialClients, group: initialGroup }: Props) {
  const [period, setPeriod] = useState<Period>('last7full')
  const [reloadKey, setReloadKey] = useState(0)
  const [rows, setRows] = useState<Row[]>([])
  const [range, setRange] = useState<{ start: string; end: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [clients, setClients] = useState(initialClients)
  const [showClients, setShowClients] = useState(false)

  const [group, setGroup] = useState(initialGroup)
  const [groups, setGroups] = useState<{ id: string; name: string }[] | null>(null)
  const [editingGroup, setEditingGroup] = useState(false)

  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)

  // Recarrega quando muda o período (ou no "Atualizar"); descarta resposta de um período já trocado
  useEffect(() => {
    let stale = false
    fetchMoment(period).then((result) => {
      if (stale) return
      if ('error' in result) {
        setError(result.error)
      } else {
        setRows(result.rows)
        setRange(result.range)
        setError(null)
      }
      setLoading(false)
    })
    return () => {
      stale = true
    }
  }, [period, reloadKey])

  function reload(p: Period = period) {
    setLoading(true)
    setPeriod(p)
    setReloadKey((k) => k + 1)
  }

  async function patch(body: object) {
    const res = await fetch('/api/momento', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error((await res.json()).error || 'Erro ao salvar')
  }

  async function changeQuality(clientId: string, quality: string) {
    const value = quality || null
    setRows((rs) => rs.map((r) => (r.clientId === clientId ? { ...r, quality: value } : r)))
    try {
      await patch({ clientId, creativeQuality: value })
    } catch (e) {
      setNotice({ ok: false, text: errorMessage(e) })
    }
  }

  async function toggleClient(clientId: string, momentEnabled: boolean) {
    setClients((cs) => cs.map((c) => (c.id === clientId ? { ...c, momentEnabled } : c)))
    try {
      await patch({ clientId, momentEnabled })
      reload()
    } catch (e) {
      setNotice({ ok: false, text: errorMessage(e) })
    }
  }

  async function openGroupPicker() {
    setEditingGroup(true)
    if (groups) return
    try {
      const data = await (await fetch('/api/whatsapp/groups')).json()
      setGroups(data.groups || [])
    } catch {
      setGroups([])
    }
  }

  async function changeGroup(id: string) {
    const picked = groups?.find((g) => g.id === id)
    if (!picked) return
    try {
      await patch({ group: { id: picked.id, name: picked.name } })
      setGroup({ id: picked.id, name: picked.name })
      setEditingGroup(false)
    } catch (e) {
      setNotice({ ok: false, text: errorMessage(e) })
    }
  }

  async function sendNow() {
    if (!group || sending) return
    if (!confirm(`Enviar agora a tabela dos últimos 7 dias para "${group.name}"?`)) return
    setSending(true)
    setNotice(null)
    try {
      const res = await fetch('/api/momento/send', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Falha no envio')
      setNotice({ ok: true, text: `Tabela com ${data.rows} lojas enviada para ${data.group}.` })
    } catch (e) {
      setNotice({ ok: false, text: errorMessage(e) })
    }
    setSending(false)
  }

  const enabledCount = clients.filter((c) => c.momentEnabled).length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Momento do Cliente</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Criativos ativos, custo por lead das campanhas de mensagens e qualidade dos criativos por loja
        </p>
      </div>

      {/* Envio automático */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap items-center gap-3">
        <Send className="w-5 h-5 text-indigo-600 shrink-0" />
        <div className="flex-1 min-w-[240px]">
          <p className="text-sm font-semibold text-gray-800">Envio automático toda quarta às 09:30</p>
          {editingGroup ? (
            <select
              className="mt-1 w-full max-w-md border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
              defaultValue={group?.id || ''}
              onChange={(e) => changeGroup(e.target.value)}
              disabled={!groups}
            >
              <option value="" disabled>{groups ? 'Escolha o grupo…' : 'Carregando grupos…'}</option>
              {groups?.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          ) : (
            <p className="text-sm text-gray-500">
              Últimos 7 dias completos (quarta a terça), em PDF, para{' '}
              {group ? <span className="font-medium text-gray-800">{group.name}</span> : <span className="text-red-600">nenhum grupo configurado</span>}
              {' · '}
              <button onClick={openGroupPicker} className="text-indigo-600 hover:underline">alterar</button>
            </p>
          )}
        </div>
        <button
          onClick={sendNow}
          disabled={!group || sending}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Enviar agora
        </button>
      </div>

      {notice && (
        <div className={`rounded-lg px-4 py-3 text-sm ${notice.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>
          {notice.text}
        </div>
      )}

      {/* Período + ações */}
      <div className="flex flex-wrap items-center gap-2">
        {PERIODS.map((p) => (
          <button
            key={p.value}
            onClick={() => reload(p.value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              period === p.value ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            {p.label}
          </button>
        ))}
        {range && (
          <span className="text-sm text-gray-500 ml-1">
            {dayLabel(range.start)} a {dayLabel(range.end)}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => reload()}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
          <a
            href={`/api/momento/pdf?period=${period}`}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            <Download className="w-4 h-4" />
            Baixar PDF
          </a>
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wide">Loja</th>
                <th className="text-center py-3 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wide">Criativos WhatsApp</th>
                <th className="text-center py-3 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wide">Criativos Instagram</th>
                <th className="text-center py-3 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wide">Custo por lead (mensagens)</th>
                <th className="text-center py-3 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wide">Qualidade</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={5} className="text-center text-gray-400 py-10">
                    <Loader2 className="w-5 h-5 animate-spin inline mr-2" />
                    Consultando os criativos ativos no Meta…
                  </td>
                </tr>
              )}
              {!loading && error && (
                <tr>
                  <td colSpan={5} className="text-center text-red-600 py-8">{error}</td>
                </tr>
              )}
              {!loading && !error && rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center text-gray-400 py-8">
                    Nenhuma loja no relatório. Marque as lojas em &quot;Lojas no relatório&quot; abaixo.
                  </td>
                </tr>
              )}
              {!loading && !error && rows.map((r) => (
                <tr key={r.clientId} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-3 px-4">
                    <p className="font-medium text-gray-800">{r.company}</p>
                    {r.error && (
                      <p className="text-xs text-red-600 mt-0.5 flex items-center gap-1" title={r.error}>
                        <AlertTriangle className="w-3 h-3" /> Meta indisponível para esta conta
                      </p>
                    )}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className="font-semibold text-gray-900">{r.activeWhatsapp ?? '—'}</span>
                    <span className="text-xs text-gray-400 ml-1">({r.ranWhatsapp} no período)</span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className="font-semibold text-gray-900">{r.activeInstagram ?? '—'}</span>
                    <span className="text-xs text-gray-400 ml-1">({r.ranInstagram} no período)</span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    {r.cpl != null ? (
                      <>
                        <p className="font-semibold text-gray-900">{formatCurrency(r.cpl)}</p>
                        <p className="text-xs text-gray-400">
                          {formatCurrency(r.spend)} ÷ {r.conversations.toLocaleString('pt-BR')} conversas
                        </p>
                      </>
                    ) : (
                      <span className="text-xs text-gray-400 italic">sem conversas</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <select
                      value={r.quality || ''}
                      onChange={(e) => changeQuality(r.clientId, e.target.value)}
                      className={`border rounded-lg px-2 py-1 text-sm font-semibold ${
                        r.quality ? qualityColor[r.quality] : 'text-gray-400 border-gray-300'
                      }`}
                    >
                      <option value="">—</option>
                      {QUALITIES.map((q) => (
                        <option key={q} value={q}>{q}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-gray-500 text-center">
        Criativos: ativos agora no Gerenciador (entre parênteses, quantos rodaram no período). Custo por lead: só campanhas de
        mensagens (WhatsApp) — visibilidade no perfil do Instagram não entra. Qualidade: avaliação do gestor, salva na hora.
      </p>

      {/* Lojas no relatório */}
      <div className="bg-white rounded-xl border border-gray-200">
        <button
          onClick={() => setShowClients((s) => !s)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-800"
        >
          Lojas no relatório ({enabledCount} de {clients.length})
          {showClients ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {showClients && (
          <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1">
            {clients.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm text-gray-700 py-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={c.momentEnabled}
                  onChange={(e) => toggleClient(c.id, e.target.checked)}
                  className="rounded border-gray-300 text-indigo-600"
                />
                {c.company}
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

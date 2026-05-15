'use client'

import { useState, useEffect } from 'react'
import { formatCurrency, formatNumber, formatPercent } from '@/lib/utils'
import { MetricsChart } from '@/components/charts/MetricsChart'
import { CampaignTable } from '@/components/dashboard/CampaignTable'
import {
  DollarSign,
  MousePointerClick,
  Eye,
  Users,
  TrendingUp,
  RefreshCw,
  FileText,
  Send,
} from 'lucide-react'

interface Client {
  id: string
  name: string
  company: string
  adAccounts: { id: string; platform: string; accountName: string; active: boolean }[]
}

interface Props {
  clients: Client[]
  lastSync: string | null
}

const DATE_FILTERS = [
  { label: 'Hoje', value: 'today' },
  { label: 'Ontem', value: 'yesterday' },
  { label: '7 dias', value: 'last7days' },
  { label: '30 dias', value: 'last30days' },
  { label: 'Este mês', value: 'thisMonth' },
  { label: 'Mês anterior', value: 'lastMonth' },
]

export function DashboardView({ clients, lastSync }: Props) {
  const [selectedClient, setSelectedClient] = useState<string>('')
  const [dateFilter, setDateFilter] = useState('last30days')
  const [metrics, setMetrics] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (selectedClient) fetchMetrics()
  }, [selectedClient, dateFilter])

  async function fetchMetrics() {
    if (!selectedClient) return
    setLoading(true)
    try {
      const res = await fetch(`/api/metrics?clientId=${selectedClient}&period=${dateFilter}`)
      const data = await res.json()
      setMetrics(data)
    } catch {}
    setLoading(false)
  }

  async function handleSync() {
    if (!selectedClient) return
    setSyncing(true)
    await fetch('/api/meta-ads/sync', {
      method: 'POST',
      body: JSON.stringify({ clientId: selectedClient }),
      headers: { 'Content-Type': 'application/json' },
    })
    await fetch('/api/google-ads/sync', {
      method: 'POST',
      body: JSON.stringify({ clientId: selectedClient }),
      headers: { 'Content-Type': 'application/json' },
    })
    setSyncing(false)
    fetchMetrics()
  }

  async function handleGeneratePDF() {
    if (!selectedClient) return
    setGenerating(true)
    try {
      const res = await fetch('/api/reports/generate', {
        method: 'POST',
        body: JSON.stringify({ clientId: selectedClient, period: dateFilter }),
        headers: { 'Content-Type': 'application/json' },
      })
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `relatorio-${selectedClient}-${dateFilter}.pdf`
      a.click()
    } catch {}
    setGenerating(false)
  }

  async function handleSendWhatsApp() {
    if (!selectedClient) return
    setSending(true)
    try {
      await fetch('/api/whatsapp/send', {
        method: 'POST',
        body: JSON.stringify({ clientId: selectedClient, period: dateFilter }),
        headers: { 'Content-Type': 'application/json' },
      })
      alert('Relatório enviado no WhatsApp!')
    } catch {
      alert('Erro ao enviar.')
    }
    setSending(false)
  }

  const s = metrics?.summary

  const cards = s
    ? [
        { label: 'Investimento Total', value: formatCurrency(s.totalSpend), icon: DollarSign, color: 'bg-indigo-500' },
        { label: 'Impressões', value: formatNumber(s.totalImpressions), icon: Eye, color: 'bg-blue-500' },
        { label: 'Cliques', value: formatNumber(s.totalClicks), icon: MousePointerClick, color: 'bg-cyan-500' },
        { label: 'Leads', value: formatNumber(s.totalLeads), icon: Users, color: 'bg-green-500' },
        { label: 'Conversões', value: formatNumber(s.totalConversions), icon: TrendingUp, color: 'bg-purple-500' },
        { label: 'CTR Médio', value: formatPercent(s.avgCtr), icon: MousePointerClick, color: 'bg-orange-500' },
        { label: 'CPC Médio', value: formatCurrency(s.avgCpc), icon: DollarSign, color: 'bg-rose-500' },
        { label: 'Custo por Lead', value: s.avgCpl > 0 ? formatCurrency(s.avgCpl) : 'N/A', icon: Users, color: 'bg-teal-500' },
      ]
    : []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          {lastSync && (
            <p className="text-sm text-gray-500 mt-0.5">
              Última atualização: {new Date(lastSync).toLocaleString('pt-BR')}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSync}
            disabled={!selectedClient || syncing}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Sincronizando...' : 'Sincronizar'}
          </button>
          <button
            onClick={handleGeneratePDF}
            disabled={!selectedClient || !metrics || generating}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            <FileText className="w-4 h-4" />
            {generating ? 'Gerando PDF...' : 'Gerar PDF'}
          </button>
          <button
            onClick={handleSendWhatsApp}
            disabled={!selectedClient || !metrics || sending}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            <Send className="w-4 h-4" />
            {sending ? 'Enviando...' : 'Enviar WhatsApp'}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap gap-4">
        <div className="flex-1 min-w-48">
          <label className="block text-xs font-medium text-gray-600 mb-1">Cliente</label>
          <select
            value={selectedClient}
            onChange={(e) => setSelectedClient(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">Selecione um cliente</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.company} – {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Período</label>
          <div className="flex gap-1">
            {DATE_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setDateFilter(f.value)}
                className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  dateFilter === f.value
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!selectedClient && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Selecione um cliente para ver as métricas</p>
        </div>
      )}

      {selectedClient && loading && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <RefreshCw className="w-8 h-8 text-indigo-400 mx-auto mb-3 animate-spin" />
          <p className="text-gray-500">Carregando métricas...</p>
        </div>
      )}

      {selectedClient && !loading && metrics && (
        <>
          {/* Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {cards.map((card) => (
              <div key={card.label} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-gray-500 font-medium">{card.label}</p>
                  <div className={`w-8 h-8 rounded-lg ${card.color} flex items-center justify-center`}>
                    <card.icon className="w-4 h-4 text-white" />
                  </div>
                </div>
                <p className="text-xl font-bold text-gray-900">{card.value}</p>
              </div>
            ))}
          </div>

          {/* Chart */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Evolução de Métricas</h3>
            <MetricsChart data={metrics.chartData || []} />
          </div>

          {/* Platform breakdown */}
          <div className="grid grid-cols-2 gap-4">
            {['META', 'GOOGLE'].map((platform) => {
              const ps = metrics.byPlatform?.[platform]
              if (!ps) return null
              return (
                <div key={platform} className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className={`w-2 h-2 rounded-full ${platform === 'META' ? 'bg-blue-500' : 'bg-red-500'}`} />
                    <h3 className="text-sm font-semibold text-gray-700">
                      {platform === 'META' ? 'Meta Ads' : 'Google Ads'}
                    </h3>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-gray-500">Investimento</p>
                      <p className="font-bold text-gray-900">{formatCurrency(ps.spend)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Cliques</p>
                      <p className="font-bold text-gray-900">{formatNumber(ps.clicks)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">CTR</p>
                      <p className="font-bold text-gray-900">{formatPercent(ps.ctr)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Leads</p>
                      <p className="font-bold text-gray-900">{formatNumber(ps.leads)}</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Campaigns Table */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Campanhas</h3>
            <CampaignTable campaigns={metrics.campaigns || []} />
          </div>
        </>
      )}
    </div>
  )
}

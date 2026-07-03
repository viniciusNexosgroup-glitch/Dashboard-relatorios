'use client'

import { useState, useEffect, useRef } from 'react'
import { formatCurrency, formatNumber, formatPercent } from '@/lib/utils'
import { MetricsChart } from '@/components/charts/MetricsChart'
import { CampaignTable } from '@/components/dashboard/CampaignTable'
import { GoogleCampaignTable } from '@/components/dashboard/GoogleCampaignTable'
import { AdTable } from '@/components/dashboard/AdTable'
import {
  DollarSign,
  MousePointerClick,
  Eye,
  Users,
  TrendingUp,
  RefreshCw,
  FileText,
  Send,
  MessageSquare,
  Infinity as InfinityIcon,
  BarChart3,
  Target,
  Sparkles,
} from 'lucide-react'

function GoogleIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  )
}

interface Client {
  id: string
  name: string
  company: string
  adAccounts: { id: string; platform: string; accountName: string; active: boolean }[]
}

interface Props {
  clients: Client[]
  lastSync: string | null
  lastSyncByClient?: Record<string, string>
}

const DATE_FILTERS = [
  { label: 'Hoje', value: 'today' },
  { label: 'Ontem', value: 'yesterday' },
  { label: '7 dias', value: 'last7days' },
  { label: '30 dias', value: 'last30days' },
  { label: 'Este mês', value: 'thisMonth' },
  { label: 'Mês anterior', value: 'lastMonth' },
]

export function DashboardView({ clients, lastSync, lastSyncByClient = {} }: Props) {
  const [selectedClient, setSelectedClient] = useState<string>('')
  const [dateFilter, setDateFilter] = useState('last30days')
  const [metrics, setMetrics] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Análise inteligente (IA) — só no sistema interno, nunca no dashboard do cliente/PDF
  const [analysis, setAnalysis] = useState<{ text: string; generatedAt: string } | null>(null)
  const [analyzing, setAnalyzing] = useState(false)

  function showToast(type: 'success' | 'error', message: string) {
    // Cancela timer anterior pra não limpar o toast novo prematuramente
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast({ type, message })
    toastTimerRef.current = setTimeout(() => setToast(null), 5000)
  }

  // Cleanup do timer quando o componente desmonta (evita setState em unmounted)
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (selectedClient) fetchMetrics()
  }, [selectedClient])

  useEffect(() => {
    if (selectedClient) fetchMetrics()
  }, [dateFilter])

  // Carrega a última análise cacheada ao trocar cliente/período (sem gerar nova)
  useEffect(() => {
    setAnalysis(null)
    if (!selectedClient) return
    fetch(`/api/analysis?clientId=${selectedClient}&period=${dateFilter}`)
      .then((r) => (r.ok ? r.json() : { analysis: null }))
      .then((d) => setAnalysis(d.analysis || null))
      .catch(() => {})
  }, [selectedClient, dateFilter])

  async function handleGenerateAnalysis() {
    if (!selectedClient || analyzing) return
    setAnalyzing(true)
    try {
      const res = await fetch('/api/analysis', {
        method: 'POST',
        body: JSON.stringify({ clientId: selectedClient, period: dateFilter }),
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `Erro ${res.status}`)
      setAnalysis(data.analysis)
      showToast('success', 'Análise gerada!')
    } catch (err: any) {
      showToast('error', err.message || 'Falha ao gerar análise')
    } finally {
      setAnalyzing(false)
    }
  }

  async function fetchMetrics() {
    if (!selectedClient) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/metrics?clientId=${selectedClient}&period=${dateFilter}`)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Erro ${res.status} ao carregar métricas`)
      }
      const data = await res.json()
      setMetrics(data)
    } catch (err: any) {
      setError(err.message || 'Falha ao buscar métricas')
      setMetrics(null)
    } finally {
      setLoading(false)
    }
  }

  async function handleSync() {
    if (syncing) return
    setSyncing(true)
    try {
      const body = selectedClient ? { clientId: selectedClient } : {}
      const [metaRes, googleRes] = await Promise.all([
        fetch('/api/meta-ads/sync', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }),
        fetch('/api/google-ads/sync', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }),
      ])
      const failures: string[] = []
      if (!metaRes.ok) failures.push('Meta Ads')
      if (!googleRes.ok) failures.push('Google Ads')
      if (failures.length > 0) {
        showToast('error', `Falha no sync: ${failures.join(' + ')}`)
      } else if (selectedClient) {
        fetchMetrics()
      }
    } catch (err: any) {
      showToast('error', `Erro de rede no sync: ${err.message}`)
    } finally {
      setSyncing(false)
    }
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
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Erro ${res.status} ao gerar PDF`)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `relatorio-${selectedClient}-${dateFilter}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      showToast('success', 'PDF gerado com sucesso')
    } catch (err: any) {
      showToast('error', err.message || 'Falha ao gerar PDF')
    } finally {
      setGenerating(false)
    }
  }

  async function handleSendWhatsApp() {
    if (!selectedClient) return
    setSending(true)
    try {
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        body: JSON.stringify({ clientId: selectedClient, period: dateFilter }),
        headers: { 'Content-Type': 'application/json' },
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Erro ${res.status} ao enviar`)
      }
      showToast('success', 'Relatório enviado no WhatsApp!')
    } catch (err: any) {
      showToast('error', err.message || 'Falha ao enviar WhatsApp')
    } finally {
      setSending(false)
    }
  }

  // ── Métricas separadas por plataforma (Meta e Google não se misturam) ──
  const meta = metrics?.byPlatform?.META
  const google = metrics?.byPlatform?.GOOGLE

  const metaCampaigns = (metrics?.campaigns || []).filter((c: any) => c.platform === 'META')
  const googleCampaigns = (metrics?.campaigns || []).filter((c: any) => c.platform === 'GOOGLE')
  const metaAds = (metrics?.ads || []).filter((a: any) => a.platform === 'META')

  const hasMeta = metaCampaigns.length > 0 || (meta?.spend || 0) > 0
  const hasGoogle = googleCampaigns.length > 0 || (google?.spend || 0) > 0

  const metaCards = meta
    ? [
        { label: 'Investimento', value: formatCurrency(meta.spend), icon: DollarSign, color: 'bg-indigo-500' },
        { label: 'Conversas por mensagem', value: formatNumber(meta.msgConversations || 0), icon: MessageSquare, color: 'bg-green-500' },
        { label: 'Custo por Conversa', value: (meta.costPerMsg || 0) > 0 ? formatCurrency(meta.costPerMsg) : 'N/A', icon: MessageSquare, color: 'bg-teal-500' },
        { label: 'Impressões', value: formatNumber(meta.impressions), icon: Eye, color: 'bg-blue-500' },
        { label: 'Alcance', value: formatNumber(meta.reach || 0), icon: Users, color: 'bg-purple-500' },
        { label: 'Cliques', value: formatNumber(meta.clicks), icon: MousePointerClick, color: 'bg-cyan-500' },
        { label: 'Frequência', value: (meta.frequency || 0).toFixed(2), icon: BarChart3, color: 'bg-amber-500' },
        { label: 'CTR Médio', value: formatPercent(meta.ctr || 0), icon: MousePointerClick, color: 'bg-orange-500' },
      ]
    : []

  const googleCards = google
    ? [
        { label: 'Investimento', value: formatCurrency(google.spend), icon: DollarSign, color: 'bg-indigo-500' },
        { label: 'Conversões', value: formatNumber(google.conversions || 0), icon: Target, color: 'bg-green-500' },
        { label: 'Custo por Conversão', value: (google.costPerConv || 0) > 0 ? formatCurrency(google.costPerConv) : 'N/A', icon: Target, color: 'bg-teal-500' },
        { label: 'Cliques', value: formatNumber(google.clicks), icon: MousePointerClick, color: 'bg-cyan-500' },
        { label: 'CPC Médio', value: formatCurrency(google.avgCpc || 0), icon: DollarSign, color: 'bg-rose-500' },
        { label: 'CTR Médio', value: formatPercent(google.ctr || 0), icon: BarChart3, color: 'bg-orange-500' },
      ]
    : []

  return (
    <div className="space-y-6">
      {/* Toast de feedback (auto-some em 5s) */}
      {toast && (
        <div
          className={`fixed top-6 right-6 z-50 px-4 py-3 rounded-lg shadow-lg border max-w-md transition-opacity ${
            toast.type === 'success'
              ? 'bg-green-50 border-green-300 text-green-800'
              : 'bg-red-50 border-red-300 text-red-800'
          }`}
          role="alert"
        >
          <p className="text-sm font-medium">{toast.message}</p>
        </div>
      )}

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
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-gray-700 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Sincronizando...' : selectedClient ? 'Sincronizar' : 'Sincronizar Todos'}
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
      <div className="bg-gray-50 rounded-xl border border-gray-300 p-4 flex flex-wrap gap-4">
        <div className="flex-1 min-w-48">
          <label className="block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wide">Cliente</label>
          <select
            value={selectedClient}
            onChange={(e) => setSelectedClient(e.target.value)}
            className="w-full px-3 py-2 border-2 border-gray-400 rounded-lg text-sm font-medium text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
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
          <label className="block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wide">Período</label>
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

      {selectedClient && !loading && error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <p className="text-red-700 font-medium">⚠️ {error}</p>
          <button
            onClick={fetchMetrics}
            className="mt-3 px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {selectedClient && !loading && !error && metrics && (
        <>
          {/* ════════════ ANÁLISE INTELIGENTE (IA) — só interno ════════════ */}
          <div className="bg-white rounded-xl border border-violet-200 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-violet-50 border-b border-violet-100">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-violet-600" />
                <h3 className="text-sm font-semibold text-violet-900">Análise Inteligente</h3>
                <span className="text-[10px] font-bold text-violet-600 bg-violet-100 px-1.5 py-0.5 rounded">IA</span>
              </div>
              <div className="flex items-center gap-3">
                {analysis && (
                  <span className="text-xs text-gray-400">
                    Gerada em {new Date(analysis.generatedAt).toLocaleString('pt-BR')}
                  </span>
                )}
                <button
                  onClick={handleGenerateAnalysis}
                  disabled={analyzing}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors"
                >
                  <RefreshCw className={`w-3 h-3 ${analyzing ? 'animate-spin' : ''}`} />
                  {analyzing ? 'Analisando...' : analysis ? 'Atualizar análise' : 'Gerar análise'}
                </button>
              </div>
            </div>
            {analysis ? (
              <div className="px-5 py-4 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                {analysis.text}
              </div>
            ) : (
              <div className="px-5 py-6 text-sm text-gray-400 text-center">
                {analyzing
                  ? 'A IA está analisando as campanhas do período — leva alguns segundos...'
                  : 'Clique em "Gerar análise" para um resumo do desempenho e sugestões de otimização feitas por IA.'}
              </div>
            )}
          </div>

          {/* ════════════ BLOCO META ADS ════════════ */}
          {hasMeta && (
            <>
              <div className="flex items-center gap-2 pt-2">
                <InfinityIcon className="w-6 h-6 text-blue-600" />
                <h2 className="text-lg font-bold text-gray-900">Meta Ads</h2>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {metaCards.map((card) => (
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

              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">Evolução de Métricas — Meta</h3>
                <MetricsChart data={metrics.chartDataByPlatform?.META || []} />
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">Campanhas Meta</h3>
                <CampaignTable campaigns={metaCampaigns} />
              </div>

              {metaAds.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-gray-700">Anúncios no Período</h3>
                    <span className="text-xs text-gray-400">{metaAds.length} anúncios</span>
                  </div>
                  <AdTable ads={metaAds} />
                </div>
              )}
            </>
          )}

          {/* ════════════ BLOCO GOOGLE ADS ════════════ */}
          {hasGoogle && (
            <>
              <div className={`flex items-center gap-2 pt-2 ${hasMeta ? 'border-t border-gray-200 mt-2 pt-6' : ''}`}>
                <GoogleIcon className="w-6 h-6" />
                <h2 className="text-lg font-bold text-gray-900">Google Ads</h2>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {googleCards.map((card) => (
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

              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">Campanhas Google</h3>
                <GoogleCampaignTable campaigns={googleCampaigns} />
              </div>
            </>
          )}

          {!hasMeta && !hasGoogle && (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
              Sem dados no período selecionado
            </div>
          )}
        </>
      )}
    </div>
  )
}

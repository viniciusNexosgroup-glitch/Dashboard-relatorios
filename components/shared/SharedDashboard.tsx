'use client'

import { useState } from 'react'
import { formatCurrency, formatNumber, formatPercent, formatDate } from '@/lib/utils'
import {
  DollarSign, MessageSquare, Eye, Users, MousePointerClick, BarChart3,
  Wallet, Calendar, Infinity as InfinityIcon, RefreshCw, Image as ImageIcon,
  ChevronRight, Target, ShoppingCart,
} from 'lucide-react'

const PERIODS = [
  { key: 'today', label: 'Hoje' },
  { key: 'yesterday', label: 'Ontem' },
  { key: 'last7days', label: '7 dias' },
  { key: 'last30days', label: '30 dias' },
  { key: 'thisMonth', label: 'Este mês' },
  { key: 'lastMonth', label: 'Mês anterior' },
]

// Meta cobra ~12,15% de impostos sobre a recarga — saldo liquido = bruto * (1 - 0.1215)
const META_TAX = 0.1215

// Rotulo generico do meio de pagamento — NAO expoe dados sensiveis (ex: final do cartao)
// num link publico/encaminhavel.
function fundingLabel(fundingType: string | null): string {
  switch (fundingType) {
    case 'credit_card': return 'Cartão de crédito'
    case 'extended_credit': return 'Crédito estendido (faturamento)'
    case 'monthly_invoicing': return 'Faturamento mensal'
    case 'google_limited': return 'Saldo não exposto pela API do Google para esta forma de pagamento.'
    default: return 'Saldo não disponível para este tipo de conta.'
  }
}

// Tipo de campanha do Google (advertising_channel_type) → badge igual ao Ads Manager
const GOOGLE_CHANNEL: Record<string, { label: string; cls: string }> = {
  SEARCH: { label: 'Pesquisa', cls: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
  PERFORMANCE_MAX: { label: 'Performance Max', cls: 'bg-orange-500/10 text-orange-400 border-orange-500/30' },
  DISPLAY: { label: 'Display', cls: 'bg-purple-500/10 text-purple-400 border-purple-500/30' },
  SHOPPING: { label: 'Shopping', cls: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30' },
  VIDEO: { label: 'Vídeo', cls: 'bg-red-500/10 text-red-400 border-red-500/30' },
  SMART: { label: 'Smart', cls: 'bg-green-500/10 text-green-400 border-green-500/30' },
  DEMAND_GEN: { label: 'Demand Gen', cls: 'bg-pink-500/10 text-pink-400 border-pink-500/30' },
  MULTI_CHANNEL: { label: 'Multicanal', cls: 'bg-slate-500/10 text-slate-300 border-slate-500/30' },
}

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

interface SharedData {
  period: { key: string; start: string; end: string }
  summary: any
  byPlatform: Record<string, any>
  campaigns: any[]
  tree: any[]
  ads: any[]
  accounts: any[]
}

interface Props {
  token: string
  companyName: string
  contactName: string
  initialPeriod: string
  initialData: SharedData
}

function statusBadge(status: string) {
  const s = (status || '').toUpperCase()
  const active = s === 'ACTIVE' || s === 'ATIVO' || s === 'ENABLED'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${
      active ? 'bg-green-500/10 text-green-400 border-green-500/30' : 'bg-slate-600/20 text-slate-400 border-slate-600/40'
    }`}>
      {active ? 'Ativo' : 'Pausado'}
    </span>
  )
}

export function SharedDashboard({ token, companyName, contactName, initialPeriod, initialData }: Props) {
  const [data, setData] = useState<SharedData>(initialData)
  const [period, setPeriod] = useState(initialPeriod)
  const [loading, setLoading] = useState(false)
  const [showPeriods, setShowPeriods] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function changePeriod(key: string) {
    setShowPeriods(false)
    if (key === period) return
    setLoading(true)
    try {
      const res = await fetch(`/api/shared/${token}/metrics?period=${key}`)
      if (res.ok) {
        const json = await res.json()
        setData(json)
        setPeriod(key)
      }
    } finally {
      setLoading(false)
    }
  }

  // ── Split por plataforma (Meta e Google NÃO se misturam, igual à Criativivo) ──
  const meta = data.byPlatform?.META
  const google = data.byPlatform?.GOOGLE

  const metaTree = (data.tree || []).filter((c) => c.platform === 'META')
  const googleCampaigns = (data.campaigns || []).filter((c) => c.platform === 'GOOGLE')

  const metaAccounts = (data.accounts || []).filter((a) => a.platform === 'META' && (a.balance != null || a.fundingType))
  const googleAccounts = (data.accounts || []).filter((a) => a.platform === 'GOOGLE' && (a.balance != null || a.fundingType))

  const hasMeta = metaTree.length > 0 || (meta?.spend || 0) > 0 || metaAccounts.length > 0
  const hasGoogle = googleCampaigns.length > 0 || (google?.spend || 0) > 0 || googleAccounts.length > 0

  const metaKpis = meta ? [
    { label: 'Investimento', value: formatCurrency(meta.spend), icon: DollarSign },
    { label: 'Conversas', value: formatNumber(meta.msgConversations || 0), icon: MessageSquare },
    { label: 'Custo por Conversa', value: (meta.costPerMsg || 0) > 0 ? formatCurrency(meta.costPerMsg) : 'N/A', icon: MessageSquare },
    { label: 'Impressões', value: formatNumber(meta.impressions), icon: Eye },
    { label: 'Alcance', value: formatNumber(meta.reach || 0), icon: Eye },
    { label: 'Cliques', value: formatNumber(meta.clicks), icon: Users },
    { label: 'Frequência', value: (meta.frequency || 0).toFixed(2), icon: BarChart3 },
    { label: 'CTR Médio', value: formatPercent(meta.ctr || 0), icon: MousePointerClick },
  ] : []

  const googleKpis = google ? [
    { label: 'Investimento', value: formatCurrency(google.spend), icon: DollarSign },
    { label: 'Conversões', value: formatNumber(google.conversions || 0), icon: Target },
    { label: 'Custo por Conversão', value: (google.costPerConv || 0) > 0 ? formatCurrency(google.costPerConv) : 'N/A', icon: ShoppingCart },
    { label: 'Cliques', value: formatNumber(google.clicks), icon: MousePointerClick },
    { label: 'CPC Médio', value: formatCurrency(google.avgCpc || 0), icon: DollarSign },
    { label: 'CTR Médio', value: formatPercent(google.ctr || 0), icon: BarChart3 },
  ] : []

  // Totais Meta (arvore)
  const metaSpend = metaTree.reduce((a, c) => a + c.spend, 0)
  const metaResults = metaTree.reduce((a, c) => a + (c.resultCount || 0), 0)
  const metaLinkClicks = metaTree.reduce((a, c) => a + (c.linkClicks || 0), 0)

  // Totais Google (tabela plana)
  const gSpend = googleCampaigns.reduce((a, c) => a + c.spend, 0)
  const gClicks = googleCampaigns.reduce((a, c) => a + (c.clicks || 0), 0)
  const gConversions = googleCampaigns.reduce((a, c) => a + (c.conversions || 0), 0)

  // Achata a arvore Meta em linhas visiveis conforme o que esta expandido
  type Row = { level: number; node: any; hasChildren: boolean; kind: 'camp' | 'set' | 'ad' }
  const rows: Row[] = []
  for (const camp of metaTree) {
    rows.push({ level: 0, node: camp, hasChildren: (camp.adSets?.length || 0) > 0, kind: 'camp' })
    if (expanded.has(camp.id)) {
      for (const set of camp.adSets || []) {
        rows.push({ level: 1, node: set, hasChildren: (set.ads?.length || 0) > 0, kind: 'set' })
        if (expanded.has(set.id)) {
          for (const ad of set.ads || []) rows.push({ level: 2, node: ad, hasChildren: false, kind: 'ad' })
        }
      }
    }
  }

  const topAds = (data.ads || []).filter((ad) => ad.platform === 'META').slice(0, 6)

  const periodLabel = `${formatDate(data.period.start)} - ${formatDate(data.period.end)}`

  const SectionTitle = ({ platform, children }: { platform: 'meta' | 'google'; children: React.ReactNode }) => (
    <div className="flex items-center gap-2 mb-4">
      {platform === 'meta' ? <InfinityIcon className="w-5 h-5 text-blue-400" /> : <GoogleIcon />}
      <h2 className="text-lg font-semibold text-white">{children}</h2>
    </div>
  )

  const KpiGrid = ({ items }: { items: { label: string; value: string; icon: any }[] }) => (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {items.map((k) => (
        <div key={k.label} className="bg-[#111f38] border border-slate-700/50 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-slate-400 font-medium">{k.label}</p>
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <k.icon className="w-4 h-4 text-blue-400" />
            </div>
          </div>
          <p className="text-2xl font-bold text-white">{k.value}</p>
        </div>
      ))}
    </div>
  )

  return (
    <div className="min-h-screen bg-[#0b1424] text-slate-200">
      {/* Header */}
      <div className="bg-[#0f1c33] border-b border-slate-800">
        <div className="max-w-6xl mx-auto px-6 py-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">{companyName}</h1>
            <p className="text-sm text-slate-400 mt-1">Período selecionado: {periodLabel}</p>
            <div className="relative mt-3">
              <button
                onClick={() => setShowPeriods((v) => !v)}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-700/50 hover:bg-slate-700 border border-slate-600/50 text-sm text-slate-200 transition-colors"
              >
                <Calendar className="w-4 h-4" />
                Alterar período
              </button>
              {showPeriods && (
                <div className="absolute z-20 mt-2 w-44 bg-[#16233d] border border-slate-700 rounded-lg shadow-xl p-1">
                  {PERIODS.map((p) => (
                    <button
                      key={p.key}
                      onClick={() => changePeriod(p.key)}
                      className={`block w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                        period === p.key ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-700/60'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {loading && <RefreshCw className="w-4 h-4 text-blue-400 animate-spin" />}
            <div className="text-right">
              <p className="text-sm font-semibold text-white leading-none">Tráfego Pro</p>
              <p className="text-[11px] text-slate-500 mt-1">Relatório de performance</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold">TP</div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-10">

        {/* ════════════════ BLOCO META ADS ════════════════ */}
        {hasMeta && (
          <>
            <section>
              <SectionTitle platform="meta">Visão Geral</SectionTitle>
              <KpiGrid items={metaKpis} />
            </section>

            {/* Tabela de Campanhas Meta (expansivel: campanha -> conjunto -> anuncio) */}
            <section>
              <SectionTitle platform="meta">Tabela de Campanhas</SectionTitle>
              <div className="bg-[#111f38] border border-slate-700/50 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-700/50">
                  <p className="text-white font-semibold">Tabela de Campanhas</p>
                  <p className="text-xs text-slate-400 mt-0.5">{metaTree.length} campanhas encontradas · clique para expandir</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-[#16233d] text-slate-400">
                      <tr>
                        <th className="text-left px-5 py-3 text-[11px] font-semibold uppercase tracking-wide">Campanha</th>
                        <th className="text-left px-3 py-3 text-[11px] font-semibold uppercase tracking-wide">Status</th>
                        <th className="text-right px-3 py-3 text-[11px] font-semibold uppercase tracking-wide">Gasto</th>
                        <th className="text-right px-3 py-3 text-[11px] font-semibold uppercase tracking-wide">Resultados</th>
                        <th className="text-right px-3 py-3 text-[11px] font-semibold uppercase tracking-wide">CPR</th>
                        <th className="text-right px-5 py-3 text-[11px] font-semibold uppercase tracking-wide">Cliques no Link</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {rows.map(({ level, node, hasChildren, kind }) => (
                        <tr
                          key={`${kind}-${node.id}`}
                          className={`hover:bg-slate-800/40 ${level === 1 ? 'bg-slate-800/10' : level === 2 ? 'bg-slate-800/20' : ''} ${hasChildren ? 'cursor-pointer' : ''}`}
                          onClick={hasChildren ? () => toggle(node.id) : undefined}
                        >
                          <td className="py-3 pr-3" style={{ paddingLeft: 20 + level * 22 }}>
                            <div className="flex items-center gap-2">
                              {hasChildren ? (
                                <ChevronRight className={`w-4 h-4 shrink-0 text-slate-400 transition-transform ${expanded.has(node.id) ? 'rotate-90' : ''}`} />
                              ) : (
                                <span className="w-4 shrink-0" />
                              )}
                              {kind === 'ad' && (
                                node.thumbnailUrl ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={node.thumbnailUrl} alt="" className="w-7 h-7 rounded object-cover bg-slate-800 shrink-0" />
                                ) : (
                                  <span className="w-7 h-7 rounded bg-slate-800 shrink-0 inline-flex items-center justify-center"><ImageIcon className="w-3.5 h-3.5 text-slate-600" /></span>
                                )
                              )}
                              <span className={`truncate ${level === 0 ? 'text-slate-100 font-medium' : 'text-slate-300'}`}>{node.name}</span>
                            </div>
                          </td>
                          <td className="px-3 py-3">{statusBadge(node.status)}</td>
                          <td className="px-3 py-3 text-right text-slate-200">{formatCurrency(node.spend)}</td>
                          <td className="px-3 py-3 text-right">
                            <span className="text-slate-100">{formatNumber(node.resultCount || 0)}</span>
                            {node.resultLabel && <span className="block text-[10px] text-slate-500">{node.resultLabel}</span>}
                          </td>
                          <td className="px-3 py-3 text-right text-slate-200">{node.cpr != null ? formatCurrency(node.cpr) : '—'}</td>
                          <td className="px-5 py-3 text-right text-slate-200">{formatNumber(node.linkClicks || 0)}</td>
                        </tr>
                      ))}
                      {metaTree.length === 0 && (
                        <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-500">Sem campanhas no período</td></tr>
                      )}
                    </tbody>
                    {metaTree.length > 0 && (
                      <tfoot>
                        <tr className="border-t border-slate-700 bg-[#16233d]/50 font-semibold text-slate-100">
                          <td className="px-5 py-3">Total</td>
                          <td className="px-3 py-3"></td>
                          <td className="px-3 py-3 text-right">{formatCurrency(metaSpend)}</td>
                          <td className="px-3 py-3 text-right">{formatNumber(metaResults)}</td>
                          <td className="px-3 py-3 text-right">{metaResults > 0 ? formatCurrency(metaSpend / metaResults) : '—'}</td>
                          <td className="px-5 py-3 text-right">{formatNumber(metaLinkClicks)}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            </section>

            {/* Melhores Anúncios (Meta) */}
            {topAds.length > 0 && (
              <section>
                <SectionTitle platform="meta">Melhores Anúncios</SectionTitle>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {topAds.map((ad, i) => (
                    <div key={i} className="bg-[#111f38] border border-slate-700/50 rounded-xl overflow-hidden">
                      <div className="flex gap-3 p-4">
                        {ad.thumbnailUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={ad.thumbnailUrl} alt={ad.name} className="w-16 h-16 rounded-lg object-cover shrink-0 bg-slate-800" />
                        ) : (
                          <div className="w-16 h-16 rounded-lg bg-slate-800 flex items-center justify-center shrink-0">
                            <ImageIcon className="w-5 h-5 text-slate-600" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-100 truncate">{ad.name}</p>
                          <p className="text-[11px] text-slate-500 truncate">{ad.campaignName}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 border-t border-slate-800 divide-x divide-slate-800 text-center">
                        <div className="py-2">
                          <p className="text-[10px] text-slate-500">Gasto</p>
                          <p className="text-xs font-semibold text-slate-200">{formatCurrency(ad.spend)}</p>
                        </div>
                        <div className="py-2">
                          <p className="text-[10px] text-slate-500">{ad.resultLabel || 'Resultados'}</p>
                          <p className="text-xs font-semibold text-slate-200">{formatNumber(ad.resultCount || 0)}</p>
                        </div>
                        <div className="py-2">
                          <p className="text-[10px] text-slate-500">CPR</p>
                          <p className="text-xs font-semibold text-slate-200">{ad.cpr != null ? formatCurrency(ad.cpr) : '—'}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Saldo da Conta (Meta) */}
            {metaAccounts.length > 0 && (
              <section>
                <SectionTitle platform="meta">Saldo da Conta</SectionTitle>
                <div className="space-y-4">
                  {metaAccounts.map((acc, i) => {
                    const bruto = acc.balance
                    const liquido = bruto != null ? bruto * (1 - META_TAX) : null
                    const isPrepaid = acc.fundingType === 'prepaid'
                    return (
                      <div key={i} className="bg-[#111f38] border border-slate-700/50 rounded-xl p-5">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div>
                            <p className="text-white font-semibold">{acc.accountName}</p>
                            <p className="text-[11px] text-slate-500 font-mono">ID: {acc.accountId}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-[11px] px-2 py-0.5 rounded-full border ${
                              acc.active ? 'bg-green-500/10 text-green-400 border-green-500/30' : 'bg-slate-600/20 text-slate-400 border-slate-600/40'
                            }`}>{acc.active ? 'Ativa' : 'Inativa'}</span>
                            {isPrepaid && <span className="text-[11px] px-2 py-0.5 rounded-full border bg-blue-500/10 text-blue-400 border-blue-500/30">Pré-paga</span>}
                          </div>
                        </div>
                        {liquido != null && isPrepaid ? (
                          <div className="mt-4 rounded-lg border border-green-500/30 bg-green-500/5 p-4">
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <div className="flex items-center gap-2 text-slate-300">
                                <Wallet className="w-4 h-4 text-green-400" />
                                <span className="text-sm">Saldo disponível:</span>
                              </div>
                              <div className="text-right">
                                <span className="text-xl font-bold text-green-400">{formatCurrency(liquido)}</span>
                                <span className="text-xs text-slate-400 ml-2">(Bruto: {formatCurrency(bruto)})</span>
                              </div>
                            </div>
                            <p className="text-[11px] text-slate-500 mt-2 text-right">Valor líquido já com desconto de 12,15% de impostos da Meta.</p>
                          </div>
                        ) : (
                          <div className="mt-4 rounded-lg border border-slate-700 bg-slate-800/30 p-4 text-sm text-slate-400">
                            {fundingLabel(acc.fundingType)}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>
            )}
          </>
        )}

        {/* ════════════════ BLOCO GOOGLE ADS ════════════════ */}
        {hasGoogle && (
          <>
            <section className={hasMeta ? 'pt-6 border-t border-slate-800' : ''}>
              <SectionTitle platform="google">Visão Geral</SectionTitle>
              <KpiGrid items={googleKpis} />
            </section>

            {/* Tabela de Campanhas Google (com tipo/objetivo, igual ao Ads Manager) */}
            <section>
              <SectionTitle platform="google">Tabela de Campanhas</SectionTitle>
              <div className="bg-[#111f38] border border-slate-700/50 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-700/50">
                  <p className="text-white font-semibold">Tabela de Campanhas</p>
                  <p className="text-xs text-slate-400 mt-0.5">{googleCampaigns.length} campanhas encontradas</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-[#16233d] text-slate-400">
                      <tr>
                        <th className="text-left px-5 py-3 text-[11px] font-semibold uppercase tracking-wide">Campanha</th>
                        <th className="text-left px-3 py-3 text-[11px] font-semibold uppercase tracking-wide">Status</th>
                        <th className="text-left px-3 py-3 text-[11px] font-semibold uppercase tracking-wide">Objetivo</th>
                        <th className="text-right px-3 py-3 text-[11px] font-semibold uppercase tracking-wide">Investimento</th>
                        <th className="text-right px-3 py-3 text-[11px] font-semibold uppercase tracking-wide">Cliques</th>
                        <th className="text-right px-3 py-3 text-[11px] font-semibold uppercase tracking-wide">CPC</th>
                        <th className="text-right px-3 py-3 text-[11px] font-semibold uppercase tracking-wide">Conversões</th>
                        <th className="text-right px-5 py-3 text-[11px] font-semibold uppercase tracking-wide">Custo/Conv.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {googleCampaigns.map((c, i) => {
                        const channel = c.objective ? GOOGLE_CHANNEL[c.objective] : null
                        const cpc = (c.clicks || 0) > 0 ? c.spend / c.clicks : null
                        const costConv = (c.conversions || 0) > 0 ? c.spend / c.conversions : null
                        return (
                          <tr key={i} className="hover:bg-slate-800/40">
                            <td className="px-5 py-3 text-slate-100 font-medium">{c.name}</td>
                            <td className="px-3 py-3">{statusBadge(c.status)}</td>
                            <td className="px-3 py-3">
                              {channel ? (
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${channel.cls}`}>{channel.label}</span>
                              ) : (
                                <span className="text-slate-500 text-xs">—</span>
                              )}
                            </td>
                            <td className="px-3 py-3 text-right text-slate-200">{formatCurrency(c.spend)}</td>
                            <td className="px-3 py-3 text-right text-slate-200">{formatNumber(c.clicks || 0)}</td>
                            <td className="px-3 py-3 text-right text-slate-200">{cpc != null ? formatCurrency(cpc) : '—'}</td>
                            <td className="px-3 py-3 text-right text-slate-100">{formatNumber(c.conversions || 0)}</td>
                            <td className="px-5 py-3 text-right text-slate-200">{costConv != null ? formatCurrency(costConv) : '—'}</td>
                          </tr>
                        )
                      })}
                      {googleCampaigns.length === 0 && (
                        <tr><td colSpan={8} className="px-5 py-10 text-center text-slate-500">Sem campanhas no período</td></tr>
                      )}
                    </tbody>
                    {googleCampaigns.length > 0 && (
                      <tfoot>
                        <tr className="border-t border-slate-700 bg-[#16233d]/50 font-semibold text-slate-100">
                          <td className="px-5 py-3">Total</td>
                          <td className="px-3 py-3"></td>
                          <td className="px-3 py-3"></td>
                          <td className="px-3 py-3 text-right">{formatCurrency(gSpend)}</td>
                          <td className="px-3 py-3 text-right">{formatNumber(gClicks)}</td>
                          <td className="px-3 py-3 text-right">{gClicks > 0 ? formatCurrency(gSpend / gClicks) : '—'}</td>
                          <td className="px-3 py-3 text-right">{formatNumber(gConversions)}</td>
                          <td className="px-5 py-3 text-right">{gConversions > 0 ? formatCurrency(gSpend / gConversions) : '—'}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            </section>

            {/* Saldo da Conta (Google) */}
            {googleAccounts.length > 0 && (
              <section>
                <SectionTitle platform="google">Saldo da Conta</SectionTitle>
                <div className="space-y-4">
                  {googleAccounts.map((acc, i) => (
                    <div key={i} className="bg-[#111f38] border border-slate-700/50 rounded-xl p-5">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div>
                          <p className="text-white font-semibold">{acc.accountName}</p>
                          <p className="text-[11px] text-slate-500 font-mono">ID: {acc.accountId}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[11px] px-2 py-0.5 rounded-full border ${
                            acc.active ? 'bg-green-500/10 text-green-400 border-green-500/30' : 'bg-slate-600/20 text-slate-400 border-slate-600/40'
                          }`}>{acc.active ? 'Ativa' : 'Inativa'}</span>
                          {acc.fundingType === 'monthly_invoicing' && (
                            <span className="text-[11px] px-2 py-0.5 rounded-full border bg-green-500/10 text-green-400 border-green-500/30">Faturamento Ativo</span>
                          )}
                        </div>
                      </div>
                      {acc.balance != null ? (
                        <div className="mt-4 rounded-lg border border-green-500/30 bg-green-500/5 p-4">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-2 text-slate-300">
                              <Wallet className="w-4 h-4 text-green-400" />
                              <span className="text-sm">Saldo disponível:</span>
                            </div>
                            <span className="text-xl font-bold text-green-400">{formatCurrency(acc.balance)}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-4 rounded-lg border border-slate-700 bg-slate-800/30 p-4 text-sm text-slate-400">
                          {fundingLabel(acc.fundingType)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {!hasMeta && !hasGoogle && (
          <div className="bg-[#111f38] border border-slate-700/50 rounded-xl p-12 text-center text-slate-500">
            Sem dados no período selecionado
          </div>
        )}

        <p className="text-center text-[11px] text-slate-600 pt-4">
          Dados extraídos das plataformas de anúncios · Atualizado automaticamente
        </p>
      </div>
    </div>
  )
}

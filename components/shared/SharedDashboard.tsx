'use client'

import { useState } from 'react'
import { formatCurrency, formatNumber, formatPercent, formatDate } from '@/lib/utils'
import {
  DollarSign, MessageSquare, Eye, Users, MousePointerClick, BarChart3,
  Wallet, Calendar, Infinity as InfinityIcon, RefreshCw, Image as ImageIcon,
  ChevronRight,
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
    default: return 'Saldo não disponível para este tipo de conta.'
  }
}

interface SharedData {
  period: { key: string; start: string; end: string }
  summary: any
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

  const s = data.summary
  const kpis = [
    { label: 'Investimento', value: formatCurrency(s.totalSpend), icon: DollarSign },
    { label: 'Conversas', value: formatNumber(s.totalMsgConv || 0), icon: MessageSquare },
    { label: 'Custo por Conversa', value: (s.avgCostPerMsg || 0) > 0 ? formatCurrency(s.avgCostPerMsg) : 'N/A', icon: MessageSquare },
    { label: 'Impressões', value: formatNumber(s.totalImpressions), icon: Eye },
    { label: 'Alcance', value: formatNumber(s.totalReach || 0), icon: Eye },
    { label: 'Cliques', value: formatNumber(s.totalClicks), icon: Users },
    { label: 'Frequência', value: (s.avgFrequency || 0).toFixed(2), icon: BarChart3 },
    { label: 'CTR Médio', value: formatPercent(s.avgCtr || 0), icon: MousePointerClick },
  ]

  const tree = data.tree || []
  const totalSpend = tree.reduce((a, c) => a + c.spend, 0)
  const totalResults = tree.reduce((a, c) => a + (c.resultCount || 0), 0)
  const totalLinkClicks = tree.reduce((a, c) => a + (c.linkClicks || 0), 0)

  // Achata a arvore em linhas visiveis conforme o que esta expandido
  type Row = { level: number; node: any; hasChildren: boolean; kind: 'camp' | 'set' | 'ad' }
  const rows: Row[] = []
  for (const camp of tree) {
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

  const topAds = (data.ads || []).slice(0, 6)
  const balanceAccounts = (data.accounts || []).filter((a) => a.balance != null || a.fundingType)

  const periodLabel = `${formatDate(data.period.start)} - ${formatDate(data.period.end)}`

  const SectionTitle = ({ children }: { children: React.ReactNode }) => (
    <div className="flex items-center gap-2 mb-4">
      <InfinityIcon className="w-5 h-5 text-blue-400" />
      <h2 className="text-lg font-semibold text-white">{children}</h2>
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
        {/* Visão Geral */}
        <section>
          <SectionTitle>Visão Geral</SectionTitle>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {kpis.map((k) => (
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
        </section>

        {/* Tabela de Campanhas (expansivel: campanha -> conjunto -> anuncio) */}
        <section>
          <SectionTitle>Tabela de Campanhas</SectionTitle>
          <div className="bg-[#111f38] border border-slate-700/50 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-700/50 flex items-center justify-between">
              <div>
                <p className="text-white font-semibold">Tabela de Campanhas</p>
                <p className="text-xs text-slate-400 mt-0.5">{tree.length} campanhas encontradas · clique para expandir</p>
              </div>
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
                  {tree.length === 0 && (
                    <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-500">Sem campanhas no período</td></tr>
                  )}
                </tbody>
                {tree.length > 0 && (
                  <tfoot>
                    <tr className="border-t border-slate-700 bg-[#16233d]/50 font-semibold text-slate-100">
                      <td className="px-5 py-3">Total</td>
                      <td className="px-3 py-3"></td>
                      <td className="px-3 py-3 text-right">{formatCurrency(totalSpend)}</td>
                      <td className="px-3 py-3 text-right">{formatNumber(totalResults)}</td>
                      <td className="px-3 py-3 text-right">{totalResults > 0 ? formatCurrency(totalSpend / totalResults) : '—'}</td>
                      <td className="px-5 py-3 text-right">{formatNumber(totalLinkClicks)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </section>

        {/* Melhores Anúncios */}
        {topAds.length > 0 && (
          <section>
            <SectionTitle>Melhores Anúncios</SectionTitle>
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

        {/* Saldo da Conta */}
        {balanceAccounts.length > 0 && (
          <section>
            <SectionTitle>Saldo da Conta</SectionTitle>
            <div className="space-y-4">
              {balanceAccounts.map((acc, i) => {
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

        <p className="text-center text-[11px] text-slate-600 pt-4">
          Dados extraídos das plataformas de anúncios · Atualizado automaticamente
        </p>
      </div>
    </div>
  )
}

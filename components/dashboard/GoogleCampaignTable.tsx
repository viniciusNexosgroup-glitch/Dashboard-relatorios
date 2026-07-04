'use client'

import { formatCurrency, formatNumber } from '@/lib/utils'
import { GOOGLE_CHANNEL_LABEL, GOOGLE_CHANNEL_CLASS_LIGHT } from '@/lib/google-channel'

interface Campaign {
  name: string
  status: string
  objective: string | null
  spend: number
  clicks: number
  conversions: number
}

export function GoogleCampaignTable({ campaigns }: { campaigns: Campaign[] }) {
  if (!campaigns.length) {
    return <p className="text-sm text-gray-400 text-center py-6">Nenhuma campanha no período.</p>
  }

  const tSpend = campaigns.reduce((a, c) => a + c.spend, 0)
  const tClicks = campaigns.reduce((a, c) => a + (c.clicks || 0), 0)
  const tConv = campaigns.reduce((a, c) => a + (c.conversions || 0), 0)

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="text-left py-2 pr-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Campanha</th>
            <th className="text-left py-2 pr-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
            <th className="text-left py-2 pr-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Objetivo</th>
            <th className="text-right py-2 pr-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Investimento</th>
            <th className="text-right py-2 pr-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Cliques</th>
            <th className="text-right py-2 pr-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">CPC</th>
            <th className="text-right py-2 pr-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Conversões</th>
            <th className="text-right py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Custo/Conv.</th>
          </tr>
        </thead>
        <tbody>
          {campaigns.map((c, i) => {
            const active = (c.status || '').toUpperCase() === 'ENABLED'
            const channel = c.objective && GOOGLE_CHANNEL_LABEL[c.objective]
              ? { label: GOOGLE_CHANNEL_LABEL[c.objective], cls: GOOGLE_CHANNEL_CLASS_LIGHT[c.objective] || 'bg-gray-100 text-gray-600' }
              : null
            const cpc = (c.clicks || 0) > 0 ? c.spend / c.clicks : null
            const costConv = (c.conversions || 0) > 0 ? c.spend / c.conversions : null
            return (
              <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                <td className="py-2.5 pr-4 font-medium text-gray-800 max-w-xs truncate">{c.name}</td>
                <td className="py-2.5 pr-4">
                  <span className={`inline-flex text-xs px-2 py-0.5 rounded-full font-medium ${
                    active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {active ? 'Ativa' : 'Pausada'}
                  </span>
                </td>
                <td className="py-2.5 pr-4">
                  {channel ? (
                    <span className={`inline-flex text-xs px-2 py-0.5 rounded-full font-medium ${channel.cls}`}>{channel.label}</span>
                  ) : (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </td>
                <td className="py-2.5 pr-4 text-right font-medium text-gray-800">{formatCurrency(c.spend)}</td>
                <td className="py-2.5 pr-4 text-right text-gray-700">{formatNumber(c.clicks || 0)}</td>
                <td className="py-2.5 pr-4 text-right text-gray-700">{cpc != null ? formatCurrency(cpc) : '—'}</td>
                <td className="py-2.5 pr-4 text-right text-gray-800">{formatNumber(c.conversions || 0)}</td>
                <td className="py-2.5 text-right text-gray-700">{costConv != null ? formatCurrency(costConv) : '—'}</td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-gray-200 font-semibold text-gray-800">
            <td className="py-2.5 pr-4">Total</td>
            <td className="py-2.5 pr-4"></td>
            <td className="py-2.5 pr-4"></td>
            <td className="py-2.5 pr-4 text-right">{formatCurrency(tSpend)}</td>
            <td className="py-2.5 pr-4 text-right">{formatNumber(tClicks)}</td>
            <td className="py-2.5 pr-4 text-right">{tClicks > 0 ? formatCurrency(tSpend / tClicks) : '—'}</td>
            <td className="py-2.5 pr-4 text-right">{formatNumber(tConv)}</td>
            <td className="py-2.5 text-right">{tConv > 0 ? formatCurrency(tSpend / tConv) : '—'}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

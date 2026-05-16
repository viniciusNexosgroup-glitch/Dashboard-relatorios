'use client'

import { formatCurrency, formatNumber } from '@/lib/utils'

interface Campaign {
  name: string
  platform: string
  status: string
  spend: number
  reach: number
  clicks: number
  linkClicks: number
  leads: number
  msgConversations: number
  conversions: number
  resultCount: number
  resultLabel: string
  roas: number | null
}

interface Props {
  campaigns: Campaign[]
}

export function CampaignTable({ campaigns }: Props) {
  if (!campaigns.length) {
    return <p className="text-sm text-gray-400 text-center py-6">Nenhuma campanha no período.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="text-left py-2 pr-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Campanha</th>
            <th className="text-left py-2 pr-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Plataforma</th>
            <th className="text-right py-2 pr-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Resultados</th>
            <th className="text-right py-2 pr-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Custo/Result.</th>
            <th className="text-right py-2 pr-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Cliques</th>
            <th className="text-right py-2 pr-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Valor Usado</th>
            <th className="text-right py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Alcance</th>
          </tr>
        </thead>
        <tbody>
          {campaigns.map((c, i) => {
            const costPerResult = c.resultCount > 0 ? c.spend / c.resultCount : null
            return (
              <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                <td className="py-2.5 pr-4 font-medium text-gray-800 max-w-xs truncate">{c.name}</td>
                <td className="py-2.5 pr-4">
                  <span className={`inline-flex text-xs px-2 py-0.5 rounded-full font-medium ${
                    c.platform === 'META' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {c.platform === 'META' ? 'Meta' : 'Google'}
                  </span>
                </td>
                <td className="py-2.5 pr-4 text-right">
                  <p className="text-gray-800">{formatNumber(c.resultCount)}</p>
                  {c.resultLabel && <p className="text-xs text-gray-400 mt-0.5">{c.resultLabel}</p>}
                </td>
                <td className="py-2.5 pr-4 text-right">
                  <p className="text-gray-700">{costPerResult ? formatCurrency(costPerResult) : '—'}</p>
                  {costPerResult && c.resultLabel && (
                    <p className="text-xs text-gray-400 mt-0.5">por {c.resultLabel.toLowerCase()}</p>
                  )}
                </td>
                <td className="py-2.5 pr-4 text-right text-gray-700">{formatNumber(c.clicks)}</td>
                <td className="py-2.5 pr-4 text-right font-medium text-gray-800">{formatCurrency(c.spend)}</td>
                <td className="py-2.5 text-right text-gray-700">{formatNumber(c.reach)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

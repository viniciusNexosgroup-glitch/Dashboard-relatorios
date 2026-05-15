'use client'

import { formatCurrency, formatNumber, formatPercent } from '@/lib/utils'

interface Campaign {
  name: string
  platform: string
  status: string
  spend: number
  impressions: number
  clicks: number
  ctr: number
  cpc: number
  leads: number
  conversions: number
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
            <th className="text-left py-2 pr-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
            <th className="text-right py-2 pr-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Invest.</th>
            <th className="text-right py-2 pr-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Impressões</th>
            <th className="text-right py-2 pr-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Cliques</th>
            <th className="text-right py-2 pr-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">CTR</th>
            <th className="text-right py-2 pr-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">CPC</th>
            <th className="text-right py-2 pr-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Leads</th>
            <th className="text-right py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">ROAS</th>
          </tr>
        </thead>
        <tbody>
          {campaigns.map((c, i) => (
            <tr key={i} className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${i % 2 === 0 ? '' : 'bg-gray-25'}`}>
              <td className="py-2.5 pr-4 font-medium text-gray-800 max-w-xs truncate">{c.name}</td>
              <td className="py-2.5 pr-4">
                <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                  c.platform === 'META'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-red-100 text-red-700'
                }`}>
                  {c.platform === 'META' ? 'Meta' : 'Google'}
                </span>
              </td>
              <td className="py-2.5 pr-4">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  c.status === 'ACTIVE' || c.status === 'ENABLED'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-600'
                }`}>
                  {c.status === 'ACTIVE' || c.status === 'ENABLED' ? 'Ativa' : 'Pausada'}
                </span>
              </td>
              <td className="py-2.5 pr-4 text-right text-gray-700">{formatCurrency(c.spend)}</td>
              <td className="py-2.5 pr-4 text-right text-gray-700">{formatNumber(c.impressions)}</td>
              <td className="py-2.5 pr-4 text-right text-gray-700">{formatNumber(c.clicks)}</td>
              <td className="py-2.5 pr-4 text-right text-gray-700">{formatPercent(c.ctr)}</td>
              <td className="py-2.5 pr-4 text-right text-gray-700">{formatCurrency(c.cpc)}</td>
              <td className="py-2.5 pr-4 text-right text-gray-700">{formatNumber(c.leads)}</td>
              <td className="py-2.5 text-right text-gray-700">{c.roas ? `${c.roas.toFixed(2)}x` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

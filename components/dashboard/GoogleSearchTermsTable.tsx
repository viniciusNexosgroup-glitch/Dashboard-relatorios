'use client'

import { formatNumber } from '@/lib/utils'

interface SearchTerm {
  term: string
  impressions: number
  clicks: number
  conversions: number
  cost: number
}

export function GoogleSearchTermsTable({ terms }: { terms: SearchTerm[] }) {
  if (!terms.length) {
    return <p className="text-sm text-gray-400 text-center py-6">Nenhum termo de pesquisa no período.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="text-left py-2 pr-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Termo pesquisado</th>
            <th className="text-right py-2 pr-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Impressões</th>
            <th className="text-right py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Cliques</th>
          </tr>
        </thead>
        <tbody>
          {terms.map((t, i) => {
            return (
              <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                <td className="py-2.5 pr-4 font-medium text-gray-800 max-w-md truncate">{t.term}</td>
                <td className="py-2.5 pr-4 text-right text-gray-700">{formatNumber(t.impressions)}</td>
                <td className="py-2.5 text-right text-gray-700">{formatNumber(t.clicks)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

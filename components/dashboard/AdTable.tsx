'use client'

import { formatCurrency, formatNumber } from '@/lib/utils'
import { ImageOff } from 'lucide-react'

interface Ad {
  name: string
  status: string
  thumbnailUrl: string | null
  platform: string
  campaignName: string
  spend: number
  reach: number
  clicks: number
  linkClicks: number
  leads: number
  msgConversations: number
  conversions: number
  resultCount: number
  resultLabel: string
}

interface Props {
  ads: Ad[]
}

export function AdTable({ ads }: Props) {
  if (!ads.length) {
    return <p className="text-sm text-gray-400 text-center py-6">Nenhum anúncio no período.</p>
  }

  return (
    <div className="space-y-2">
      {ads.map((ad, i) => {
        const costPerResult = ad.resultCount > 0 ? ad.spend / ad.resultCount : null

        return (
          <div key={i} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition-colors">
            {/* Thumbnail */}
            <div className="w-14 h-14 rounded-lg overflow-hidden bg-gray-100 shrink-0 flex items-center justify-center">
              {ad.thumbnailUrl ? (
                <img
                  src={ad.thumbnailUrl}
                  alt={ad.name}
                  className="w-full h-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
              ) : (
                <ImageOff className="w-5 h-5 text-gray-300" />
              )}
            </div>

            {/* Name + campaign */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{ad.name}</p>
              <p className="text-xs text-gray-400 truncate">{ad.campaignName}</p>
            </div>

            {/* Metrics */}
            <div className="hidden sm:flex items-center shrink-0">
              <div className="text-right w-36 px-2">
                <p className="text-xs text-gray-400">Resultados</p>
                <p className="text-sm font-semibold text-gray-800">{formatNumber(ad.resultCount)}</p>
                <p className="text-xs text-gray-400 truncate">{ad.resultLabel || ' '}</p>
              </div>
              <div className="text-right w-36 px-2">
                <p className="text-xs text-gray-400">Custo/Result.</p>
                <p className="text-sm font-semibold text-gray-800">{costPerResult ? formatCurrency(costPerResult) : '—'}</p>
                <p className="text-xs text-gray-400 truncate">
                  {costPerResult && ad.resultLabel ? `por ${ad.resultLabel.toLowerCase()}` : ' '}
                </p>
              </div>
              <div className="text-right w-20 px-2">
                <p className="text-xs text-gray-400">Cliques</p>
                <p className="text-sm font-semibold text-gray-800">{formatNumber(ad.clicks)}</p>
              </div>
              <div className="text-right w-28 px-2">
                <p className="text-xs text-gray-400">Valor Usado</p>
                <p className="text-sm font-bold text-gray-900">{formatCurrency(ad.spend)}</p>
              </div>
              <div className="text-right w-24 px-2">
                <p className="text-xs text-gray-400">Alcance</p>
                <p className="text-sm font-semibold text-gray-800">{formatNumber(ad.reach)}</p>
              </div>
            </div>

            {/* Platform badge */}
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
              ad.platform === 'META' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'
            }`}>
              {ad.platform === 'META' ? 'Meta' : 'Google'}
            </span>
          </div>
        )
      })}
    </div>
  )
}

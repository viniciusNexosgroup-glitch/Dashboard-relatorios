'use client'

import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import { formatCurrency, formatNumber } from '@/lib/utils'

interface ChartData {
  date: string
  spend: number
  clicks: number
  leads: number
  msgConversations: number
  conversions: number
  costPerMsg: number
}

interface Props {
  data: ChartData[]
}

export function MetricsChart({ data }: Props) {
  if (!data.length) {
    return <div className="h-64 flex items-center justify-center text-gray-400 text-sm">Sem dados no período</div>
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          yAxisId="left"
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `R$${v}`}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          formatter={(value: any, name: any) => {
            if (name === 'Investimento' || name === 'Custo por conversa') return formatCurrency(Number(value))
            return formatNumber(Number(value))
          }}
          contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12, backgroundColor: '#ffffff' }}
          labelStyle={{ color: '#1e293b', fontWeight: 600, marginBottom: 4 }}
          itemStyle={{ padding: 0 }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar yAxisId="left" dataKey="spend" name="Investimento" fill="#6366f1" opacity={0.8} radius={[4, 4, 0, 0]} />
        <Line yAxisId="right" type="monotone" dataKey="clicks" name="Cliques" stroke="#06b6d4" strokeWidth={2} dot={false} />
        <Line yAxisId="right" type="monotone" dataKey="msgConversations" name="Conversas por mensagem" stroke="#f59e0b" strokeWidth={2} dot={false} />
        <Line yAxisId="left" type="monotone" dataKey="costPerMsg" name="Custo por conversa" stroke="#22c55e" strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

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
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          tickLine={false}
          axisLine={false}
        />
        {/* Eixo esquerdo: quantidade de conversas (escala pequena, integer) */}
        <YAxis
          yAxisId="left"
          tick={{ fontSize: 11, fill: '#f59e0b' }}
          tickLine={false}
          axisLine={false}
          label={{
            value: 'Conversas por mensagem',
            angle: -90,
            position: 'insideLeft',
            style: { fontSize: 10, fill: '#f59e0b', fontWeight: 600 },
          }}
        />
        {/* Eixo direito: custo por conversa em R$ */}
        <YAxis
          yAxisId="right"
          orientation="right"
          tick={{ fontSize: 11, fill: '#22c55e' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `R$${v}`}
          label={{
            value: 'Custo por conversa',
            angle: 90,
            position: 'insideRight',
            style: { fontSize: 10, fill: '#22c55e', fontWeight: 600 },
          }}
        />
        <Tooltip
          formatter={(value: any, name: any) => {
            if (name === 'Custo por conversa') return formatCurrency(Number(value))
            return formatNumber(Number(value))
          }}
          contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12, backgroundColor: '#ffffff' }}
          labelStyle={{ color: '#1e293b', fontWeight: 600, marginBottom: 4 }}
          itemStyle={{ padding: 0 }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar
          yAxisId="left"
          dataKey="msgConversations"
          name="Conversas por mensagem"
          fill="#f59e0b"
          opacity={0.85}
          radius={[4, 4, 0, 0]}
        />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="costPerMsg"
          name="Custo por conversa"
          stroke="#22c55e"
          strokeWidth={2.5}
          dot={{ r: 3 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Wallet, RefreshCw, AlertTriangle, CheckCircle2, CreditCard } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

interface Account {
  id: string
  accountId: string
  accountName: string
  clientName: string | null
  clientResponsible: string | null
  balance: number | null
  amountSpent: number | null
  spendCap: number | null
  currency: string | null
  accountStatus: number | null
  fundingType: string | null
  active: boolean
  balanceLastSync: string | null
}

interface Props {
  accounts: Account[]
}

const LOW_BALANCE_THRESHOLD = 100

const statusLabel = (s: number | null) =>
  s === 1 ? 'Ativa' : s === 2 ? 'Desativada' : s === 3 ? 'Pendente fechamento' : s === 7 ? 'Bloqueada' : s === 9 ? 'Em revisão' : 'Desconhecida'

const statusColor = (s: number | null) =>
  s === 1 ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-700'

const fundingLabel: Record<string, string> = {
  prepaid: 'Pré-paga',
  credit_card: 'Cartão de crédito',
  extended_credit: 'Linha de crédito',
}

const isPrepaid = (ft: string | null) => ft === 'prepaid'

export function SaldosView({ accounts }: Props) {
  const router = useRouter()
  const [refreshing, setRefreshing] = useState(false)

  async function handleRefresh() {
    if (refreshing) return
    setRefreshing(true)
    try {
      await fetch('/api/meta-ads/sync', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      })
      router.refresh()
    } catch {}
    setRefreshing(false)
  }

  // Soma e contagem só consideram contas pré-pagas (postpaid não tem saldo real)
  const prepaidAccounts = accounts.filter((a) => isPrepaid(a.fundingType))
  const totalBalance = prepaidAccounts.reduce((s, a) => s + (a.balance || 0), 0)
  const totalSpent = accounts.reduce((s, a) => s + (a.amountSpent || 0), 0)
  const lowBalanceCount = prepaidAccounts.filter((a) => (a.balance || 0) < LOW_BALANCE_THRESHOLD).length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Saldos das Contas</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {accounts.length} contas Meta · {prepaidAccounts.length} pré-pagas · atualizadas a cada sincronização
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-gray-700 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Atualizando...' : 'Atualizar Saldos'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-gray-500 font-medium">Saldo Total (pré-pagas)</p>
            <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center">
              <Wallet className="w-4 h-4 text-white" />
            </div>
          </div>
          <p className="text-xl font-bold text-gray-900">{formatCurrency(totalBalance)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-gray-500 font-medium">Total Gasto (lifetime)</p>
            <div className="w-8 h-8 rounded-lg bg-purple-500 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4 text-white" />
            </div>
          </div>
          <p className="text-xl font-bold text-gray-900">{formatCurrency(totalSpent)}</p>
        </div>
        <div className={`rounded-xl border p-4 ${lowBalanceCount > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
          <div className="flex items-center justify-between mb-2">
            <p className={`text-xs font-medium ${lowBalanceCount > 0 ? 'text-red-700' : 'text-gray-500'}`}>
              Pré-pagas com saldo baixo
            </p>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${lowBalanceCount > 0 ? 'bg-red-500' : 'bg-gray-300'}`}>
              <AlertTriangle className="w-4 h-4 text-white" />
            </div>
          </div>
          <p className={`text-xl font-bold ${lowBalanceCount > 0 ? 'text-red-700' : 'text-gray-900'}`}>
            {lowBalanceCount} abaixo de {formatCurrency(LOW_BALANCE_THRESHOLD)}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wide">Conta</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wide">Cliente</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wide">Pagamento</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wide">Status</th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wide">Saldo</th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wide">Total Gasto</th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wide">Limite de Gasto</th>
              </tr>
            </thead>
            <tbody>
              {accounts.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center text-gray-400 py-8">
                    Nenhuma conta Meta vinculada. Vincule contas em <strong>Clientes</strong> e clique em <strong>Atualizar Saldos</strong>.
                  </td>
                </tr>
              )}
              {accounts.map((a) => {
                const prepaid = isPrepaid(a.fundingType)
                const balance = a.balance ?? 0
                const isLow = prepaid && balance < LOW_BALANCE_THRESHOLD
                const hasSync = !!a.balanceLastSync
                const fLabel = a.fundingType ? fundingLabel[a.fundingType] || 'Outro' : '—'
                return (
                  <tr key={a.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="py-3 px-4">
                      <p className="font-medium text-gray-800">{a.accountName}</p>
                      <p className="text-xs text-gray-400 font-mono">{a.accountId}</p>
                    </td>
                    <td className="py-3 px-4">
                      {a.clientName ? (
                        <>
                          <p className="text-gray-700">{a.clientName}</p>
                          <p className="text-xs text-gray-400">{a.clientResponsible}</p>
                        </>
                      ) : (
                        <span className="text-xs text-gray-400 italic">— sem cliente —</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {a.fundingType ? (
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                          prepaid ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                        }`}>
                          {!prepaid && <CreditCard className="w-3 h-3" />}
                          {fLabel}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400 italic">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(a.accountStatus)}`}>
                        {statusLabel(a.accountStatus)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {!hasSync ? (
                        <span className="text-xs text-gray-400 italic">não sincronizado</span>
                      ) : prepaid ? (
                        <p className={`font-bold ${isLow ? 'text-red-600' : 'text-gray-900'}`}>
                          {formatCurrency(balance)}
                        </p>
                      ) : (
                        <span className="text-xs text-gray-400 italic" title="Pós-pago não usa saldo">N/A</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right text-gray-700">
                      {a.amountSpent != null ? formatCurrency(a.amountSpent) : '—'}
                    </td>
                    <td className="py-3 px-4 text-right text-gray-700">
                      {a.spendCap != null && a.spendCap > 0 ? formatCurrency(a.spendCap) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-gray-500 text-center">
        ⚠️ Apenas contas <strong>pré-pagas</strong> têm saldo monitorado. Saldos abaixo de <strong>{formatCurrency(LOW_BALANCE_THRESHOLD)}</strong> ficam em vermelho.
        Contas pós-pagas (cartão / linha de crédito) cobram automaticamente e não exibem saldo.
        Atualização automática nos horários do cron (08:00, 14:00, 20:00).
      </p>
    </div>
  )
}

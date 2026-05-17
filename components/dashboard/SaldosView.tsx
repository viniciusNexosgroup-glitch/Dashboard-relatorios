'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw, AlertTriangle, CheckCircle2, CreditCard } from 'lucide-react'
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
  fundingDisplay: string | null
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

  // Ordenação: saldo baixo (vermelho) primeiro, depois pré-pagas OK, depois outras
  const sorted = [...accounts].sort((a, b) => {
    const aLow = isPrepaid(a.fundingType) && (a.balance ?? 0) < LOW_BALANCE_THRESHOLD && !!a.balanceLastSync
    const bLow = isPrepaid(b.fundingType) && (b.balance ?? 0) < LOW_BALANCE_THRESHOLD && !!b.balanceLastSync
    if (aLow && !bLow) return -1
    if (!aLow && bLow) return 1
    const aPre = isPrepaid(a.fundingType)
    const bPre = isPrepaid(b.fundingType)
    if (aPre && !bPre) return -1
    if (!aPre && bPre) return 1
    return (a.balance ?? 0) - (b.balance ?? 0)
  })

  const lowBalanceAccounts = accounts.filter(
    (a) => isPrepaid(a.fundingType) && !!a.balanceLastSync && (a.balance ?? 0) < LOW_BALANCE_THRESHOLD
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Saldos das Contas</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Monitora contas pré-pagas para avisar clientes quando precisam adicionar saldo
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

      {/* Banner de alerta */}
      {lowBalanceAccounts.length > 0 ? (
        <div className="bg-red-50 border-2 border-red-200 rounded-xl p-5 flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-red-500 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-red-800 text-base">
              {lowBalanceAccounts.length} {lowBalanceAccounts.length === 1 ? 'conta precisa' : 'contas precisam'} de recarga
            </h3>
            <p className="text-sm text-red-700 mt-1">
              {lowBalanceAccounts.length === 1 ? 'A conta abaixo está' : 'As contas abaixo estão'} com saldo menor que {formatCurrency(LOW_BALANCE_THRESHOLD)}.
              Avise {lowBalanceAccounts.length === 1 ? 'o cliente para adicionar saldo' : 'os clientes para adicionarem saldo'} antes que os anúncios pausem.
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-green-50 border border-green-200 rounded-xl p-5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-green-500 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-bold text-green-800 text-base">Tudo certo</h3>
            <p className="text-sm text-green-700 mt-0.5">
              Nenhuma conta pré-paga com saldo abaixo de {formatCurrency(LOW_BALANCE_THRESHOLD)}.
            </p>
          </div>
        </div>
      )}

      {/* Tabela */}
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
              </tr>
            </thead>
            <tbody>
              {accounts.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center text-gray-400 py-8">
                    Nenhuma conta Meta vinculada.
                  </td>
                </tr>
              )}
              {sorted.map((a) => {
                const prepaid = isPrepaid(a.fundingType)
                const balance = a.balance ?? 0
                const isLow = prepaid && !!a.balanceLastSync && balance < LOW_BALANCE_THRESHOLD
                const fLabel = a.fundingType ? fundingLabel[a.fundingType] || 'Outro' : '—'
                return (
                  <tr
                    key={a.id}
                    className={`border-b border-gray-50 transition-colors ${isLow ? 'bg-red-50/40 hover:bg-red-50' : 'hover:bg-gray-50'}`}
                  >
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
                        <div>
                          <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                            prepaid ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                          }`}>
                            {!prepaid && <CreditCard className="w-3 h-3" />}
                            {fLabel}
                          </span>
                          {a.fundingDisplay && (
                            <p className="text-xs text-gray-400 mt-1">{a.fundingDisplay}</p>
                          )}
                        </div>
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
                      {!a.balanceLastSync ? (
                        <span className="text-xs text-gray-400 italic">não sincronizado</span>
                      ) : prepaid ? (
                        <p className={`font-bold ${isLow ? 'text-red-600' : 'text-gray-900'}`}>
                          {formatCurrency(balance)}
                        </p>
                      ) : (
                        <span className="text-xs text-gray-400 italic" title="Pós-pago não usa saldo">N/A</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-gray-500 text-center">
        Apenas contas <strong>pré-pagas</strong> têm saldo monitorado. Atualização automática nos horários do cron (08:00, 14:00, 20:00).
      </p>
    </div>
  )
}

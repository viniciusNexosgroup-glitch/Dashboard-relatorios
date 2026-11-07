'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw, AlertTriangle, CheckCircle2, CreditCard } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

const SP_TZ = 'America/Sao_Paulo'
function formatLastSync(iso: string | null): string {
  if (!iso) return 'nunca'
  const d = new Date(iso)
  const date = new Intl.DateTimeFormat('pt-BR', { timeZone: SP_TZ, day: '2-digit', month: '2-digit', year: 'numeric' }).format(d)
  const time = new Intl.DateTimeFormat('pt-BR', { timeZone: SP_TZ, hour: '2-digit', minute: '2-digit' }).format(d)
  return `${date} às ${time}`
}

interface Account {
  id: string
  platform: 'META' | 'GOOGLE'
  accountId: string
  accountName: string
  clientName: string | null
  clientResponsible: string | null
  clientAlertsEnabled: boolean | null
  balance: number | null
  amountSpent: number | null
  spendCap: number | null
  currency: string | null
  accountStatus: number | null
  fundingType: string | null
  fundingDisplay: string | null
  active: boolean
  tokenError: string | null
  tokenErrorAt: string | null
  balanceLastSync: string | null
}

interface Props {
  accounts: Account[]
}

const LOW_BALANCE_THRESHOLD = 100

// No Google, 3 = anúncios parados com campanhas ativas (a API não informa cartão recusado)
const statusLabel = (s: number | null, platform: Account['platform']) =>
  s === 1 ? 'Ativa'
    : s === 2 ? 'Desativada'
    : s === 3 ? (platform === 'GOOGLE' ? 'Anúncios parados' : 'Pagamento pendente')
    : s === 7 ? (platform === 'GOOGLE' ? 'Suspensa' : 'Bloqueada')
    : s === 9 ? 'Falha na cobrança'
    : 'Desconhecida'

const statusColor = (s: number | null) =>
  s === 1 ? 'bg-green-100 text-green-700' : s === 3 || s === 9 ? 'bg-red-100 text-red-700' : 'bg-gray-200 text-gray-700'

const fundingLabel: Record<string, string> = {
  prepaid: 'Pré-paga',
  credit_card: 'Cartão de crédito',
  extended_credit: 'Linha de crédito',
  monthly_invoicing: 'Faturamento mensal',
  google_budget: 'Saldo (limite da conta)',
  google_unlimited: 'Pagamento automático',
  google_limited: 'Google limitado',
}

// Contas com saldo monitorado: Meta pré-paga e Google com limite de gasto (saldo = limite − gasto)
const isPrepaid = (ft: string | null) => ft === 'prepaid' || ft === 'google_budget'
const hasBalanceLikeValue = (a: Account) => isPrepaid(a.fundingType) || a.fundingType === 'monthly_invoicing'

type Filter = 'all' | 'prepaid' | 'postpaid'

// Lista das contas dentro dos quadros de alerta: plataforma, cliente, saldo e se o aviso
// automático no grupo do cliente está desligado (aí ninguém é avisado sem ação manual)
function AlertAccountList({ accounts, showBalance }: { accounts: Account[]; showBalance?: boolean }) {
  return (
    <ul className="mt-2 space-y-1">
      {accounts.map((a) => (
        <li key={a.id} className="text-sm text-red-800 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="font-semibold">{a.accountName}</span>
          <span className="text-xs text-red-600">
            {a.platform === 'META' ? 'Meta' : 'Google'}{a.clientName ? ` · ${a.clientName}` : ''}
          </span>
          {showBalance && <span className="font-bold">{formatCurrency(a.balance ?? 0)}</span>}
          {a.clientAlertsEnabled === false && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-white border border-red-200 text-red-600">
              aviso no WhatsApp desligado
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}

export function SaldosView({ accounts }: Props) {
  const router = useRouter()
  const [refreshing, setRefreshing] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')

  async function handleRefresh() {
    if (refreshing) return
    setRefreshing(true)
    try {
      // Endpoint leve: só atualiza saldo/funding (não faz sync de campanhas/anúncios)
      await Promise.all([
        fetch('/api/meta-ads/refresh-balances', { method: 'POST' }),
        fetch('/api/google-ads/refresh-balances', { method: 'POST' }),
      ])
      router.refresh()
    } catch {}
    setRefreshing(false)
  }

  // Aplica filtro de tipo (pré-paga / pós-paga / todas)
  const filtered = accounts.filter((a) => {
    if (filter === 'all') return true
    if (filter === 'prepaid') return isPrepaid(a.fundingType)
    return !isPrepaid(a.fundingType) && !!a.fundingType // pós-paga = qualquer coisa que não seja pré-paga
  })

  const prepaidCount = accounts.filter((a) => isPrepaid(a.fundingType)).length
  const postpaidCount = accounts.filter((a) => !isPrepaid(a.fundingType) && !!a.fundingType).length

  // Ordenação alfabética pelo nome da conta (alerta visual de saldo baixo já é dado pelo card vermelho no topo)
  const sorted = [...filtered].sort((a, b) =>
    a.accountName.localeCompare(b.accountName, 'pt-BR', { numeric: true })
  )

  const lowBalanceAccounts = accounts.filter(
    (a) => isPrepaid(a.fundingType) && !!a.balanceLastSync && (a.balance ?? 0) < LOW_BALANCE_THRESHOLD
  )
  // Status 3 = UNSETTLED (pagamento recusado, anúncios pausados) | 9 = falha na cobrança (vai pausar)
  const paymentIssueAccounts = accounts.filter((a) => a.accountStatus === 3 || a.accountStatus === 9)
  const tokenErrorAccounts = accounts.filter((a) => !!a.tokenError)

  // Horário do sync mais recente entre todas as contas
  const latestSync = accounts
    .map((a) => a.balanceLastSync)
    .filter((x): x is string => !!x)
    .sort()
    .pop() ?? null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Saldos das Contas</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Monitora saldo e pagamento das contas Meta e Google para avisar os clientes
          </p>
          {latestSync && (
            <p className="text-xs text-gray-400 mt-1">
              Última atualização: <span className="font-medium text-gray-600">{formatLastSync(latestSync)}</span>
            </p>
          )}
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

      {/* Banner de token expirado (mais grave que saldo baixo, vem antes) */}
      {tokenErrorAccounts.length > 0 && (
        <div className="bg-orange-50 border-2 border-orange-300 rounded-xl p-5 flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-orange-500 flex items-center justify-center shrink-0 text-white text-xl">
            🔑
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-orange-800 text-base">
              {tokenErrorAccounts.length} {tokenErrorAccounts.length === 1 ? 'conta com token' : 'contas com tokens'} expirado/inválido
            </h3>
            <p className="text-sm text-orange-700 mt-1">
              {tokenErrorAccounts.length === 1 ? 'A conta' : 'As contas'} abaixo {tokenErrorAccounts.length === 1 ? 'precisa' : 'precisam'} de um novo token Meta.
              Enquanto isso, os syncs vão falhar e os dados não vão atualizar. Renove o token no painel do Meta Business.
            </p>
            <ul className="mt-2 text-xs text-orange-700 space-y-1">
              {tokenErrorAccounts.map((a) => (
                <li key={a.id}>• <strong>{a.accountName}</strong>: {a.tokenError}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Banner de alerta */}
      {/* Alerta: contas com pagamento pendente/cobrança recusada (cartão) */}
      {paymentIssueAccounts.length > 0 && (
        <div className="bg-red-50 border-2 border-red-300 rounded-xl p-5 flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-red-600 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-red-800 text-base">
              {paymentIssueAccounts.length} {paymentIssueAccounts.length === 1 ? 'conta com problema de pagamento' : 'contas com problema de pagamento'}
            </h3>
            <p className="text-sm text-red-700 mt-1">
              Meta: a cobrança não foi processada e os anúncios foram pausados (ou serão em breve).
              Google: os anúncios não tiveram nenhuma exibição ontem com campanhas ativas — geralmente cartão recusado.
              Regularize o pagamento na plataforma:
            </p>
            <AlertAccountList accounts={paymentIssueAccounts} />
          </div>
        </div>
      )}

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
            <AlertAccountList accounts={[...lowBalanceAccounts].sort((x, y) => (x.balance ?? 0) - (y.balance ?? 0))} showBalance />
          </div>
        </div>
      ) : paymentIssueAccounts.length === 0 ? (
        <div className="bg-green-50 border border-green-200 rounded-xl p-5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-green-500 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-bold text-green-800 text-base">Tudo certo</h3>
            <p className="text-sm text-green-700 mt-0.5">
              Nenhuma conta com saldo baixo e nenhum problema de pagamento (Meta e Google).
            </p>
          </div>
        </div>
      ) : null}

      {/* Filtro */}
      <div className="flex items-center gap-2">
        {([
          { value: 'all', label: 'Todas', count: accounts.length },
          { value: 'prepaid', label: 'Pré-pagas', count: prepaidCount },
          { value: 'postpaid', label: 'Pós-pagas', count: postpaidCount },
        ] as { value: Filter; label: string; count: number }[]).map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === f.value
                ? 'bg-indigo-600 text-white'
                : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            {f.label} <span className={`ml-1 text-xs ${filter === f.value ? 'text-indigo-200' : 'text-gray-400'}`}>({f.count})</span>
          </button>
        ))}
      </div>

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
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center text-gray-400 py-8">
                    {accounts.length === 0
                      ? 'Nenhuma conta Meta vinculada.'
                      : `Nenhuma conta ${filter === 'prepaid' ? 'pré-paga' : 'pós-paga'} encontrada.`}
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
                      <p className="text-xs text-gray-400 font-mono">
                        {a.platform === 'META' ? 'Meta Ads' : 'Google Ads'} - {a.accountId}
                      </p>
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
                        {statusLabel(a.accountStatus, a.platform)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {!a.balanceLastSync ? (
                        <span className="text-xs text-gray-400 italic">não sincronizado</span>
                      ) : hasBalanceLikeValue(a) && a.balance != null ? (
                        <div>
                          <p className={`font-bold ${isLow ? 'text-red-600' : 'text-gray-900'}`}>
                            {formatCurrency(balance)}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {a.fundingType === 'monthly_invoicing' ? 'limite restante' : formatLastSync(a.balanceLastSync)}
                          </p>
                        </div>
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
        Saldo monitorado: contas Meta <strong>pré-pagas</strong> e contas Google <strong>com limite de gasto</strong>. Contas Google em
        pagamento automático não têm saldo na API — o aviso é quando os anúncios param de rodar. Atualização automática nos horários do cron (08:00, 14:00, 20:00).
      </p>
    </div>
  )
}

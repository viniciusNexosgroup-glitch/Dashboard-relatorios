'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle, XCircle, MessageSquare, Key, Clock, Info, KeyRound, Loader2 } from 'lucide-react'
import { ChangePasswordCard } from './ChangePasswordCard'
import { GoogleAdsCard } from './GoogleAdsCard'

interface Props {
  whatsappStatus: { connected: boolean; state: string }
  googleConnectedEmail?: string | null
  googleConnectedAt?: string | null
  googleEnv?: { clientId: boolean; clientSecret: boolean; developerToken: boolean }
  metaTokenExpiresAt?: string | null
}

export function ConfigView({ whatsappStatus, googleConnectedEmail = null, googleConnectedAt = null, googleEnv, metaTokenExpiresAt = null }: Props) {
  const router = useRouter()
  const [newToken, setNewToken] = useState('')
  const [savingToken, setSavingToken] = useState(false)
  const [tokenMsg, setTokenMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const tokenDaysLeft = metaTokenExpiresAt
    ? Math.floor((new Date(metaTokenExpiresAt).getTime() - Date.now()) / 86_400_000)
    : null

  async function handleSaveToken() {
    if (!newToken.trim() || savingToken) return
    setSavingToken(true)
    setTokenMsg(null)
    try {
      const res = await fetch('/api/meta-token', {
        method: 'POST',
        body: JSON.stringify({ token: newToken.trim() }),
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `Erro ${res.status}`)
      setTokenMsg({ ok: true, text: `Token renovado! Válido por ${data.daysLeft} dias (até ${new Date(data.expiresAt).toLocaleDateString('pt-BR')}).` })
      setNewToken('')
      router.refresh()
    } catch (err: any) {
      setTokenMsg({ ok: false, text: err.message || 'Falha ao renovar token' })
    } finally {
      setSavingToken(false)
    }
  }
  const googleEnvOk = !!(googleEnv?.clientId && googleEnv?.clientSecret && googleEnv?.developerToken)
  const googleMissing = googleEnv
    ? [
        !googleEnv.clientId && 'GOOGLE_CLIENT_ID',
        !googleEnv.clientSecret && 'GOOGLE_CLIENT_SECRET',
        !googleEnv.developerToken && 'GOOGLE_DEVELOPER_TOKEN',
      ].filter(Boolean)
    : []
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Configurações</h1>
        <p className="text-sm text-gray-500 mt-0.5">Integrações e status do sistema</p>
      </div>

      {/* WhatsApp Status */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-lg bg-green-100 flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-800">Evolution API (WhatsApp)</h2>
            <p className="text-xs text-gray-500">Instância: {process.env.NEXT_PUBLIC_APP_URL || 'configurada via .env'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {whatsappStatus.connected ? (
            <>
              <CheckCircle className="w-4 h-4 text-green-500" />
              <span className="text-sm text-green-700 font-medium">Conectado</span>
            </>
          ) : (
            <>
              <XCircle className="w-4 h-4 text-red-500" />
              <span className="text-sm text-red-700 font-medium">Desconectado – Estado: {whatsappStatus.state}</span>
            </>
          )}
        </div>
        {!whatsappStatus.connected && (
          <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
            Configure <strong>EVOLUTION_API_URL</strong>, <strong>EVOLUTION_API_KEY</strong> e <strong>EVOLUTION_INSTANCE_NAME</strong> no arquivo <code>.env</code>.
          </div>
        )}
      </div>

      {/* Google Ads OAuth */}
      <GoogleAdsCard connectedEmail={googleConnectedEmail} connectedAt={googleConnectedAt} />

      {/* Token Meta — renovação manual (tokens de usuário duram no máx. 60 dias) */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
              <KeyRound className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-800">Token Meta</h2>
              <p className="text-xs text-gray-500">Acesso às contas de anúncio (Facebook/Instagram)</p>
            </div>
          </div>
          {tokenDaysLeft != null && (
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
              tokenDaysLeft <= 10 ? 'bg-red-100 text-red-700' : tokenDaysLeft <= 20 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
            }`}>
              {tokenDaysLeft <= 0 ? 'EXPIRADO' : `expira em ${tokenDaysLeft}d (${new Date(metaTokenExpiresAt!).toLocaleDateString('pt-BR')})`}
            </span>
          )}
        </div>

        <p className="text-xs text-gray-500 mb-3 leading-relaxed">
          Tokens de usuário do Meta duram no máximo <strong>60 dias</strong> e não renovam sozinhos.
          Gere um novo no{' '}
          <a href="https://developers.facebook.com/tools/explorer" target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">
            Graph API Explorer
          </a>{' '}
          (selecione o app, gere o token de usuário com as permissões de anúncios) e cole abaixo —
          o sistema troca por um token de 60 dias automaticamente. Você recebe um aviso no WhatsApp quando faltarem 10 dias.
        </p>

        <div className="flex gap-2">
          <input
            type="password"
            value={newToken}
            onChange={(e) => setNewToken(e.target.value)}
            placeholder="Cole o token novo aqui (EAAX...)"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            onClick={handleSaveToken}
            disabled={!newToken.trim() || savingToken}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {savingToken && <Loader2 className="w-4 h-4 animate-spin" />}
            {savingToken ? 'Renovando...' : 'Salvar e renovar'}
          </button>
        </div>
        {tokenMsg && (
          <p className={`text-xs mt-2 font-medium ${tokenMsg.ok ? 'text-green-600' : 'text-red-600'}`}>
            {tokenMsg.ok ? '✓ ' : '✗ '}{tokenMsg.text}
          </p>
        )}
      </div>

      {/* API Keys Guide */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-lg bg-indigo-100 flex items-center justify-center">
            <Key className="w-5 h-5 text-indigo-600" />
          </div>
          <h2 className="font-semibold text-gray-800">Credenciais das APIs</h2>
        </div>
        <div className="space-y-3 text-sm">
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="font-semibold text-blue-800 mb-1">Meta Ads</p>
            <p className="text-blue-700 text-xs">Configure via <strong>Configurações → Clientes → Vincular conta</strong>. O token é armazenado por conta de anúncio.</p>
          </div>
          {googleEnvOk ? (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="font-semibold text-green-800 mb-1">Google Ads</p>
              <p className="text-green-700 text-xs">
                Credenciais configuradas no ambiente (CLIENT_ID, CLIENT_SECRET e DEVELOPER_TOKEN).
                Gerencie a conexão no card <strong>Google Ads</strong> acima.
              </p>
            </div>
          ) : (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="font-semibold text-red-800 mb-1">Google Ads</p>
              <p className="text-red-700 text-xs">
                Faltando no ambiente: <strong>{googleMissing.join(', ') || 'verificação indisponível'}</strong>.
                Configure no EasyPanel (Ambiente) e faça redeploy. Tokens pendentes/rejeitados acessam apenas contas de teste.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Cron Schedule */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-lg bg-purple-100 flex items-center justify-center">
            <Clock className="w-5 h-5 text-purple-600" />
          </div>
          <h2 className="font-semibold text-gray-800">Agendamentos Automáticos</h2>
        </div>
        <div className="space-y-2 text-sm">
          {[
            { time: '08:00', desc: 'Sync completo (últimos 7 dias) + check de saldo baixo' },
            { time: '14:00 e 20:00', desc: 'Sync leve (dia atual) + check de saldo baixo' },
            { time: 'Sábado 01:00', desc: 'Sync profundo (60 dias) — pega atribuições retroativas do Meta' },
            { time: 'Domingo 02:00', desc: 'Limpeza: métricas > 90 dias e logs de sync > 30 dias' },
            { time: 'Segunda 03:00', desc: 'Renovação automática do token Meta (válido por 60 dias)' },
            { time: 'Dia 1 às 09:30', desc: 'Envio automático do relatório mensal para todos os clientes' },
            { time: 'Sempre que detectar', desc: 'Alerta no WhatsApp quando saldo da conta pré-paga ficar < R$ 100 (cooldown 24h)' },
            { time: 'Sempre que detectar', desc: 'Alerta no WhatsApp quando a conta pausar por falha no pagamento do cartão (cooldown 24h)' },
          ].map((item) => (
            <div key={item.time} className="flex items-center gap-3 p-2.5 rounded-lg bg-gray-50">
              <span className="text-xs font-mono bg-gray-200 text-gray-700 px-2 py-0.5 rounded">{item.time}</span>
              <span className="text-gray-600">{item.desc}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg flex gap-2">
          <Info className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
          <p className="text-xs text-green-700">
            ✓ Agendamentos rodam automaticamente em background enquanto o servidor estiver ligado (fuso de São Paulo).
            O relatório mensal sincroniza todas as contas antes de enviar, garantindo dados atualizados.
          </p>
        </div>
      </div>

      {/* Trocar senha */}
      <ChangePasswordCard />
    </div>
  )
}

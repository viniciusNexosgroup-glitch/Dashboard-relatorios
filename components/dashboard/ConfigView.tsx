'use client'

import { CheckCircle, XCircle, MessageSquare, Key, Clock, Info } from 'lucide-react'
import { ChangePasswordCard } from './ChangePasswordCard'
import { GoogleAdsCard } from './GoogleAdsCard'

interface Props {
  whatsappStatus: { connected: boolean; state: string }
  googleConnectedEmail?: string | null
  googleConnectedAt?: string | null
}

export function ConfigView({ whatsappStatus, googleConnectedEmail = null, googleConnectedAt = null }: Props) {
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
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="font-semibold text-red-800 mb-1">Google Ads</p>
            <p className="text-red-700 text-xs">Configure <strong>GOOGLE_CLIENT_ID</strong>, <strong>GOOGLE_CLIENT_SECRET</strong> e um <strong>GOOGLE_DEVELOPER_TOKEN</strong> aprovado no .env. Tokens pendentes/rejeitados acessam apenas contas de teste.</p>
          </div>
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
            { time: '08:00', desc: 'Sincronização de métricas + check de saldo baixo' },
            { time: '14:00', desc: 'Sincronização de métricas + check de saldo baixo' },
            { time: '20:00', desc: 'Sincronização de métricas + check de saldo baixo' },
            { time: 'Segunda 03:00', desc: 'Renovação automática do token Meta (válido por 60 dias)' },
            { time: 'Dia 1 às 09:30', desc: 'Envio automático de relatório mensal para todos os clientes (sincroniza antes)' },
            { time: 'Sempre que detectar', desc: 'Alerta no WhatsApp quando saldo da conta pré-paga ficar < R$ 100 (cooldown 24h)' },
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

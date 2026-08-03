import axios from 'axios'
import { prisma } from './prisma'
import { sendTextMessage } from './evolution-api'

// Saúde REAL da sessão do WhatsApp.
//
// O problema que isto resolve: quando o aparelho é removido (device_removed /
// conflict — ex: WhatsApp Web aberto em outro lugar, limite de 4 aparelhos),
// a Evolution segue reportando connectionStatus:'open', mas as mensagens saem
// INDECIFRÁVEIS pro destinatário ("Aguardando mensagem"). O status "open"
// sozinho NÃO garante saúde — foi o que deixou 2 meses de relatórios quebrados
// passarem despercebidos.
//
// Sinal confiável (calibrado observando os dois estados na prática):
//   - saudável (pós-pareamento limpo): disconnectionObject = "Log out instance..."
//   - quebrado:                        disconnectionObject contém device_removed/conflict

const EVOLUTION_URL = process.env.EVOLUTION_API_URL || ''
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY || ''
const INSTANCE = process.env.EVOLUTION_INSTANCE_NAME || 'agencia'

const HEALTH_CACHE_KEY = 'whatsapp_health'
const HEALTH_ALERT_KEY = 'whatsapp_health_last_alert'
const ALERT_COOLDOWN_MS = 12 * 60 * 60 * 1000

export interface WhatsappHealth {
  healthy: boolean
  state: string          // 'open' | 'connecting' | 'close' | 'unknown'
  reason: string | null  // motivo quando NÃO saudável
  checkedAt: string
}

export async function getWhatsappHealth(): Promise<WhatsappHealth> {
  const checkedAt = new Date().toISOString()
  try {
    const res = await axios.get(`${EVOLUTION_URL}/instance/fetchInstances`, {
      params: { instanceName: INSTANCE },
      headers: { apikey: EVOLUTION_KEY },
      timeout: 20_000,
    })
    const data = Array.isArray(res.data) ? res.data[0] : res.data
    const state = data?.connectionStatus || 'unknown'
    const disc =
      typeof data?.disconnectionObject === 'string'
        ? data.disconnectionObject
        : JSON.stringify(data?.disconnectionObject ?? '')

    if (state !== 'open') {
      return {
        healthy: false, state, checkedAt,
        reason: `WhatsApp desconectado (estado: ${state}). Reconecte a instância no gerenciador da Evolution.`,
      }
    }
    // Aberta, mas a última desconexão foi aparelho removido/conflito → sessão inválida
    if (/device_removed|conflict/i.test(disc)) {
      return {
        healthy: false, state, checkedAt,
        reason:
          'Sessão do WhatsApp invalidada (aparelho removido/conflito). As mensagens saem como "Aguardando mensagem" e NÃO chegam aos clientes. ' +
          'Re-pareie escaneando o QR novamente no gerenciador da Evolution.',
      }
    }
    return { healthy: true, state, reason: null, checkedAt }
  } catch (e: any) {
    return {
      healthy: false, state: 'unknown', checkedAt,
      reason: `Não foi possível verificar o WhatsApp: ${e.message}`,
    }
  }
}

// Verifica a saúde, salva no cache (lido pelo banner do dashboard, sem custo por
// pageview) e alerta o admin no WhatsApp se degradado (best-effort — pode não
// chegar se a sessão estiver totalmente quebrada; por isso o banner in-app é a
// rede de segurança principal).
export async function checkWhatsappHealthAndAlert(): Promise<WhatsappHealth> {
  const health = await getWhatsappHealth()

  await prisma.appSettings.upsert({
    where: { key: HEALTH_CACHE_KEY },
    update: { value: JSON.stringify(health) },
    create: { key: HEALTH_CACHE_KEY, value: JSON.stringify(health) },
  }).catch(() => {})

  if (health.healthy) return health
  console.warn(`[whatsapp-health] DEGRADADO: ${health.reason}`)

  const adminGroup = process.env.ADMIN_WHATSAPP_GROUP
  if (!adminGroup) return health

  const last = await prisma.appSettings.findUnique({ where: { key: HEALTH_ALERT_KEY } })
  if (last && Date.now() - new Date(last.value).getTime() < ALERT_COOLDOWN_MS) return health

  try {
    await sendTextMessage(adminGroup, `🚨 *WhatsApp com problema*\n\n${health.reason}\n\nEnquanto não resolver, os alertas e relatórios NÃO chegam aos clientes.`)
    await prisma.appSettings.upsert({
      where: { key: HEALTH_ALERT_KEY },
      update: { value: new Date().toISOString() },
      create: { key: HEALTH_ALERT_KEY, value: new Date().toISOString() },
    })
  } catch (e: any) {
    console.error('[whatsapp-health] falha ao alertar admin (esperado se WA totalmente fora):', e.message)
  }
  return health
}

// Lê o status cacheado (rápido, só banco) — usado pelo banner do dashboard.
export async function getCachedWhatsappHealth(): Promise<WhatsappHealth | null> {
  const s = await prisma.appSettings.findUnique({ where: { key: HEALTH_CACHE_KEY } })
  if (!s) return null
  try {
    return JSON.parse(s.value) as WhatsappHealth
  } catch {
    return null
  }
}

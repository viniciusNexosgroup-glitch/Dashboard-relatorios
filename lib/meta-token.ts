import axios from 'axios'
import { prisma } from './prisma'
import { sendTextMessage } from './evolution-api'

const REFRESH_BEFORE_EXPIRY_MS = 14 * 24 * 60 * 60 * 1000 // 14 dias

export async function getMetaAccessToken(): Promise<string> {
  const stored = await prisma.appSettings.findUnique({ where: { key: 'meta_access_token' } })
  return stored?.value || process.env.META_SYSTEM_USER_TOKEN || ''
}

export async function getMetaTokenExpiresAt(): Promise<Date | null> {
  const stored = await prisma.appSettings.findUnique({ where: { key: 'meta_token_expires_at' } })
  if (!stored?.value) return null
  const d = new Date(stored.value)
  return isNaN(d.getTime()) ? null : d
}

// Troca o token atual por um novo long-lived (60 dias) e persiste no banco.
// Única implementação da troca — usada pela renovação preventiva e pelo cron semanal.
export async function exchangeAndStoreMetaToken(currentToken: string): Promise<{ token: string; expiresAt: Date }> {
  const res = await axios.get('https://graph.facebook.com/oauth/access_token', {
    params: {
      grant_type: 'fb_exchange_token',
      client_id: process.env.META_APP_ID,
      client_secret: process.env.META_APP_SECRET,
      fb_exchange_token: currentToken,
    },
    timeout: 30_000,
  })
  const newToken = res.data.access_token
  const expiresAt = new Date(Date.now() + res.data.expires_in * 1000)

  await prisma.$transaction([
    prisma.appSettings.upsert({
      where: { key: 'meta_access_token' },
      update: { value: newToken },
      create: { key: 'meta_access_token', value: newToken },
    }),
    prisma.appSettings.upsert({
      where: { key: 'meta_token_expires_at' },
      update: { value: expiresAt.toISOString() },
      create: { key: 'meta_token_expires_at', value: expiresAt.toISOString() },
    }),
  ])

  return { token: newToken, expiresAt }
}

// Tokens de USUÁRIO do Meta têm teto de 60 dias e a troca fb_exchange_token de um
// long-lived NÃO estende a validade (devolve a mesma data). A renovação real é
// manual: colar um token novo em Configurações → Token Meta. Este alerta avisa o
// admin no WhatsApp quando faltam <= 10 dias, com cooldown de 24h.
const EXPIRY_ALERT_THRESHOLD_DAYS = 10
const EXPIRY_ALERT_COOLDOWN_MS = 24 * 60 * 60 * 1000

export async function checkMetaTokenExpiryAlert(): Promise<void> {
  const expiresAt = await getMetaTokenExpiresAt()
  if (!expiresAt) return
  const daysLeft = Math.floor((expiresAt.getTime() - Date.now()) / 86_400_000)
  if (daysLeft > EXPIRY_ALERT_THRESHOLD_DAYS) return

  const adminGroup = process.env.ADMIN_WHATSAPP_GROUP
  if (!adminGroup) {
    console.warn(`[meta-token] token expira em ${daysLeft}d e ADMIN_WHATSAPP_GROUP não está configurado — sem alerta`)
    return
  }

  const last = await prisma.appSettings.findUnique({ where: { key: 'meta_token_expiry_last_alert' } })
  if (last && Date.now() - new Date(last.value).getTime() < EXPIRY_ALERT_COOLDOWN_MS) return

  const message =
    `⚠️ *Token Meta expira em ${daysLeft} dia(s)* (${expiresAt.toLocaleDateString('pt-BR')}).\n\n` +
    `Renove em *Configurações → Token Meta*: gere um token novo no Graph Explorer ` +
    `(developers.facebook.com/tools/explorer) e cole lá.\n\n` +
    `Sem renovar, os syncs, alertas e relatórios param quando o token vencer.`

  try {
    await sendTextMessage(adminGroup, message)
    await prisma.appSettings.upsert({
      where: { key: 'meta_token_expiry_last_alert' },
      update: { value: new Date().toISOString() },
      create: { key: 'meta_token_expiry_last_alert', value: new Date().toISOString() },
    })
    console.log(`[meta-token] alerta de expiração enviado ao admin (${daysLeft}d restantes)`)
  } catch (e: any) {
    console.error('[meta-token] falha ao enviar alerta de expiração:', e.message)
  }
}

// Renova o token automaticamente se estiver perto de expirar (< 14 dias).
// Idempotente — se já está fresco, não faz nada. Chamado antes dos syncs.
export async function refreshMetaTokenIfNearExpiry(): Promise<{ refreshed: boolean; expiresAt: Date | null }> {
  const expiresAt = await getMetaTokenExpiresAt()
  const now = Date.now()

  // Se nunca foi renovado (sem expires_at) OU vai expirar em < 14 dias → renova
  const needsRefresh = !expiresAt || expiresAt.getTime() - now < REFRESH_BEFORE_EXPIRY_MS
  if (!needsRefresh) return { refreshed: false, expiresAt }

  const currentToken = await getMetaAccessToken()
  if (!currentToken) return { refreshed: false, expiresAt }

  try {
    const { expiresAt: newExpiresAt } = await exchangeAndStoreMetaToken(currentToken)
    console.log(`[meta-token] renovado preventivamente — novo valido até ${newExpiresAt.toISOString()}`)
    return { refreshed: true, expiresAt: newExpiresAt }
  } catch (err: any) {
    console.error('[meta-token] falha ao renovar preventivamente:', err.response?.data?.error?.message || err.message)
    return { refreshed: false, expiresAt }
  }
}

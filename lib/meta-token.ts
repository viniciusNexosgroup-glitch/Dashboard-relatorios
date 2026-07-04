import axios from 'axios'
import { prisma } from './prisma'

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

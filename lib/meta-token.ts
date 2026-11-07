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

// Troca um token de usuário por um long-lived (60 dias), sem gravar.
async function exchangeForLongLivedToken(currentToken: string): Promise<{ token: string; expiresAt: Date }> {
  const res = await axios.get('https://graph.facebook.com/oauth/access_token', {
    params: {
      grant_type: 'fb_exchange_token',
      client_id: process.env.META_APP_ID,
      client_secret: process.env.META_APP_SECRET,
      fb_exchange_token: currentToken,
    },
    timeout: 30_000,
  })
  return { token: res.data.access_token, expiresAt: new Date(Date.now() + res.data.expires_in * 1000) }
}

// Troca o token atual por um novo long-lived (60 dias) e persiste no banco.
// Usada pela renovação preventiva, pelo cron semanal e pelo "colar token" em Configurações.
export async function exchangeAndStoreMetaToken(currentToken: string): Promise<{ token: string; expiresAt: Date }> {
  const { token: newToken, expiresAt } = await exchangeForLongLivedToken(currentToken)
  await storeMetaToken(newToken, expiresAt)
  return { token: newToken, expiresAt }
}

async function storeMetaToken(newToken: string, expiresAt: Date): Promise<void> {
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
}

// ── "Renovar com Facebook" (login OAuth em Configurações) ──
// Substitui o Graph Explorer: um clique, login no Facebook e o token de 60 dias é salvo.
// Apps do tipo Business com "Facebook Login for Business" usam META_LOGIN_CONFIG_ID
// (configuração criada no painel do app) no lugar de scope.
export const META_OAUTH_STATE_COOKIE = 'meta_oauth_state'
const META_GRAPH = `https://graph.facebook.com/${process.env.META_API_VERSION || 'v19.0'}`
const META_LOGIN_SCOPES = ['ads_read', 'ads_management', 'business_management', 'pages_show_list', 'pages_read_engagement']

export function getMetaLoginUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID || '',
    redirect_uri: redirectUri,
    state,
    response_type: 'code',
  })
  if (process.env.META_LOGIN_CONFIG_ID) {
    params.set('config_id', process.env.META_LOGIN_CONFIG_ID)
  } else {
    params.set('scope', META_LOGIN_SCOPES.join(','))
    params.set('auth_type', 'rerequest') // pede de novo permissões desmarcadas antes
  }
  return `https://www.facebook.com/${process.env.META_API_VERSION || 'v19.0'}/dialog/oauth?${params}`
}

export interface MetaLoginResult {
  stored: boolean
  expiresAt: Date
  missingScopes: string[]
  missingAccounts: string[] // clientes cujas contas Meta o novo token não acessa
}

// Code do login → token de 60 dias. Só grava se o novo token enxerga todas as contas Meta dos
// clientes (no login dá para desmarcar empresas/contas); se faltar alguma e o token atual ainda
// valer, mantém o atual para não quebrar o sync. Token atual vencido: grava mesmo assim.
export async function renewMetaTokenFromLogin(code: string, redirectUri: string): Promise<MetaLoginResult> {
  const short = await axios.get(`${META_GRAPH}/oauth/access_token`, {
    params: {
      client_id: process.env.META_APP_ID,
      client_secret: process.env.META_APP_SECRET,
      redirect_uri: redirectUri,
      code,
    },
    timeout: 30_000,
  })
  const { token, expiresAt } = await exchangeForLongLivedToken(short.data.access_token)

  const debug = await axios.get(`${META_GRAPH}/debug_token`, {
    params: { input_token: token, access_token: `${process.env.META_APP_ID}|${process.env.META_APP_SECRET}` },
    timeout: 30_000,
  })
  const granted: string[] = debug.data?.data?.scopes || []
  const missingScopes = META_LOGIN_SCOPES.filter((s) => !granted.includes(s))

  const accessible = new Set<string>()
  let url: string | null = `${META_GRAPH}/me/adaccounts`
  let params: Record<string, string | number> | undefined = { access_token: token, fields: 'account_id', limit: 500 }
  while (url) {
    const page: { data: { data?: { account_id: string }[]; paging?: { next?: string } } } = await axios.get(url, { params, timeout: 30_000 })
    for (const a of page.data.data || []) accessible.add(`act_${a.account_id}`)
    url = page.data.paging?.next || null
    params = undefined
  }
  const dashboardAccounts = await prisma.adAccount.findMany({
    where: { platform: 'META', active: true, accessToken: '__system__' },
    select: { accountId: true, client: { select: { company: true } } },
  })
  const missingAccounts = dashboardAccounts.filter((a) => !accessible.has(a.accountId)).map((a) => a.client.company.trim())

  const current = await getMetaTokenExpiresAt()
  const currentStillValid = !!current && current.getTime() > Date.now()
  const blocked = missingScopes.includes('ads_read') || (missingAccounts.length > 0 && currentStillValid)
  if (!blocked) await storeMetaToken(token, expiresAt)

  return { stored: !blocked, expiresAt, missingScopes, missingAccounts }
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
    `Renove em *Configurações → Token Meta → Renovar com Facebook* (um clique, login no Facebook).\n\n` +
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
    // Token de usuário long-lived costuma voltar com a MESMA validade (limite do Meta) —
    // nesse caso não houve renovação de verdade; o caminho é "Renovar com Facebook".
    const extended = !expiresAt || newExpiresAt.getTime() - expiresAt.getTime() > 86_400_000
    console.log(extended
      ? `[meta-token] renovado preventivamente — novo valido até ${newExpiresAt.toISOString()}`
      : `[meta-token] troca não estendeu a validade (${newExpiresAt.toISOString()}) — renove em Configurações → Renovar com Facebook`)
    return { refreshed: extended, expiresAt: newExpiresAt }
  } catch (err: any) {
    console.error('[meta-token] falha ao renovar preventivamente:', err.response?.data?.error?.message || err.message)
    return { refreshed: false, expiresAt }
  }
}

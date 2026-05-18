import axios from 'axios'
import { prisma } from './prisma'

const GOOGLE_OAUTH_BASE = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo'

const SCOPES = [
  'https://www.googleapis.com/auth/adwords',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ')

export function getGoogleAuthUrl(redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || '',
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',  // garante novo refresh_token mesmo em re-conexão
  })
  return `${GOOGLE_OAUTH_BASE}?${params.toString()}`
}

export async function exchangeCodeForTokens(code: string, redirectUri: string) {
  const res = await axios.post(
    GOOGLE_TOKEN_URL,
    new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 30_000 }
  )
  return res.data as {
    access_token: string
    refresh_token?: string
    expires_in: number
    scope: string
    token_type: string
  }
}

export async function getUserEmail(accessToken: string): Promise<string> {
  const res = await axios.get(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
    timeout: 15_000,
  })
  return res.data.email as string
}

// Retorna o refresh_token armazenado: prefere DB (AppSettings), fallback pro .env
export async function getGoogleRefreshToken(): Promise<string> {
  const stored = await prisma.appSettings.findUnique({ where: { key: 'google_refresh_token' } })
  return stored?.value || process.env.GOOGLE_REFRESH_TOKEN || ''
}

export async function getGoogleConnectedEmail(): Promise<string | null> {
  const stored = await prisma.appSettings.findUnique({ where: { key: 'google_connected_email' } })
  return stored?.value || null
}

export async function getGoogleConnectedAt(): Promise<Date | null> {
  const stored = await prisma.appSettings.findUnique({ where: { key: 'google_connected_at' } })
  if (!stored?.value) return null
  const d = new Date(stored.value)
  return isNaN(d.getTime()) ? null : d
}

export async function storeGoogleTokens(refreshToken: string, email: string): Promise<void> {
  const now = new Date().toISOString()
  await prisma.$transaction([
    prisma.appSettings.upsert({
      where: { key: 'google_refresh_token' },
      update: { value: refreshToken },
      create: { key: 'google_refresh_token', value: refreshToken },
    }),
    prisma.appSettings.upsert({
      where: { key: 'google_connected_email' },
      update: { value: email },
      create: { key: 'google_connected_email', value: email },
    }),
    prisma.appSettings.upsert({
      where: { key: 'google_connected_at' },
      update: { value: now },
      create: { key: 'google_connected_at', value: now },
    }),
  ])
}

export async function disconnectGoogle(): Promise<void> {
  await prisma.appSettings.deleteMany({
    where: { key: { in: ['google_refresh_token', 'google_connected_email', 'google_connected_at'] } },
  })
}

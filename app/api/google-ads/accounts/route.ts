import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import axios from 'axios'
import { getGoogleRefreshToken } from '@/lib/google-oauth'

const GOOGLE_ADS_API = 'https://googleads.googleapis.com/v20'

async function getAccessToken(refreshToken: string): Promise<string> {
  const res = await axios.post(
    'https://oauth2.googleapis.com/token',
    new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 30_000 }
  )
  return res.data.access_token
}

type Account = {
  id: string
  formattedId: string
  name: string
  currency: string
  status: string
  isManager: boolean
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const developerToken = process.env.GOOGLE_DEVELOPER_TOKEN
  const fallbackManagerId = process.env.GOOGLE_MANAGER_CUSTOMER_ID?.replace(/-/g, '')

  if (!clientId || !clientSecret || !developerToken) {
    return NextResponse.json({ accounts: [], error: 'Google Ads não configurado no .env' })
  }

  const refreshToken = await getGoogleRefreshToken()
  if (!refreshToken) {
    return NextResponse.json({ accounts: [], error: 'Conecte sua conta Google em Configurações' })
  }

  try {
    const accessToken = await getAccessToken(refreshToken)
    const baseHeaders: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      'developer-token': developerToken,
    }

    // 1. Lista TODOS os customer IDs acessíveis pela conta logada
    const accessibleRes = await axios.get(`${GOOGLE_ADS_API}/customers:listAccessibleCustomers`, {
      headers: baseHeaders,
      timeout: 30_000,
    })
    const resourceNames: string[] = accessibleRes.data?.resourceNames || []
    const customerIds = resourceNames.map((r) => r.replace('customers/', ''))

    if (customerIds.length === 0) {
      return NextResponse.json({ accounts: [], error: 'Nenhuma conta acessível por esta conta Google' })
    }

    // 2. Pra cada ID, busca info detalhada (nome, currency, é MCC?). Roda em paralelo
    //    em chunks de 10 pra não estourar rate limit.
    const accounts: Account[] = []
    const chunkSize = 10
    for (let i = 0; i < customerIds.length; i += chunkSize) {
      const chunk = customerIds.slice(i, i + chunkSize)
      const results = await Promise.all(
        chunk.map(async (cid) => {
          try {
            const r = await axios.post(
              `${GOOGLE_ADS_API}/customers/${cid}/googleAds:search`,
              {
                query: `SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.status, customer.manager FROM customer LIMIT 1`,
              },
              {
                headers: { ...baseHeaders, 'login-customer-id': cid },
                timeout: 15_000,
              }
            )
            const c = r.data?.results?.[0]?.customer
            if (!c) return null
            const formattedId = cid.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3')
            return {
              id: cid,
              formattedId,
              name: c.descriptiveName || `Conta ${formattedId}`,
              currency: c.currencyCode || 'BRL',
              status: c.status || 'ENABLED',
              isManager: !!c.manager,
            } as Account
          } catch (e: any) {
            // Se for sub-conta de um MCC, pode falhar com 'login-customer-id'.
            // Tenta de novo usando o MCC do .env como login-customer-id.
            if (fallbackManagerId && fallbackManagerId !== cid) {
              try {
                const r = await axios.post(
                  `${GOOGLE_ADS_API}/customers/${cid}/googleAds:search`,
                  {
                    query: `SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.status, customer.manager FROM customer LIMIT 1`,
                  },
                  {
                    headers: { ...baseHeaders, 'login-customer-id': fallbackManagerId },
                    timeout: 15_000,
                  }
                )
                const c = r.data?.results?.[0]?.customer
                if (!c) return null
                const formattedId = cid.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3')
                return {
                  id: cid,
                  formattedId,
                  name: c.descriptiveName || `Conta ${formattedId}`,
                  currency: c.currencyCode || 'BRL',
                  status: c.status || 'ENABLED',
                  isManager: !!c.manager,
                } as Account
              } catch {
                // Não conseguiu nem com fallback — retorna info mínima
                const formattedId = cid.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3')
                return {
                  id: cid,
                  formattedId,
                  name: `Conta ${formattedId}`,
                  currency: 'BRL',
                  status: 'UNKNOWN',
                  isManager: false,
                } as Account
              }
            }
            return null
          }
        })
      )
      for (const r of results) if (r) accounts.push(r)
    }

    // Filtra contas canceladas e MCCs (a menos que queira sincronizar MCC direto)
    const usable = accounts.filter((a) => a.status !== 'CANCELED' && !a.isManager)
    usable.sort((a, b) => a.name.localeCompare(b.name))

    return NextResponse.json({ accounts: usable, total: accounts.length, totalAccessible: customerIds.length })
  } catch (err: any) {
    const status = err.response?.status
    const msg =
      err.response?.data?.error?.details?.[0]?.errors?.[0]?.message ||
      err.response?.data?.error?.message ||
      err.message
    return NextResponse.json({ accounts: [], error: `${status ? `[${status}] ` : ''}${msg}` })
  }
}

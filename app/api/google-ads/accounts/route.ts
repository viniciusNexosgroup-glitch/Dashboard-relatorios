import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import axios from 'axios'

async function getAccessToken(): Promise<string> {
  const res = await axios.post('https://oauth2.googleapis.com/token', {
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
    grant_type: 'refresh_token',
  })
  return res.data.access_token
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN
  const developerToken = process.env.GOOGLE_DEVELOPER_TOKEN
  const managerId = process.env.GOOGLE_MANAGER_CUSTOMER_ID?.replace(/-/g, '')

  if (!clientId || !clientSecret || !refreshToken || !developerToken) {
    return NextResponse.json({ accounts: [], error: 'Google Ads não configurado' })
  }

  try {
    const accessToken = await getAccessToken()

    const query = `
      SELECT
        customer_client.client_customer,
        customer_client.descriptive_name,
        customer_client.currency_code,
        customer_client.status,
        customer_client.manager,
        customer_client.hidden
      FROM customer_client
      WHERE customer_client.level <= 1
        AND customer_client.hidden = FALSE
    `

    const res = await axios.post(
      `https://googleads.googleapis.com/v20/customers/${managerId}/googleAds:search`,
      { query },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'developer-token': developerToken,
          'login-customer-id': managerId,
        },
      }
    )

    const accounts = (res.data.results || [])
      .filter((r: any) => !r.customerClient?.manager)
      .map((r: any) => {
        const c = r.customerClient
        const rawId = c.clientCustomer?.replace('customers/', '') || ''
        const formattedId = rawId.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3')
        return {
          id: rawId,
          formattedId,
          name: c.descriptiveName || `Conta ${formattedId}`,
          currency: c.currencyCode || 'BRL',
          status: c.status || 'ENABLED',
        }
      })

    accounts.sort((a: any, b: any) => a.name.localeCompare(b.name))

    return NextResponse.json({ accounts })
  } catch (err: any) {
    const status = err.response?.status
    const msg =
      err.response?.data?.error?.details?.[0]?.errors?.[0]?.message ||
      err.response?.data?.error?.message ||
      err.message
    return NextResponse.json({ accounts: [], error: `${status ? `[${status}] ` : ''}${msg}` })
  }
}

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import axios from 'axios'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const token = process.env.META_SYSTEM_USER_TOKEN
  if (!token) return NextResponse.json({ accounts: [], error: 'Token Meta não configurado' })

  try {
    const res = await axios.get('https://graph.facebook.com/v19.0/me/adaccounts', {
      params: {
        access_token: token,
        fields: 'id,name,account_status,currency,business',
        limit: 200,
      },
    })

    const accounts = (res.data.data || []).map((a: any) => ({
      id: a.id,
      name: a.name,
      status: a.account_status,
      currency: a.currency,
      business: a.business?.name || null,
    }))

    return NextResponse.json({ accounts })
  } catch (err: any) {
    const msg = err.response?.data?.error?.message || err.message
    return NextResponse.json({ accounts: [], error: msg })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { getMetaAccessToken, exchangeAndStoreMetaToken } from '@/lib/meta-token'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const currentToken = await getMetaAccessToken()
    if (!currentToken) {
      return NextResponse.json({ error: 'Nenhum token Meta configurado' }, { status: 400 })
    }

    const { expiresAt } = await exchangeAndStoreMetaToken(currentToken)

    return NextResponse.json({
      ok: true,
      expiresAt: expiresAt.toISOString(),
      message: 'Token Meta renovado com sucesso',
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.response?.data?.error?.message || err.message }, { status: 500 })
  }
}

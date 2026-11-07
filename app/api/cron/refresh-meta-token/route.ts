import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/auth'
import { getMetaAccessToken, exchangeAndStoreMetaToken } from '@/lib/meta-token'

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
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

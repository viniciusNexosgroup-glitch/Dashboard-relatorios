import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { exchangeCodeForTokens, getUserEmail, storeGoogleTokens } from '@/lib/google-oauth'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.redirect(new URL('/login', req.url))

  const code = req.nextUrl.searchParams.get('code')
  const oauthError = req.nextUrl.searchParams.get('error')

  if (oauthError) {
    return NextResponse.redirect(
      new URL(`/configuracoes?google_error=${encodeURIComponent(oauthError)}`, req.url)
    )
  }
  if (!code) {
    return NextResponse.redirect(new URL('/configuracoes?google_error=missing_code', req.url))
  }

  const baseUrl = process.env.NEXTAUTH_URL || `${req.nextUrl.protocol}//${req.nextUrl.host}`
  const redirectUri = `${baseUrl}/api/google-ads/oauth/callback`

  try {
    const tokens = await exchangeCodeForTokens(code, redirectUri)
    if (!tokens.refresh_token) {
      return NextResponse.redirect(
        new URL('/configuracoes?google_error=no_refresh_token_returned', req.url)
      )
    }
    const email = await getUserEmail(tokens.access_token)
    await storeGoogleTokens(tokens.refresh_token, email)
    return NextResponse.redirect(new URL('/configuracoes?google_connected=1', req.url))
  } catch (err: any) {
    const msg = err.response?.data?.error_description || err.response?.data?.error || err.message
    return NextResponse.redirect(
      new URL(`/configuracoes?google_error=${encodeURIComponent(msg)}`, req.url)
    )
  }
}

import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getMetaLoginUrl, META_OAUTH_STATE_COOKIE } from '@/lib/meta-token'

// "Renovar com Facebook": manda para o login do Facebook. O state aleatório vai num cookie
// httpOnly e é conferido no callback (impede salvar um token iniciado por outra pessoa).
export async function GET(req: NextRequest) {
  const baseUrl = process.env.NEXTAUTH_URL || `${req.nextUrl.protocol}//${req.nextUrl.host}`

  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.redirect(new URL('/login', baseUrl))

  const state = randomUUID()
  const res = NextResponse.redirect(getMetaLoginUrl(`${baseUrl}/api/meta-ads/oauth/callback`, state))
  res.cookies.set(META_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: baseUrl.startsWith('https'),
    sameSite: 'lax',
    path: '/api/meta-ads/oauth',
    maxAge: 600,
  })
  return res
}

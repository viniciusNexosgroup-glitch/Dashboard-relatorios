import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getGoogleAuthUrl } from '@/lib/google-oauth'

export async function GET(req: NextRequest) {
  const baseUrl = process.env.NEXTAUTH_URL || `${req.nextUrl.protocol}//${req.nextUrl.host}`

  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.redirect(new URL('/login', baseUrl))

  const redirectUri = `${baseUrl}/api/google-ads/oauth/callback`

  return NextResponse.redirect(getGoogleAuthUrl(redirectUri))
}

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import axios from 'axios'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const stored = await prisma.appSettings.findUnique({ where: { key: 'meta_access_token' } })
    const currentToken = stored?.value || process.env.META_SYSTEM_USER_TOKEN || ''

    if (!currentToken) {
      return NextResponse.json({ error: 'Nenhum token Meta configurado' }, { status: 400 })
    }

    const res = await axios.get('https://graph.facebook.com/oauth/access_token', {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: process.env.META_APP_ID,
        client_secret: process.env.META_APP_SECRET,
        fb_exchange_token: currentToken,
      },
    })

    const newToken = res.data.access_token
    const expiresIn = res.data.expires_in
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()

    await prisma.appSettings.upsert({
      where: { key: 'meta_access_token' },
      update: { value: newToken },
      create: { key: 'meta_access_token', value: newToken },
    })

    await prisma.appSettings.upsert({
      where: { key: 'meta_token_expires_at' },
      update: { value: expiresAt },
      create: { key: 'meta_token_expires_at', value: expiresAt },
    })

    return NextResponse.json({
      ok: true,
      expiresAt,
      message: 'Token Meta renovado com sucesso',
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.response?.data?.error?.message || err.message }, { status: 500 })
  }
}

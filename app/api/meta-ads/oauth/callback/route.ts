import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { renewMetaTokenFromLogin, META_OAUTH_STATE_COOKIE } from '@/lib/meta-token'

export async function GET(req: NextRequest) {
  // Base pública SEMPRE do NEXTAUTH_URL — atrás do proxy, req.url resolve pro host interno
  const baseUrl = process.env.NEXTAUTH_URL || `${req.nextUrl.protocol}//${req.nextUrl.host}`
  const back = (params: Record<string, string>) => {
    const res = NextResponse.redirect(new URL(`/configuracoes?${new URLSearchParams(params)}`, baseUrl))
    res.cookies.delete({ name: META_OAUTH_STATE_COOKIE, path: '/api/meta-ads/oauth' })
    return res
  }

  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.redirect(new URL('/login', baseUrl))

  const q = req.nextUrl.searchParams
  if (q.get('error')) return back({ meta_error: q.get('error_description') || q.get('error') || 'login cancelado' })

  const state = q.get('state')
  if (!state || state !== req.cookies.get(META_OAUTH_STATE_COOKIE)?.value) {
    return back({ meta_error: 'Sessão de login expirada ou inválida — clique em Renovar com Facebook de novo' })
  }
  const code = q.get('code')
  if (!code) return back({ meta_error: 'O Facebook não devolveu o código de acesso' })

  try {
    const r = await renewMetaTokenFromLogin(code, `${baseUrl}/api/meta-ads/oauth/callback`)
    if (!r.stored) {
      const why = r.missingScopes.includes('ads_read')
        ? 'a permissão ads_read não foi concedida'
        : `o novo login não dá acesso às contas de: ${r.missingAccounts.join(', ')}`
      return back({ meta_error: `Token não trocado (o atual continua valendo): ${why}. Refaça marcando todas as empresas, contas e permissões.` })
    }
    return back({
      meta_connected: r.expiresAt.toISOString(),
      ...(r.missingAccounts.length ? { meta_warning: `Sem acesso às contas de: ${r.missingAccounts.join(', ')}` } : {}),
    })
  } catch (err: unknown) {
    const e = err as { response?: { data?: { error?: { message?: string } } }; message?: string }
    return back({ meta_error: e.response?.data?.error?.message || e.message || 'Falha ao renovar o token' })
  }
}

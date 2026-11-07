import { getGoogleConnectedEmail, getGoogleConnectedAt } from '@/lib/google-oauth'
import { getMetaTokenExpiresAt } from '@/lib/meta-token'
import { getWhatsappHealth } from '@/lib/whatsapp-health'
import { ConfigView } from '@/components/dashboard/ConfigView'

export default async function ConfiguracoesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  // Volta do "Renovar com Facebook" (app/api/meta-ads/oauth/callback)
  const q = await searchParams
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
  const metaConnected = one(q.meta_connected)
  const metaLoginNotice = one(q.meta_error)
    ? { ok: false, text: one(q.meta_error)! }
    : metaConnected
      ? {
          ok: true,
          text: `Token renovado pelo Facebook! Válido até ${new Date(metaConnected).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.` +
            (one(q.meta_warning) ? ` Atenção: ${one(q.meta_warning)}` : ''),
        }
      : null

  // Checagem de saúde REAL (não só connectionState) — detecta "open mas quebrado"
  let whatsappStatus = { connected: false, state: 'unknown', reason: null as string | null }
  try {
    const h = await getWhatsappHealth()
    whatsappStatus = { connected: h.healthy, state: h.state, reason: h.reason }
  } catch {}

  const [googleEmail, googleAt, metaTokenExpiresAt] = await Promise.all([
    getGoogleConnectedEmail().catch(() => null),
    getGoogleConnectedAt().catch(() => null),
    getMetaTokenExpiresAt().catch(() => null),
  ])

  // Presença (não os valores) das credenciais Google no ambiente — pro status na tela
  const googleEnv = {
    clientId: !!process.env.GOOGLE_CLIENT_ID,
    clientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
    developerToken: !!process.env.GOOGLE_DEVELOPER_TOKEN,
  }

  return (
    <ConfigView
      whatsappStatus={whatsappStatus}
      googleConnectedEmail={googleEmail}
      googleConnectedAt={googleAt?.toISOString() ?? null}
      googleEnv={googleEnv}
      metaTokenExpiresAt={metaTokenExpiresAt?.toISOString() ?? null}
      metaLoginNotice={metaLoginNotice}
      metaRedirectUri={`${process.env.NEXTAUTH_URL || ''}/api/meta-ads/oauth/callback`}
    />
  )
}

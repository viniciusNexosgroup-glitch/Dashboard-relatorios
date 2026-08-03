import { getGoogleConnectedEmail, getGoogleConnectedAt } from '@/lib/google-oauth'
import { getMetaTokenExpiresAt } from '@/lib/meta-token'
import { getWhatsappHealth } from '@/lib/whatsapp-health'
import { ConfigView } from '@/components/dashboard/ConfigView'

export default async function ConfiguracoesPage() {
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
    />
  )
}

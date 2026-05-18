import { getInstanceStatus } from '@/lib/evolution-api'
import { getGoogleConnectedEmail, getGoogleConnectedAt } from '@/lib/google-oauth'
import { ConfigView } from '@/components/dashboard/ConfigView'

export default async function ConfiguracoesPage() {
  let whatsappStatus = { connected: false, state: 'unknown' }
  try {
    whatsappStatus = await getInstanceStatus()
  } catch {}

  const [googleEmail, googleAt] = await Promise.all([
    getGoogleConnectedEmail().catch(() => null),
    getGoogleConnectedAt().catch(() => null),
  ])

  return (
    <ConfigView
      whatsappStatus={whatsappStatus}
      googleConnectedEmail={googleEmail}
      googleConnectedAt={googleAt?.toISOString() ?? null}
    />
  )
}

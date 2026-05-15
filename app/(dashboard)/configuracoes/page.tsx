import { getInstanceStatus } from '@/lib/evolution-api'
import { ConfigView } from '@/components/dashboard/ConfigView'

export default async function ConfiguracoesPage() {
  let whatsappStatus = { connected: false, state: 'unknown' }
  try {
    whatsappStatus = await getInstanceStatus()
  } catch {}

  return <ConfigView whatsappStatus={whatsappStatus} />
}

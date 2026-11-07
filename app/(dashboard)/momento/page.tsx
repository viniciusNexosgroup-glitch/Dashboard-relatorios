import { getMomentGroup } from '@/lib/client-moment'
import { MomentoView } from '@/components/dashboard/MomentoView'

export default async function MomentoPage() {
  const group = await getMomentGroup()
  return <MomentoView group={group} />
}

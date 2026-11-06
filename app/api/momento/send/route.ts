import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { sendClientMoment } from '@/lib/client-moment'

export const maxDuration = 120

// "Enviar agora" da aba: manda a tabela dos últimos 7 dias completos para o grupo
// configurado, mesmo que o envio automático da semana já tenha saído.
export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const result = await sendClientMoment({ manual: true })
    if (!result.sent) return NextResponse.json({ error: result.reason }, { status: 400 })
    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

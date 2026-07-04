import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { exchangeAndStoreMetaToken } from '@/lib/meta-token'
import { parseJson } from '@/lib/validators'

const bodySchema = z.object({
  token: z.string().trim().min(30, 'Token muito curto — cole o token completo'),
})

// Renovação manual do token Meta: cola um token do Graph Explorer (curto ou longo),
// o sistema troca por um long-lived de 60 dias e persiste no banco.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = await parseJson(req, bodySchema)
  if ('error' in parsed) return parsed.error

  try {
    const { expiresAt } = await exchangeAndStoreMetaToken(parsed.data.token)
    const daysLeft = Math.floor((expiresAt.getTime() - Date.now()) / 86_400_000)
    return NextResponse.json({ ok: true, expiresAt: expiresAt.toISOString(), daysLeft })
  } catch (err: any) {
    const metaMsg = err.response?.data?.error?.message
    return NextResponse.json(
      { error: metaMsg ? `Meta recusou o token: ${metaMsg}` : `Falha na troca: ${err.message}` },
      { status: 400 }
    )
  }
}

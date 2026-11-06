import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { buildClientMomentPDF } from '@/lib/client-moment'
import { momentQuerySchema, parseQuery } from '@/lib/validators'

export const maxDuration = 120

// Download do PDF da tabela (o mesmo arquivo que vai para o grupo na quarta)
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = parseQuery(req, momentQuerySchema)
  if ('error' in parsed) return parsed.error

  const { pdf, filename } = await buildClientMomentPDF(parsed.data.period || 'last7full')
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}

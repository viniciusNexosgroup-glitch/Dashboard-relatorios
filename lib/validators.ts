import { z } from 'zod'
import { NextResponse } from 'next/server'

// IDs do Prisma (cuid)
const cuid = z.string().min(20).max(40).regex(/^[a-z0-9]+$/i)

// Períodos suportados no getDateRange
export const periodSchema = z.enum([
  'today',
  'yesterday',
  'last7days',
  'last30days',
  'thisMonth',
  'lastMonth',
])

// POST/PUT /api/clients e /api/clients/[id]
export const clientBodySchema = z.object({
  name: z.string().trim().min(1, 'Nome obrigatório').max(120),
  company: z.string().trim().min(1, 'Empresa obrigatória').max(160),
  phone: z.string().trim().max(30).optional().nullable().or(z.literal('')),
  whatsappGroup: z.string().trim().max(120).optional().nullable().or(z.literal('')),
  whatsappGroupName: z.string().trim().max(160).optional().nullable().or(z.literal('')),
  notes: z.string().trim().max(2000).optional().nullable().or(z.literal('')),
  active: z.boolean().optional(),  // toggle de ativar/desativar
})

// POST /api/meta-ads/sync e /api/google-ads/sync
export const syncBodySchema = z.object({
  clientId: cuid.optional(),
})

// POST /api/reports/generate
export const reportGenerateSchema = z.object({
  clientId: cuid,
  period: periodSchema.optional(),
})

// POST /api/whatsapp/send
export const whatsappSendSchema = z.object({
  clientId: cuid,
  period: periodSchema.optional(),
})

// POST /api/ad-accounts
export const adAccountSchema = z.object({
  clientId: cuid,
  platform: z.enum(['META', 'GOOGLE']),
  accountId: z.string().trim().min(1).max(120),
  accountName: z.string().trim().min(1).max(200),
  accessToken: z.string().trim().min(1).max(1000),
  refreshToken: z.string().trim().min(1).max(1000).optional(),
})

// GET /api/metrics
export const metricsQuerySchema = z.object({
  clientId: cuid,
  period: periodSchema.optional(),
})

// Helper: tenta parsear body JSON e validar.
// Retorna `{ data }` em sucesso ou `{ error: NextResponse }` em falha.
export async function parseJson<T extends z.ZodTypeAny>(
  req: Request,
  schema: T
): Promise<{ data: z.infer<T> } | { error: NextResponse }> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return { error: NextResponse.json({ error: 'JSON inválido no body' }, { status: 400 }) }
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    return { error: NextResponse.json({ error: 'Dados inválidos', issues }, { status: 400 }) }
  }
  return { data: parsed.data as z.infer<T> }
}

// Helper pra query strings (GET endpoints)
export function parseQuery<T extends z.ZodTypeAny>(
  req: Request,
  schema: T
): { data: z.infer<T> } | { error: NextResponse } {
  const url = new URL(req.url)
  const obj: Record<string, string> = {}
  url.searchParams.forEach((v, k) => { obj[k] = v })
  const parsed = schema.safeParse(obj)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    return { error: NextResponse.json({ error: 'Parâmetros inválidos', issues }, { status: 400 }) }
  }
  return { data: parsed.data as z.infer<T> }
}

import { prisma } from './prisma'

export async function getMetaAccessToken(): Promise<string> {
  const stored = await prisma.appSettings.findUnique({ where: { key: 'meta_access_token' } })
  return stored?.value || process.env.META_SYSTEM_USER_TOKEN || ''
}

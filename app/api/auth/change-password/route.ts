import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { compare, hash } from 'bcryptjs'
import { z } from 'zod'
import { parseJson } from '@/lib/validators'

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Senha atual obrigatória'),
  // bcrypt trunca silenciosamente em 72 bytes — limita aqui pra evitar surpresa no login
  newPassword: z.string().min(8, 'Nova senha precisa de pelo menos 8 caracteres').max(72, 'Senha não pode ter mais de 72 caracteres'),
})

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = await parseJson(req, changePasswordSchema)
  if ('error' in parsed) return parsed.error
  const { currentPassword, newPassword } = parsed.data

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })

  const match = await compare(currentPassword, user.password)
  if (!match) return NextResponse.json({ error: 'Senha atual incorreta' }, { status: 400 })

  if (currentPassword === newPassword) {
    return NextResponse.json({ error: 'A nova senha precisa ser diferente da atual' }, { status: 400 })
  }

  const newHash = await hash(newPassword, 12)
  await prisma.user.update({
    where: { id: user.id },
    data: { password: newHash },
  })

  return NextResponse.json({ ok: true })
}

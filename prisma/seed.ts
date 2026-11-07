import { PrismaClient } from '@prisma/client'
import { hash } from 'bcryptjs'

const prisma = new PrismaClient()

// Cria o admin inicial. A senha vem de ADMIN_PASSWORD (nunca fixa no código: o repositório
// é público). Se o admin já existe, NÃO mexe na senha dele (update vazio).
async function main() {
  const email = process.env.ADMIN_EMAIL || 'admin@agencia.com'
  const plain = process.env.ADMIN_PASSWORD
  if (!plain || plain.length < 12) {
    throw new Error('Defina ADMIN_PASSWORD (mínimo 12 caracteres) para criar o admin inicial')
  }
  const password = await hash(plain, 12)
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      name: 'Administrador',
      email,
      password,
      role: 'ADMIN',
    },
  })
  console.log('Usuário criado:', user.email)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())

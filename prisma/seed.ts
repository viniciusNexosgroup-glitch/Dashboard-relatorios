import { PrismaClient } from '@prisma/client'
import { hash } from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const password = await hash('admin123', 12)
  const user = await prisma.user.upsert({
    where: { email: 'admin@agencia.com' },
    update: {},
    create: {
      name: 'Administrador',
      email: 'admin@agencia.com',
      password,
      role: 'ADMIN',
    },
  })
  console.log('Usuário criado:', user.email)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())

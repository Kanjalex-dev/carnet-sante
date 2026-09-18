import { PrismaClient } from '@prisma/client';

/**
 * Client Prisma unique. En developpement, Next recharge les modules a chaque
 * edition : sans ce cache global on ouvrirait une nouvelle pool de connexions
 * a chaque sauvegarde, et Postgres finirait par refuser les connexions.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;

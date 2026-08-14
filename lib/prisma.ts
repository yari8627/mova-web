import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function serverlessDatabaseUrl(value?: string) {
  if (!value) return value;

  try {
    const url = new URL(value);
    // Supabase usa la porta 6543 per il transaction pooler. Prisma deve
    // disabilitare le prepared statements e mantenere una sola connessione
    // per istanza serverless, altrimenti le scritture possono fallire in modo
    // intermittente anche quando le letture continuano a funzionare.
    if (url.port === "6543") {
      if (!url.searchParams.has("pgbouncer")) url.searchParams.set("pgbouncer", "true");
      if (!url.searchParams.has("connection_limit")) url.searchParams.set("connection_limit", "1");
      if (!url.searchParams.has("pool_timeout")) url.searchParams.set("pool_timeout", "20");
    }
    return url.toString();
  } catch {
    return value;
  }
}

const datasourceUrl = serverlessDatabaseUrl(process.env.DATABASE_URL);

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  ...(datasourceUrl ? { datasources: { db: { url: datasourceUrl } } } : {}),
});

globalForPrisma.prisma = prisma;

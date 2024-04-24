import { createClient } from "@libsql/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { PrismaClient } from "@prisma/client";
import fp from "fastify-plugin";

export const prisma = fp(
  async (fastify) => {
    const libsql = createClient({
      url: fastify.config.TURSO_DATABASE_URL,
      authToken: fastify.config.TURSO_AUTH_TOKEN,
    });
    const adapter = new PrismaLibSQL(libsql);
    const prisma = new PrismaClient({
      adapter,
    });
    fastify.decorate("prisma", prisma);
  },
  {
    name: "prisma",
  },
);

declare module "fastify" {
  export interface FastifyInstance {
    prisma: PrismaClient;
  }
}

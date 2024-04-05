import { PrismaClient } from "@prisma/client";
import fp from "fastify-plugin";

export const prisma = fp(
  async (fastify) => {
    const prisma = new PrismaClient();
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

import { Static, Type } from "@sinclair/typebox";
import fp from "fastify-plugin";

const CONFIG_SCHEMA = Type.Object({
  PORT: Type.Optional(
    Type.Number({
      default: 3000,
    }),
  ),
  NODE_ENV: Type.Optional(
    Type.Union(
      [
        Type.Literal("development"),
        Type.Literal("production"),
        Type.Literal("test"),
      ],
      { default: "development" },
    ),
  ),
  REDIS_URL: Type.String(),
  TURSO_DATABASE_URL: Type.String(),
  TURSO_AUTH_TOKEN: Type.String(),
  JWT_SECRET: Type.String(),
  FTP_HOST: Type.String(),
  FTP_USER: Type.String(),
  FTP_PASS: Type.String(),
  BULL_BOARD_USER: Type.String(),
  BULL_BOARD_PASS: Type.String(),
});

export const config = fp(async (fastify) => {
  fastify.register(import("@fastify/env"), {
    schema: CONFIG_SCHEMA,
    dotenv: true,
    confKey: "config",
  });
});

declare module "fastify" {
  interface FastifyInstance {
    config: Static<typeof CONFIG_SCHEMA>;
  }
}

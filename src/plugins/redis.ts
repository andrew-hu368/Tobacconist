import fastifyRedis from "@fastify/redis";
import fp from "fastify-plugin";
import Redis from "ioredis";

export const redis = fp(
  async (fastify) => {
    const redis = new Redis(fastify.config.REDIS_URL, {
      maxRetriesPerRequest: null,
    });
    await fastify.register(fastifyRedis, {
      client: redis,
    });
  },
  {
    name: "redis",
  },
);

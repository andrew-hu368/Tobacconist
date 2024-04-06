import { join } from "node:path";
import fastifyView from "@fastify/view";
import ejs from "ejs";
import { FastifyInstance } from "fastify";

export async function siteRoute(fastify: FastifyInstance) {
  await fastify.register(fastifyView, {
    engine: {
      ejs,
    },
    root: join(__dirname, "../views"),
    viewExt: "ejs",
  });

  fastify.get("/", async (request, reply) => {
    return reply.view("pages/index.ejs");
  });
}

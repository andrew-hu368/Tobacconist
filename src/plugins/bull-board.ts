import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { FastifyAdapter } from "@bull-board/fastify";
import FastifyBasicAuth from "@fastify/basic-auth";
import { FastifyInstance } from "fastify";

export async function bullBoard(fastify: FastifyInstance) {
  await fastify.register(FastifyBasicAuth, {
    validate: function validate(username, password, req, reply, done) {
      if (
        username === fastify.config.BULL_BOARD_USER &&
        password === fastify.config.BULL_BOARD_PASS
      ) {
        done();
      } else {
        done(new Error("Unauthorized"));
      }
    },
    authenticate: { realm: "Bull-Board" },
  });

  fastify.after(() => {
    const serverAdapter = new FastifyAdapter();

    createBullBoard({
      queues: fastify.queues.map((q) => new BullMQAdapter(q)),
      serverAdapter,
    });

    serverAdapter.setBasePath("/bullmq/ui");
    // @ts-expect-error - Code provided by the example
    fastify.register(serverAdapter.registerPlugin(), {
      prefix: "/bullmq/ui",
    });
    fastify.route({
      method: "GET",
      url: "/bullmq/login",
      handler: function (_req, reply) {
        reply.redirect("/bullmq/ui");
      },
    });
    fastify.addHook("onRequest", fastify.basicAuth);
  });
}

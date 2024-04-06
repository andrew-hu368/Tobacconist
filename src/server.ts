import { join } from "node:path";
import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import closeWithGrace from "close-with-grace";
import fastify, { type FastifyServerOptions } from "fastify";

import { bullmq } from "./plugins/bullmq";
import { config } from "./plugins/config";
import { jwt } from "./plugins/jwt";
import { prisma } from "./plugins/prisma";
import { redis } from "./plugins/redis";
import { productsRoute } from "./routes/products";
import { siteRoute } from "./routes/site";
import { tokensRoute } from "./routes/tokens";

async function main() {
  const opts = {
    logger: {
      level: "info",
    },
  } as FastifyServerOptions;

  if (process.stdout.isTTY) {
    opts.logger = {
      level: "info",
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
        },
      },
    };
  }

  const app = fastify(opts).withTypeProvider<TypeBoxTypeProvider>();

  await app.register(config);
  await app.register(import("@fastify/sensible"));
  await app.register(prisma);
  await app.register(jwt);
  await app.register(redis);
  await app.register(bullmq);
  await app.register(import("@fastify/static"), {
    root: join(__dirname, "../public"),
  });
  await app.register(siteRoute);

  // ROUTES
  await app.register(import("fastify-healthcheck"));
  await app.register(tokensRoute, {
    prefix: "/v1/tokens",
  });
  await app.register(productsRoute, {
    prefix: "/v1/products",
  });

  if (app.config.NODE_ENV === "development") {
    app.addHook("onReady", (done) => {
      app.log.info(app.printRoutes());
      done();
    });
  }

  const port = app.config.PORT;

  app.listen(
    {
      port,
      host: "0.0.0.0",
    },
    (err) => {
      if (err) {
        app.log.error(err);
        process.exit(1);
      }
    },
  );

  closeWithGrace(async ({ signal, err }) => {
    if (err) {
      app.log.error(err);
    } else {
      app.log.info(`closeWithGrace signal: ${signal}`);
    }

    await Promise.allSettled(app.workers.map((worker) => worker.close()));
    await Promise.allSettled(app.queues.map((queue) => queue.close()));
    await app.redis.quit();
    await app.prisma.$disconnect();
    await app.close();
  });
}

main();

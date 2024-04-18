import { join } from "node:path";
import fastifyView from "@fastify/view";
import ejs from "ejs";
import { FastifyInstance } from "fastify";

export async function siteRoute(fastify: FastifyInstance) {
  await fastify.register(fastifyView, {
    engine: {
      ejs,
    },
    root:
      fastify.config.NODE_ENV === "production"
        ? join(__dirname, "./views")
        : join(__dirname, "../views"),
    viewExt: "ejs",
  });

  const dateFormat = new Intl.DateTimeFormat("it-IT", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  fastify.get("/", async (_request, reply) => {
    const products = await fastify.prisma.product.findMany({
      select: {
        name: true,
        groupDescription: true,
        active: true,
        updatedAt: true,
      },
      take: 10,
      orderBy: {
        updatedAt: "desc",
      },
    });
    return reply.view("pages/index.ejs", {
      title: "Codici a barre dei tabacchi",
      description:
        "Gli ultimi dati aggiornati sui codici a barre dei tabacchi, gratta e vinci, lotterie istantanee e altri prodotti dei tabaccai.",
      products: products.map((p) => ({
        name: p.name,
        groupDescription: p.groupDescription,
        active: p.active ? "Attivo" : "Ritirato",
        updatedAt: dateFormat.format(p.updatedAt),
      })),
    });
  });
}

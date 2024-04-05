import fp from "fastify-plugin";

export const jwt = fp(
  async (fastify) => {
    await fastify.register(import("@fastify/jwt"), {
      secret: fastify.config.JWT_SECRET,
      sign: { algorithm: "HS512" },
    });

    const tokens = await fastify.prisma.token.findMany({
      where: {
        role: "master",
      },
    });

    if (tokens.length === 0) {
      const masterToken = fastify.jwt.sign({ role: "master" });
      const decodedToken = fastify.jwt.decode(masterToken, {
        complete: true,
      }) as {
        payload: { role: string };
        signature: string;
      } | null;

      if (!decodedToken) {
        throw new Error("Failed to decode initial master token");
      }

      await fastify.prisma.token.create({
        data: {
          signature: decodedToken.signature,
          role: "master",
        },
      });

      fastify.log.info(`Master token: ${masterToken}. Store it safely!`);
    }
  },
  {
    name: "jwt",
    dependencies: ["prisma"],
  },
);

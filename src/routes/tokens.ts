import { Static, Type } from "@sinclair/typebox";
import { type FastifyInstance } from "fastify";

const CREATE_TOKEN_SCHEMA = Type.Object({
  token: Type.String(),
  role: Type.String(),
});

export async function tokensRoute(fastify: FastifyInstance) {
  fastify.addHook("onRequest", async (request, reply) => {
    try {
      const decodedToken = fastify.jwt.decode(
        request.headers.authorization?.split(" ")[1] as string,
        {
          complete: true,
        },
      ) as { payload: { role: string }; signature: string } | null;

      if (!decodedToken) {
        return reply.unauthorized();
      }

      const foundToken = await fastify.prisma.token.findMany({
        where: {
          signature: decodedToken.signature,
        },
      });

      if (decodedToken?.payload.role !== "master" || !foundToken) {
        return reply.unauthorized();
      }
    } catch (err) {
      return reply.unauthorized();
    }
  });

  fastify.post<{
    Reply: Static<typeof CREATE_TOKEN_SCHEMA>;
  }>(
    "/",
    {
      schema: {
        response: {
          201: CREATE_TOKEN_SCHEMA,
        },
      },
    },
    async (_, reply) => {
      const role = "viewer";
      const token = fastify.jwt.sign(
        {
          role,
        },
        {
          algorithm: "HS512",
        },
      );
      const decodedToken = fastify.jwt.decode(token, {
        complete: true,
      }) as {
        payload: { role: string };
        signature: string;
      } | null;

      if (!decodedToken) {
        return reply.internalServerError();
      }

      await fastify.prisma.token.create({
        data: {
          role,
          signature: decodedToken.signature,
        },
      });

      reply.statusCode = 201;
      reply.send({
        token,
        role,
      });
    },
  );
}

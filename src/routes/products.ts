import { Static, Type } from "@sinclair/typebox";
import { FastifyInstance } from "fastify";

import {
  CreateProductBody,
  Product,
  ProductParam,
  UpdateProductBody,
} from "../plugins/product-store";

const Products = Type.Array(Product);
type Products = Static<typeof Products>;

export async function productsRoute(fastify: FastifyInstance) {
  fastify.addHook("onRequest", async (request, reply) => {
    try {
      const token = request.headers.authorization?.split(" ")[1];

      if (!token) {
        return reply.unauthorized();
      }

      const decodedToken = fastify.jwt.decode(token, { complete: true }) as {
        payload: { role: string };
        signature: string;
      } | null;

      if (!decodedToken) {
        return reply.unauthorized();
      }

      if (
        (request.method === "POST" ||
          request.method === "PUT" ||
          request.method === "DELETE") &&
        decodedToken.payload.role !== "admin"
      ) {
        return reply.forbidden();
      }

      const foundToken = await fastify.prisma.token.findMany({
        where: {
          signature: decodedToken.signature,
        },
      });
      if (!foundToken.length) {
        return reply.unauthorized();
      }
    } catch (err) {
      return reply.internalServerError((err as Error).message);
    }
  });

  fastify.post<{ Body: CreateProductBody }>(
    "/",
    {
      schema: {
        body: CreateProductBody,
        response: {
          201: Product,
        },
      },
    },
    async (request, reply) => {
      const product = await fastify.productStore.createProduct(request.body);

      return reply.code(201).send(product);
    },
  );

  fastify.put<{
    Params: ProductParam;
    Body: UpdateProductBody;
  }>(
    "/:id",
    {
      schema: {
        params: ProductParam,
        body: UpdateProductBody,
        response: {
          200: Product,
        },
      },
    },
    async (request, reply) => {
      const product = await fastify.productStore.updateProduct(
        request.params.id,
        request.body,
      );

      if (!product) {
        return reply.notFound();
      }

      return product;
    },
  );

  fastify.get<{ Reply: Products }>(
    "/",
    {
      schema: {
        response: {
          200: Products,
        },
      },
    },
    async (_, __) => {
      const products = await fastify.productStore.getProducts();

      return products;
    },
  );
}

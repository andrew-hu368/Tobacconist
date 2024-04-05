import { Prisma } from "@prisma/client";
import { Static, Type } from "@sinclair/typebox";
import { FastifyInstance } from "fastify";

const PRODUCT_SCHEMA = Type.Object({
  productId: Type.String(),
  productName: Type.String(),
  productPrice: Type.Optional(Type.Number()),
  barcodes: Type.Array(
    Type.Object({
      barcode: Type.String(),
      quantity: Type.Number(),
    }),
  ),
});

const PRODUCTS_SCHEMA = Type.Array(PRODUCT_SCHEMA);

export async function productsRoute(fastify: FastifyInstance) {
  fastify.addHook("onRequest", async (request, reply) => {
    try {
      const token = request.headers.authorization?.split(" ")[1];

      if (!token) {
        reply.statusCode = 401;
        return reply.send(new Error("Unauthorized"));
      }

      const decodedToken = fastify.jwt.decode(token, { complete: true }) as {
        payload: { role: string };
        signature: string;
      } | null;

      if (!decodedToken) {
        reply.statusCode = 401;
        return reply.send(new Error("Unauthorized"));
      }

      const foundToken = await fastify.prisma.token.findMany({
        where: {
          signature: decodedToken.signature,
        },
      });
      if (!foundToken.length) {
        return reply.send(new Error("Unauthorized"));
      }
    } catch (err) {
      return reply.send(err);
    }
  });

  fastify.get<{ Reply: Static<typeof PRODUCTS_SCHEMA> }>(
    "/",
    {
      schema: {
        response: {
          200: PRODUCTS_SCHEMA,
        },
      },
    },
    async (_, __) => {
      const unformattedProducts: {
        productId: string;
        productName: string;
        productPrice: number;
        barcode: string;
        quantity: number;
      }[] = await fastify.prisma.$queryRaw(
        Prisma.sql`SELECT Product.id AS productId, Product.name AS productName, Product.price AS productPrice, Barcode.barcode AS barcode, Barcode.quantity AS quantity FROM Product LEFT JOIN Barcode ON Product.id = Barcode.productId`,
      );

      const products = unformattedProducts.reduce(
        (acc, product) => {
          if (!acc.has(product.productId)) {
            acc.set(product.productId, {
              productId: product.productId,
              productName: product.productName,
              productPrice: product.productPrice,
              barcodes: [],
            });
          }

          if (product.barcode) {
            acc.get(product.productId)?.barcodes.push({
              barcode: product.barcode,
              quantity: product.quantity,
            });
          }

          return acc;
        },
        new Map<
          string,
          {
            productId: string;
            productName: string;
            productPrice: number;
            barcodes: {
              barcode: string;
              quantity: number;
            }[];
          }
        >(),
      );

      return Array.from(products.values());
    },
  );
}

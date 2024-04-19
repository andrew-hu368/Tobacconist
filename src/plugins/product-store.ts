import { Prisma, PrismaClient } from "@prisma/client";
import { Static, Type } from "@sinclair/typebox";
import fp from "fastify-plugin";

export const Barcode = Type.Object({
  id: Type.String(),
  barcode: Type.String(),
  quantity: Type.Number(),
});
export type Barcode = Static<typeof Barcode>;
export const Product = Type.Object({
  id: Type.String(),
  name: Type.String(),
  price: Type.Union([Type.Number(), Type.Null()]),
  groupCode: Type.String(),
  groupDescription: Type.String(),
  productCode: Type.String(),
  productDescription: Type.Union([Type.String(), Type.Null()]),
  active: Type.Boolean(),
  barcodes: Type.Array(Barcode),
  createdAt: Type.String({ format: "date" }),
  updatedAt: Type.String({ format: "date" }),
});
export type Product = Static<typeof Product>;
export const CreateProductBody = Type.Intersect([
  Type.Omit(Product, ["id", "createdAt", "updatedAt"]),
  Type.Object({
    barcodes: Type.Array(Type.Omit(Barcode, ["id"])),
  }),
]);
export type CreateProductBody = Static<typeof CreateProductBody>;
export const ProductParam = Type.Pick(Product, ["id"]);
export type ProductParam = Static<typeof ProductParam>;
export const UpdateProductBody = Type.Intersect([
  Type.Partial(Type.Omit(CreateProductBody, ["barcodes"])),
  Type.Object({
    barcodes: Type.Array(
      Type.Intersect([
        Type.Omit(Barcode, ["id"]),
        Type.Partial(Type.Pick(Barcode, ["id"])),
      ]),
    ),
  }),
]);
export type UpdateProductBody = Static<typeof UpdateProductBody>;
type GetProductBarcodesRaw = (Omit<Product, "barcodes"> &
  Omit<Barcode, "id"> & { barcodeId: Barcode["id"] })[];

class ProductStore {
  private db: PrismaClient;

  constructor(db: PrismaClient) {
    this.db = db;
  }

  createProduct({ barcodes, ...rest }: CreateProductBody) {
    return this.db.product.create({
      data: {
        ...rest,
        barcodes: {
          create: barcodes,
        },
      },
    });
  }

  async getProduct(id: ProductParam["id"]) {
    const productBarcodes = await this.db.$queryRaw<GetProductBarcodesRaw>(
      Prisma.sql`SELECT Product.id AS id, Product.name AS name, Product.price AS price, Product.groupCode AS groupCode, Product.groupDescription AS groupDescription, Product.productCode AS productCode, Product.productDescription AS productDescription, Product.active AS active, Product.createdAt AS createdAt, Product.updatedAt AS updatedAt, Barcode.id AS barcodeId, Barcode.barcode AS barcode, Barcode.quantity AS quantity FROM Product LEFT JOIN Barcode ON Product.id = Barcode.productId WHERE Product.id = ${id}`,
    );

    const products = this._formatProduct(productBarcodes);

    if (products.length === 0) {
      return null;
    }

    if (products.length > 1) {
      throw new Error("Expected to find one product, but found multiple.");
    }

    return products[0];
  }

  async updateProduct(id: ProductParam["id"], product: UpdateProductBody) {
    const foundProduct = await this.getProduct(id);

    if (!foundProduct) {
      return null;
    }

    const { barcodes, ...rest } = product;
    const deletedBarcodes = foundProduct.barcodes.filter(
      (b) => !barcodes?.find((b2) => b2.barcode === b.barcode),
    );
    const newBarcodes = barcodes?.filter((b) => !b.id);
    const updatedBarcodes = foundProduct.barcodes.filter((b) =>
      barcodes.find((b2) => b2.id === b.id),
    );

    await this.db.$transaction([
      this.db.product.update({
        data: {
          ...rest,
          barcodes: {
            create: newBarcodes,
          },
        },
        where: {
          id,
        },
      }),
      ...deletedBarcodes.map((b) => {
        return this.db.barcode.delete({
          where: {
            id: b.id,
          },
        });
      }),
      ...(updatedBarcodes?.map((b) => {
        return this.db.barcode.update({
          data: b,
          where: {
            id: b.id,
          },
        });
      }) ?? []),
    ]);

    return this.getProduct(id);
  }

  async getProducts() {
    const productsBarcodes = await this.db.$queryRaw<GetProductBarcodesRaw>(
      Prisma.sql`SELECT Product.id AS id, Product.name AS name, Product.price AS price, Product.groupCode AS groupCode, Product.groupDescription AS groupDescription, Product.productCode AS productCode, Product.productDescription AS productDescription, Product.active AS active, Product.createdAt AS createdAt, Product.updatedAt AS updatedAt, Barcode.id AS barcodeId, Barcode.barcode AS barcode, Barcode.quantity AS quantity FROM Product LEFT JOIN Barcode ON Product.id = Barcode.productId`,
    );

    return this._formatProduct(productsBarcodes);
  }

  private _formatProduct(productBarcodes: GetProductBarcodesRaw) {
    const products = productBarcodes.reduce((acc, product) => {
      if (!acc.has(product.id)) {
        acc.set(product.id, {
          id: product.id,
          name: product.name,
          price: product.price,
          groupCode: product.groupCode,
          groupDescription: product.groupDescription,
          productCode: product.productCode,
          productDescription: product.productDescription,
          active: product.active,
          barcodes: [],
          createdAt: product.createdAt,
          updatedAt: product.updatedAt,
        });
      }

      if (product.barcode) {
        acc.get(product.id)?.barcodes.push({
          id: product.barcodeId,
          barcode: product.barcode,
          quantity: product.quantity,
        });
      }

      return acc;
    }, new Map<string, Product>());

    return Array.from(products.values());
  }
}

export const productStore = fp(
  async (fastify) => {
    fastify.decorate("productStore", new ProductStore(fastify.prisma));
  },
  {
    name: "productStore",
    dependencies: ["prisma"],
  },
);

declare module "fastify" {
  export interface FastifyInstance {
    productStore: ProductStore;
  }
}

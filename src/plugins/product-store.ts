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
  Type.Omit(Product, ["id", "barcodes", "createdAt", "updatedAt"]),
  Type.Object({
    barcodes: Type.Array(Type.Omit(Barcode, ["id"])),
  }),
]);
export type CreateProductBody = Static<typeof CreateProductBody>;
export const ProductParam = Type.Pick(Product, ["id"]);
export type ProductParam = Static<typeof ProductParam>;
export const UpdateProductBody = Type.Intersect([
  Type.Partial(Type.Omit(CreateProductBody, ["barcodes"])),
  Type.Partial(
    Type.Object({
      barcodes: Type.Array(
        Type.Intersect([
          Type.Omit(Barcode, ["id"]),
          Type.Partial(Type.Pick(Barcode, ["id"])),
        ]),
      ),
    }),
  ),
]);
export type UpdateProductBody = Static<typeof UpdateProductBody>;
type GetProductBarcodesRaw = (Omit<Product, "barcodes"> &
  Omit<Barcode, "id"> & { barcodeId: Barcode["id"] })[];

class ProductStore {
  private _db: PrismaClient;

  constructor(db: PrismaClient) {
    this._db = db;
  }

  async createProduct({ barcodes, ...rest }: CreateProductBody) {
    const product = await this._db.product.create({
      data: {
        ...rest,
        barcodes: {
          create: barcodes,
        },
      },
      select: {
        id: true,
      },
    });

    return this.getProduct({ id: product.id });
  }

  async getProduct({
    id,
    productCode,
  }: Partial<Pick<Product, "id" | "productCode">>) {
    if (!id && !productCode) {
      throw new Error("Expected either id or productCode to be provided.");
    }

    const condition = id
      ? `p.id = '${id}'`
      : `p.productCode = '${productCode}'`;

    const productBarcodes =
      await this._db.$queryRawUnsafe<GetProductBarcodesRaw>(
        `SELECT r.id AS id, r.name AS name, r.price AS price, r.groupCode AS groupCode, r.groupDescription AS groupDescription, r.productCode AS productCode, r.productDescription AS productDescription, r.active AS active, r.createdAt AS createdAt, r.updatedAt AS updatedAt, b.id AS barcodeId, b.barcode AS barcode, b.quantity AS quantity FROM (SELECT * FROM Product p WHERE ${condition}) AS r LEFT JOIN Barcode b ON r.id = b.productId`,
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

  async updateProduct(
    identifier: Partial<Pick<Product, "id" | "productCode">>,
    product: UpdateProductBody,
  ) {
    const foundProduct = await this.getProduct(identifier);

    if (!foundProduct) {
      return null;
    }

    if (!this.shouldUpdateProduct(product, foundProduct)) {
      return foundProduct;
    }

    const { barcodes, ...rest } = product;
    const deletedBarcodes = foundProduct.barcodes.filter(
      (b) => !barcodes?.find((b2) => b2.barcode === b.barcode),
    );
    const newBarcodes = barcodes?.filter((b) => !b.id);
    const updatedBarcodes = foundProduct.barcodes.filter((b) =>
      barcodes?.find((b2) => b2.id === b.id),
    );

    await this._db.$transaction([
      this._db.product.update({
        data: {
          ...rest,
          barcodes: {
            create: newBarcodes,
          },
        },
        where: {
          id: foundProduct.id,
        },
      }),
      ...deletedBarcodes.map((b) => {
        return this._db.barcode.delete({
          where: {
            id: b.id,
          },
        });
      }),
      ...updatedBarcodes?.map((b) => {
        return this._db.barcode.update({
          data: b,
          where: {
            id: b.id,
          },
        });
      }),
    ]);

    return this.getProduct(identifier);
  }

  async getProducts() {
    const productsBarcodes = await this._db.$queryRaw<GetProductBarcodesRaw>(
      Prisma.sql`SELECT p.id AS id, p.name AS name, p.price AS price, p.groupCode AS groupCode, p.groupDescription AS groupDescription, p.productCode AS productCode, p.productDescription AS productDescription, p.active AS active, p.createdAt AS createdAt, p.updatedAt AS updatedAt, b.id AS barcodeId, b.barcode AS barcode, b.quantity AS quantity FROM Product p LEFT JOIN Barcode b ON p.id = b.productId`,
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

  private shouldUpdateProduct(
    product: UpdateProductBody,
    existingProduct: Product,
  ) {
    return Object.keys(product)
      .map((k) => {
        const key = k as keyof UpdateProductBody;

        if (key === "barcodes") {
          return product.barcodes?.some((b) => {
            return !existingProduct.barcodes.find(
              (b2) => b.barcode === b2.barcode && b.quantity === b2.quantity,
            );
          });
        }

        return product[key] !== existingProduct[key];
      })
      .every(Boolean);
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

import fs from "node:fs";
import { Transform, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { type PrismaClient } from "@prisma/client";
import { Client } from "basic-ftp";
import { Queue, Worker } from "bullmq";
import { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { parser as jsonParser } from "stream-json";
import { pick } from "stream-json/filters/Pick";
import { streamArray } from "stream-json/streamers/StreamArray";
// @ts-expect-error - No types available
import xmlToJson from "xml-to-json-stream";

const DEFAULT_QUEUE_NAME = "default";
const INIT_DAILY_DATA_DOWNLOAD = "init-daily-data-download";
const PROCESS_DAILY_DATA = "process-daily-data";
const FILE_NAME = "TobaccoData.xml";

// Exporting the plugin to gracefully close the queues and workers
export const bullmq = fp(
  async (fastify: FastifyInstance) => {
    const queue = new Queue(DEFAULT_QUEUE_NAME, {
      connection: fastify.redis,
    });
    const onCompletedDailyDataDownload = async () => {
      await queue.add(
        PROCESS_DAILY_DATA,
        { fileName: FILE_NAME },
        {
          removeOnComplete: 30,
          removeOnFail: 30,
        },
      );
    };
    const worker = new Worker(
      DEFAULT_QUEUE_NAME,
      async (job) => {
        fastify.log.info(`Processing job id ${job.id} with name ${job.name}`);

        if (job.name === INIT_DAILY_DATA_DOWNLOAD) {
          return initDailyDataDownload({
            logger: fastify.log,
            config: fastify.config,
            onComplete: onCompletedDailyDataDownload,
            data: job.data,
          });
        }

        if (job.name === PROCESS_DAILY_DATA) {
          return processDailyData({
            logger: fastify.log,
            data: job.data,
            prisma: fastify.prisma,
          });
        }

        throw new Error(`Unknown job name: ${job.name}`);
      },
      {
        connection: fastify.redis,
      },
    );

    fastify.decorate("queues", [queue]);
    fastify.decorate("workers", [worker]);

    // TODO: Add repeatable job to download daily data
    await queue.add(
      INIT_DAILY_DATA_DOWNLOAD,
      {
        fileName: FILE_NAME,
      },
      {
        removeOnComplete: 30,
        removeOnFail: 30,
      },
    );

    worker.on("completed", (job) => {
      fastify.log.info(`Job id ${job.id} with name ${job.name} has completed`);
    });
    worker.on("failed", (job, err) => {
      fastify.log.error(
        `Job id ${job?.id} with name ${job?.name} has failed with error: ${err}`,
      );
    });
  },
  {
    name: "bullmq",
    dependencies: ["redis", "prisma"],
  },
);

async function initDailyDataDownload({
  logger,
  config,
  onComplete,
  data,
}: {
  logger: FastifyInstance["log"];
  config: FastifyInstance["config"];
  onComplete: () => Promise<void>;
  data: { fileName: string };
}) {
  logger.info("Downloading daily data");

  const client = new Client();
  client.ftp.verbose = config.NODE_ENV === "development";

  await client.access({
    host: config.FTP_HOST,
    user: config.FTP_USER,
    password: config.FTP_PASS,
    secure: false,
  });

  await client.cd("TOBACCO");
  await client.downloadTo(data.fileName, data.fileName);
  client.close();

  await onComplete();

  logger.info("Downloaded daily data");
}

async function processDailyData({
  prisma,
  logger,
  data,
}: {
  prisma: FastifyInstance["prisma"];
  logger: FastifyInstance["log"];
  data: { fileName: string };
}) {
  logger.info("Processing daily data");

  const tobaccoXmlReadStream = fs.createReadStream(FILE_NAME);

  await pipeline([
    tobaccoXmlReadStream,
    xmlToJson().createStream(),
    jsonParser(),
    pick({ filter: "TobaccoData" }),
    pick({ filter: "Groups" }),
    pick({ filter: "Group" }),
    streamArray(),
    new TransformProduct(),
    new ProductsWritable(prisma),
  ]);

  fs.existsSync(FILE_NAME) && fs.unlinkSync(FILE_NAME);
  logger.info("Processing daily data completed");
}

class TransformProduct extends Transform {
  constructor() {
    super({ objectMode: true });
  }

  _transform(
    chunk: {
      value?: {
        code: string;
        description: string;
        Articles: { Article: RawProduct[] };
      };
    },
    _: any,
    callback: (err?: Error | null) => void,
  ) {
    if (chunk.value) {
      const products = chunk.value.Articles.Article.map((article) => {
        const barcodes = Array.isArray(article.Barcodes?.Barcode)
          ? article.Barcodes.Barcode
          : article.Barcodes?.Barcode
            ? [article.Barcodes.Barcode]
            : [];

        return {
          code: article.code,
          oldCode: article.oldCode,
          description: article.description,
          price: article.price
            ? parseInt(article.price.replace(",", "."))
            : undefined,
          disbarred: article.disbarred,
          groupCode: chunk.value!.code,
          groupDescription: chunk.value!.description,
          barcodes: barcodes.map((barcode) => ({
            quantity: parseInt(barcode.quantity),
            value: barcode.value,
          })),
        };
      });

      for (const product of products) {
        this.push(product);
      }
    }
    callback(null);
  }
}

class ProductsWritable extends Writable {
  private readonly prisma: PrismaClient;
  constructor(prisma: PrismaClient) {
    super({ objectMode: true, highWaterMark: 16 });
    this.prisma = prisma;
  }

  _write(
    chunk: FormattedProduct,
    _: any,
    callback: (err?: Error | null) => void,
  ) {
    if (chunk.disbarred === "1") {
      this.prisma.product
        .updateMany({
          where: {
            productCode: chunk.code !== "" ? chunk.code : chunk.oldCode,
          },
          data: {
            active: false,
          },
        })
        .then(() => callback(null))
        .catch(callback);
    } else if (chunk.disbarred === "0" && chunk.code !== "") {
      this.prisma.product
        .findFirst({
          where: {
            productCode: chunk.code,
          },
          include: {
            barcodes: true,
          },
        })
        // @ts-expect-error - It seems to be useless type checking
        .then((product) => {
          if (product) {
            return this.prisma.$transaction([
              this.prisma.product.update({
                where: {
                  id: product.id,
                },
                data: {
                  price: chunk.price,
                },
              }),
              ...chunk.barcodes.map((barcode) => {
                const existingBarcode = product.barcodes.find(
                  (b) => b.barcode === barcode.value,
                );

                if (existingBarcode) {
                  return this.prisma.barcode.update({
                    where: {
                      id: existingBarcode.id,
                    },
                    data: {
                      quantity: barcode.quantity,
                      barcode: barcode.value,
                    },
                  });
                }
                return this.prisma.product.update({
                  where: {
                    id: product.id,
                  },
                  data: {
                    barcodes: {
                      create: {
                        quantity: barcode.quantity,
                        barcode: barcode.value,
                      },
                    },
                  },
                });
              }),
            ]);
          }

          return this.prisma.product.create({
            data: {
              price: chunk.price,
              productCode: chunk.code,
              productDescription: chunk.description,
              active: true,
              groupCode: chunk.groupCode,
              groupDescription: chunk.groupDescription,
              name: chunk.description,
              barcodes: {
                create: chunk.barcodes.map((barcode) => ({
                  quantity: barcode.quantity,
                  barcode: barcode.value,
                })),
              },
            },
          });
        })
        .then(() => callback(null))
        .catch(callback);
    } else {
      callback(null);
    }
  }
}

type RawProduct = {
  code: string;
  oldCode: string;
  description: string;
  price?: string;
  disbarred: "0" | "1";
  Barcodes?: {
    Barcode:
      | {
          quantity: string;
          value: string;
        }[]
      | { quantity: string; value: string };
  };
};

type FormattedProduct = {
  code: string;
  oldCode: string;
  description: string;
  price?: number;
  disbarred: "0" | "1";
  groupCode: string;
  groupDescription: string;
  barcodes: { quantity: number; value: string }[];
};

declare module "fastify" {
  export interface FastifyInstance {
    queues: Queue[];
    workers: Worker[];
  }
}

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { resolveJoinOrigin } from "./join-origin.js";

const querySchema = z.object({
  browserOrigin: z
    .string()
    .url()
    .refine((value) => {
      const protocol = new URL(value).protocol;
      return protocol === "http:" || protocol === "https:";
    }),
});

export async function registerRuntimeRoutes(app: FastifyInstance) {
  app.get("/api/runtime", async (request, reply) => {
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success)
      return reply.code(400).send({ error: "Invalid browser origin." });
    return { joinOrigin: resolveJoinOrigin(parsed.data.browserOrigin) };
  });
}

import { z } from "zod";
const environmentSchema = z.object({
    HOST: z.string().default("127.0.0.1"),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    DATABASE_URL: z.string().url(),
    LOG_LEVEL: z
        .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
        .default("info"),
    SERVE_CLIENT: z
        .enum(["true", "false"])
        .default("false")
        .transform((value) => value === "true"),
    NODE_ENV: z
        .enum(["development", "test", "production"])
        .default("development"),
});
export function readConfig(environment = process.env) {
    return environmentSchema.parse(environment);
}
//# sourceMappingURL=config.js.map
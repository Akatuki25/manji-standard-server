import { serve } from "@hono/node-server";
import { drizzle } from "drizzle-orm/node-postgres";
import { Hono } from "hono";
import pg from "pg";
import { UserService } from "./domain/service/user-service.js";
import { PostgresUserRepository } from "./infra/repository/user-postgres-repository.gen.js";
import { registerHandlers } from "./lib/handler-registry.gen.js";
import { UserUsecaseImpl } from "./usecase/user-usecase.js";
// --- DB 接続 ---
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
    // eslint-disable-next-line no-console
    console.error("DATABASE_URL is required (example: postgres://user:pass@localhost:5432/app)");
    process.exit(1);
}
const pool = new pg.Pool({ connectionString: databaseUrl });
const db = drizzle(pool);
// --- DI: Usecase 実装を組み立て、生成された handler-registry に渡す ---
const userRepo = new PostgresUserRepository(db);
const userService = new UserService(userRepo);
const userUsecase = new UserUsecaseImpl(userService);
// --- Hono: REST ルートをネイティブに登録 ---
const app = new Hono();
app.get("/health", (c) => c.text("ok"));
registerHandlers(app, { userUsecase });
const port = Number(process.env.PORT ?? 8080);
serve({ fetch: app.fetch, port }, () => {
    // eslint-disable-next-line no-console
    console.log(`listening on http://localhost:${port}`);
});
//# sourceMappingURL=main.js.map
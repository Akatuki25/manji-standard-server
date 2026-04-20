import * as http from "node:http";
import { connectNodeAdapter } from "@connectrpc/connect-node";
import { getRequestListener } from "@hono/node-server";
import { Hono } from "hono";
import { UserService as UserServiceDef } from "./gen/user/v1/user_connect.js";
import { UserService } from "./domain/service/user-service.js";
import { createUserServiceImpl } from "./handler/user-handler.js";
import { InMemoryUserRepository } from "./infra/repository/in-memory-user-repository.gen.js";
import { UserUsecase } from "./usecase/user-usecase.js";
// --- DI: 依存組み立て ---
const userRepo = new InMemoryUserRepository();
const userService = new UserService(userRepo);
const userUsecase = new UserUsecase(userService);
// --- Hono: 非 RPC のルート（ヘルスチェック等） ---
const app = new Hono();
app.get("/health", (c) => c.text("ok"));
const honoListener = getRequestListener(app.fetch);
// --- Connect: RPC を処理、非 RPC は Hono へフォールバック ---
// hono/node-server と connect-node の req/res 型は HTTP/2 対応差で型定義が
// 一致しないが、HTTP/1.1 のみで動かす本プロジェクトでは実行時互換。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fallback = honoListener;
const handler = connectNodeAdapter({
    routes(router) {
        router.service(UserServiceDef, createUserServiceImpl(userUsecase));
    },
    fallback,
});
const port = Number(process.env.PORT ?? 8080);
http.createServer(handler).listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`listening on http://localhost:${port}`);
});
//# sourceMappingURL=main.js.map
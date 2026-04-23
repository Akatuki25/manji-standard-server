import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";

import { UserService } from "@/domain/service/user-service";
import { PostgresUserRepository } from "@/infra/repository/user-postgres-repository.gen";
import { provideHandlerDepsFactory } from "@/lib/handler-registry.gen";
import { UserUsecaseImpl } from "@/usecase/user-usecase";

// HMR 対策として接続 Pool は globalThis にキャッシュする。
declare global {
  // eslint-disable-next-line no-var
  var __pgPool: pg.Pool | undefined;
  // eslint-disable-next-line no-var
  var __drizzleDb: NodePgDatabase<Record<string, never>> | undefined;
}

// module load 時は factory を登録するだけ。実際の DB 接続や Usecase 組み立ては
// 最初の Route Handler 呼び出し時まで遅延させる（Next の build 時に DB 接続しないため）。
provideHandlerDepsFactory(() => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required (example: postgres://user:pass@localhost:5432/app)");
  }
  const pool = globalThis.__pgPool ?? (globalThis.__pgPool = new pg.Pool({ connectionString: databaseUrl }));
  const db = globalThis.__drizzleDb ?? (globalThis.__drizzleDb = drizzle(pool));
  const userRepository = new PostgresUserRepository(db);
  const userService = new UserService(userRepository);
  const userUsecase = new UserUsecaseImpl(userService);
  return { userUsecase };
});

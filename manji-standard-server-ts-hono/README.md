# manji-standard-server-ts-hono

TypeScript + Hono + DDD + Connect RPC のバックエンドプロジェクト。

> [manji-standard-server 系](../manji-standard-server/README.md) の **Hono 参照実装**。基盤の skill / subagent / [アーキテクチャパターン](../manji-standard-server/docs/patterns/README.md)（proto 駆動 DDD / `mss-protoc-gen` / インフラ差し替え）に準拠。
> 姉妹実装: [Go 版](../manji-standard-server-go/) / [Next.js 版](../manji-standard-server-ts-next/)

## セットアップ

```bash
npm install
make proto-gen         # proto からコード生成
npm run dev            # tsx watch で起動（:8080）
# or
npm run build && npm start
```

## エンドポイント（Connect RPC）

```bash
# ユーザー作成
curl -X POST http://localhost:8080/user.v1.UserService/CreateUser \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@example.com","name":"Alice"}'

# ユーザー取得
curl -X POST http://localhost:8080/user.v1.UserService/GetUser \
  -H 'Content-Type: application/json' \
  -d '{"id":"<uuid>"}'

# ヘルスチェック（Hono REST）
curl http://localhost:8080/health
```

## Docker

```bash
make docker-up
```

## ユースケース別ガイド

「〜したい時」に辿るフロー。Claude Code で作業する際は各セクションの **skill / subagent** を呼ぶと自動で対応する手順に入る。

### 仕様を書きたい

新機能の仕様書を `docs/spec/` に作成する。実装詳細（コード・API）は書かず、目的・ルール・境界のみ。

- Skill: **`backend-spec-creator`**（「仕様書作って」「spec 書いて」）
- 出力先: `docs/spec/<feature-name>-spec.md`
- 仕様書にはルール ID（R-01...）を振り、テスト・実装から参照可能にする

### 実装計画を立てたい

- Skill: **`backend-work-planner`**（「実装計画立てて」）
- 出力先: `docs/work/YYYYMMDD_<feature>.md`
- Phase 分解・並列化計画・テスト戦略を含む

### 新しいエンティティを追加したい

User のような新ドメイン概念（例: `Order`）を追加する。

1. `proto/order/v1/order.proto` を作成、`// @entity` マーカー付きで定義
   ```proto
   // @entity
   message Order {
     // @pk
     string id = 1;
     // @unique
     string order_number = 2;
     // @timestamp
     int64 created_at_unix = 3;
   }
   ```
2. `npm run proto:gen`（または `make proto-gen`）→ `src/domain/entity/order.gen.ts`・`src/domain/repository/order-repository.gen.ts`・`src/infra/repository/in-memory-order-repository.gen.ts` が生成
3. `src/domain/service/order-service.ts` を手書き（ビジネスルール）
4. `src/usecase/order-usecase.ts` を手書き（トランザクション境界）
5. `src/handler/order-handler.ts` を手書き（`ServiceImpl<typeof OrderService>` を返す関数）
6. `src/main.ts` で `router.service(OrderService, createOrderServiceImpl(...))` を追加

### 既存エンティティにフィールドを追加したい

User に `phoneNumber` を追加するケース。

1. `proto/user/v1/user.proto` にフィールド追加
2. `npm run proto:gen` → `user.gen.ts` のプロパティとファクトリが変わる
3. **コンパイルエラー** で影響範囲（Service / Handler の toPb など）が特定される
4. エラー箇所を最小差分で更新

### 新しい RPC メソッドを追加したい

`UserService` に `updateUser` を追加するケース。

1. `proto/user/v1/user.proto` の `service` に `rpc UpdateUser(...) returns (...);` を追加
2. `npm run proto:gen` → `user_connect.ts` の `UserService` に method が追加される
3. `src/handler/user-handler.ts` の `createUserServiceImpl` 返却オブジェクトに `updateUser` を追加
4. 必要に応じて UseCase / Service にメソッド追加

### InMemory から PostgreSQL に切り替えたい

下部「インフラ層の差し替え」セクションを参照。要点:

1. `src/infra/repository/postgres-user-repository.ts`（`.gen.ts` ではない通常ファイル）を手書き
2. `src/main.ts` で `new InMemoryUserRepository()` → `new PostgresUserRepository(pool)` に差し替え
3. Service / UseCase / Handler は **一切変更不要**

### バグを調査したい

- Skill: **`backend-debug-session`**（「バグ調査して」）
- 再現 → 仮説 3 つ → 検証 → 再発防止テスト先行 → 修正 の順

### コードレビューを依頼したい

- Skill: **`backend-code-reviewer`**（「レビューして」）
- Subagent: **`backend-reviewer`**（並列委託したいとき）
- must / should / nit の 3 段階優先度で指摘

### リファクタしたい

- Skill: **`backend-refactor-planner`**（「リファクタ計画立てて」）
- コードを触る前に影響範囲 / 順序 / ロールバック戦略を計画

### コミット分割・PR を作りたい

- Skill: **`backend-commit-splitter`**（「コミット分けて」）
- Skill: **`backend-pr-describer`**（「PR 説明書いて」）

### 考えがまとまらない（壁打ち）

- Skill: **`backend-rubber-duck`**（「壁打ちして」）

### 開発全体をオーケストレートしたい

- Skill: **`backend-dev-manager`**（「開発進めて」）
- 仕様〜実装〜PR 作成まで Phase 分解 + subagent 委託で一気通貫

## レイヤー構成

```
proto/user/v1/user.proto  ← 唯一の手書き source
   │
   └─ make proto-gen (buf generate)
      │
      ├→ src/gen/user/v1/user_pb.ts              [protoc-gen-es]
      ├→ src/gen/user/v1/user_connect.ts         [protoc-gen-connect-es]
      ├→ src/domain/entity/user.gen.ts           [mss-protoc-gen]
      ├→ src/domain/repository/user-repository.gen.ts
      └→ src/infra/repository/in-memory-user-repository.gen.ts

Handler (src/handler/user-handler.ts)      ← 手書き（ServiceImpl）
  ↓
UseCase (src/usecase/user-usecase.ts)      ← 手書き
  ↓
Service (src/domain/service/user-service.ts) ← 手書き（ビジネスロジック）
  ↓
Repository interface (生成)
  ↑ 実装
InMemory Repository (生成)
  ↓
Entity (生成)
```

Connect RPC リクエストはこの順序で通り、`User.create()` ファクトリで検証後に永続化されます。
Hono は `/health` などの REST エンドポイントを担当（Connect のフォールバックとして動作）。

## インフラ層の差し替え（InMemory → PostgreSQL / MySQL 等）

現在の Repository 実装は proto から生成された **InMemory 版**（`src/infra/repository/in-memory-*-repository.gen.ts`）です。
開発・テスト用途のデフォルトで、そのまま本番には使えません。docker-compose 同梱の PostgreSQL 等に差し替える手順:

### なぜ差し替えが容易か

- Repository **interface** は `src/domain/repository/*-repository.gen.ts` として自動生成され、ドメイン層（Service）はこれにのみ依存する
- InMemory 実装も PostgreSQL 実装も、同じ interface を `implements` する別クラス
- `src/main.ts`（DI ワイヤリング）で差し替えるだけで、Service / UseCase / Handler は一切変更不要

### 手順

**1. 新しい Repository 実装を手書きで追加**（`*.gen.ts` ではなく通常の `.ts` ファイル）

```ts
// src/infra/repository/postgres-user-repository.ts
import type { Pool } from "pg";
import { User } from "../../domain/entity/user.gen.js";
import type { UserRepository } from "../../domain/repository/user-repository.gen.js";

export class PostgresUserRepository implements UserRepository {
  constructor(private readonly pool: Pool) {}

  async save(user: User): Promise<void> {
    await this.pool.query(
      `INSERT INTO users (id, email, name, created_at) VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name`,
      [user.id, user.email, user.name, user.createdAt],
    );
  }

  async findById(id: string): Promise<User | null> {
    const { rows } = await this.pool.query(
      `SELECT id, email, name, created_at FROM users WHERE id = $1`,
      [id],
    );
    if (rows.length === 0) return null;
    return User.create({
      id: rows[0].id,
      email: rows[0].email,
      name: rows[0].name,
      createdAt: rows[0].created_at,
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    // SELECT ... WHERE email = $1
    // ...
  }
}
```

**2. `src/main.ts` で切り替え**

```ts
// Before (InMemory、生成物)
import { InMemoryUserRepository } from "./infra/repository/in-memory-user-repository.gen.js";
const userRepo = new InMemoryUserRepository();

// After (PostgreSQL、手書き)
import { Pool } from "pg";
import { PostgresUserRepository } from "./infra/repository/postgres-user-repository.js";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const userRepo = new PostgresUserRepository(pool);
```

**3. 依存ドライバを追加**

```bash
npm install pg
npm install -D @types/pg
```

**4. Service / UseCase / Handler は変更不要**

Repository interface が抽象化してくれるため、実装差し替えはドメイン層まで波及しない。

### 併用パターン（推奨）

- **本番・ステージング**: PostgreSQL 実装
- **ユニットテスト**: 生成された InMemory 実装（`new InMemoryUserRepository()` のまま）
- **結合テスト**: testcontainers / pg-mem で起動した一時 PostgreSQL

DI 切り替えは環境変数で行う:

```ts
const userRepo: UserRepository = process.env.DATABASE_URL
  ? new PostgresUserRepository(new Pool({ connectionString: process.env.DATABASE_URL }))
  : new InMemoryUserRepository();
```

## Skills / Subagents

このプロジェクトには `.claude/skills/` と `.claude/agents/` が直接配置済みです。

- `.claude/skills/` — 14 個の skill
- `.claude/agents/` — 8 個の subagent

Claude Code 起動時に自動認識されます。

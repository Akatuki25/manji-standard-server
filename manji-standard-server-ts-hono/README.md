# manji-standard-server-ts-hono

TypeScript + Hono + DDD + REST のバックエンドプロジェクト。

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

## エンドポイント (REST)

URL は proto の rpc 毎に `@http METHOD /path` アノテーションで宣言済み。生成物の `src/lib/handler-registry.gen.ts` が Hono に登録する。

```bash
# ユーザー作成
curl -X POST http://localhost:8080/api/users \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@example.com","name":"Alice"}'

# ユーザー取得
curl http://localhost:8080/api/users/<uuid>

# ヘルスチェック
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
2. `proto` の `service` に rpc を定義し、各 rpc に `// @http METHOD /path` を付ける
3. `npm run proto:gen`(または `make proto-gen`) → entity / repository / mock / postgres 実装 / Usecase interface / REST Handler / handler-registry がすべて生成
4. `src/domain/service/order-service.ts` を手書き(ビジネスルール)
5. `src/usecase/order-usecase.ts` を手書き(生成された interface を実装するだけ)
6. `src/main.ts` は既に `registerHandlers(app, deps)` を呼んでいるので追加作業なし

### 既存エンティティにフィールドを追加したい

User に `phoneNumber` を追加するケース。

1. `proto/user/v1/user.proto` にフィールド追加
2. `npm run proto:gen` → `user.gen.ts` のプロパティとファクトリが変わる
3. **コンパイルエラー** で影響範囲（Service / Handler の toPb など）が特定される
4. エラー箇所を最小差分で更新

### 新しい RPC メソッド(REST エンドポイント)を追加したい

`UserService` に `updateUser` を追加するケース。

1. `proto/user/v1/user.proto` の `service` に rpc を追加、`// @http PUT /api/users/{id}` を付ける
2. `npm run proto:gen` → Usecase interface にメソッドが足され、生成 Handler と registry にエンドポイントが追加される
3. `src/usecase/user-usecase.ts`(手書き)に Usecase interface の新メソッドを実装
4. 必要に応じて Service にメソッド追加

### PostgreSQL から別 DB（MySQL / Redis / MongoDB）へ移管したい

永続化は PostgreSQL 単一実装（mss-protoc-gen で生成）が既定。別 DB への移管は「生成テンプレートと CLAUDE.md の書き換え」で行う。

1. `CLAUDE.md` の「技術スタック > データストア」欄を更新
2. `tools/mss-protoc-gen/generator/infra_postgres_repository/` をフォークして ORM / ドライバ / 型マッピングを差し替え
3. ドライバ依存を入れ替え（`npm install mysql2` / `ioredis` / `mongodb` 等）
4. `npm run proto:gen` → コンパイルエラー箇所（`src/main.ts` の DI など）を追従

詳細は [`../manji-standard-server/README.md` の「対象 DB / 自動生成対象の変更方法」](../manji-standard-server/README.md#対象-db--自動生成対象の変更方法) と [`infra-swap.md`](../manji-standard-server/docs/patterns/infra-swap.md) を参照。

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
      ├→ src/domain/entity/user.gen.ts                    [mss-protoc-gen]
      ├→ src/domain/repository/user-repository.gen.ts
      ├→ src/domain/repository/mock/mock-user-repository.gen.ts
      ├→ src/infra/repository/user-postgres-repository.gen.ts
      ├→ src/usecase/user-usecase-interface.gen.ts        (interface + Input 型)
      ├→ src/handler/user-handler.gen.ts                  (REST Handler クラス、Hono Context 受け取り)
      └→ src/lib/handler-registry.gen.ts                  (registerHandlers + HandlerDeps)

REST Handler (生成) → Usecase interface (生成)
                          ↑ implements
                      UserUsecaseImpl (手書き) → Service (手書き) → Repository (生成) → Entity (生成)
                                                                        ↑
                                                             Postgres Repository (生成)
```

HTTP リクエストは Hono が routing → 生成 Handler が JSON を parse → Usecase 実装 → Entity を `User.create()` または `User.hydrate()` で取得 → JSON で返却、の流れで通ります。

## インフラ層の構成（Postgres 単一実装）

Repository の本番実装は proto から生成された **PostgreSQL 版**（`src/infra/repository/*-postgres-repository.gen.ts`）に統一しています。InMemory 実装は採用しません。

- **ユニットテスト**: 生成された Mock（`src/domain/repository/mock/`）を Service / UseCase のテストに注入
- **結合テスト**: docker-compose または testcontainers の PostgreSQL に `new PostgresUserRepository(client)` で接続
- **本番**: 同じ `new PostgresUserRepository(client)`。接続情報は環境変数

### 配線例（`src/main.ts`）

```ts
import { PostgresUserRepository } from "./infra/repository/user-postgres-repository.gen.js";
// ORM クライアント（Drizzle / TypeORM）を DATABASE_URL から初期化
const userRepo = new PostgresUserRepository(client);
```

### 別 DB（MySQL / Redis / MongoDB）へ移管する場合

CLAUDE.md の「データストア」欄と `tools/mss-protoc-gen/generator/infra_postgres_repository/` のテンプレートを書き換えて `npm run proto:gen` で再生成する。ランタイムの DI 切り替えではなく、**テンプレート差し替え + 再生成** が切り替え手段。

詳細は:
- [`../manji-standard-server/README.md#対象-db--自動生成対象の変更方法`](../manji-standard-server/README.md#対象-db--自動生成対象の変更方法)
- [`../manji-standard-server/docs/patterns/infra-swap.md`](../manji-standard-server/docs/patterns/infra-swap.md)

## Skills / Subagents

このプロジェクトには `.claude/skills/` と `.claude/agents/` が直接配置済みです。

- `.claude/skills/` — 15 個の skill
- `.claude/agents/` — 8 個の subagent

Claude Code 起動時に自動認識されます。

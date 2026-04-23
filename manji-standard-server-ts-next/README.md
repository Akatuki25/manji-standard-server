# manji-standard-server-ts-next

Next.js（App Router） + TypeScript + DDD のフロントエンド + API プロジェクト。

> [manji-standard-server 系](../manji-standard-server/README.md) の **Next.js 参照実装**。REST API + Route Handler 構成。**proto 駆動 DDD は採用**（Entity / Repository / Mock / Postgres 実装は proto から自動生成）するが、**RPC プロトコル（Connect / gRPC）は採用しない** — HTTP 境界は素の REST。姉妹実装（Go / Hono）と比較して RPC 層だけが異なる。
> 姉妹実装: [Go 版](../manji-standard-server-go/) / [Hono 版](../manji-standard-server-ts-hono/)

## セットアップ

```bash
npm install
npm run dev        # :3000
```

## エンドポイント

```bash
curl -X POST http://localhost:3000/api/users \
  -H 'Content-Type: application/json' \
  -d '{"email":"carol@example.com","name":"Carol"}'

curl http://localhost:3000/api/users/<id>
curl http://localhost:3000/api/health
```

トップページは `http://localhost:3000/` で API 一覧を表示。

## Docker

```bash
make docker-up
```

## ユースケース別ガイド

「〜したい時」に辿るフロー。Claude Code で作業する際は各セクションの **skill / subagent** を呼ぶと自動で対応する手順に入る。

Next.js は **proto 駆動 DDD を採用**しつつ **RPC プロトコルは採用しない**。Entity / Repository interface / Mock / Postgres 実装は proto から生成、Route Handler は素の REST を手書き。姉妹実装（Go / Hono）と違う部分は ★ で明示。

### 仕様を書きたい

新機能の仕様書を `docs/spec/` に作成する。

- Skill: **`backend-spec-creator`**（「仕様書作って」）
- 出力先: `docs/spec/<feature-name>-spec.md`
- 実装詳細は書かず、目的・ルール・境界のみ

### 実装計画を立てたい

- Skill: **`backend-work-planner`**（「実装計画立てて」）
- 出力先: `docs/work/YYYYMMDD_<feature>.md`

### 新しいエンティティを追加したい

例: `Order` を追加する。proto 駆動なのでドメイン層は自動生成、Route Handler と Service / UseCase のみ手書き。

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
2. `make proto-gen`（または `npm run proto:gen`）→ `src/domain/entity/order.gen.ts`・`src/domain/repository/order-repository.gen.ts`・`src/domain/repository/mock/mock-order-repository.gen.ts`・`src/infra/repository/order-postgres-repository.gen.ts` が生成
3. `src/domain/service/order-service.ts` を手書き（ビジネスルール）
4. `src/usecase/order-usecase.ts` を手書き
5. `src/lib/container.ts` で DI 組み立て、`orderUsecase` を export
6. `src/app/api/orders/route.ts`（POST/GET）に Route Handler を実装（`await req.json()` で受けて Usecase を呼ぶ）

### 既存エンティティにフィールドを追加したい

User に `phoneNumber` を追加するケース。

1. `proto/user/v1/user.proto` にフィールド追加
2. `make proto-gen` → `user.gen.ts` の `UserProps` / `User.create()` / Repository 実装が一括更新される
3. **コンパイルエラー** で影響範囲（Service / Route Handler のレスポンス JSON など）が特定される
4. エラー箇所を最小差分で更新

### 新しい API エンドポイントを追加したい

例: `GET /api/users` の一覧取得を追加。Repository interface の `selectAll()` は既に生成済みなので UseCase / Handler だけ足せばよい。

1. `src/usecase/user-usecase.ts` に `listUsers()` メソッド追加（Service の `selectAll()` を呼ぶ）
2. `src/domain/service/user-service.ts` に `selectAll()` メソッドを追加し、生成済みの `userRepo.selectAll()` を呼ぶ
3. `src/app/api/users/route.ts` に `export async function GET(req)` を追加

### PostgreSQL から別 DB（MySQL / Redis / MongoDB）へ移管したい

永続化は PostgreSQL 単一実装（mss-protoc-gen で生成）が既定。別 DB への移管は「生成テンプレートと CLAUDE.md の書き換え」で行う。

1. `CLAUDE.md` の「技術スタック > データストア」欄を更新
2. `tools/mss-protoc-gen/generator/infra_postgres_repository/` をフォークして ORM / ドライバ / 型マッピングを差し替え
3. ドライバ依存を入れ替え（`npm install mysql2` / `ioredis` / `mongodb` 等）
4. `npm run proto:gen` → コンパイルエラー箇所（`src/lib/container.ts` の DI など）を追従

HMR 対策の `globalThis` シングルトンは接続 Pool を共有するために残す。

詳細は [`../manji-standard-server/README.md` の「対象 DB / 自動生成対象の変更方法」](../manji-standard-server/README.md#対象-db--自動生成対象の変更方法) と [`infra-swap.md`](../manji-standard-server/docs/patterns/infra-swap.md) を参照。

### バグを調査したい

- Skill: **`backend-debug-session`**（「バグ調査して」）

### コードレビューを依頼したい

- Skill: **`backend-code-reviewer`**（「レビューして」）

### リファクタしたい

- Skill: **`backend-refactor-planner`**（「リファクタ計画立てて」）

### コミット分割・PR を作りたい

- Skill: **`backend-commit-splitter`** / **`backend-pr-describer`**

### 考えがまとまらない（壁打ち）

- Skill: **`backend-rubber-duck`**

### 開発全体をオーケストレートしたい

- Skill: **`backend-dev-manager`**

### UI ページを追加したい ★Next 特有

1. `src/app/<route>/page.tsx` を作成（Server Component がデフォルト）
2. 同階層に `layout.tsx` を配置すれば子ルートで共通
3. API 呼び出しは Server Component から `fetch('http://localhost:3000/api/...')` で

## Skills / Subagents

このプロジェクトには `.claude/skills/` と `.claude/agents/` が直接配置済みです。

- `.claude/skills/` — 15 個の skill
- `.claude/agents/` — 8 個の subagent

Claude Code 起動時に自動認識されます。

## レイヤー構成

```
proto/user/v1/user.proto  ← 唯一の手書き source（ドメインスキーマ）
   │
   └─ make proto-gen (buf generate)
      │
      ├→ src/domain/entity/user.gen.ts                       [mss-protoc-gen]
      ├→ src/domain/repository/user-repository.gen.ts
      ├→ src/domain/repository/mock/mock-user-repository.gen.ts
      └→ src/infra/repository/user-postgres-repository.gen.ts

Route Handler (src/app/api/**/route.ts)   ← 手書き（素の REST）
  ↓
UseCase (src/usecase)                     ← 手書き
  ↓
Service (src/domain/service)              ← 手書き（ビジネスロジック）
  ↓
Repository interface (生成)
  ↑ 実装
Postgres Repository (Drizzle、生成)
  ↓
Entity (生成)
```

`container.ts` で DI 組み立てし、Route Handler は組み立て済みの Usecase を import して使う形。姉妹実装（Go / Hono）との差分は **RPC 層を持たず、Route Handler で JSON in / JSON out** している点のみ。

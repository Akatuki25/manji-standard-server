# manji-standard-server-ts-next

Next.js（App Router） + TypeScript + DDD のフロントエンド + API プロジェクト。

> [manji-standard-server 系](../manji-standard-server/README.md) の **Next.js 参照実装**。REST API + Route Handler 構成で、proto / Connect RPC は採用しない。基盤の [DI によるインフラ差し替え](../manji-standard-server/docs/patterns/infra-swap.md) と [共通原則](../manji-standard-server/docs/patterns/README.md#共通原則) は遵守。
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

Next.js は **proto / Connect RPC を採用しない** ため、Entity / Repository は手書きで追加する。姉妹実装（Go / Hono）と違う部分は ★ で明示。

### 仕様を書きたい

新機能の仕様書を `docs/spec/` に作成する。

- Skill: **`backend-spec-creator`**（「仕様書作って」）
- 出力先: `docs/spec/<feature-name>-spec.md`
- 実装詳細は書かず、目的・ルール・境界のみ

### 実装計画を立てたい

- Skill: **`backend-work-planner`**（「実装計画立てて」）
- 出力先: `docs/work/YYYYMMDD_<feature>.md`

### 新しいエンティティを追加したい ★手書き

例: `Order` を追加する。

1. `src/domain/entity/order.ts` を作成（プライベートコンストラクタ + `static create(props)` でバリデーション）
2. `src/domain/repository/order-repository.ts` に interface を定義
3. `src/infra/repository/in-memory-order-repository.ts` に InMemory 実装（HMR 対策で `globalThis` 経由のシングルトン）
4. `src/domain/service/order-service.ts` を手書き（ビジネスルール）
5. `src/usecase/order-usecase.ts` を手書き
6. `src/lib/container.ts` で DI 組み立て、`orderUsecase` を export
7. `src/app/api/orders/route.ts`（POST/GET）に Route Handler を実装

> ★ 将来 proto 駆動に移行したくなったら、`manji-standard-server-ts-hono` の `tools/mss-protoc-gen.mjs` を参考にプラグインを移植すれば手順 1-3 は自動生成に置き換え可能（詳細は `CLAUDE.md` の「proto 駆動への拡張パス」）

### 既存エンティティにフィールドを追加したい ★手書き

User に `phoneNumber` を追加するケース。

1. `src/domain/entity/user.ts` の `UserProps` 型にフィールド追加
2. `User` class のプロパティ・コンストラクタ・`create()` を更新
3. Repository の `findById` / `findByEmail` の戻り値マッピングを更新
4. Route Handler のレスポンス JSON に含める

`.gen.*` 自動生成がない分、手で変更箇所を追う必要がある（TypeScript の型で漏れ検知は効く）。

### 新しい API エンドポイントを追加したい

例: `GET /api/users` の一覧取得を追加。

1. `src/usecase/user-usecase.ts` に `listUsers()` メソッド追加
2. Service / Repository interface に `findAll()` を追加
3. InMemory Repository に `findAll()` を実装
4. `src/app/api/users/route.ts` に `export async function GET(req)` を追加

### InMemory から PostgreSQL に切り替えたい

1. `src/infra/repository/postgres-user-repository.ts` を手書きで追加（`UserRepository` を implements）
2. `src/lib/container.ts` で `new InMemoryUserRepository()` → `new PostgresUserRepository(pool)` に差し替え
3. Route Handler / UseCase / Service は **一切変更不要**

HMR 対策の `globalThis` シングルトンは InMemory 固有。Postgres 実装では pool 自体が共有される想定。

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

- `.claude/skills/` — 14 個の skill
- `.claude/agents/` — 8 個の subagent

Claude Code 起動時に自動認識されます。

## レイヤー構成

```
Route Handler (src/app/api/**/route.ts)
  ↓
UseCase (src/usecase)
  ↓
Service (src/domain/service)
  ↓
Repository interface (src/domain/repository)
  ↑ 実装
Infra Repository (src/infra/repository)
  ↓
Entity (src/domain/entity)
```

`container.ts` で DI 組み立てし、Route Handler は組み立て済みの Usecase を import して使う形。

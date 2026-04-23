# CLAUDE.md

Next.js（App Router） + TypeScript + DDD のフロントエンド + API プロジェクト。
`.claude/skills/` と `.claude/agents/` 配下の skill / subagent は、このファイルを読んでプロジェクト固有の前提を把握する。

**アーキテクチャ方針**: manji-standard-server 標準パターン群に準拠する（`manji-standard-server/docs/patterns/` 参照）。
**proto 駆動 DDD + REST**。proto の `@entity` からドメイン層を、各 rpc の `// @http METHOD /path` から Next App Router の Route Handler を生成する。

## 技術スタック

- **言語**: TypeScript 5.5（strict）
- **ランタイム**: Node.js 20+
- **フレームワーク**: Next.js 14（App Router）
- **API スタイル**: REST（Route Handler）。クライアントは fetch / Server Component からの直接呼び出し
- **ランタイム指定**: Route Handler は `nodejs`（エッジではなく Node）
- **Proto**: Protocol Buffers + buf（`buf generate` で DDD 層を生成）
- **コード生成プラグイン**:
  - `mss-protoc-gen`（独自、`tools/mss-protoc-gen/` 配置、`@bufbuild/protoplugin` 使用）— proto の `@entity` マーカーと service / rpc 宣言から以下を生成:
    - Entity class / Repository interface / Mock / Postgres Repository 実装（エンティティ由来）
    - Usecase interface + Input 型、**REST Route Handler**（`src/app/<path>/route.ts`、`@http` アノテーションから URL 解決）、`src/lib/handler-registry.gen.ts`（service 由来）
  - **`protoc-gen-es` / `protoc-gen-connect-es` は採用しない**(REST なので proto メッセージ型は不要)
- **データストア**: PostgreSQL（Drizzle ORM `drizzle-orm/node-postgres` + `pg`）。docker-compose に同梱
- **テスト方針**: ユニットテストは生成 Mock を使う。結合テストは docker-compose / testcontainers の Postgres
- **テスト**: Vitest
- **ビルド**: `next build`（standalone 出力）

> 別 DB（MySQL / Redis / MongoDB 等）へ移管する手順は `manji-standard-server/README.md` の「対象 DB / 自動生成対象の変更方法」を参照。

## アーキテクチャ

- **パターン**: DDD + クリーンアーキテクチャ + proto 駆動生成
- **レイヤー構成**:
  ```
  proto/**/*.proto
    └→ mss-protoc-gen で以下を生成:
       src/domain/entity/*.gen.ts
       src/domain/repository/*-repository.gen.ts
       src/domain/repository/mock/mock-*-repository.gen.ts
       src/infra/repository/*-postgres-repository.gen.ts      （Drizzle）
       src/usecase/*-usecase-interface.gen.ts                           （interface + Input 型）
       src/app/<path>/route.ts                                 （REST Route Handler、@http 由来）
       src/lib/handler-registry.gen.ts                         （HandlerDeps + provideHandlerDepsFactory）
                             ↓
  Route Handler (生成) → Usecase interface (生成)
                              ↑ implements
                          <Name>UsecaseImpl (手書き) → Service (手書き) → Repository (生成) → Entity (生成)
                                                                              ↑
                                                                   Postgres Repository (生成)
  ```
- **依存方向**: 常に内側（Entity）に向かう
- **DI**: `src/lib/container.ts` で組み立てた Usecase シングルトンを Route Handler が import
- **パスエイリアス**: `@/*` → `src/*`

## ディレクトリ構造

```
manji-standard-server-ts-next/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── users/
│   │   │   │   ├── route.ts         # POST /api/users
│   │   │   │   └── [id]/route.ts    # GET /api/users/:id
│   │   │   └── health/route.ts      # GET /api/health
│   │   ├── layout.tsx
│   │   └── page.tsx                 # トップ画面
│   ├── domain/
│   │   ├── entity/*.gen.ts                     # 生成（mss-protoc-gen）
│   │   ├── repository/*-repository.gen.ts      # 生成（interface + エラー）
│   │   │   └── mock/mock-*.gen.ts              # 生成（テスト用スタブ）
│   │   └── service/                            # ドメインサービス（手書き）
│   ├── usecase/                                # アプリケーションサービス（手書き）
│   ├── infra/repository/*-postgres-repository.gen.ts  # 生成（Drizzle 実装）
│   └── lib/
│       └── container.ts                        # DI 組み立て
├── proto/                                      # Protocol Buffers 定義（唯一の手書きソース）
│   └── user/v1/user.proto
├── tools/
│   └── mss-protoc-gen/                         # 独自プラグイン（`.tpl` テンプレート方式）
├── buf.yaml
├── buf.gen.yaml
└── docs/
    ├── spec/
    ├── work/
    └── knowledge/
```

## proto アノテーション（mss-protoc-gen が解釈）

- `// @entity` — メッセージに付与。Entity class / Repository interface / Mock / Postgres 実装の 4 ファイル生成
- `// @pk` — フィールドに付与。主キー。`selectByPk` / `delete` / `bulkDelete` が生成
- `// @unique` — フィールドに付与。`selectBy<Field>` が追加生成
- `// @email` — フィールドに付与。email 形式バリデーション
- `// @required` — フィールドに付与。非空バリデーション
- `// @timestamp` — `int64` フィールドに付与。TS 側で `Date` にマップし、末尾 `Unix` を除去した名前に
- `// @http METHOD /path` — **rpc に付与**。REST Route Handler 生成用。`{name}` は Next App Router の `[name]` に変換。例: `@http GET /api/users/{id}` → `src/app/api/users/[id]/route.ts` に GET handler が生成

例:
```proto
// @entity
message User {
  // @pk
  string id = 1;
  // @unique @email
  string email = 2;
  // @required
  string name = 3;
  // @timestamp
  int64 created_at_unix = 4;
}
```

## REST Route Handler の規約

proto はあくまでドメイン生成源。HTTP 境界では **proto メッセージ型に依存しない** ので、以下の方針で書く:

- リクエストボディは `await req.json()` で受け取り、必要フィールドを明示的にピック（`body.email ?? ""`）
- レスポンスは Entity のプロパティを JSON 化して返す（`createdAt` は `Math.floor(user.createdAt.getTime() / 1000)` で Unix 秒に）
- バリデーションは Entity のファクトリ（`User.create()`）が投げる Error に任せ、Route Handler は `try/catch` でステータスコードに変換
- ドメイン層のセンチネルエラー（`UserNotFoundError` / `UserAlreadyExistsError` 等の `*.gen.ts` 生成物、あるいは `EmailAlreadyTakenError` のような手書き）を `instanceof` で判別して 404 / 409 等にマップ

## コーディング規約

- **命名**: ファイルは kebab-case（`user-service.ts`）、クラス・型は PascalCase、関数は camelCase
- **Route Handler の runtime**: 明示的に `export const runtime = "nodejs"`（DI シングルトンが Edge で動かないため）
- **DB 接続**: 接続 Pool は HMR 対策で `globalThis` にキャッシュし、同一プロセス内で再利用する
- **エラー**: 独自エラークラス + `instanceof` 判定でステータスコードを分岐
- **時刻取得**: 直接 `new Date()` を書かない（コンストラクタで注入）
- **コメント**: 原則書かない。書く場合は WHY のみ

## よく使うコマンド

- **Proto 生成**: `make proto-gen` / `npm run proto:gen`（proto 変更後は必須）
- **生成物削除**: `make proto-clean` / `npm run proto:clean`
- **開発**: `npm run dev`（:3000）
- **ビルド**: `npm run build`
- **起動**: `npm start`
- **型チェック**: `npm run lint`
- **Docker 起動**: `make docker-up`

## 規約上の禁則

- Route Handler を手書きしない（`src/app/<path>/route.ts` は生成物）— 新しいエンドポイントは proto に rpc + `@http` を書いて再生成
- Route Handler 内で直接 Repository を使わない（生成 Route は Usecase 経由）
- `container.ts` 以外で具体的 Repository 実装を import しない
- Route Handler に長いロジックを書かない（Usecase に抽出）
- **`*.gen.ts` ファイルと生成された `route.ts` を手動編集しない**（冒頭に "Code generated" コメントあり）
- proto 変更後は必ず `make proto-gen` を実行
- Entity に振る舞いを足したい場合は `<kebab>-ext.ts` で拡張する（生成ファイルとは別ファイル）
- **RPC プロトコル（Connect / gRPC）は採用しない** — REST (`@http`) のみ

## コミット・PR

- **ブランチ**: `feat/<author>/<topic>`
- **メッセージ**: Conventional Commits

## manji-standard-server 標準パターンとの対応

- `proto-driven-ddd.md` — 採用（RPC 層を除く）
- `mss-protoc-gen.md` — 採用（hono と同じプラグインを共有）
- `infra-swap.md` — 採用（Postgres 単一実装、テンプレート差し替えで別 DB へ）

3 実装(Go / Hono / Next)すべて **REST + 同じ proto 駆動 DDD** で揃っている。Next 固有なのは Next App Router の `src/app/<path>/route.ts` に出力する点のみ。

## 利用可能な skill / subagent

`.claude/skills/` と `.claude/agents/` に配置済み。**skill / subagent 本体は技術非依存の workflow** であり、Next.js / Route Handler / REST / Postgres / Drizzle / proto といった**具体はこの CLAUDE.md から読み取られる**前提で書かれている。したがって技術スタックの変更はこのファイルだけで吸収でき、skill 本体を書き換えることはない。

### Skills（15）

| 種別 | Skill | 用途・トリガー例 |
| --- | --- | --- |
| 探索 | `backend-codebase-explorer` | 未知のコードベースを最短で把握。「このプロジェクト教えて」 |
| 仕様 | `backend-spec-creator` | `docs/spec/` に新規仕様書。「仕様書作って」 |
| 仕様 | `backend-spec-updater` | 既存仕様書の最小差分更新。「spec 更新して」 |
| 計画 | `backend-work-planner` | `docs/work/YYYYMMDD_*.md` に実装計画。「実装計画立てて」 |
| 開発 | `backend-dev-manager` | Phase 分解 + PDCA で実装オーケストレーション。「開発進めて」 |
| 開発 | `backend-refactor-planner` | リファクタの影響範囲・順序計画。「リファクタ計画立てて」 |
| 開発 | `backend-debug-session` | 仮説駆動のバグ調査。「バグ調査して」 |
| テスト | `backend-test-planner` | Unit / Integration の区分け込みテスト戦略設計。「テスト戦略立てて」 |
| テスト | `backend-test-writer` | 単体テスト(mock 前提)を既存パターンで実装。「テスト書いて」 |
| テスト | `backend-integration-test-writer` | 実 DB 起動の integration test を実装。「integration test 書いて」「E2E テスト追加して」 |
| テスト | `backend-test-gap-finder` | テスト不足箇所の洗い出し(unit / integration 両面)。「テストギャップ調べて」 |
| レビュー | `backend-code-reviewer` | 構造化観点のコードレビュー。「レビューして」 |
| 壁打ち | `backend-rubber-duck` | 問い返しで思考整理。「壁打ちして」 |
| Git/PR | `backend-commit-splitter` | 適切な粒度のコミット分割。「コミット分けて」 |
| Git/PR | `backend-pr-describer` | PR 説明文生成。「PR 説明書いて」 |

### Subagents（8）

| 種別 | Subagent | 用途 |
| --- | --- | --- |
| 実行 | `backend-worker` | 実装・テスト・ビルドの汎用ワーカー |
| 実行 | `backend-reviewer` | must/should/nit で指摘を返すレビュー専門（修正はしない） |
| 設計 | `backend-designer` | API・データモデル・エンティティの対話設計 |
| 実装スタイル | `backend-conservative` | 既存への影響を最小化、後方互換を最優先 |
| 実装スタイル | `backend-evolution` | 既存と調和させつつ段階的に改善 |
| 実装スタイル | `backend-greenfield` | ゼロベースで刷新（撤退戦略込み） |
| 運用 | `backend-git-rebase` | PR 作成前のコミット履歴整理 |
| 運用 | `backend-knowledge-manager` | `docs/knowledge/` の蓄積・検索・整理 |

**原則**: skill / subagent はどのプロジェクトでも共通。プロジェクト固有の判断（どの DB を使うか・どの層を生成するか・どんな命名規約か）はすべて **この CLAUDE.md から読ませる**。skill 本体を書き換えない。

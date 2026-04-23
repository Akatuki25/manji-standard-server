# CLAUDE.md

TypeScript + Hono + DDD + REST のバックエンドプロジェクト。
`.claude/skills/` と `.claude/agents/` 配下の skill / subagent は、このファイルを読んでプロジェクト固有の前提を把握する。

## 技術スタック

- **言語**: TypeScript 5.5(strict)
- **ランタイム**: Node.js 20+
- **API スタイル**: REST(JSON over HTTP)。URL は proto の rpc に付けた `@http METHOD /path` アノテーションで宣言する
- **Proto**: Protocol Buffers + buf(`buf generate` でドメイン層〜ハンドラまで生成)
- **コード生成プラグイン**:
  - `mss-protoc-gen`(独自、`tools/mss-protoc-gen/` 配置、`@bufbuild/protoplugin` 使用) — proto の `@entity` / `@http` マーカーから以下を生成:
    - Entity / Repository interface / Mock / Postgres Repository 実装(エンティティ由来)
    - Usecase interface + Input 型、REST Handler クラス(Hono の `Context` を受ける)、`src/lib/handler-registry.gen.ts` の DI 登録関数(service 由来)
  - **`@bufbuild/protoc-gen-es` / `@connectrpc/protoc-gen-connect-es` は採用しない**(REST なので proto メッセージ型は不要)
- **HTTP フレームワーク**: Hono v4(ネイティブの routing `app.get` / `app.post` で直接登録)
- **HTTP サーバー**: `@hono/node-server` の `serve()`
- **データストア**: PostgreSQL（Drizzle ORM または TypeORM を予定。現状は生成テンプレート未整備 → Go 版を先行実装）
- **テスト方針**: ユニットテストは生成 Mock を使う。結合テストは docker-compose / testcontainers の Postgres に接続
- **テスト**: Vitest
- **ビルド**: tsc

> 別 DB（MySQL / Redis / MongoDB 等）へ移管する手順は `manji-standard-server/README.md` の「対象 DB / 自動生成対象の変更方法」を参照。この CLAUDE.md の「データストア」欄を更新することで、以降の Skill / Subagent の判断に反映される。

## アーキテクチャ

- **パターン**: DDD + クリーンアーキテクチャ
- **レイヤー構成**:
  ```
  proto/**/*.proto
    └→ mss-protoc-gen で以下を生成:
       src/domain/entity/*.gen.ts
       src/domain/repository/*-repository.gen.ts
       src/domain/repository/mock/mock-*-repository.gen.ts
       src/infra/repository/*-postgres-repository.gen.ts
       src/usecase/*-usecase-interface.gen.ts           (interface + Input 型)
       src/handler/*-handler.gen.ts                     (REST Handler クラス、Hono の Context を受ける)
       src/lib/handler-registry.gen.ts                  (registerHandlers + HandlerDeps 型)
                             ↓
  Handler (生成) → Usecase interface (生成)
                      ↑ implements
                  <Name>UsecaseImpl (手書き) → Service (手書き) → Repository (生成) → Entity (生成)
                                                                     ↑
                                                          Postgres Repository (生成)
  ```
- **依存方向**: 常に内側（Entity）に向かう。Entity は他層を import しない。
- **DI**: コンストラクタ注入（`src/main.ts` で組み立て）

## ディレクトリ構造

```
manji-standard-server-ts-hono/
├── src/
│   ├── main.ts                           # エントリポイント(DI + Hono serve)
│   ├── domain/
│   │   ├── entity/*.gen.ts               # 生成
│   │   ├── repository/*-repository.gen.ts# 生成(interface)
│   │   │   └── mock/mock-*.gen.ts        # 生成(テスト用スタブ)
│   │   └── service/                      # ドメインサービス(★手書き)
│   ├── usecase/                          # *-usecase-interface.gen.ts(interface、生成) + 実装(★手書き)
│   ├── handler/                          # *-handler.gen.ts(REST Handler、生成)
│   ├── infra/
│   │   └── repository/*-postgres-repository.gen.ts # 生成(Drizzle)
│   └── lib/
│       └── handler-registry.gen.ts       # registerHandlers + HandlerDeps(生成)
├── proto/                                # Protocol Buffers 定義（唯一の手書きソース）
├── tools/
│   └── mss-protoc-gen/             # 独自プラグイン（`.tpl` テンプレート方式）
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
- `// @http METHOD /path` — **rpc に付与**。REST Handler の URL 登録用(例: `@http GET /api/users/{id}`)。Hono 側では `{name}` が `:name` に変換されて `c.req.param("name")` で取り出せる

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

## コーディング規約

- **命名**:
  - ファイル: kebab-case（`user-service.ts`）
  - クラス・型: PascalCase
  - 関数・変数: camelCase
- **import 拡張子**: ESM 前提のため `.js` 拡張子を付ける（TypeScript ソースでも）
- **エラー**: 独自エラークラスで `instanceof` 判定可能に（例: `EmailAlreadyTakenError`）
- **時刻取得**: 直接 `new Date()` を呼ばず、コンストラクタで注入した `clock` 経由
- **ID 生成**: `node:crypto` の `randomUUID()`
- **コメント**: 原則書かない。書く場合は WHY のみ

## よく使うコマンド

- **Proto 生成**: `make proto-gen` / `npm run proto:gen`（proto 変更後は必須）
- **生成物削除**: `make proto-clean`
- **開発**: `npm run dev`（tsx watch）
- **ビルド**: `npm run build`
- **起動**: `npm start`
- **テスト**: `npm test`
- **型チェック**: `npm run lint`
- **Docker 起動**: `make docker-up`

## 規約上の禁則

- Handler 層から直接 Repository を触らない（必ず UseCase 経由）
- Entity に副作用を持たせない（永続化は Repository の責務）
- `main.ts` 以外で具体的な Repository 実装を import しない
- **`*.gen.ts` ファイルを手動編集しない**(Entity / Repository / Mock / Postgres 実装 / Usecase interface / REST Handler / handler-registry はすべて proto から生成)
- Handler を手書き追加しない（複雑な変換ロジックは Usecase 実装に寄せる）
- proto 変更後は必ず `make proto-gen` を実行
- Entity に振る舞いを足したい場合は `<kebab>-ext.ts` で拡張する（生成ファイルとは別ファイル）

## コミット・PR

- **ブランチ**: `feat/<author>/<topic>` / `fix/<author>/<topic>`
- **メッセージ**: Conventional Commits

## 利用可能な skill / subagent

`.claude/skills/` と `.claude/agents/` に配置済み。**skill / subagent 本体は技術非依存の workflow** であり、TypeScript / Hono / REST / Postgres / Drizzle / proto といった**具体はこの CLAUDE.md から読み取られる**前提で書かれている。したがって技術スタックの変更はこのファイルだけで吸収でき、skill 本体を書き換えることはない。

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

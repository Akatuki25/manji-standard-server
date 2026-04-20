# CLAUDE.md

TypeScript + Hono + DDD + Connect RPC のバックエンドプロジェクト。
`.claude/skills/` と `.claude/agents/` 配下の skill / subagent は、このファイルを読んでプロジェクト固有の前提を把握する。

## 技術スタック

- **言語**: TypeScript 5.5（strict）
- **ランタイム**: Node.js 20+
- **RPC**: Connect RPC（`@connectrpc/connect` + `@connectrpc/connect-node`）
- **Proto**: Protocol Buffers + buf（`buf generate` で各層のコードを生成）
- **コード生成プラグイン**:
  - `@bufbuild/protoc-gen-es` — メッセージクラス
  - `@connectrpc/protoc-gen-connect-es` — RPC サービス定義
  - `mss-protoc-gen`（独自、`tools/mss-protoc-gen.mjs` 配置、`@bufbuild/protoplugin` 使用）— proto の `@entity` マーカーから Entity class / Repository interface / InMemory Repository 実装を生成
- **HTTP フレームワーク**: Hono v4（Connect RPC のフォールバック＝ヘルスチェックなど REST）
- **HTTP サーバー**: Node 標準 `http` + `connectNodeAdapter`（非 RPC は Hono へフォールバック）
- **データストア**: In-memory（生成物）。docker-compose 同梱の PostgreSQL に差し替え可能（手順は README「インフラ層の差し替え」参照）
- **テスト**: Vitest
- **ビルド**: tsc

## アーキテクチャ

- **パターン**: DDD + クリーンアーキテクチャ
- **レイヤー構成**:
  ```
  proto/**/*.proto
    ├→ src/gen/**/*_pb.ts, *_connect.ts                    （protoc-gen-es / connect-es）
    └→ src/domain/entity/*.gen.ts                          （mss-protoc-gen）
       src/domain/repository/*-repository.gen.ts
       src/infra/repository/in-memory-*-repository.gen.ts
                             ↓ implements
  Handler (src/handler) → UseCase (src/usecase) → Service (src/domain/service)
      → Repository interface (生成) → Entity (生成)
                                   ↑
                        Infra (src/infra) が実装（生成）
  ```
- **依存方向**: 常に内側（Entity）に向かう。Entity は他層を import しない。
- **DI**: コンストラクタ注入（`src/main.ts` で組み立て）

## ディレクトリ構造

```
manji-standard-server-ts-hono/
├── src/
│   ├── main.ts                           # エントリポイント（DI + connectNodeAdapter）
│   ├── domain/
│   │   ├── entity/*.gen.ts               # 生成（mss-protoc-gen）
│   │   ├── repository/*-repository.gen.ts# 生成（interface）
│   │   └── service/                      # ドメインサービス（手書き）
│   ├── usecase/                          # アプリケーションサービス（手書き）
│   ├── handler/                          # Connect ServiceImpl（手書き）
│   ├── infra/
│   │   └── repository/in-memory-*.gen.ts # 生成（InMemory 実装）
│   └── gen/user/v1/
│       ├── user_pb.ts                    # 生成（protoc-gen-es）
│       └── user_connect.ts               # 生成（protoc-gen-connect-es）
├── proto/                                # Protocol Buffers 定義（唯一の手書きソース）
├── tools/
│   └── mss-protoc-gen.mjs          # 独自プラグイン
├── buf.yaml
├── buf.gen.yaml
└── docs/
    ├── spec/
    ├── work/
    └── knowledge/
```

## proto アノテーション（mss-protoc-gen が解釈）

- `// @entity` — メッセージに付与。Entity class / Repository interface / InMemory Impl の 3 ファイル生成
- `// @pk` — フィールドに付与。主キー。`findById` 相当が生成
- `// @unique` — フィールドに付与。`findBy<Field>` が追加生成
- `// @email` — フィールドに付与。email 形式バリデーション
- `// @required` — フィールドに付与。非空バリデーション
- `// @timestamp` — `int64` フィールドに付与。TS 側で `Date` にマップし、末尾 `Unix` を除去した名前に

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
- **`*.gen.ts` ファイルを手動編集しない**（Entity / Repository / InMemory 実装はすべて proto から生成）
- proto 変更後は必ず `make proto-gen` を実行
- Entity に振る舞いを足したい場合は `<kebab>-ext.ts` で拡張する（生成ファイルとは別ファイル）

## コミット・PR

- **ブランチ**: `feat/<author>/<topic>` / `fix/<author>/<topic>`
- **メッセージ**: Conventional Commits

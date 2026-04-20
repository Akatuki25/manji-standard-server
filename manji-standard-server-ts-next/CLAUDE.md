# CLAUDE.md

Next.js（App Router） + TypeScript + DDD のフロントエンド + API プロジェクト。
`.claude/skills/` と `.claude/agents/` 配下の skill / subagent は、このファイルを読んでプロジェクト固有の前提を把握する。

**アーキテクチャ方針**: manji-standard-server 標準パターン群に準拠する（`manji-standard-server/docs/patterns/` 参照）。
現状 proto / Connect RPC は採用していないが、DDD 層分離と DI パターンは踏襲する。

## 技術スタック

- **言語**: TypeScript 5.5（strict）
- **ランタイム**: Node.js 20+
- **フレームワーク**: Next.js 14（App Router）
- **ランタイム指定**: Route Handler は `nodejs`（エッジではなく Node）
- **データストア**: In-memory（HMR 対策の globalThis シングルトン、docker-compose に PostgreSQL 同梱）
- **テスト**: Vitest
- **ビルド**: `next build`（standalone 出力）

## アーキテクチャ

- **パターン**: DDD + クリーンアーキテクチャ
- **レイヤー構成**:
  ```
  Route Handler (app/api/**/route.ts) → UseCase → Service → Repository(interface) → Entity
                                                         ↑
                                                       Infra が実装
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
│   │   ├── entity/
│   │   ├── repository/
│   │   └── service/
│   ├── usecase/
│   ├── infra/repository/
│   └── lib/
│       └── container.ts             # DI 組み立て
└── docs/
    ├── spec/
    ├── work/
    └── knowledge/
```

## コーディング規約

- **命名**: ファイルは kebab-case（`user-service.ts`）、クラス・型は PascalCase、関数は camelCase
- **Route Handler の runtime**: 明示的に `export const runtime = "nodejs"`（DI シングルトンが Edge で動かないため）
- **HMR 対策**: in-memory 状態は `globalThis` に保持
- **エラー**: 独自エラークラス + `instanceof` 判定でステータスコードを分岐
- **時刻取得**: 直接 `new Date()` を書かない（コンストラクタで注入）

## よく使うコマンド

- **開発**: `npm run dev`（:3000）
- **ビルド**: `npm run build`
- **起動**: `npm start`
- **型チェック**: `npm run lint`
- **Docker 起動**: `make docker-up`

## 規約上の禁則

- Route Handler 内で直接 Repository を使わない（必ず Usecase 経由）
- `container.ts` 以外で具体的 Repository 実装を import しない
- Route Handler に長いロジックを書かない（Usecase に抽出）

## コミット・PR

- **ブランチ**: `feat/<author>/<topic>`
- **メッセージ**: Conventional Commits

## manji-standard-server 標準パターンとの対応

このプロジェクトは proto / Connect RPC を採用しないが、バックエンド系のサーバー（`manji-standard-server-go` / `manji-standard-server-ts-hono`）と **DDD レイヤー分離** と **インフラ層の DI 差し替え** の方針は同じ。

### 継承している原則

1. **Entity / Repository interface / UseCase / Route Handler を分離** — Route Handler から直接 Repository を触らない
2. **Repository を interface にして DI で差し替える** — `container.ts` で In-memory / Postgres を切り替え可能
3. **依存方向は常に内側（Entity）へ**
4. **Entity のファクトリ（`User.create()`）でバリデーション** — Route Handler には書かない

詳細は `../manji-standard-server/docs/patterns/` の以下を参照:
- `infra-swap.md` — In-memory → Postgres 等への DI 差し替え（このプロジェクトにも直接適用可能）
- `proto-driven-ddd.md` — 将来 proto 駆動に移行する場合のリファレンス

### proto 駆動への拡張パス（参考）

もしこのプロジェクトに Entity 定義を proto 駆動に寄せたい場合:

1. `proto/` を追加し、`.proto` に `@entity` マーカー付きで定義
2. `buf.gen.yaml` と `tools/mss-protoc-gen.mjs`（`manji-standard-server-ts-hono` の実装を参考）を配置
3. `src/domain/entity/*.gen.ts` / `src/domain/repository/*.gen.ts` / `src/infra/repository/in-memory-*.gen.ts` が生成される
4. 既存の手書き entity を削除、Route Handler の import を `.gen.ts` に切り替え
5. Connect RPC を入れる場合は `@connectrpc/connect` + `@hono/node-server` ではなく Route Handler 内でルーティング

現状では Next.js 単独プロジェクトとしての簡潔さを優先し、proto は採用していない。

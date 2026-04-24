# 共通インフラ整備 + @paging codegen 拡張 実装計画

- **作成日**: 2026-04-24
- **仕様書**: なし（口頭要件から起こす。本文書冒頭に前提を明記）
- **完了条件**:
  - 3 プロジェクト（go / hono / next）で `env` / `tx` ヘルパーが導入され、Usecase で tx を張り Repository が ctx 経由で受け取れる
  - Go に `pkg/util/logger/` が導入され、`env.AppEnv()` から log level が決定される
  - proto に `// @paging` を付与すると `SelectByCursor` が 3 プロジェクトすべてで自動生成される
  - ルート `README.md` と各プロジェクト `README.md` に上記の使用方法が記載される

---

## 1. 基本情報

### 目的

`manji-standard-server` モノレポは proto 駆動 DDD で 3 実装（go / hono / next）が並走している。
現状、以下の共通基盤が未整備なため、機能追加のたびに各プロジェクトで個別実装になる:

- 環境変数の読み込み（local / dev / staging / prod の切り替え）
- 構造化ロガー（Go のみ未整備、TS は `console` のまま）
- トランザクション境界の標準化（Usecase 層で開始 → Repository 層で透過利用）
- カーソルページングのコード生成（`@paging` アノテーション）

これらを 1 サイクルで揃え、以後の機能追加で共通基盤として使えるようにする。

### スコープ

**含む**:
- `pkg/util/env/`（Go） / `src/util/env/`（hono/next）の env loader と関数 Getter 群
- `.env.example` の整備（`.env.{local,dev,staging,prod}` は `.gitignore`）
- `pkg/util/logger/`（Go のみ）— `log/slog` ベース、env 連動
- `pkg/util/tx/`（Go） / `src/util/tx/`（hono/next）の transaction helper
- 既存 Usecase / Repository を tx helper 利用に書き換え（生成テンプレも合わせて更新）
- proto 生成プラグイン 3 種に `@paging` 解析 + `SelectByCursor` 生成の追加
- ルート + 各プロジェクト `README.md` の使用方法セクション追加
- 上記の Unit / Integration テスト

**含まない**:
- pgx への移行（Go は GORM のまま）
- DESC ソート版の `SelectByCursor`（将来 PR）
- 複数 `@paging` フィールドによる複合カーソル（将来 PR）
- `@paging` 対象カラムへのインデックス自動生成（警告のみ）
- リクエスト ID middleware の自動装着（logger は受け入れ口だけ用意し、middleware 実装は別 PR）
- `.claude/skills/` の更新（ユーザ指示によりスキル類は対象外）

### 制約

- 既存の生成済み `*.gen.go` / `*.gen.ts` は再生成で上書きされる前提（手動編集なし）
- 生成テンプレ更新後は `make proto-gen` 一発で全生成物が新形式に更新されること
- Go: GORM 維持、TS: Drizzle 維持
- `.env` 系の実ファイルはコミットしない（テンプレのみ）

---

## 2. 現状分析

### 関連する既存コード

| パス | 役割 |
| --- | --- |
| `manji-standard-server-go/cmd/mss-protoc-gen/main.go:399-403` | 既存 proto コメント解析（`@pk` / `@unique` / `@email` / `@required` / `@timestamp`） |
| `manji-standard-server-go/cmd/mss-protoc-gen/generator/repository/output/.../repository.gen.go.tpl` | Repository interface テンプレ |
| `manji-standard-server-go/cmd/mss-protoc-gen/generator/infra_postgres_repository/output/.../postgres_repository.gen.go.tpl` | Postgres 実装テンプレ（GORM） |
| `manji-standard-server-go/cmd/mss-protoc-gen/generator/mock/output/.../mock_repository.gen.go.tpl` | Mock テンプレ |
| `manji-standard-server-ts-hono/tools/mss-protoc-gen/index.mjs:154-161` | Hono 側の `hasMarker()` |
| `manji-standard-server-ts-next/tools/mss-protoc-gen/index.mjs` | Next 側の同等プラグイン |
| `manji-standard-server-go/pkg/infra/repository/profile_postgres_repository.gen.go:112-120` | 現状の bulk 系で GORM `Transaction()` を直接呼んでいる箇所 |

### 類似パターン（参考）

- `@pk` / `@unique` の解析・生成パスがすでに通っている → **`@paging` も同じ流路で追加**できる
- GORM の `db.Transaction(func(tx *gorm.DB) error { ... })` がすでに bulk 系で使われている → tx helper は GORM 機構をラップするだけ
- Drizzle の `db.transaction(async (tx) => ...)` が同様にすでに利用済み

### 依存関係

```
env  ──┬──→ logger（Go のみ）
       └──→ tx（DB 接続を Init で受け取り）
              ↓
     Usecase (tx.Run)
              ↓
   Repository (tx.From(ctx) / getDb())
              ↑
@paging codegen は Repository テンプレに新メソッドを追加
```

---

## 3. 設計方針

### 採用するパターン

| 領域 | 方針 |
| --- | --- |
| env | 関数 Getter 群（`env.AppEnv()` 等）。lazy init + `sync.Once` / module singleton。Getter 初回呼出時に必須欠落で panic |
| Go logger | `log/slog` の package default を init で差し替え。`logger.Info(ctx, ...)` で ctx-decorator 取り出し |
| tx | Go: `gorm.DB.Transaction()` ラップ + ctx key。TS: Drizzle `transaction()` + `AsyncLocalStorage` |
| Repository コンストラクタ | **`db` 引数を削除**し、`tx.From(ctx)` / `getDb()` 一本化。`tx.Init()` 未呼出時は明示メッセージで panic |
| `@paging` codegen | 既存 `hasMarker()` 流路に追加。1 message 1 フィールドのみ。複数指定はエラー |
| `@paging` ソート順 | ASC 固定（DESC は将来 PR） |

### データモデル

**env 共通 Getter**:

```
AppEnv() string         // "local" | "dev" | "staging" | "prod"
LogLevel() string       // local/dev → "debug"、staging/prod → "info"
DBHost / DBPort / DBUser / DBPassword / DBName / Port
```

**tx 公開 API**（Go 例、TS も対応 API）:

```
Init(db *gorm.DB)
Run(ctx, func(ctx) error) error
From(ctx) *gorm.DB
```

### インターフェース

**`@paging` 生成例**:

proto:
```
// @paging
int64 created_at = 3;
```

生成（Go Repository interface）:
```
SelectByCursor(ctx context.Context, limit int, after *int64) ([]*Profile, error)
```

挙動:
- `after == nil` → 先頭から `limit` 件
- `after != nil` → `WHERE created_at > $after ORDER BY created_at ASC LIMIT $limit`

---

## 4. Phase 分解

### Phase 0: 仕様確認・前提整理（完了）

- 口頭要件の整理 + 5 つの設計確認（GORM 維持 / dotenv 採用 / コンストラクタ db 引数削除 / ASC / stdout 一本）
- 本書をもって Phase 1 に進む

### Phase 1: 計画書作成（本書）

- **成果物**: `docs/work/20260424_infra_and_codegen.md`
- **検証**: ユーザ承認

### Phase 2: 設計レビュー・edge case 洗い出し（完了 2026-04-24）

- **目的**: 設計穴を Plan / reviewer agent で検出
- **成果物**: 洗い出しメモ + 対応方針の合意
- **観点**:
  - tx 未開始の Repository 呼び出し（fallback の挙動）
  - tx ネスト（GORM savepoint / Drizzle nested transaction）
  - env 必須キー欠落時のエラーメッセージ
  - codegen 既存 message に `@paging` 不在のときの後方互換
- **依存**: Phase 1
- **委託先**: `Plan` / `backend-reviewer`

#### Phase 2 決定事項（実装時の制約）

1. **`@paging` フィールド制約**: parser で `@pk` または `@unique` を持つフィールドのみ許可。違反時は generator がエラーで落ちる。1 message につき `@paging` は 1 個まで。許容型は `int64 / int32 / string`
2. **`tx.Init()` 未呼出時**: `tx.From(ctx)` は panic する（メッセージは `tx.Init not called; call it in cmd/api/main.go before serving`）。test 用に internal `resetForTest` を公開
3. **bulk 系 savepoint 二重化回避**: Repository テンプレから `gorm.DB.Transaction()` を削除し `tx.From(ctx).CreateInBatches(...)` 等に書き換える。原子性保証は Usecase 層の `tx.Run` に委譲
4. **`tx.Run` 内 panic**: `defer recover → rollback → re-panic` を `tx.Run` 実装内で保証し、test で検証
5. **tx 未開始時の fallback**: `tx.From(ctx)` は tx が無ければ default pool を返す + `slog.WarnContext(ctx, "repository called outside tx.Run")` を 1 回ログ出力
6. **Repository コンストラクタ**: `NewPostgres<Entity>Repository()`（引数なし）。Phase 5 で `cmd/api/main.go` の `NewPostgresUserRepository(db)` 呼び出しも更新
7. **logger 出力先**: `local` = text / stderr、`dev` = text / stderr、`staging|prod` = JSON / stdout
8. **env test override**: `t.Setenv` + internal `env.resetForTest()`
9. **dotenv**: `github.com/joho/godotenv`
10. **`SelectByCursor(after *T)` の意味**: `after == nil` で先頭。`after != nil` なら `WHERE col > *after` (厳密 `>`、境界行は前ページに含まれる前提)

### Phase 3: env loader 実装（go / hono / next 並列）

- **成果物**:
  - Go: `pkg/util/env/env.go` + `env_test.go` + `.env.example`
  - Hono: `src/util/env/index.ts` + `index.test.ts` + `.env.example` + `dotenv` 追加
  - Next: 同上
- **検証**: 各プロジェクトで `AppEnv()` が `.env.local` を読めることを test で確認
- **依存**: Phase 2
- **委託先**: `backend-worker` × 3（並列）

### Phase 4: Go logger

- **成果物**: `pkg/util/logger/logger.go` + `logger_test.go`
- **検証**: `env.AppEnv()` を変えると handler / level が切り替わることを test で確認
- **依存**: Phase 3（env が先）
- **委託先**: `backend-worker`

### Phase 5: tx helper（3 プロジェクト並列）+ Usecase / Repository テンプレ書き換え

- **成果物**:
  - Go: `pkg/util/tx/tx.go` + テンプレ更新（`tx.Init` 呼び出しを `cmd/api/main.go` に追加、Repository テンプレを `tx.From(ctx)` 一本化、コンストラクタから `db` 引数削除）
  - Hono: `src/util/tx/index.ts` + 同等のテンプレ更新（`getDb()` 一本化）
  - Next: 同上
  - 全プロジェクトで `make proto-gen` 後、生成物が新形式
- **検証**:
  - Usecase で `tx.Run` 内で複数 Repository 呼び出し → 1 つが err → ロールバックされる integration test
  - tx 未開始の Repository 呼び出しが default pool 経由で成功する test
- **依存**: Phase 3
- **委託先**: `backend-worker` × 3（並列）

### Phase 6: `@paging` codegen 拡張（go → hono → next 順次）

- **成果物**:
  - Go: `cmd/mss-protoc-gen/main.go` parser 拡張 + 3 テンプレ（repository / postgres / mock）に conditional block 追加
  - Hono: `tools/mss-protoc-gen/index.mjs` + 3 テンプレ
  - Next: 同上
  - サンプル proto に `@paging` 付与 → 再生成して動作確認
- **検証**:
  - 単一 `@paging` フィールド → 期待 signature 生成
  - 複数 `@paging` → generator が明示エラー
  - `@paging` 不在の既存 message → 出力に変化なし（後方互換）
- **依存**: Phase 5（生成コードが `tx.From(ctx)` を呼ぶため）
- **委託先**: `backend-worker` × 3（順次：Go → Hono → Next。最初の generator で得た知見を後続に展開）

### Phase 7: README ドキュメント更新

- **成果物**:
  - ルート `README.md`: 「共通ユーティリティ」「proto アノテーション一覧」セクションに `@paging` 行追加
  - 各プロジェクト `README.md`: `env` / `tx` / `logger`（Go のみ） / `@paging` の使用例（≤5 行ずつ）
- **検証**: ユーザレビュー
- **依存**: Phase 3-6 完了
- **委託先**: `backend-worker`

### Phase 8: Unit / Integration テスト（スコープ外、2026-04-24 決定）

- **決定**: 本 PR ではテスト自体を書かない。ユーザ指示により削除
- **理由**: `@paging` 生成コードは GORM の `WHERE > ORDER BY ASC LIMIT` を呼ぶだけで実質 GORM の責務、`tx.Run` も sqlmock レベルでは library の transaction flow を追うだけとなり、`testcontainers` 導入コストに見合う追加保証が薄い
- **今後**: 実機能（Usecase / Service）の実装時にその文脈で unit test を書く

### Phase 9: 品質チェック + コミット分割

- 各プロジェクトの format / lint / test を緑にする
- `backend-commit-splitter` 原則でコミット分割（自動生成 / 手書き / テスト / docs を分離）
- **依存**: Phase 8
- **委託先**: `backend-worker`

### Phase 10: PR 作成（明示指示後）

- `backend-pr-describer` で説明文生成
- ユーザ指示があれば `gh pr create`
- **依存**: Phase 9

---

## 5. 並列化計画

```
Phase 1 ─→ Phase 2
              ↓
        ┌──── Phase 3 (env: go)     ─┐
        ├──── Phase 3 (env: hono)   ─┤
        └──── Phase 3 (env: next)   ─┘
                                      ↓
                              ┌── Phase 4 (Go logger) ──┐
                              │                          │
                              ├── Phase 5 (tx: go)   ────┤
                              ├── Phase 5 (tx: hono) ────┤
                              └── Phase 5 (tx: next) ────┘
                                                          ↓
                                       Phase 6 (Go codegen)
                                                ↓
                                       Phase 6 (Hono codegen)
                                                ↓
                                       Phase 6 (Next codegen)
                                                ↓
                                       Phase 7 (README)
                                                ↓
                                       Phase 8 (テスト, unit/integration 並列)
                                                ↓
                                       Phase 9 (品質 + コミット)
                                                ↓
                                       Phase 10 (PR)
```

---

## 6. テスト戦略

### Unit テスト（mock 前提）

| 対象 | 観点 |
| --- | --- |
| env loader (3 言語) | APP_ENV 別ファイル選択 / 必須キー欠落 panic / type 変換 |
| Go logger | level 切替 / handler 切替 / ctx attrs マージ |
| tx helper (3 言語) | Init 未呼出 panic / ネスト動作 / fallback to default pool |
| `@paging` codegen | parser 単体: `@paging` マーカー認識、複数指定エラー |

### Integration テスト（実 DB）

| 対象 | 観点 |
| --- | --- |
| tx 境界（3 言語） | `tx.Run` 内で複数 Repository 呼び出し → 一部 err → 全件ロールバック |
| `@paging` 生成コード | サンプル proto から生成 → 実 DB に投入 → `SelectByCursor(nil)` / `SelectByCursor(after)` で期待行を取得 |
| Repository tx 未開始時 | default pool 経由で正常動作 |

### 既存テスト基盤の活用

- 各プロジェクトに既存の `test/` ディレクトリがある場合はそちらを踏襲
- 無い場合は `backend-integration-test-writer` の手順で testcontainers / docker-compose ベースで新規構築
- fixture は TestMain / global setup で 1 回だけ投入、テスト間はトランザクションロールバックで隔離

---

## 7. リスクと対策

| リスク | 影響 | 対策 |
| --- | --- | --- |
| Repository コンストラクタ削除で DI が壊れる（`pkg/di/handlers.gen.go` ほか） | 中 | DI テンプレも同時更新、`make proto-gen` 後にビルド確認 |
| tx helper の AsyncLocalStorage が Edge runtime で動かない | 中 | Next の Route Handler は `runtime: nodejs` 強制、CLAUDE.md にも記載済 |
| 既存 message が `@paging` 不在のまま生成 → 出力差分が出る | 低 | conditional block で `@paging` あり時のみ追加、test で diff 確認 |
| dotenv の追加で TS プロジェクトの起動順序問題（Drizzle init 前に env 必要） | 中 | env import を最上位に固定、`tx.init` も env 後に呼ぶ |
| GORM の `Transaction()` ネスト挙動が DB driver により差異 | 低 | Postgres のみ前提、savepoint 経由で動作することを integration test で確認 |
| `cmd/mss-protoc-gen` バイナリが `pkg/util/env` に依存して循環参照 | 中 | env は副作用 import を持たず、codegen は env を import しない構成 |

---

## 8. ロールバック戦略

- **コミット粒度**: Phase 単位で commit を分けるため、後段の Phase だけ revert 可能
- **codegen の後方互換**: `@paging` 不在の既存 message は出力差分ゼロ → revert 時も影響なし
- **DB schema 変更なし**: 本作業はアプリケーション層のみ。DB migration は発生しない
- **env loader fallback**: APP_ENV 未設定でも `local` で起動するので、CI 環境で APP_ENV を設定し忘れても落ちない（warning は出る）

---

## 9. オープン課題

- [ ] tx helper を Service 層からも `tx.Run` で開始したいケースがあるか（現状は Usecase 起点想定）
- [ ] logger に request_id を載せる middleware の実装は別 PR
- [ ] DESC ソート版 `SelectByCursor` の追加方法（別アノテーション or オプション引数）
- [ ] `@paging` 対象カラムのインデックス自動生成（migration 連携）

---

## 10. 参考資料

- `manji-standard-server-go/cmd/mss-protoc-gen/main.go` — Go 既存 generator
- `manji-standard-server-ts-hono/tools/mss-protoc-gen/index.mjs` — TS 既存 generator
- `manji-standard-server-ts-next/CLAUDE.md` — Next プロジェクトの規約と利用可能 skill / agent 一覧
- GORM Transaction docs: https://gorm.io/docs/transactions.html
- Drizzle Transactions: https://orm.drizzle.team/docs/transactions
- Go `log/slog`: https://pkg.go.dev/log/slog

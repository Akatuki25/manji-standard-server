# manji-standard-server-go

Go + DDD + クリーンアーキテクチャ + REST のバックエンドプロジェクト。

> [manji-standard-server 系](../manji-standard-server/README.md) の **Go 参照実装**。基盤の skill / subagent / [アーキテクチャパターン](../manji-standard-server/docs/patterns/README.md)（proto 駆動 DDD / `mss-protoc-gen` / インフラ差し替え）に準拠。
> 姉妹実装: [Hono 版](../manji-standard-server-ts-hono/) / [Next.js 版](../manji-standard-server-ts-next/)

## セットアップ

```bash
make install-tools   # buf + protoc プラグインをインストール
make proto-gen       # proto からコード生成 (entity / repository / handler / usecase / dto / DI)
make migration-gen   # entity の gorm タグから Postgres up SQL を生成 (初回 = CREATE TABLE)
go mod tidy          # 依存解決
cp .env.example .env.local  # 起動前に環境変数ファイルを用意 (APP_ENV=local で読まれる)
# migration を本番に適用する場合は golang-migrate を別途インストール:
#   migrate -path migrations -database "$DATABASE_URL" up
make run             # ローカル起動 (:8080)
```

## 共通ユーティリティ（`pkg/util/`）

### `env` — 環境変数ローダー

```go
import "github.com/example/manji-standard-server-go/pkg/util/env"

env.AppEnv()   // "local" | "dev" | "staging" | "prod"
env.DBHost(), env.DBPort(), env.DBUser(), env.DBPassword(), env.DBName()
env.Port()     // ":8080" (default)
```

起動時に `APP_ENV` を見て `.env.<APP_ENV>` を読み込む（未設定なら `local`）。必須キー欠落時は getter 呼び出し時に panic。

### `logger` — 構造化ロガー（`log/slog`）

```go
import "github.com/example/manji-standard-server-go/pkg/util/logger"

logger.Init()                              // main の最初に 1 度
logger.Info(ctx, "msg", "user_id", uid)    // ctx に積んだ attrs も展開
ctx = logger.WithAttrs(ctx, slog.String("request_id", rid))
```

`local`/`dev` → text / stderr / debug、`staging`/`prod` → JSON / stdout / info。

### `tx` — トランザクション境界

```go
import "github.com/example/manji-standard-server-go/pkg/util/tx"

tx.Init(db)                                             // main で 1 度
err := tx.Run(ctx, func(ctx context.Context) error {    // Usecase 層で境界を張る
    if err := repoA.Insert(ctx, a); err != nil { return err }
    return repoB.Insert(ctx, b)                         // 同一 tx で実行される
})
```

生成された Repository は内部で `tx.From(ctx)` を呼ぶので、`tx.Run` の中では自動的に同一トランザクションを使う。`tx.Run` の外で呼ばれた場合は default pool + `slog.Warn` 出力。

## エンドポイント (REST)

URL は proto の rpc 毎に `@http METHOD /path` アノテーションで宣言済み。生成物の `internal/di/handlers.gen.go` が `mux.HandleFunc` で登録する。レスポンスは `internal/dto/*.gen.go` の DTO を `json.Encode` した snake_case JSON。

| Method | Path | RPC |
|---|---|---|
| GET | `/api/users` | `ListUsers` |
| GET | `/api/users/cursor` | `ListUsersByCursor` (`?limit=&after_id=`) |
| GET | `/api/users/by-email` | `GetUserByEmail` (`?email=`) |
| GET | `/api/users/{id}` | `GetUser` |
| POST | `/api/users` | `CreateUser` |
| POST | `/api/users/bulk` | `BulkCreateUsers` |
| PUT | `/api/users/bulk` | `BulkUpsertUsers` |
| PUT | `/api/users/{id}` | `UpsertUser` |
| PATCH | `/api/users/{id}` | `UpdateUser` |
| POST | `/api/users/bulk-delete` | `BulkDeleteUsers` |
| DELETE | `/api/users/{id}` | `DeleteUser` |
| DELETE | `/api/users` | `DeleteAllUsers` |
| GET | `/health` | (手書き) |

```bash
# ユーザー作成
curl -X POST http://localhost:8080/api/users \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@example.com","name":"Alice"}'

# ユーザー取得
curl http://localhost:8080/api/users/<uuid>

# cursor pagination
curl 'http://localhost:8080/api/users/cursor?limit=20&after_id=<last-id>'

# ヘルスチェック
curl http://localhost:8080/health
```

## Docker

```bash
make docker-up       # api + postgres を起動
make docker-down     # 停止
```

## ユースケース別ガイド

「〜したい時」に辿るフロー。Claude Code で作業する際は各セクションの **skill / subagent** を呼ぶと自動で対応する手順に入る。

### 仕様を書きたい

新機能の仕様書を `docs/spec/` に作成する。実装詳細（コード・API エンドポイント）は書かず、目的・ルール・境界のみ。

- Skill: **`backend-spec-creator`**（「仕様書作って」「spec 書いて」）
- 出力先: `docs/spec/<feature-name>-spec.md`
- 仕様書にはルール ID（R-01, R-02...）を振り、テスト・実装から参照可能にする

### 実装計画を立てたい

仕様書を元に実装の進め方を決める。

- Skill: **`backend-work-planner`**（「実装計画立てて」「work 書いて」）
- 出力先: `docs/work/YYYYMMDD_<feature>.md`
- Phase 分解・並列化計画・テスト戦略・リスクを含む

### 新しいエンティティを追加したい

User のような新ドメイン概念(例: `Order`)を追加する。

1. `proto/order/v1/order.proto` を作成し、`// @entity` マーカー付きで定義。rpc には `// @http METHOD /path` を付ける
   ```proto
   // @entity
   message Order {
     // @pk @paging
     string id = 1;
     // @unique
     string order_number = 2;
     // @timestamp
     int64 created_at_unix = 3;
   }

   service OrderService {
     // @http POST /api/orders
     rpc CreateOrder(CreateOrderRequest) returns (CreateOrderResponse);
     // @http GET /api/orders/{id}
     rpc GetOrder(GetOrderRequest) returns (GetOrderResponse);
   }
   ```
2. `make proto-gen` → 以下が生成される:
   - `internal/domain/entity/order.gen.go` (構造体 + GORM タグ)
   - `internal/domain/entity/registry.gen.go` (`entity.All` に `&Order{}` が追加される)
   - `internal/domain/repository/order_repository.gen.go`
   - `internal/domain/repository/mock/mock_order_repository.gen.go`
   - `internal/infra/repository/order_postgres_repository.gen.go`
   - `internal/dto/order.gen.go` (`OrderDTO` + `FromOrder` / `FromOrders`)
   - `internal/usecase/order_usecase_interface.gen.go`
   - `internal/handler/order_handler.gen.go`
   - `internal/di/handlers.gen.go`
3. `make migration-gen` → `migrations/<YYYYMMDDHHMMSS>_create_orders.up.sql` が出る + `migrations/.snapshot.json` に orders が追加される(両方 git commit する)
4. `internal/domain/service/order_service.go` を手書き(ビジネスルール)
5. `internal/usecase/order_usecase.go` に `OrderUsecaseImpl` を手書き(生成 interface を実装。戻り値は `*dto.OrderDTO` / `[]*dto.OrderDTO` で、`dto.FromOrder*` で entity から変換)
6. `cmd/api/main.go` の `di.NewHandlers(...)` 呼び出しに `orderUsecase` を追加

#### proto アノテーション (mss-protoc-gen が解釈)

- `// @entity` — メッセージに付与。Entity / DTO / Repository interface / Mock / Postgres 実装の **5 ファイル**が生成される + `entity.All` registry に追加される
- `// @pk` — フィールドに付与。主キー。`SelectByPK` / `Delete` / `BulkDelete` が生成される
- `// @unique` — フィールドに付与。`SelectBy<Field>` が追加生成される
- `// @email` — フィールドに付与。email 形式バリデーション
- `// @required` — フィールドに付与。非空バリデーション
- `// @timestamp` — `int64` フィールドに付与。Entity 側で `time.Time` にマップ。DTO では `<name>_unix: int64` に展開
- `// @paging` — フィールドに付与。`SelectByCursor(ctx, limit, after *T)` が追加生成される。ASC 固定。`@pk` または `@unique` を持つ `int64 / int32 / string` 型フィールドでのみ許可、1 message に 1 個まで
- `// @http METHOD /path` — **rpc に付与**。REST Handler の URL 登録用(例: `@http GET /api/users/{id}`)。`{name}` は `r.PathValue("name")` で取り出す。`POST/PUT/PATCH` は body decode、`GET/DELETE` は query string から組み立てる


### 既存エンティティにフィールドを追加したい

User に `phone_number` を追加するケース。

1. `proto/user/v1/user.proto` にフィールド追加(必要なら `// @required` 等のマーカー)
2. `make proto-gen` で `user.gen.go` が再生成 → ファクトリ `NewUser` のシグネチャと DTO が変わる
3. **コンパイルエラー** で影響範囲(Service / Handler / Usecase 実装)が特定される
4. エラーが出た箇所を最小差分で更新
5. `make migration-gen` で `migrations/<timestamp>_alter_users.up.sql` が出る — `ADD COLUMN` の場合 NOT NULL なら **WARNING コメント** が付くので、既存行があるなら 2 段階(NULL 許容で追加 → 値埋め → NOT NULL 化)に手動分割する判断をここで行う
6. SQL を確認したら `migrations/.snapshot.json` ごと commit
7. 本番適用は `migrate -path migrations -database "$DATABASE_URL" up`

### 新しい REST エンドポイントを追加したい

`UserService` に `UpdateUser` を追加するケース。

1. `proto/user/v1/user.proto` の `service` ブロックに rpc を追加、`// @http PUT /api/users/{id}` を付ける
2. `make proto-gen` → `UserUsecase` interface にメソッドが足され、生成 Handler と DI の `Register` に URL が追加される
3. `pkg/usecase/user_usecase.go` の `UserUsecaseImpl` に新メソッドを実装(interface 要件を満たさないとコンパイルエラー)
4. 必要に応じて UseCase / Service にメソッド追加

### PostgreSQL から別 DB（MySQL / Redis / MongoDB）へ移管したい

永続化は PostgreSQL + GORM 単一実装が既定。別 DB への移管は「生成テンプレートと CLAUDE.md の書き換え」で行う。

1. `CLAUDE.md` の「技術スタック > データストア」欄を更新
2. `cmd/mss-protoc-gen/generator/infra_postgres_repository/` を `infra_<db>_repository/` にコピーして ORM / ドライバ / 型マッピングを差し替え
3. ドライバ依存を入れ替え（`go get gorm.io/driver/mysql` 等）
4. `make proto-gen` → コンパイルエラー箇所（`cmd/api/main.go` の DI など）を追従

詳細は [`../manji-standard-server/README.md` の「対象 DB / 自動生成対象の変更方法」](../manji-standard-server/README.md#対象-db--自動生成対象の変更方法) と [`infra-swap.md`](../manji-standard-server/docs/patterns/infra-swap.md) を参照。

### バグを調査したい

場当たり的に修正せず、仮説駆動で進める。

- Skill: **`backend-debug-session`**（「バグ調査して」「デバッグ手伝って」）
- 再現 → 仮説 3 つ出す → 検証 → 再発防止テストを先に書く → 修正 の順

### コードレビューを依頼したい

- Skill: **`backend-code-reviewer`**（「レビューして」）
- Subagent: **`backend-reviewer`**（並列委託したいとき）
- must / should / nit の 3 段階で指摘が返る。修正自体は別途 `backend-worker` に委託

### リファクタしたい

コードを触る前に影響範囲を洗い出す。

- Skill: **`backend-refactor-planner`**（「リファクタ計画立てて」）
- Parallel Change / Strangler Fig / In-place の戦略選定込み

### コミット分割・PR を作りたい

- Skill: **`backend-commit-splitter`**（「コミット分けて」）— 自動生成物と手書きを別コミットに分離
- Skill: **`backend-pr-describer`**（「PR 説明書いて」）— Summary / Changes / Test plan / Risk を構造化

### 考えがまとまらない（壁打ち）

- Skill: **`backend-rubber-duck`**（「壁打ちして」「一緒に考えて」）
- 答えを出さず問い返しで思考を整理する

### 開発全体をオーケストレートしたい

仕様〜実装〜PR 作成まで一気通貫で進めたい場合。

- Skill: **`backend-dev-manager`**（「開発進めて」）
- Phase 0-N に自動分解 + 各 Phase を subagent に委託

## Skills / Subagents

このプロジェクトには `.claude/skills/` と `.claude/agents/` が配置済みです。

- `.claude/skills/` — 15 個の skill（`backend-spec-creator` ～ `backend-pr-describer` など）
- `.claude/agents/` — 8 個の subagent（`backend-worker` / `backend-reviewer` / `backend-designer` など）

Claude Code を起動すると自動で認識されます。スキル一覧は:

```bash
ls .claude/skills/
ls .claude/agents/
```

## レイヤー構成 (`*.gen.*` が自動生成、それ以外が手書き)

```
proto/user/v1/user.proto  ← 唯一の手書き source
     │
     ├─ buf generate (mss-protoc-gen)
     │   │
     │   ├→ internal/domain/entity/user.gen.go              (struct + GORM タグ + TableName)
     │   ├→ internal/domain/entity/registry.gen.go          (entity.All 一覧)
     │   ├→ internal/domain/repository/user_repository.gen.go
     │   ├→ internal/domain/repository/mock/mock_user_repository.gen.go
     │   ├→ internal/infra/repository/user_postgres_repository.gen.go
     │   ├→ internal/dto/user.gen.go                         (UserDTO + From*)
     │   ├→ internal/usecase/user_usecase_interface.gen.go
     │   ├→ internal/handler/user_handler.gen.go             (REST Handler、net/http)
     │   └→ internal/di/handlers.gen.go                      (Register(mux))
     │
     └─ make migration-gen (cmd/mss-migration-gen)
         │
         └→ migrations/<timestamp>_<table>.up.sql            (差分ベース、CASCADE/DEFAULT は使わない)
            migrations/.snapshot.json                        (前回適用 schema、git commit)

REST Handler (生成) ─json.Encode→ DTO (生成)
        ↓ 呼び出し                  ↑ 変換 (usecase 内で dto.From*)
Usecase interface (生成)           Entity (生成)
        ↑ 実装                       ↑ GORM が直接読み書き
<Name>UsecaseImpl (手書き) → Service (手書き) → Repository (生成)
                                                     ↑ 実装
                                          Postgres Repository (生成)
```

HTTP リクエストは生成 Handler が JSON / query を parse → Usecase 実装に委譲 → Entity を Repository 経由で操作 → Usecase 内で DTO に変換 → Handler が `json.Encode(dto)` で返却、の順で通ります。

## インフラ層の構成 (Postgres 単一実装)

Repository の本番実装は proto から生成された **PostgreSQL + GORM 版**(`internal/infra/repository/*_postgres_repository.gen.go`)に統一しています。InMemory 実装は採用しません。

- **ユニットテスト**: 生成された Mock(`internal/domain/repository/mock/`)を Service / UseCase のテストに注入
- **結合テスト**: docker-compose または testcontainers で起動した PostgreSQL に接続し `tx.Init(db)` を呼んでから `NewPostgresUserRepository()` で取得。テスト用 schema は `AutoMigrateUser(db)` で同期(本番は使わない)
- **本番**: 同じ `NewPostgresUserRepository()`。DB 接続情報は `env.DB*()` から。スキーマは `migrations/*.up.sql` を `golang-migrate` で適用

### 配線例 (`cmd/api/main.go`)

```go
import (
    "gorm.io/driver/postgres"
    "gorm.io/gorm"

    infrarepo "github.com/example/manji-standard-server-go/internal/infra/repository"
    "github.com/example/manji-standard-server-go/pkg/util/env"
    "github.com/example/manji-standard-server-go/pkg/util/logger"
    "github.com/example/manji-standard-server-go/pkg/util/tx"
)

logger.Init()
dsn := fmt.Sprintf("host=%s port=%d user=%s password=%s dbname=%s sslmode=disable",
    env.DBHost(), env.DBPort(), env.DBUser(), env.DBPassword(), env.DBName())
db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{TranslateError: true})
if err != nil { log.Fatal(err) }
tx.Init(db)
// 本番では AutoMigrateUser を呼ばない。代わりに migrations/*.up.sql を golang-migrate で適用しておく。
userRepo := infrarepo.NewPostgresUserRepository()
```

## Migration 運用 (`migrations/`)

Entity の `gorm:` タグから `make migration-gen` で **差分 SQL** を生成する独自ツール (`cmd/mss-migration-gen`)。`mss-protoc-gen` と対をなすバイナリ。

- **ファイル形式**: `migrations/<YYYYMMDDHHMMSS>_<table>.up.sql` (1 entity 1 file、golang-migrate 互換)
- **状態保持**: `migrations/.snapshot.json` (前回適用した schema を JSON に。**git commit する**)
- **down は手書き**: 必要なら `<同 timestamp>_<table>.down.sql` を併置
- **CASCADE / DEFAULT は使わない**: NOT NULL カラムを後から追加する場合は 2 段階(NULL 許容で追加 → 値埋め → NOT NULL 化)が必要、生成 SQL に WARNING コメントが入る
- **適用**: `golang-migrate` 想定。`migrate -path migrations -database "$DATABASE_URL" up`
- **`AutoMigrate*` は開発・テスト用**: 本番起動時には呼ばない

詳細は `CLAUDE.md` の「Migration 生成」節を参照。

### 別 DB (MySQL / Redis / MongoDB) へ移管する場合

CLAUDE.md の「データストア」欄と `cmd/mss-protoc-gen/generator/infra_postgres_repository/` のテンプレートを書き換えて `make proto-gen` で再生成する。ランタイムの DI 切り替えではなく、**テンプレート差し替え + 再生成** が切り替え手段。`mss-migration-gen` も Postgres 前提で書かれているので、別 DB の場合は SQL 出力部 (`cmd/mss-migration-gen/sql.go`) を該当 dialect に書き換える。

詳細は:
- [`../manji-standard-server/README.md#対象-db--自動生成対象の変更方法`](../manji-standard-server/README.md#対象-db--自動生成対象の変更方法)
- [`../manji-standard-server/docs/patterns/infra-swap.md`](../manji-standard-server/docs/patterns/infra-swap.md)

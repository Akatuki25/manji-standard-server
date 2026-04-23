# manji-standard-server-go

Go + DDD + クリーンアーキテクチャ + REST のバックエンドプロジェクト。

> [manji-standard-server 系](../manji-standard-server/README.md) の **Go 参照実装**。基盤の skill / subagent / [アーキテクチャパターン](../manji-standard-server/docs/patterns/README.md)（proto 駆動 DDD / `mss-protoc-gen` / インフラ差し替え）に準拠。
> 姉妹実装: [Hono 版](../manji-standard-server-ts-hono/) / [Next.js 版](../manji-standard-server-ts-next/)

## セットアップ

```bash
make install-tools   # buf + protoc プラグインをインストール
make proto-gen       # proto からコード生成
go mod tidy          # 依存解決
make run             # ローカル起動（:8080）
```

## エンドポイント (REST)

URL は proto の rpc 毎に `@http METHOD /path` アノテーションで宣言済み。生成物の `pkg/di/handlers.gen.go` が `mux.HandleFunc` で登録する。

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

User のような新ドメイン概念（例: `Order`）を追加する。

1. `proto/order/v1/order.proto` を作成し、`// @entity` マーカー付きで定義。rpc には `// @http METHOD /path` を付ける
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

   service OrderService {
     // @http POST /api/orders
     rpc CreateOrder(CreateOrderRequest) returns (CreateOrderResponse);
     // @http GET /api/orders/{id}
     rpc GetOrder(GetOrderRequest) returns (GetOrderResponse);
   }
   ```
2. `make proto-gen` → `entity/order.gen.go` / `repository/order_repository.gen.go` / `infra/repository/order_postgres_repository.gen.go` / `usecase/order_usecase_interface.gen.go` / `handler/order_handler.gen.go` / `di/handlers.gen.go` が生成
3. `pkg/domain/service/order_service.go` を手書き(ビジネスルール)
4. `pkg/usecase/order_usecase.go` に `OrderUsecaseImpl` を手書き(生成 interface を実装)
5. `cmd/api/main.go` の `di.NewHandlers(...)` 呼び出しに `orderUsecase` を追加

### 既存エンティティにフィールドを追加したい

User に `phone_number` を追加するケース。

1. `proto/user/v1/user.proto` にフィールド追加（必要なら `// @required` 等のマーカー）
2. `make proto-gen` で `user.gen.go` が再生成 → ファクトリ `NewUser` のシグネチャが変わる
3. **コンパイルエラー** で影響範囲（Service / Handler）が特定される
4. エラーが出た箇所を最小差分で更新

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

## レイヤー構成（青色が自動生成、白色が手書き）

```
proto/user/v1/user.proto  ← 唯一の手書き source
     │
     └─ buf generate
         │
         ├→ pkg/domain/entity/user.gen.go       [mss-protoc-gen]
         ├→ pkg/domain/repository/user_repository.gen.go
         ├→ pkg/domain/repository/mock/mock_user_repository.gen.go
         ├→ pkg/infra/repository/user_postgres_repository.gen.go
         ├→ pkg/usecase/user_usecase_interface.gen.go
         ├→ pkg/handler/user_handler.gen.go     (REST Handler、net/http)
         └→ pkg/di/handlers.gen.go              (Register(mux))

REST Handler (生成) → Usecase interface (生成)
                          ↑ 実装
                      <Name>UsecaseImpl (手書き) → Service (手書き) → Repository (生成) → Entity (生成)
                                                                          ↑
                                                               Postgres Repository (生成)
```

HTTP リクエストは生成 Handler が JSON を parse → Usecase 実装に委譲 → Entity を取得 → JSON として返却、の順で通ります。

## インフラ層の構成（Postgres 単一実装）

Repository の本番実装は proto から生成された **PostgreSQL + GORM 版**（`pkg/infra/repository/*_postgres_repository.gen.go`）に統一しています。InMemory 実装は採用しません。

- **ユニットテスト**: 生成された Mock（`pkg/domain/repository/mock/`）を Service / UseCase のテストに注入
- **結合テスト**: docker-compose または testcontainers で起動した PostgreSQL に `NewPostgresUserRepository(db)` で接続
- **本番**: 同じ `NewPostgresUserRepository(db)`。DSN は環境変数

### 配線例（`cmd/api/main.go`）

```go
import (
    "gorm.io/driver/postgres"
    "gorm.io/gorm"

    infrarepo "github.com/example/manji-standard-server-go/pkg/infra/repository"
)

db, err := gorm.Open(postgres.Open(os.Getenv("DATABASE_URL")), &gorm.Config{})
if err != nil { log.Fatal(err) }
if err := infrarepo.AutoMigrateUser(db); err != nil { log.Fatal(err) }
userRepo := infrarepo.NewPostgresUserRepository(db)
```

### 別 DB（MySQL / Redis / MongoDB）へ移管する場合

CLAUDE.md の「データストア」欄と `cmd/mss-protoc-gen/generator/infra_postgres_repository/` のテンプレートを書き換えて `make proto-gen` で再生成する。ランタイムの DI 切り替えではなく、**テンプレート差し替え + 再生成** が切り替え手段。

詳細は:
- [`../manji-standard-server/README.md#対象-db--自動生成対象の変更方法`](../manji-standard-server/README.md#対象-db--自動生成対象の変更方法)
- [`../manji-standard-server/docs/patterns/infra-swap.md`](../manji-standard-server/docs/patterns/infra-swap.md)

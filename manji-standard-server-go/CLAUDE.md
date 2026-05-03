# CLAUDE.md

Go + DDD + クリーンアーキテクチャ + REST のバックエンドプロジェクト。
`.claude/skills/` と `.claude/agents/` 配下の skill / subagent は、このファイルを読んでプロジェクト固有の前提を把握する。

## 技術スタック

- **言語**: Go 1.25
- **API スタイル**: REST(JSON over HTTP)。URL は proto の rpc に付けた `@http METHOD /path` アノテーションで宣言する
- **Proto**: Protocol Buffers + buf(`buf generate` でドメイン層〜ハンドラまで生成)
- **コード生成プラグイン**:
  - `mss-protoc-gen`(独自、`cmd/mss-protoc-gen/` 配置) — proto の `@entity` / `@http` マーカーから以下を生成:
    - Entity / Repository interface / Mock / Postgres Repository 実装(エンティティ由来)
    - Usecase interface + Input 型、REST Handler 実装(`net/http`)、DI 用 `Handlers` struct(service 由来)
  - **protoc-gen-go / protoc-gen-connect-go は採用しない**(REST なので proto メッセージ型は不要)
- **HTTP ルーティング**: 標準 `net/http` + `http.ServeMux`(Go 1.22+ の `"METHOD /path/{param}"` パターン)
- **データストア**: PostgreSQL（GORM `gorm.io/gorm` + `gorm.io/driver/postgres`、生成物の単一実装）
- **テスト方針**: ユニットテストは生成 Mock を使う。結合テストは docker-compose / testcontainers の Postgres に接続
- **ビルド**: make + go

> 別 DB（MySQL / Redis / MongoDB 等）へ移管する手順は `manji-standard-server/README.md` の「対象 DB / 自動生成対象の変更方法」を参照。この CLAUDE.md の「データストア」欄を更新することで、以降の Skill / Subagent の判断に反映される。

## アーキテクチャ

- **パターン**: DDD(ドメイン駆動設計) + クリーンアーキテクチャ
- **レイヤー構成**:
  ```
  Proto (.proto)
   └→ mss-protoc-gen で以下を生成:
      internal/domain/entity/*.gen.go                          (Entity + GORM タグ)
      internal/domain/entity/registry.gen.go                   (var All = []any{...} mss-migration-gen 用)
      internal/domain/repository/*_repository.gen.go           (interface)
      internal/domain/repository/mock/mock_*_repository.gen.go (テスト用スタブ)
      internal/infra/repository/*_postgres_repository.gen.go   (Postgres + GORM)
      internal/dto/*.gen.go                                    (DTO + entity → DTO 変換関数)
      internal/usecase/*_usecase_interface.gen.go              (Usecase interface + Input 型)
      internal/handler/*_handler.gen.go                        (REST Handler、net/http ベース)
      internal/di/handlers.gen.go                              (Handlers struct + Register(mux))

  Entity (生成)
   └→ mss-migration-gen (cmd/mss-migration-gen) で以下を生成:
      migrations/<YYYYMMDDHHMMSS>_<table>.up.sql               (Postgres up migration、1 entity につき 1 file)
      migrations/.snapshot.json                                (前回適用 schema、git commit する)
                            ↓
  Handler (生成) ──json.Encode──→ DTO (生成)
       ↓ 呼び出し                  ↑ 変換(usecase 内で dto.From*)
  Usecase interface (生成)        Entity (生成)
       ↑ 実装                       ↑ GORM が直接読み書き
  <Name>UsecaseImpl (手書き) → Service (手書き) → Repository (生成)
                                                     ↑ 実装
                                          Postgres Repository (生成)
  ```
- **依存方向**: 常に内側(Entity)に向かう。Entity は他層を import しない。
- **DI**: コンストラクタ注入(`cmd/api/main.go` でワイヤリング)
- **DTO 境界**: クライアントへ返す JSON 表現は **DTO 層が一元管理** する。Usecase が `*entity.X` を `*dto.XDTO` に変換して返し、Handler は `json.Encode(result)` するだけ。Entity 側の json タグは持たず、`gorm:` タグのみ。
- **Entity = ORM モデル**: 生成 Entity は GORM の `column / primaryKey / uniqueIndex / not null` タグを所有し、`TableName()` も自動付与される。`*entity.X` を直接 `db.Create / Find` に渡せる(`HydrateX` のような中間モデルを噛ませない)。
- **可視性境界**: ドメイン〜インフラ〜DI〜Handler はすべて `internal/` 配下に置き、外部モジュールから import 不可にする。`pkg/util/` だけは横断的ユーティリティ(env / logger / tx)として `pkg/` に残し、外部からも参照可能。

## ディレクトリ構造

```
manji-standard-server-go/
├── cmd/
│   ├── api/                    # エントリポイント(ワイヤリング + net/http)
│   ├── mss-protoc-gen/         # 独自 protoc プラグイン(DDD 層の自動生成)
│   └── mss-migration-gen/      # entity → Postgres up SQL の独自ジェネレータ
├── internal/
│   ├── domain/
│   │   ├── entity/             # *.gen.go(生成、GORM タグ + TableName 内蔵)
│   │   ├── repository/         # *_repository.gen.go(interface、生成)
│   │   │   └── mock/           # mock_*_repository.gen.go(テスト用スタブ、生成)
│   │   └── service/            # ドメインサービス(★手書き)
│   ├── dto/                    # *.gen.go(DTO + From<Entity> 変換、生成)
│   ├── usecase/                # *_usecase_interface.gen.go(生成) + <Name>UsecaseImpl(★手書き)
│   ├── handler/                # *_handler.gen.go(REST Handler、生成)
│   ├── infra/
│   │   └── repository/         # *_postgres_repository.gen.go(GORM、生成)
│   └── di/
│       └── handlers.gen.go     # Handlers struct + Register(mux)(生成)
├── pkg/
│   └── util/                   # env / logger / tx(★手書き、横断ユーティリティ)
├── proto/                      # Protocol Buffers 定義(唯一の手書きソース)
│   └── user/v1/user.proto
├── migrations/                 # Postgres up SQL + .snapshot.json(mss-migration-gen 出力 + ★git commit)
├── buf.yaml                    # buf lint / breaking 設定
├── buf.gen.yaml                # 生成プラグイン設定
└── docs/
    ├── spec/                   # 仕様書
    ├── work/                   # 実装計画書
    └── knowledge/              # ナレッジ
```

## proto アノテーション(mss-protoc-gen が解釈)

- `// @entity` — メッセージに付与。Entity / Repository interface / Mock / Postgres 実装 / **DTO** の 5 ファイルが生成される
- `// @pk` — フィールドに付与。主キー。`SelectByPK` / `Delete` / `BulkDelete` が生成される
- `// @unique` — フィールドに付与。`SelectBy<Field>` が追加生成される
- `// @email` — フィールドに付与。email 形式バリデーション
- `// @required` — フィールドに付与。非空バリデーション
- `// @timestamp` — `int64` フィールドに付与。Entity 側で `time.Time` にマップ。DTO 側では `<name>_unix: int64` に展開
- `// @paging` — フィールドに付与。cursor pagination の cursor 列。`SelectByCursor(limit, after)` が追加生成される。`@pk` か `@unique` を併記する必要があり、proto 型は `string` / `int32` / `int64` のみ
- `// @http METHOD /path` — **rpc に付与**。REST Handler の URL 登録用(例: `@http GET /api/users/{id}`)。`{name}` は `r.PathValue("name")` で取り出す。`POST/PUT/PATCH` は body decode、`GET/DELETE` は query string から組み立てる

例:
```proto
// @entity
message User {
  // @pk @paging
  string id = 1;
  // @unique @email
  string email = 2;
  // @required
  string name = 3;
  // @timestamp
  int64 created_at_unix = 4;
}
```

### Response 形状とハンドラ生成

- 単一フィールドの response が `@entity` メッセージなら、Usecase は `*dto.<Name>DTO` / `[]*dto.<Name>DTO` を返す
- 複数フィールド or 非 entity message なら usecase ファイル内に `<Method>Output` struct を生成して返す
- `repeated <NonEntityMessage>` のように bulk 系入力で参照される非 entity message は usecase ファイル内に struct として emit され、`<Method>Input` と名前衝突したらリネームされる
- response が空(empty message)なら `error` のみ返す。Handler は 204 No Content

## コーディング規約

- **命名**:
  - パッケージ: 小文字（`entity`, `service`, `usecase`, `handler`）
  - インターフェース: ドメイン名を含めない（`repository.UserRepository` は OK、`user.UserRepository` は冗長）
- **エラー**: 標準 `errors` パッケージで生成。文脈が必要なら `fmt.Errorf("context: %w", err)`
- **コンテキスト**: `context.Context` は第一引数
- **時刻取得**: コンストラクタで注入された `clock func() time.Time` を経由（テスト容易性のため）
- **コメント**: 原則書かない。書く場合は WHY のみ。公開 API は godoc

## よく使うコマンド

- **ツールインストール**: `make install-tools`(buf + protoc プラグイン)
- **Proto 生成**: `make proto-gen`(proto 変更後は必須)
- **生成物削除**: `make proto-clean`
- **Migration 生成**: `make migration-gen`(entity 変更後、Postgres up SQL を `migrations/` に出力)
- **Migration 生成 (dry-run)**: `make migration-gen-dry`(SQL を標準出力)
- **ビルド**: `make build`
- **実行**: `make run`
- **テスト**: `make test`
- **Lint**: `make lint`
- **フォーマット**: `make fmt`
- **Docker 起動**: `make docker-up`

## Migration 生成 (`cmd/mss-migration-gen`)

Entity の `gorm:` タグから Postgres 向け **up migration SQL** を自動生成する独自ツール。`make migration-gen` で起動。

- **入力**: `internal/domain/entity/registry.gen.go` の `entity.All`(proto 生成物。全 `@entity` 構造体の zero-value ポインタが入る)
- **状態管理**: `migrations/.snapshot.json`(前回適用した schema を JSON で保持。**git commit する**)
- **出力**: `migrations/<YYYYMMDDHHMMSS>_<table>.up.sql`(1 entity の差分につき 1 ファイル)
- **適用**: [`golang-migrate/migrate`](https://github.com/golang-migrate/migrate) を採用想定。`migrate -path migrations -database $DATABASE_URL up`
- **down は手書き**: 自動生成しない。down が必要な場合は `<同 timestamp>_<table>.down.sql` を手書きする

### 差分判定ルール

| ケース | 出力 |
|---|---|
| snapshot が空 / 該当 entity 不在 | `CREATE TABLE` |
| 既存 entity に新カラム | `ALTER TABLE ... ADD COLUMN` |
| 既存 entity からカラム消滅 | `ALTER TABLE ... DROP COLUMN` (WARNING コメント付き) |
| 型 / NOT NULL / unique 変化 | `ALTER COLUMN` / `ADD CONSTRAINT` / `DROP CONSTRAINT` |
| entity が消滅 | `DROP TABLE` (WARNING コメント付き) |

### 規約

- **CASCADE は使わない**: `DROP TABLE` / `DROP COLUMN` で依存があれば失敗する。FK 参照や view からの依存は手動で剥がしてから適用
- **DEFAULT は使わない**: gorm タグの `default:` は無視される。NOT NULL カラムを後から追加する場合は **2 段階**(NULL 許容で追加 → 値を埋める → NOT NULL 化)が必要、生成 SQL に WARNING コメントが入る
- **危険操作のガード**: NOT NULL 追加 / DROP COLUMN / DROP TABLE / 型変更には `-- WARNING:` ヘッダが付与される。確認のうえ手動で確認・必要なら修正してから commit
- **snapshot とコードの整合性**: `migrations/.snapshot.json` は entity 状態の真実。手動で migration SQL を書いた場合、snapshot を手で同期しないと次回 diff で差分が再出現する

### `AutoMigrate` との使い分け

`internal/infra/repository/*_postgres_repository.gen.go` には `AutoMigrate<Name>(db *gorm.DB)` も生成されているが、**開発・テスト・integration test 用のスキーマ同期ヘルパー**。本番デプロイは `migrations/*.up.sql` を `golang-migrate` で適用するのが正。`AutoMigrate` を本番起動時に呼ばない。

## 規約上の禁則

- `cmd/api/main.go` 以外で具体的な Repository 実装を import しない(依存注入は main でのみ)
- Service / UseCase 層から直接 DB に触らない(Repository 経由)
- Entity に依存性を持たせない(GORM タグ + バリデーションロジックのみ。他層を import しない)
- **`*.gen.go` ファイルを手動編集しない**(Entity / DTO / Repository / Mock / Postgres 実装 / Usecase interface / REST Handler / DI 配線 / entity registry はすべて proto から生成)
- **`migrations/*.up.sql` と `migrations/.snapshot.json` の関係を壊さない**: SQL を手書き修正したら snapshot も手動で同期する。snapshot だけ書き換えて差分を消すのは厳禁(本番 DB と乖離する)
- Handler を手書き追加しない(生成物で十分、複雑な変換が必要なら Usecase 実装に寄せる)
- **Usecase は entity を直接返さない**。クライアントへ抜ける戻り値は必ず `dto.From<Name>` で DTO に変換してから返す
- **Handler は DTO の整形をしない**。`json.Encode(usecaseResult)` だけ。json タグの責務は DTO のみ
- proto 変更後は必ず `make proto-gen` を実行
- Entity に振る舞いを足したい場合は `<snake>_ext.go` で拡張する(生成ファイルとは別ファイル)
- `internal/` 配下のパッケージを外部モジュールから import しない(Go の internal 規則で物理的に禁止される)

## コミット・PR

- **ブランチ**: `feat/<author>/<topic>` / `fix/<author>/<topic>`
- **メッセージ**: Conventional Commits（`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`）
- **件名言語**: 英語 or 日本語（プロジェクトで統一）

## 利用可能な skill / subagent

`.claude/skills/` と `.claude/agents/` に配置済み。**skill / subagent 本体は技術非依存の workflow** であり、Go / REST / Postgres / GORM / proto といった**具体はこの CLAUDE.md から読み取られる**前提で書かれている。したがって技術スタックの変更はこのファイルだけで吸収でき、skill 本体を書き換えることはない。

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

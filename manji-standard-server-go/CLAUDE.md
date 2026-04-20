# CLAUDE.md

Go + DDD + クリーンアーキテクチャ + Connect RPC のバックエンドプロジェクト。
`.claude/skills/` と `.claude/agents/` 配下の skill / subagent は、このファイルを読んでプロジェクト固有の前提を把握する。

## 技術スタック

- **言語**: Go 1.22
- **通信**: Connect RPC（`connectrpc.com/connect`、HTTP/1.1 + JSON/Protobuf）
- **Proto**: Protocol Buffers + buf（`buf generate` で各層のコードを生成）
- **コード生成プラグイン**:
  - `protoc-gen-go` — メッセージ型
  - `protoc-gen-connect-go` — RPC ハンドラ/クライアント
  - `mss-protoc-gen`（独自、`cmd/mss-protoc-gen/` 配置）— proto の `@entity` マーカーから Entity / Repository interface / InMemory Repository 実装を生成
- **HTTP ルーティング**: 標準 `net/http` + `http.ServeMux`
- **データストア**: In-memory（生成物）。docker-compose 同梱の PostgreSQL に差し替え可能（手順は README「インフラ層の差し替え」参照）
- **ビルド**: make + go

## アーキテクチャ

- **パターン**: DDD（ドメイン駆動設計） + クリーンアーキテクチャ
- **レイヤー構成**:
  ```
  Proto (.proto)
   ├→ gen/**/*.pb.go, *_connect.go            （protoc-gen-go / connect-go）
   └→ pkg/domain/entity/*.gen.go              （mss-protoc-gen）
      pkg/domain/repository/*_repository.gen.go（mss-protoc-gen）
      pkg/infra/repository/*_repository.gen.go （mss-protoc-gen）
                            ↓
  Handler (connect 実装) → UseCase → Service → Repository(interface=生成) → Entity(生成)
                                                       ↑
                                              Infra 層の InMemory 実装(生成)
  ```
- **依存方向**: 常に内側（Entity）に向かう。Entity は他層を import しない。
- **DI**: コンストラクタ注入（`cmd/api/main.go` でワイヤリング）

## ディレクトリ構造

```
manji-standard-server-go/
├── cmd/
│   ├── api/                    # エントリポイント（ワイヤリング + net/http）
│   └── mss-protoc-gen/      # 独自 protoc プラグイン（DDD 層の自動生成）
├── pkg/
│   ├── domain/
│   │   ├── entity/             # *.gen.go（mss-protoc-gen で生成）
│   │   ├── repository/         # *_repository.gen.go（生成）
│   │   └── service/            # ドメインサービス（手書き）
│   ├── usecase/                # アプリケーションサービス（手書き）
│   ├── handler/                # Connect ハンドラ（手書き）
│   └── infra/
│       └── repository/         # *_repository.gen.go（InMemory 実装、生成）
├── proto/                      # Protocol Buffers 定義（唯一の手書きソース）
│   └── user/v1/user.proto
├── gen/                        # protoc-gen-go / connect-go の出力
│   └── user/v1/
│       ├── user.pb.go
│       └── userv1connect/user.connect.go
├── buf.yaml                    # buf lint / breaking 設定
├── buf.gen.yaml                # 生成プラグイン設定
└── docs/
    ├── spec/                   # 仕様書
    ├── work/                   # 実装計画書
    └── knowledge/              # ナレッジ
```

## proto アノテーション（mss-protoc-gen が解釈）

- `// @entity` — メッセージに付与。Entity / Repository / InMemory Impl の 3 ファイルが生成される
- `// @pk` — フィールドに付与。主キー。`FindByID` 相当が生成される
- `// @unique` — フィールドに付与。`FindBy<Field>` が追加生成される
- `// @email` — フィールドに付与。email 形式バリデーション
- `// @required` — フィールドに付与。非空バリデーション
- `// @timestamp` — `int64` フィールドに付与。Entity 側で `time.Time` にマップ

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
  - パッケージ: 小文字（`entity`, `service`, `usecase`, `handler`）
  - インターフェース: ドメイン名を含めない（`repository.UserRepository` は OK、`user.UserRepository` は冗長）
- **エラー**: 標準 `errors` パッケージで生成。文脈が必要なら `fmt.Errorf("context: %w", err)`
- **コンテキスト**: `context.Context` は第一引数
- **時刻取得**: コンストラクタで注入された `clock func() time.Time` を経由（テスト容易性のため）
- **コメント**: 原則書かない。書く場合は WHY のみ。公開 API は godoc

## よく使うコマンド

- **ツールインストール**: `make install-tools`（buf + protoc プラグイン）
- **Proto 生成**: `make proto-gen`（proto 変更後は必須）
- **生成物削除**: `make proto-clean`
- **ビルド**: `make build`
- **実行**: `make run`
- **テスト**: `make test`
- **Lint**: `make lint`
- **フォーマット**: `make fmt`
- **Docker 起動**: `make docker-up`

## 規約上の禁則

- `cmd/api/main.go` 以外で具体的な Repository 実装を import しない（依存注入は main でのみ）
- Service / UseCase 層から直接 DB に触らない（Repository 経由）
- Entity に依存性を持たせない（Entity は純粋なデータ + 生成ロジックのみ）
- **`*.gen.go` ファイルを手動編集しない**（Entity / Repository / InMemory 実装はすべて proto から生成）
- proto 変更後は必ず `make proto-gen` を実行
- Entity に振る舞いを足したい場合は `<snake>_ext.go` で拡張する（生成ファイルとは別ファイル）

## コミット・PR

- **ブランチ**: `feat/<author>/<topic>` / `fix/<author>/<topic>`
- **メッセージ**: Conventional Commits（`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`）
- **件名言語**: 英語 or 日本語（プロジェクトで統一）

# Architecture Patterns

manji-standard-server が推奨するバックエンドアーキテクチャパターン集。

Go / TypeScript / Hono / Next / その他言語でも共通に適用できる原則と、具体的な実装手順を記述する。

## パターン一覧

| パターン | ドキュメント | 適用場面 |
| --- | --- | --- |
| Proto 駆動 DDD | [proto-driven-ddd.md](./proto-driven-ddd.md) | スキーマが安定し Entity が多数あるサービス |
| カスタム protoc プラグイン設計 | [mss-protoc-gen.md](./mss-protoc-gen.md) | proto 駆動 DDD を実現するプラグイン実装時 |
| インフラ層の差し替え（DI） | [infra-swap.md](./infra-swap.md) | 本番 DB とテスト用 InMemory を切り替える全プロジェクト |

## 共通原則

全パターンの根底にある設計原則:

### 1. 単一のソース・オブ・トゥルース

- ドメインスキーマは 1 箇所で定義する（proto 駆動プロジェクトなら `.proto` が唯一）
- 同じ情報を複数のファイルで繰り返し書かない
- 生成物でカバーできる範囲は手書きしない

### 2. 依存方向は常に内側へ

```
Handler → UseCase → Service → Repository interface → Entity
```

外側は内側を知ってよいが、内側は外側を知らない。Entity は Repository の存在を知らず、Service は Handler の存在を知らない。

### 3. 抽象に依存する

具象実装（Postgres, Redis, HTTP client 等）を直接 import せず、interface に依存する。具象は `main` / DI コンテナでのみ注入する。

### 4. コンパイル時に影響範囲を検知する

- スキーマ変更は proto / interface 定義で表現する
- 手書き層が壊れたらコンパイルエラーで知らされる
- runtime の動作テストだけに頼らない

### 5. テストは軽量に保つ

- Entity / Service のユニットテストは生成された InMemory Repository でローカル完結
- 結合テストは testcontainers 等で本物の DB を一時起動
- 本番実装そのものを差し替えるための I/F は最初から整備する

## プロジェクトへの適用

新規プロジェクト開始時:

1. proto を書く（あるいは単に手書き interface で始める）
2. 最小の Entity / Repository / InMemory を用意
3. Service / UseCase / Handler を書く
4. 本番 DB 実装は必要になった時に差し替えパターンで追加

既存プロジェクトへの導入:

1. 最も変更頻度の高いドメインエンティティを 1 つ選ぶ
2. そのエンティティだけを proto 駆動 + 自動生成に移行
3. 既存 Repository を段階的に移行
4. 成功体験をチーム内に共有してから他のエンティティへ展開

## 関連 skill / subagent

- `backend-work-planner` — これらのパターンを前提に work 計画を立てる
- `backend-refactor-planner` — 既存コードのパターン適用リファクタを計画
- `backend-dev-manager` — Phase 分解で proto → 生成 → 手書きの順に進行

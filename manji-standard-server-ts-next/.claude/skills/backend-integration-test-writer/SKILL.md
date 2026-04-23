---
name: backend-integration-test-writer
description: 実 DB を起動して Handler → Usecase → Service → Repository を貫通させる integration test を書く。fixture 分離、TestMain/global setup、トランザクション単位のロールバックによるテスト間隔離、API エンドポイントを HTTP 経由で叩く E2E 的検証を扱う。単体テスト(mock 前提)は対象外で `backend-test-writer` に委譲する。「integration test 書いて」「E2E テスト追加して」「DB 込みのテスト書いて」などで起動。
---

# Integration Test Writer

実 DB(および必要な外部サービスのコンテナ)を起動した状態で、アプリケーション層を **なるべく mock なしで** 貫通させるテストを書く。単体テスト(mock 前提)と役割を分ける:

- **単体テスト**: Service / Usecase の論理分岐を mock で速く検証 → `backend-test-writer`
- **integration test(このスキル)**: Handler から Repository までを実 DB で貫通、proto ↔ Entity 変換・エラー→ステータスマップ・トランザクション境界まで含めて検証

## いつ使うか

- 新しい RPC / REST エンドポイントを追加した直後
- Repository / ORM マッピングの挙動(unique 違反・not null・timestamp 変換)を確認したい
- 複数エンドポイントを跨ぐシナリオ(作成 → 取得 → 更新 → 削除 のような流れ)を通したい
- proto 変更の互換性を実際のリクエスト/レスポンス経由で確認したい

## 実行手順

### 1. 既存パターン調査

**最も重要**。勝手に独自構造を作らない。

- `test/integration/` があればその中を一通り `ls` して構成を把握
- 1-2 本のテストファイルを `Read` し、以下を抽出:
  - 実 DB への接続方法(環境変数 / docker-compose サービス / testcontainers / CI の service container)
  - fixture の置き場所と投入タイミング(TestMain / beforeAll / conftest など)
  - テスト間の隔離方式(トランザクション rollback / truncate / 都度再シード)
  - API の叩き方(HTTP mux 経由 / Connect client 経由 / Next の handler 直接呼び出し)
  - アサーション流儀とレスポンス型の検証粒度

既存パターンがなければ以下の雛形を提案する(プロジェクトで合意後に採用)。

### 2. ディレクトリ構成(未整備の場合の推奨)

```
test/
├── integration/              # integration test 本体
│   ├── main_test.go         /  setup.ts          # TestMain / 共通初期化
│   ├── <feature>_test.*                          # 機能ごとのテスト
│   ├── util/                                     # HTTP ヘルパー・DI・context
│   └── fixture/
│       ├── master/                               # マスターデータ定義
│       └── user/                                 # 各テストユーザー用データ
└── scenario/                 # 任意: より広い E2E シナリオ(長めの流れ)
```

`fixture/` は「どのテストでも共通して必要になるデータ」を宣言的に定義する層。**個別テストで必要になる細かいデータはテスト関数内で作る**ほうが保守しやすい。

### 3. テスト間の隔離方式を決める

選択肢(既存に合わせる、なければプロジェクトで選ぶ):

| 方式 | 速度 | 実装難度 | 使い所 |
| --- | --- | --- | --- |
| **トランザクション rollback** | ◎ | △ (トランザクション境界を跨ぐ API だと難) | 書き込み系テストが多いとき |
| **テーブル truncate** | ○ | ○ | シンプル、小規模 |
| **テストごとに DB スキーマ再作成** | ✕ | ◎ | 本数が少ないとき |

**推奨: トランザクション rollback**。fixture を TestMain で一度だけ投入しておき、各テストの最外層トランザクションはテスト完了時に必ずロールバックする。本体 API が内部で開くトランザクションは、この外側トランザクションに乗る形にする(ネストしたトランザクションを再利用する実装か、テスト時のみ外側のトランザクションを注入できる DI が必要)。

### 4. fixture 設計

- **マスターデータ**: 全テストで共有してよい。TestMain / global beforeAll で 1 度だけ投入。削除はテスト終了時(ロールバックで勝手に消える方式なら不要)
- **ユーザーデータ**: テスト間の衝突を避けるため、`test-user-001` / `test-user-002` のように **テストごとにユーザー ID を変える**
- **シード値**: 時刻・UUID などランダム要素は固定値を注入(`time.Unix(0, 0)` / 定数 ID)

fixture は proto からの自動生成で用意してもよいし、手書き helper でもよい。**テスト本体から fixture 投入コードが見えるようにする**(fixture が暗黙でロードされると、何に依存しているか追いにくい)。

### 5. API 叩き方

E2E で貫通させるため、**Service や Repository を直接呼ばない**。プロジェクトの HTTP 境界を経由する。プロジェクトの API スタイルに応じて:

- REST + HTTP サーバー(標準ライブラリ / 汎用 framework) → 本番と同じ mux / router にテスト内でリクエストを流して handler を起こす
- REST + App Router 系 framework → 生成された route handler 関数をテスト内で呼ぶか、framework 付属のテストユーティリティを使う
- gRPC / RPC フレームワーク → in-process listener(`bufconn` 相当)を立ててクライアント呼び出しで貫通させる

**本番と同じ middleware を通すこと**が理想(認証 middleware は test 用のバイパスを用意)。

### 6. アサーション

2 段階で見る:

1. **レスポンス検証**: ステータスコード + レスポンス body の形と値
2. **DB 副作用検証**: Repository 経由で実際の DB を読んで、期待する行が存在するか / 存在しないかを確認

レスポンスだけ見て満足しない — handler が書いた値が DB に反映されているかまで見ないと「成功っぽいレスポンスを返すだけ」のバグを見逃す。

### 7. 実行確認

- ローカル: `docker-compose up -d db` で Postgres を起動 → テスト実行(Makefile の `make test-integration` などの形に統一)
- CI: GitHub Actions の `services:` で Postgres コンテナを起動して `DATABASE_URL` を渡す
- **わざと壊してレッドになることも確認**

## アンチパターン

- ❌ **integration test で mock を多用する** — 単体テストとの境界が曖昧になる。mock するなら外部サービス(決済 API 等)だけに限定
- ❌ **テスト順序に依存**(前のテストが作ったレコードを次のテストで使う)— 壊れたとき原因特定が困難
- ❌ **一つのテスト関数で全シナリオを検証**(set-up ロジックが巨大化)— 1 テスト = 1 シナリオ
- ❌ **DB 接続をテストごとに作って close**(遅い)— connection pool を共有し、隔離はトランザクションで
- ❌ **本番と違う migration / seed を使う**(挙動がずれる)— 本番と同じマイグレーションを走らせる
- ❌ **時刻依存テスト**(`time.Now()` 直叩き)— clock を注入 or 固定値でシード

## 言語別の参考

具体の実装は既存パターン最優先。参考までに:

- **Go**: `func TestXxx(t *testing.T)` + `httptest.NewRecorder()` / `http.ServeMux.ServeHTTP()`。`-tags=integration` などの build tag で単体テストと分離し `go test -tags=integration ./test/integration/...` で実行
- **TypeScript (vitest)**: `describe` / `it` + `pg` 直接接続 / `drizzle` client。`test/integration/*.test.ts` パスで分離し `vitest run test/integration` で実行
- **Python**: `pytest` + `testcontainers`、`conftest.py` で fixture

## 関連

- [backend-test-planner](../backend-test-planner/SKILL.md) — integration / unit の区分けを含めたテスト戦略設計
- [backend-test-writer](../backend-test-writer/SKILL.md) — 単体テスト(mock 前提)の作成
- [backend-test-gap-finder](../backend-test-gap-finder/SKILL.md) — 不足している integration / unit を両面で検出
- [backend-dev-manager](../backend-dev-manager/SKILL.md) — Phase の中で `backend-test-planner` → `backend-test-writer` + `backend-integration-test-writer` を順に回す

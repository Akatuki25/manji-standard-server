# mss-protoc-gen: DDD 層を生成するカスタムプラグイン

`proto-driven-ddd.md` で説明した「proto からドメイン層を自動生成する」方針を実現するカスタム protoc プラグインの設計・実装ガイド。

## プラグインが生成するもの

proto メッセージ 1 つ（`@entity` マーカー付き）につき 3 ファイルを出力:

| ファイル | 役割 |
| --- | --- |
| `entity/<name>.gen.*` | 構造体 / クラス + ファクトリ関数（バリデーション付き） |
| `repository/<name>_repository.gen.*` | Repository interface（`Save`, `FindByPK`, `FindBy<Unique>`...）|
| `infra/<name>_repository.gen.*` | InMemory 実装（テスト・開発用） |

各言語・フレームワーク向けに同じ仕様でプラグインを実装できる。Go なら protoc 公式 Go ライブラリ、TypeScript なら `@bufbuild/protoplugin`、Python なら protobuf 公式 Python ライブラリ、などを使う。

## 実装の 4 ステップ

### Step 1: proto アノテーション仕様の確定

既に `proto-driven-ddd.md` に定義がある:

```
@entity / @pk / @unique / @email / @required / @timestamp
```

これはコメント解釈方式。proto options を使わないのは、options 定義の proto 自体を先にコンパイルするブートストラップが不要になるため。

### Step 2: proto コメントの読み取り

プラグインが proto descriptor から各メッセージ / フィールドのコメントを取得する。

- **Go (`protogen`)**: `msg.Comments.Leading`, `field.Comments.Leading`
- **TS (`@bufbuild/protoplugin`)**: `message.getComments().leading`, `field.getComments().leading`

コメントに `@entity` が含まれる message のみ生成対象とする。

### Step 3: 型マッピング

| proto 型 | Go | TypeScript |
| --- | --- | --- |
| string | string | string |
| int32 / int64 | int32 / int64 | number |
| bool | bool | boolean |
| int64 + `@timestamp` | time.Time | Date |

`@timestamp` フィールドはフィールド名末尾の `Unix` を除去して命名（`createdAtUnix` → `CreatedAt` / `createdAt`）。

### Step 4: コード出力

テンプレートまたは `print` 系 API で 3 ファイルを書き出す。

**Entity 生成時の規約**:
- プライベートコンストラクタ + static ファクトリ（validation 込み）
- `@pk` フィールド: 空文字チェック
- `@required` かつ string: `trim` + 空文字チェック
- `@email`: `trim` + `@` を含むかチェック
- それ以外のフィールドは検証なしで通す

**Repository interface 生成時の規約**:
- `Save(entity)` 必須
- `FindBy<PK名>` 必須
- `@unique` フィールドそれぞれに `FindBy<Field名>` を追加

**InMemory 実装の規約**:
- Map ベース（キーは PK フィールド）
- 並行安全（Go では `sync.RWMutex`、TS では単一スレッドで不要）
- 本番用途ではなく、テスト・開発のみ想定

## 命名正規化

Go の lint（`stylecheck` ST1003）は initialism を期待する:
- `Id` → `ID`
- `Url` → `URL`
- `Api` → `API`
- `Http` → `HTTP`
- `Json` → `JSON`

プラグイン内で末尾マッチを検出して置換する。TypeScript では camelCase を維持（`id`, `url`, ...）。

## buf への組み込み

```yaml
# buf.gen.yaml
version: v2
plugins:
  - local: mss-protoc-gen        # Go: GOBIN 内のバイナリ
    out: .
  - local: ["node", "./tools/mss-protoc-gen.mjs"]  # TS: Node スクリプト
    out: .
```

`out: .` でプロジェクトルート起点のパスで書き出す。プラグイン側で `pkg/domain/entity/<name>.gen.go` のような絶対パスを指定する。

## 既存実装の参照ポイント

同じ namespace にある `manji-standard-server-go/cmd/mss-protoc-gen/main.go` と `manji-standard-server-ts-hono/tools/mss-protoc-gen.mjs` が参照実装。別言語（Python / Rust など）で新たに実装する場合もこの仕様に揃える。

## 拡張の方向性

必要になったら追加できるマーカー例:
- `@foreign_key=<target>` — 別エンティティへの参照を表現
- `@soft_delete` — 論理削除列（`deleted_at`）を自動付与
- `@audit` — 作成者 / 更新者列を自動付与
- `@index` — DB スキーマ生成時のインデックス指定

段階的に導入し、「書いたコードのうち何割が手書き → 自動生成に移行できたか」を指標にする。

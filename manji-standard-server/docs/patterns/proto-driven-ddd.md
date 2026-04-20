# Proto 駆動 DDD パターン

バックエンドを「proto を唯一のソース」にして DDD レイヤー全体を自動生成するパターン。言語・フレームワーク非依存。

## 要点

1. **proto (.proto) が真実のソース** — ドメインスキーマはすべて `.proto` に書く
2. **proto の変更 → 各層の再生成 → コンパイルエラーで影響範囲検知** の流れで安全に進化させる
3. **Entity / Repository interface / InMemory 実装は手書きしない** — すべて proto から自動生成
4. **ビジネスロジック（Service / UseCase / Handler）だけを手書き** する

## レイヤー構成

```
proto/**/*.proto                       ← 唯一の手書き source
   │
   └─ buf generate
      │
      ├→ メッセージ型 / RPC                  （protoc-gen-<lang>, connect-<lang>）
      └→ Entity + Repository interface + InMemory 実装  （mss-protoc-gen）
                                             │
Handler (connect 実装)                       │ ← 手書き
  ↓                                          │
UseCase                                      │ ← 手書き
  ↓                                          │
Service (ドメインロジック)                    │ ← 手書き
  ↓                                          │
Repository(interface)  ←──────────────────── 生成
  ↑ 実装
InMemory Repository    ←──────────────────── 生成
  ↓
Entity                 ←──────────────────── 生成
```

## なぜ有効か

### メリット

- **手書きコード量が激減** — User 1 つにつき Entity / Repository interface / 実装の 3 ファイル（Go の場合 100+ 行）が 0 手書きになる
- **スキーマ変更時の影響が型で検知** — proto を変えると生成物が変わり、それを使う手書き層がコンパイルエラーになる
- **フィールド追加・リネームが安全** — 再生成 → ビルドエラー修正、で漏れがない
- **DB エンジン切り替えが容易** — Repository interface が固定なので、実装（InMemory / Postgres / MySQL）を DI で差し替え可能

### トレードオフ

- 独自 protoc プラグインの保守コストが発生
- 生成ルールに収まらない Entity は別途手書きする必要がある（が、その時点で proto 駆動に合わない設計と判断すべき）
- マーカー（`@entity` 等）を proto に書くため、proto の読み手に独自規約の知識が必要

## 採用判断

**合う**:
- CRUD 中心のリソース指向 API
- 同じパターンの Entity が多数（数十〜）ある
- ドメイン層の骨格が安定していて、主に追加・拡張が多い

**合わない**:
- Entity が少数で構造がそれぞれ大きく異なる
- ドメインロジックが Entity 自体に多く、生成コードに収まらない振る舞いが多い
- proto を採用していない / 導入できない通信層（REST しか使えない等）

## proto アノテーション（mss-protoc-gen の例）

| マーカー | 位置 | 効果 |
| --- | --- | --- |
| `@entity` | message | Entity / Repository / InMemory 実装を生成 |
| `@pk` | field | 主キー。`FindByID` を生成 |
| `@unique` | field | `FindBy<Field>` を追加生成 |
| `@email` | field | email 形式バリデーション |
| `@required` | field | 非空バリデーション |
| `@timestamp` | int64 field | 時刻型（`time.Time` / `Date`）にマップ、`_unix` サフィックスを除去 |

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

## 関連

- [mss-protoc-gen](./mss-protoc-gen.md) — 生成プラグインそのものの実装ガイド
- [infra-swap.md](./infra-swap.md) — InMemory ↔ 本番 DB の切り替え方

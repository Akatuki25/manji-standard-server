# manji-standard-server-web

manji-standard-server の **frontend** スタック(Next.js)。backend(Go/TS/Python)と同じ `proto` 契約から、
**型付き API クライアント + CRUD UI(list/detail/form)+ client validation** を生成する。

- 設計: **[DESIGN.md](./DESIGN.md)**(契約→UI 生成の全体設計)。
- ステータス: **設計のみ**(2026-07-15)。実装は次の build-out(`tools/mss-protoc-gen` の frontend 移植 → デモ `/users` CRUD)。
- 原則: 素の全列テーブル/全項目フォームにしない(データの壁回避)。優先度駆動レイアウトを生成側に組み込む。

関連ナレッジ(`~/knowledge_base`): [[contract-to-ui-codegen]] / [[ref-schema-driven-ui]] / [[selection-design-pattern]]。

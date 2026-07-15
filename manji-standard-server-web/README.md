# manji-standard-server-web

manji-standard-server の **frontend** スタック(Next.js)。backend(Go/TS/Python)と同じ `proto` 契約から、
**型付き API クライアント + CRUD UI(list/detail/form)+ client validation** を生成する。

- 設計: **[DESIGN.md](./DESIGN.md)**(契約→UI 生成の全体設計)。
- ステータス: **生成器実装済み・1本通った**(2026-07-15)。`node tools/mss-protoc-gen/generate.mjs` で
  types / client / UserList / UserForm / page を生成、`npx tsc --noEmit` **PASS**。
- 原則: 素の全列テーブル/全項目フォームにしない(データの壁回避)。優先度駆動レイアウトを生成側に組み込む。

## 使い方
```bash
npm install
npm run gen         # proto → src/gen/** + src/app/users/page.tsx を生成
npm run typecheck   # tsc --noEmit (PASS)
```
- **生成**(`src/gen/`, `src/app/`, ヘッダ `// Code generated ... DO NOT EDIT.`):
  `types/user.ts`(型) / `client/user.ts`(@http由来の型付きfetch, 10RPC) / `ui/user/UserList.tsx`(優先度カードリスト) /
  `ui/user/UserForm.tsx`(@required/@email 由来の validation) / `app/users/page.tsx`。
- **手書き**(`src/lib/`): `api.ts`(fetch基盤) / `widgets.tsx`(componentMap=見た目)。
- 残: Detail/Edit/Delete 画面、Next.js ランタイム統合、コンポーネント/E2Eテスト、CI(codegen-drift)。

関連ナレッジ(`~/knowledge_base`): [[contract-to-ui-codegen]] / [[ref-schema-driven-ui]] / [[selection-design-pattern]]。

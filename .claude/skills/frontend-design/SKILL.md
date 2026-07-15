---
name: frontend-design
description: このscaffold(webスタック)で画面を作る/直すときのデザイン規約。新しい画面の実装、生成UIの調整、widget追加、「デザインを良くして」と言われたとき、レイアウトや色を決める前に必ず読む。
---

# frontend-design — 画面を作るときの規約

デザイン原則の正典は KB(`~/knowledge_base`)の [[selection-design-pattern]] / [[ref-ui-information-design]] /
[[contract-to-ui-codegen]]。このスキルはそれを**このコードベースの実装規約**に落としたもの。

## 3原則(すべての画面判断の基準)

1. **必要最小限**: その画面で「絶対に必要な情報」以上を載せない。表示できる≠表示すべき。
2. **優先度駆動**: 全項目を等価に並べない。「最も見たい1つ」を決めて視覚的に突出させ、二次情報は従属させる。
   優先度は推測でなく利用実態から決める。
3. **列挙にしない**: 表・リストの平置き(データの壁)を避ける。card+強弱に再構成し、詳細は
   progressive disclosure(≤3段)へ。モバイルでは表を card 積み上げに変換する。

## 実装規約

### tokens だけを使う
- 色・サイズ・余白・角丸・影は `src/lib/tokens.css` の CSS 変数のみ。**生の hex / px を画面コードに書かない**。
  (`padding: "var(--sp-3)"` ○ / `padding: 12` ✗)
- ダークモードは tokens 側で自動追従する。画面側で分岐しない。
- 新しい値が要るときは tokens に追加してから使う(1画面のための特例値を作らない)。

### widget に委譲する
- レイアウト/表示の構造は `src/lib/widgets.tsx` のコンポーネントで組む:
  `Page / Section / ListStack / ListRow / EmptyState / KVList / Badge / ProgressBar / Field / Button / ErrorText`
- 生成UI(`src/gen/ui/**`)は widget を呼ぶだけの構造になっている。**見た目を変えたいときは
  生成物や生成テンプレでなく widget/tokens を変える**(全画面に一括で効く)。
- 同じ見た目を2箇所で手書きしそうになったら widget 化する。

### 契約(proto)側の表示制御
- 一覧の強弱は `@list primary|secondary|hidden`、ラベルは `@label`、フォーム部品は `@form` で契約に書く。
  画面側でフィールドの選別ロジックを書かない([[contract-to-ui-codegen]])。

## 画面を作る手順

1. 「この画面でユーザが**最も見たい1つ**」を言語化する(書けないなら画面の目的が曖昧)
2. その1つに最大の視覚的重み(サイズ/位置/太さ)。二次情報は `--text-sm`+`--text-muted` へ
3. 3つ以上並ぶものは ListRow/card 化。0件時は EmptyState(次の行動への導線つき)
4. **検証**: `npm run build` 後にライト/ダーク両方でスクリーンショットを撮って目視検品する。
   チェック: 最優先が一目で分かるか / 生hex・生pxが混入していないか / 0件・長文・多件数で崩れないか

## アンチパターン

- 全カラムを等幅で並べた table(→ ListRow で primary/secondary に再構成)
- 画面ごとに違うボタン・違う枠線(→ Button/ListRow を使う。亜種が要るなら widget に variant を足す)
- 「とりあえず全部表示して後で削る」(→ 逆。最小から始めて必要が証明されたら足す)
- 生成ファイル(`Code generated ... DO NOT EDIT.`)への手当て(→ widget/tokens/テンプレ側で直す)

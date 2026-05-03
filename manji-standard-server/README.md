# manji-standard-server

Claude Code で動くバックエンド開発の標準基盤。DDD + クリーンアーキテクチャを前提にした skill / subagent / アーキテクチャパターン集と、言語別の参照実装プロジェクトから構成される。

## manji-standard-server 系プロジェクト一覧

| 種別 | ディレクトリ | 概要 |
| --- | --- | --- |
| **基盤（本リポ）** | [`manji-standard-server/`](./) | 汎用 skill / agent / パターン集。全メンバーの思想的中心 |
| Go 参照実装 | [`../manji-standard-server-go/`](../manji-standard-server-go/) | Go 1.22 + `net/http` + REST + Proto 駆動 DDD + カスタム `mss-protoc-gen` |
| Hono 参照実装 | [`../manji-standard-server-ts-hono/`](../manji-standard-server-ts-hono/) | TypeScript + Hono v4 + REST + Proto 駆動 DDD |
| Next.js 参照実装 | [`../manji-standard-server-ts-next/`](../manji-standard-server-ts-next/) | Next.js 14 (App Router) + REST + Proto 駆動 DDD |

新しいプロジェクトを作るときはどれかの実装を元に fork するか、このベースディレクトリの skill / agent / パターンを取り込んで独自構成を組む。

## 3 実装の構造比較

| | Go | Hono | Next |
| --- | --- | --- | --- |
| proto 駆動 DDD | ✅ | ✅ | ✅ |
| mss-protoc-gen | ✅ | ✅ | ✅ |
| Entity / Repo interface / Mock / Postgres 実装を生成 | ✅ | ✅ | ✅ |
| DTO + entity → DTO 変換関数を生成 | ✅ | ✅ | ✅ |
| Entity が ORM スキーマ(GORM タグ / Drizzle pgTable)を所有 | ✅ | ✅ | ✅ |
| Usecase interface + Input 型を生成 | ✅ | ✅ | ✅ |
| API スタイル | **REST** | **REST** | **REST** |
| URL ルーティング指定 | `@http METHOD /path` | 同左 | 同左 |
| REST Handler 実装を生成 | ✅ (`net/http`) | ✅ (Hono `Context`) | ✅ (Next Route Handler) |
| DI 配線を生成 | ✅ (`Handlers` struct + `Register(mux)`) | ✅ (`registerHandlers(app, deps)`) | ✅ (`handler-registry` 遅延 factory) |
| Entity → DB マイグレーション SQL を生成 | ✅ (`mss-migration-gen` + `golang-migrate`) | ⚠️ (drizzle-kit を採用) | ⚠️ (drizzle-kit を採用) |
| 外部 DI フレームワーク | 不使用 | 不使用 | 不使用 |

**手書きに残るのは 3 実装とも Service + Usecase 実装 + DI ワイヤリング数行のみ**。ドメイン層・ユースケース層 interface・REST Handler・ルーティング登録は全て proto から生成される。

違うのは HTTP フレームワークだけ — Go は `net/http`(Go 1.22+ の `"METHOD /path/{param}"` パターン)、Hono は `app.get` / `app.post`、Next は App Router の `route.ts`。どれも JSON over HTTP の REST。

## どの実装を選ぶか

| こういう時は | 推奨 | 理由 |
| --- | --- | --- |
| 高性能・型安全なバックエンド API を作る | `manji-standard-server-go` | Go 静的型 + `net/http` の REST、proto 駆動で大量エンティティを高速実装 |
| Node エコシステムでバックエンド API を作る | `manji-standard-server-ts-hono` | npm 資産 + TypeScript + Hono、proto 駆動で Go と同等の体験 |
| フロントエンドも同一リポで管理したい | `manji-standard-server-ts-next` | Next.js App Router で UI + API を同居。SSR / ISR が必要な場合 |
| API / クライアントを明確に分けたい | Hono(API) + Next(UI) を別デプロイ | どちらも素の REST なのでクライアント間で仕様を共有しやすい |

## 使い方（ユースケース別）

### まったく新規のプロジェクトを始める

1. どれかの参照実装（go / hono / next）をコピー
2. `CLAUDE.md` をプロジェクト固有の内容に書き換え
3. `docs/spec/`・`docs/work/`・`docs/knowledge/` は空のまま使い始める
4. `proto/user/v1/user.proto` を起点にドメインを書いていく（proto 駆動実装の場合）

### 既存プロジェクトに skill / agent だけ導入する

本基盤の skill / agent のみを別リポに取り込みたい場合:

```bash
# 別リポのルートで
cp -r /path/to/manji-standard-server/skills .claude/
cp -r /path/to/manji-standard-server/agents .claude/

# または Makefile 経由
make -f /path/to/manji-standard-server/Makefile install
```

詳細は本ディレクトリの [`Makefile`](./Makefile) の help ターゲット参照。

### アーキテクチャパターンだけ参考にしたい

`docs/patterns/` の 4 本(proto-driven-ddd / mss-protoc-gen / mss-migration-gen / infra-swap)を読む。
skill / 実装を取り込まなくても、概念だけ取り入れられる。

### 開発中のユースケース別ガイド

実装時の「仕様書を書きたい」「新エンティティを追加したい」などの具体操作は、**各実装プロジェクトの README** の「ユースケース別ガイド」セクションを参照:

- [Go 版ユースケース](../manji-standard-server-go/README.md#ユースケース別ガイド)
- [Hono 版ユースケース](../manji-standard-server-ts-hono/README.md#ユースケース別ガイド)
- [Next 版ユースケース](../manji-standard-server-ts-next/README.md#ユースケース別ガイド)

## このディレクトリの内容

- [`skills/`](./skills/) — Claude Code で会話中に呼び出すワークフロースキル（15 本）
- [`agents/`](./agents/) — `Task` tool で並列委託できる subagent（8 本）
- [`docs/patterns/`](./docs/patterns/) — **バックエンドアーキテクチャ推奨パターン**
- [`Makefile`](./Makefile) — 別プロジェクトへ `.claude/` を配置するための管理ターゲット

## アーキテクチャパターン

manji-standard-server 系が推奨するバックエンドアーキテクチャは [`docs/patterns/README.md`](./docs/patterns/README.md) を参照。主な内容:

| パターン | 要点 |
| --- | --- |
| [Proto 駆動 DDD](./docs/patterns/proto-driven-ddd.md) | `.proto` を唯一のソースとし、Entity / Repository interface / Postgres 実装 / Mock を自動生成する |
| [mss-protoc-gen](./docs/patterns/mss-protoc-gen.md) | DDD 層を生成するカスタム protoc プラグインの設計ガイド(言語別に実装) |
| [mss-migration-gen](./docs/patterns/mss-migration-gen.md) | 生成された Entity の ORM タグから差分マイグレーション SQL を生成するカスタムジェネレータの設計ガイド |
| [インフラ切り替え](./docs/patterns/infra-swap.md) | 生成対象 DB を Postgres → MySQL / Redis / MongoDB に移管する手順 |

これらの参照実装は `manji-standard-server-go` / `manji-standard-server-ts-hono` / `manji-standard-server-ts-next` に存在。Next 系実装は **RPC プロトコルを持たない** が proto 駆動 DDD（ドメイン層生成）は採用しており、[切り替えパターン](./docs/patterns/infra-swap.md)・[共通原則](./docs/patterns/README.md)も同じく遵守。

**永続化実装は Postgres 単一**。ユニットテストは生成された Mock、結合テストは testcontainers の Postgres を使う前提。InMemory 実装はこの標準には含めない。

## 対象 DB / 自動生成対象の変更方法

標準構成は PostgreSQL + GORM（TS は Drizzle / TypeORM 予定）だが、MySQL / Redis / MongoDB 等への変更、あるいは「Mock は生成しない」のような生成対象自体の変更もサポートする。切り替えに必要な知識は **2 層に分離** されている:

### 役割分担

| 層 | 場所 | 何を持つか | いつ編集するか |
| --- | --- | --- | --- |
| **Skill / Subagent** | `skills/*/SKILL.md` / `agents/*.md` | **技術非依存のワークフロー**（計画・実装・レビューの進め方） | 手順やポリシーが変わった時のみ。**DB 変更では編集しない** |
| **CLAUDE.md** | 各プロジェクト直下 | **プロジェクト固有の技術スタック / 規約 / 生成物一覧** | DB 変更・ORM 変更・生成対象の増減で編集する |
| **生成テンプレート** | `cmd/mss-protoc-gen/generator/` or `tools/mss-protoc-gen/generator/` | **各 DB 向けの具体コード** | DB 変更時にテンプレートを差し替え |

Skill は CLAUDE.md を **起動時に読む**。そのため CLAUDE.md を更新すれば、以降の会話での計画立案・コード生成・レビューは新しい前提を踏襲する。Skill 本体を編集する必要はない。

### ケース 1: Postgres → MySQL / Redis / MongoDB に移管する

1. **CLAUDE.md のデータストア欄を更新**（各プロジェクトの `CLAUDE.md`）
   ```diff
   - **データストア**: PostgreSQL（GORM）
   + **データストア**: MySQL（GORM `gorm.io/driver/mysql`）
   ```
2. **生成テンプレートを差し替え / フォーク**
   - Go: `cmd/mss-protoc-gen/generator/infra_postgres_repository/` を `infra_mysql_repository/` にコピーし、内部の GORM ドライバ import と型マッピングを変更
   - TS: `tools/mss-protoc-gen/generator/` 以下を同様に変更
3. **ドライバ依存を差し替え**（`go get` / `npm install`）
4. **`make proto-gen` で再生成** → コンパイルエラーが出た箇所（`main.go` / `container.ts` の DI など）を追従
5. Mock / Entity / Repository interface は **変更不要**

Redis / MongoDB のようにパラダイムが変わる場合は、interface そのものが成立しない操作（Redis での `SelectAll` 等）があるため proto アノテーションの見直しから入る。詳細: [`docs/patterns/infra-swap.md`](./docs/patterns/infra-swap.md)

### ケース 2: 自動生成対象を増減させる（例: Mock をやめる / ハンドラも生成する）

1. **CLAUDE.md の「生成物一覧」を更新** — 何が生成され、何を手書きするかの正本
2. **`cmd/mss-protoc-gen/generator/<kind>/` のディレクトリを追加 / 削除**
3. **プラグインの main 側で対象 kind のループを追加 / 削除**
4. **生成ポリシーに影響する規約（ファイル命名・配置ルール）を `docs/patterns/mss-protoc-gen.md` に反映**

### ケース 3: Skill / Subagent 自体の方針を変える

技術非依存のワークフロー方針（例: Phase 分解の粒度、PR description のフォーマット、レビューの観点）を変更した場合:

- `skills/` / `agents/` のファイルを更新した上で、**全 standard-server プロジェクトに同期**（`manji-standard-server/Makefile install` 等で配布）
- 固有の技術に踏み込む記述を Skill に書かないこと（書くなら CLAUDE.md へ）

### Skill が技術非依存であることの検証

```bash
# Skills / Agents に具体技術が漏れていないことを確認（返る場合は是正対象）
grep -rE 'GORM|gorm|Postgres|postgres|MySQL|Redis|Mongo|InMemory|in-memory' \
    manji-standard-server/skills/ manji-standard-server/agents/
```

Skill 側でどうしても DB を言及したい場合は具体名を避けて「CLAUDE.md の『データストア』欄に従う」のような **参照型** で記述する。

## 収録スキル

### 探索 / オンボーディング
| スキル | 用途 | トリガー例 |
| --- | --- | --- |
| [backend-codebase-explorer](./skills/backend-codebase-explorer/SKILL.md) | 未知のコードベースの全体像を素早く把握する | 「このコードベース教えて」「プロジェクト構造調べて」 |

### 仕様 (docs/spec/)
| スキル | 用途 | トリガー例 |
| --- | --- | --- |
| [backend-spec-creator](./skills/backend-spec-creator/SKILL.md) | `docs/spec/` 配下に新規仕様書を作成する | 「仕様書作って」「spec 書いて」 |
| [backend-spec-updater](./skills/backend-spec-updater/SKILL.md) | 既存仕様書を最小差分で更新する | 「spec 更新して」「仕様書を最新化して」 |

### 開発 (docs/work/)
| スキル | 用途 | トリガー例 |
| --- | --- | --- |
| [backend-work-planner](./skills/backend-work-planner/SKILL.md) | `docs/work/YYYYMMDD_*.md` として実装計画書を作成する | 「実装計画立てて」「work 書いて」 |
| [backend-dev-manager](./skills/backend-dev-manager/SKILL.md) | 仕様と計画書を軸に Phase 分解 + PDCA で開発全体をオーケストレーション | 「開発進めて」「実装オーケストレートして」 |
| [backend-refactor-planner](./skills/backend-refactor-planner/SKILL.md) | リファクタの影響範囲・順序・ロールバックを事前計画 | 「リファクタ計画立てて」「影響範囲調べて」 |
| [backend-debug-session](./skills/backend-debug-session/SKILL.md) | バグ調査を仮説駆動で体系的に進める | 「バグ調査して」「デバッグ手伝って」 |

### テスト
| スキル | 用途 | トリガー例 |
| --- | --- | --- |
| [backend-test-planner](./skills/backend-test-planner/SKILL.md) | Unit / Integration を区分けしたテスト層選定・ケース洗い出し・カバレッジ方針を設計する | 「テスト戦略立てて」「テスト計画書いて」 |
| [backend-test-writer](./skills/backend-test-writer/SKILL.md) | 単体テスト(mock 前提)を既存パターンに合わせて書く | 「テスト書いて」「このコードのテスト追加して」 |
| [backend-integration-test-writer](./skills/backend-integration-test-writer/SKILL.md) | 実 DB を起動して Handler → Repository を貫通させる integration test を書く | 「integration test 書いて」「E2E テスト追加して」「DB 込みのテスト書いて」 |
| [backend-test-gap-finder](./skills/backend-test-gap-finder/SKILL.md) | テスト不足箇所を優先度付きで洗い出す(unit / integration 両面) | 「テスト不足どこ？」「テストギャップ調べて」 |

### レビュー / 思考整理
| スキル | 用途 | トリガー例 |
| --- | --- | --- |
| [backend-code-reviewer](./skills/backend-code-reviewer/SKILL.md) | 構造化観点でコードをレビュー・優先度付き指摘を返す | 「レビューして」「セカンドオピニオン」 |
| [backend-rubber-duck](./skills/backend-rubber-duck/SKILL.md) | 問い返しで思考整理するソクラテス式の壁打ち | 「壁打ちして」「一緒に考えて」 |

### Git / PR
| スキル | 用途 | トリガー例 |
| --- | --- | --- |
| [backend-commit-splitter](./skills/backend-commit-splitter/SKILL.md) | 差分を依存関係に基づいて適切な粒度のコミットに分割 | 「コミット分けて」「良い粒度でコミット」 |
| [backend-pr-describer](./skills/backend-pr-describer/SKILL.md) | コミット履歴から質の高い PR 説明文を生成 | 「PR 説明書いて」「PR description 作って」 |

## 収録 Subagent

Skills（会話内ワークフロー）とは別に、`Task` tool で並列委託できる subagent も収録しています。

### 実行系
| Subagent | 用途 |
| --- | --- |
| [backend-worker](./agents/backend-worker.md) | 実装・テスト・ビルド確認を実行する汎用ワーカー |
| [backend-reviewer](./agents/backend-reviewer.md) | 実装をレビューし must/should/nit の優先度付きで指摘を返す（修正はしない） |

### 設計系
| Subagent | 用途 |
| --- | --- |
| [backend-designer](./agents/backend-designer.md) | API・データモデル・エンティティの「何を作るか」を対話で決定する設計パートナー |

### 実装スタイル系（3 つのうち状況に応じて選択）
| Subagent | 選ぶべき場面 |
| --- | --- |
| [backend-conservative](./agents/backend-conservative.md) | 既存への影響を最小化し、後方互換を最優先する場合 |
| [backend-evolution](./agents/backend-evolution.md) | 既存と調和させながら段階的に改善する場合 |
| [backend-greenfield](./agents/backend-greenfield.md) | ゼロベース思考で刷新が妥当な場合（撤退戦略込み） |

### 運用系
| Subagent | 用途 |
| --- | --- |
| [backend-git-rebase](./agents/backend-git-rebase.md) | PR 作成前のコミット履歴整理（バックアップ必須） |
| [backend-knowledge-manager](./agents/backend-knowledge-manager.md) | `docs/knowledge/` にプロジェクトナレッジを蓄積・検索・整理 |

### Skill と Subagent の違い

| 種別 | 場所 | 呼び出し方 | 主な用途 |
| --- | --- | --- | --- |
| **Skill** | `.claude/skills/*/SKILL.md` | `/skill-name` or 自然言語 | 会話の中でワークフローを実行 |
| **Subagent** | `.claude/agents/*.md` | `Task(subagent_type="...", ...)` | 並列委託、長時間タスク、独立した context で実行 |

`backend-dev-manager` は両方を組み合わせて使います（Skill から Subagent を Task で呼び出す）。

## 命名規約

このディレクトリのスキルはすべて **`backend-` プレフィックス** で統一されています。
バックエンド開発に関連する作業（仕様策定・設計・実装・テスト・レビュー・PR）を同じ名前空間で一覧しやすくし、将来フロントエンド用 (`frontend-xxx`) やインフラ用 (`infra-xxx`) のスキルが追加されたときにも衝突しないようにするためです。

## 推奨される使い方（開発フロー）

```
[初見]     backend-codebase-explorer   ← プロジェクトを把握
   ↓
[企画]     backend-spec-creator        ← docs/spec/ に仕様策定
   ↓
[計画]     backend-work-planner        ← docs/work/ に実装計画
   ↓
[大規模]   backend-dev-manager         ← Phase 分解して並列実装
[通常]     直接実装                     ← 小さければ work からそのまま
   ↓
[テスト]   backend-test-planner → backend-test-writer
   ↓
[確認]     backend-code-reviewer / backend-rubber-duck
   ↓
[仕上げ]   backend-commit-splitter → backend-pr-describer
```

バグ修正の場合: `backend-debug-session → backend-test-writer → backend-code-reviewer` の順。

リファクタの場合: `backend-refactor-planner → backend-test-gap-finder → backend-test-writer → 実装`。

## 使い方

Skill は `.claude/skills/` に、Subagent は `.claude/agents/` に配置する必要があります。
`manji-standard-server/Makefile` を使うと、配置・更新・削除を一括で実行できます。

### 方法 0: Makefile で一括管理（推奨）

`manji-standard-server/Makefile` はプロジェクトルート（`manji-standard-server/` と同階層）から実行する前提で書かれています。

```bash
# プロジェクトルートで実行
cd /path/to/your-project

# 環境確認（source, 配置先, CLAUDE.md, docs/ の状態を一覧）
make -f manji-standard-server/Makefile doctor

# docs/{spec,work,knowledge}/ を作成
make -f manji-standard-server/Makefile docs-init

# skills + agents を .claude/ にコピー配置
make -f manji-standard-server/Makefile install

# 更新時の再配置
make -f manji-standard-server/Makefile sync

# 配置済みを削除
make -f manji-standard-server/Makefile uninstall
```

主要ターゲット:

| ターゲット | 用途 |
| --- | --- |
| `help` | 全ターゲット一覧（デフォルト） |
| `doctor` | 環境診断（source / destination / CLAUDE.md / docs） |
| `list` | 収録 skills / agents の一覧 |
| `install` | `.claude/` にコピー配置（`install-skills` / `install-agents` で個別実行可） |
| `link` | コピーでなくシンボリックリンクで配置（`manji-standard-server/` の更新が即時反映） |
| `sync` | 最新内容で再配置（install と同義） |
| `uninstall` / `clean` | 配置済み artifact を削除 |
| `docs-init` | `docs/spec/`・`docs/work/`・`docs/knowledge/` を作成 |

**Makefile を自分のプロジェクトルートにコピーして使う場合**:

```bash
cp manji-standard-server/Makefile ./Makefile
make help
```

既存の `Makefile` がある場合は `include manji-standard-server/Makefile` で取り込むか、必要なターゲットだけコピーしてください。

### 方法 0.5: Makefile を使わない手動配置

### 方法 1: プロジェクト別にコピー

他のプロジェクトで使う場合、それぞれを適切なディレクトリにコピー:

```bash
# Skills
cp -r <this-skills-repo>/skills/backend-rubber-duck \
      /path/to/other-project/.claude/skills/

# Subagents
cp <this-skills-repo>/agents/backend-worker.md \
   /path/to/other-project/.claude/agents/
cp <this-skills-repo>/agents/backend-reviewer.md \
   /path/to/other-project/.claude/agents/
```

### 方法 2: グローバル（ユーザーレベル）配置

全プロジェクトで共通に使いたい場合、`~/.claude/` 配下に配置:

```bash
# Skills
mkdir -p ~/.claude/skills
cp -r <this-skills-repo>/skills/* ~/.claude/skills/

# Subagents
mkdir -p ~/.claude/agents
cp <this-skills-repo>/agents/*.md ~/.claude/agents/
```

### 方法 3: シンボリックリンクで同期

このリポジトリを正本として扱い、他プロジェクトからリンクする運用:

```bash
# Skills
ln -s <this-skills-repo>/skills/backend-codebase-explorer \
      /path/to/other-project/.claude/skills/backend-codebase-explorer

# Subagents
ln -s <this-skills-repo>/agents/backend-worker.md \
      /path/to/other-project/.claude/agents/backend-worker.md
```

更新はこのディレクトリ側で行えば、リンク先すべてに反映されます。

### 起動方法

- **Skill**: スラッシュコマンド `/backend-codebase-explorer` または自然言語（description にマッチ）
- **Subagent**: 別 Skill / Agent 内から `Task(subagent_type="backend-worker", prompt="...")` で呼び出し

## 前提とするプロジェクト構造

開発系スキルは以下を前提にしています（特定プロジェクト固有の実装は含みません）:

```
<your-project>/
├── CLAUDE.md                 ← プロジェクト固有の言語・アーキテクチャ・規約を記載（後述）
├── docs/
│   ├── spec/                 ← 仕様書（backend-spec-creator / backend-spec-updater の出力先）
│   ├── work/                 ← 実装計画書・調査メモ（backend-work-planner / backend-dev-manager が使用）
│   └── knowledge/            ← ナレッジ蓄積（backend-knowledge-manager が使用、任意）
└── ...
```

`docs/spec/` / `docs/work/` / `docs/knowledge/` は存在しなければ各スキル・subagent が初回実行時に作成します。
既存プロジェクトに別の命名（`specs/`, `rfc/`, `design-docs/` 等）がある場合は、各 `SKILL.md` / agent ファイルの該当パスを書き換えてください。

## 言語・アーキテクチャの指定方法（重要）

このディレクトリの skills / subagents は **言語・フレームワーク・アーキテクチャを内部にハードコードしていません**。
代わりに、各 skill / agent が起動時に **`CLAUDE.md`（または `AGENTS.md`）を読む** ことでプロジェクト固有の前提を把握します。

プロジェクトを作ったら、**まず `CLAUDE.md` を作成** してください。書かないと、skill / agent は「既存コードから推測」モードで動きますが、精度は落ちます。

### CLAUDE.md の書き方テンプレート

以下の項目を埋めてください。省略可ですが、埋めるほど skill / agent の出力品質が上がります。

```markdown
# CLAUDE.md

このファイルは Claude Code に読ませるためのプロジェクト固有コンテキストです。
`manji-standard-server/` 由来の skills / subagents はこのファイルを必ず参照します。

## 技術スタック

- **言語**: <Go 1.22 / TypeScript 5 / Python 3.12 / Rust 1.80 / ...>
- **主要フレームワーク**: <framework とバージョン>
- **データストア**: <MySQL / PostgreSQL / Redis / ...>
- **通信**: <REST / gRPC / Connect RPC / GraphQL / ...>
- **ビルドツール**: <make / go / npm / cargo / ...>

## アーキテクチャ

- **パターン**: <DDD + Clean Architecture / MVC / Hexagonal / ...>
- **レイヤー構成**: <Handler → UseCase → Service → Repository → Entity のような依存方向>
- **コード生成**: <Proto → Go / OpenAPI → TS など、どんな自動生成があるか>
- **依存の方向**: <どの層がどの層を参照してよいか>

## ディレクトリ構造

```
pkg/
├── cmd/          # エントリポイント
├── domain/       # ドメイン層
├── infra/        # インフラ層
└── ...
proto/            # Proto 定義
```

## コーディング規約

- **命名**:
  - パッケージ: <lower_snake>
  - 型: <PascalCase>
  - インターフェース: <末尾に接尾辞を付けない / 付ける>
- **エラーハンドリング**: <標準 errors / 独自エラーパッケージ / errors.Is でラップ / ...>
- **コンテキスト**: <context.Context を第一引数に / 独自 context ラッパー / ...>
- **時間取得**: <time.Now() / 注入された Clock を使う / ...>
- **コメント**: <WHY のみ / 公開 API には godoc / ...>

## よく使うコマンド

- **ビルド**: `<command>`
- **テスト**: `<command>`
- **Lint**: `<command>`
- **フォーマット**: `<command>`
- **コード生成**: `<command>`（該当する場合）

## 規約上の禁則

- `<してはいけないこと 1>`
- `<してはいけないこと 2>`

## コミット・PR

- **ブランチ命名**: `<feat/name/topic 形式 など>`
- **コミットメッセージ**: <Conventional Commits / 日本語 / 英語 / プレフィックスルール>
- **PR テンプレート**: <ある場合は参照先>
```

### 具体例: Go + DDD + Proto のプロジェクトの場合

以下は「Go 言語 + DDD + Protocol Buffers」という典型的なバックエンド構成を採用する場合の **記述例** です。
実際の内部パッケージ名・関数名・ブランチ命名規則は各プロジェクトに合わせて書き換えてください。

```markdown
# CLAUDE.md

## 技術スタック

- **言語**: Go（バージョンは `.tool-versions` を参照）
- **API スタイル**: REST / gRPC / Connect RPC / GraphQL のいずれか
- **Proto**: Protocol Buffers + buf（`buf.build`）
- **HTTP サーバー**: Echo / Gin / net/http など
- **DI**: Wire / Uber Fx など
- **データストア**: MySQL / PostgreSQL / Redis
- **ビルド**: make + go

## アーキテクチャ

- **パターン**: DDD（ドメイン駆動設計） + クリーンアーキテクチャ
- **レイヤー構成**:
  ```
  Handler → Usecase → Service → Repository → Entity
                                     ↑
                                   Infrastructure 層が Repository を実装
  ```
- **依存方向**: 常に内側（ドメイン層）に向かう。Entity は他層を import しない
- **コード生成**: Proto から Entity / Repository インターフェース / Handler スケルトン / Converter を自動生成
- **手動実装**: Service, Usecase, Entity 拡張（例: `*_ext.go`）

## ディレクトリ構造

```
proto/                     # Proto 定義（手動）
pkg/
├── cmd/api/               # API エントリポイント
│   ├── handler/           # 手動実装
│   └── usecase/           # 手動実装
├── domain/
│   ├── entity/            # 自動生成 + 拡張
│   ├── service/           # 手動実装
│   └── repository/        # 自動生成（interface + 実装）
└── infra/                 # Repository の実装詳細
```

## コーディング規約

- **命名**:
  - パッケージ: 標準パッケージと衝突しない名前（必要に応じて prefix/suffix）
  - インターフェース: ドメイン名を含めない（`user.Service` OK、`user.UserService` NG）
  - Enum: 接尾辞統一（例: `xxxType`）
- **エラー**: 独自エラーパッケージでコードとメッセージを明示的に扱う（例: `myerrors.New(code, message)` / `myerrors.Wrap(err, code, message)`）
- **コンテキスト**: 独自 context ラッパーを使い、時刻・認証情報などを乗せて配る
- **時刻取得**: コンテキストから取得（直接 `time.Now()` を呼ばない）
- **ログ**: Zap / slog 等の構造化ログ
- **型エイリアス**: dto / entity の slice エイリアス以外は作らない
- **コア型**: int32/int64 ではなく int を使う
- **空レスポンス**: `*emptypb.Empty` は nil でなく `&emptypb.Empty{}` を返す
- **コメント**: 原則書かない。書く場合は WHY のみ。公開 API は godoc

## Proto 規約

- **Map 型禁止**: API 定義で map を使わない（repeated のキーバリューメッセージで代替）
- **外部キー**: `テーブル名_id` 形式。PK は `id`
- **サンプル**: サンプル用メッセージには識別可能な prefix を付ける（例: `Example`）

## よく使うコマンド

- **Proto 生成**: `make proto-gen`（proto 変更後は必須）
- **Mock 生成**: `make generate-mocks`（interface 変更後）
- **DB スキーマ同期**: `make db-sync`（DDL 変更後）
- **テスト**: `make test`
- **Lint**: `make lint`
- **フォーマット**: `make fmt`
- **コミット前チェック**: `make fmt && make lint && make test`

## 規約上の禁則

- 自動生成ファイル（`*.gen.go` 等）を直接編集しない
- proto 変更後にコード生成コマンドを忘れない
- Service / Usecase 層で外部 I/O（DB, HTTP）を直接触らない（Repository 経由）
- テストはテーブルドリブンで書く

## コミット・PR

- **ブランチ**: `{prefix}/{author}/{topic}`（例: `feat/alice/create-user`）
- **メッセージ**: Conventional Commits（`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`）
- **件名言語**: 日本語 or 英語をプロジェクトで統一
```

上記はあくまで **項目名とフォーマットの例** です。内部パッケージ名（`myerrors` の箇所など）、Make ターゲット名、ブランチ命名規則は各プロジェクトの実情に合わせて書き換えてください。

### Skill / Subagent 側の振る舞い

- CLAUDE.md が **あれば**: 書かれた規約に厳密に従う
- CLAUDE.md が **なければ**: 既存コードから推測して動く（精度は落ちる）
- CLAUDE.md に **書かれていない項目**: 既存コードから推測

そのため、**特殊な規約・暗黙のルール・禁則** ほど CLAUDE.md に明記する価値があります。コードから読めば自明なこと（シグネチャ、型）は書かなくて OK。

## ディレクトリ構造

```
manji-standard-server/
├── README.md                         ← このファイル
├── Makefile                          ← install / link / uninstall / docs-init 等の管理ターゲット
├── agents/                           ← Task tool で委託する subagent
│   ├── backend-worker.md
│   ├── backend-reviewer.md
│   ├── backend-designer.md
│   ├── backend-conservative.md
│   ├── backend-evolution.md
│   ├── backend-greenfield.md
│   ├── backend-git-rebase.md
│   └── backend-knowledge-manager.md
└── skills/                           ← 会話内で実行する workflow
    ├── backend-codebase-explorer/
    │   └── SKILL.md
    ├── backend-spec-creator/
    │   └── SKILL.md
    ├── backend-spec-updater/
    │   └── SKILL.md
    ├── backend-work-planner/
    │   └── SKILL.md
    ├── backend-dev-manager/
    │   └── SKILL.md
    ├── backend-refactor-planner/
    │   └── SKILL.md
    ├── backend-debug-session/
    │   └── SKILL.md
    ├── backend-test-planner/
    │   └── SKILL.md
    ├── backend-test-writer/
    │   └── SKILL.md
    ├── backend-test-gap-finder/
    │   └── SKILL.md
    ├── backend-code-reviewer/
    │   └── SKILL.md
    ├── backend-rubber-duck/
    │   └── SKILL.md
    ├── backend-commit-splitter/
    │   ├── SKILL.md
    │   └── principles.md
    └── backend-pr-describer/
        └── SKILL.md
```

## スキル追加のガイドライン

このディレクトリに追加するスキルは以下を満たすこと。

1. **言語・フレームワーク非依存** — 特定プロジェクトの命名規則やパスをハードコードしない
2. **自己完結** — 外部ファイル（CLAUDE.md の特定セクション等）に依存しない。必要な原則は `principles.md` として同梱する
3. **トリガー明示** — `description` にどんな発話で呼ばれるか具体例を書く
4. **短さ優先** — SKILL.md は原則 80 行以内。長くなる場合はサブファイルに分割

## ライセンス・再配布

中身は汎用的な内容のみで構成されているため、各自の作業に応じて自由にコピー・改変して構いません。

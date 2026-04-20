# インフラ層の差し替えパターン（InMemory ↔ 本番 DB）

Repository interface を介したクリーンアーキテクチャでは、**具象実装を DI で差し替える** ことでインフラを自由に切り替えられる。このドキュメントはその運用手順。

## 全体像

```
          [本番]                    [テスト]
             │                         │
             ▼                         ▼
   PostgresUserRepository    InMemoryUserRepository
       (手書き)                   (生成)
             │                         │
             └────── 同じ interface ──┘
                     UserRepository (生成)
                           ▲
                           │
                    Service / UseCase (手書き)
                      （実装に依存しない）
```

**ポイント**: Service / UseCase / Handler は Repository の **interface** にだけ依存し、具象は `main`（DI ワイヤリング）でしか登場しない。

## 差し替え手順

### 1. 本番実装を手書きで追加

生成ファイル（`*.gen.*`）とは別のファイル名で、同じ interface を満たすクラス／構造体を作る。

**Go**:
```go
// pkg/infra/repository/user_postgres_repository.go（.gen.go ではない）
type postgresUserRepository struct { db *sql.DB }

func NewPostgresUserRepository(db *sql.DB) repository.UserRepository { ... }
func (r *postgresUserRepository) Save(ctx context.Context, u *entity.User) error { ... }
func (r *postgresUserRepository) FindByID(ctx context.Context, id string) (*entity.User, error) { ... }
func (r *postgresUserRepository) FindByEmail(ctx context.Context, email string) (*entity.User, error) { ... }
```

**TypeScript**:
```ts
// src/infra/repository/postgres-user-repository.ts（.gen.ts ではない）
export class PostgresUserRepository implements UserRepository {
  constructor(private readonly pool: Pool) {}
  async save(user: User): Promise<void> { ... }
  async findById(id: string): Promise<User | null> { ... }
  async findByEmail(email: string): Promise<User | null> { ... }
}
```

### 2. `main` で DI を切り替える

環境変数でスイッチするのが定番:

**Go**:
```go
var userRepo repository.UserRepository
if dsn := os.Getenv("DATABASE_URL"); dsn != "" {
    db, _ := sql.Open("postgres", dsn)
    userRepo = infrarepo.NewPostgresUserRepository(db)
} else {
    userRepo = infrarepo.NewInMemoryUserRepository()
}
```

**TypeScript**:
```ts
const userRepo: UserRepository = process.env.DATABASE_URL
  ? new PostgresUserRepository(new Pool({ connectionString: process.env.DATABASE_URL }))
  : new InMemoryUserRepository();
```

### 3. 依存ドライバを追加

- Go: `go get github.com/jackc/pgx/v5/stdlib`
- TS: `npm install pg && npm install -D @types/pg`

### 4. Service / UseCase / Handler は変更不要

interface が抽象化してくれるため、ドメイン層・アプリケーション層に波及しない。

## 利点

- **テストは InMemory（生成）のまま** — 高速・依存ゼロ
- **結合テストは testcontainers 等で一時 DB** — 本番に近い環境
- **本番は Postgres / MySQL 等** — 永続化・スケール可能
- **切り替えコストは `main` の数行**

## 注意点

- InMemory 実装は生成物 (`*.gen.*`) なので **手で消さない**（次回の proto-gen で復活する）
- 本番実装を `*.gen.*` 名で書かない（自動生成規約に従うファイル名は予約）
- interface 側が変わる（proto が変わる）と両実装の修正が必要 — 生成物は自動、手書きはコンパイルエラーで検知

## フレームワーク依存外の一般パターンとして

この構成は romance-server / Go / Hono / Next どれでも成立する。共通コンセプト:

1. **ドメインは interface にしか依存しない**
2. **interface は可能なら自動生成で固定する**
3. **具象実装は複数作って DI で選ぶ**
4. **DI の分岐は `main`（エントリポイント）1 箇所のみ**

proto を使わないプロジェクトでも、手書きの interface に対して InMemory / 本番 DB の 2 実装を用意すれば同じ恩恵が得られる。

import type { User } from "@/domain/entity/user";
import type { UserRepository } from "@/domain/repository/user-repository";

class InMemoryUserRepository implements UserRepository {
  private readonly items = new Map<string, User>();

  async save(user: User): Promise<void> {
    this.items.set(user.id, user);
  }

  async findById(id: string): Promise<User | null> {
    return this.items.get(id) ?? null;
  }

  async findByEmail(email: string): Promise<User | null> {
    for (const user of this.items.values()) {
      if (user.email === email) return user;
    }
    return null;
  }
}

// Next.js の dev サーバーは HMR でモジュールが再評価されるので、
// グローバルに保持して揮発を防ぐ（本番 DB 接続時は不要）
declare global {
  // eslint-disable-next-line no-var
  var __userRepo: InMemoryUserRepository | undefined;
}

export const userRepositorySingleton: InMemoryUserRepository =
  globalThis.__userRepo ?? (globalThis.__userRepo = new InMemoryUserRepository());

import { randomUUID } from "node:crypto";
import { User } from "../entity/user.gen.js";
import { UserNotFoundError, type UserRepository } from "../repository/user-repository.gen.js";

export class EmailAlreadyTakenError extends Error {
  constructor() {
    super("email already taken");
    this.name = "EmailAlreadyTakenError";
  }
}

export type NewUserParams = {
  email: string;
  name: string;
};

export type UpsertUserParams = {
  id: string;
  email: string;
  name: string;
  createdAtUnix: number;
};

export class UserService {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  list(): Promise<User[]> {
    return this.userRepo.selectAll();
  }

  listByCursor(limit: number, afterId: string): Promise<User[]> {
    return this.userRepo.selectByCursor(limit, afterId === "" ? null : afterId);
  }

  getById(id: string): Promise<User | null> {
    return this.userRepo.selectByPk(id);
  }

  getByEmail(email: string): Promise<User | null> {
    return this.userRepo.selectByEmail(email);
  }

  async create(email: string, name: string): Promise<User> {
    const existing = await this.userRepo.selectByEmail(email);
    if (existing) throw new EmailAlreadyTakenError();
    const user = User.create({
      id: randomUUID(),
      email,
      name,
      createdAt: this.clock(),
    });
    await this.userRepo.insert(user);
    return user;
  }

  async bulkCreate(params: NewUserParams[]): Promise<User[]> {
    const now = this.clock();
    const users = params.map((p) =>
      User.create({ id: randomUUID(), email: p.email, name: p.name, createdAt: now }),
    );
    await this.userRepo.bulkInsert(users);
    return users;
  }

  async upsert(p: UpsertUserParams): Promise<User> {
    const user = User.create({
      id: p.id,
      email: p.email,
      name: p.name,
      createdAt: p.createdAtUnix === 0 ? this.clock() : new Date(p.createdAtUnix * 1000),
    });
    await this.userRepo.upsert(user);
    return user;
  }

  async bulkUpsert(params: UpsertUserParams[]): Promise<User[]> {
    const now = this.clock();
    const users = params.map((p) =>
      User.create({
        id: p.id,
        email: p.email,
        name: p.name,
        createdAt: p.createdAtUnix === 0 ? now : new Date(p.createdAtUnix * 1000),
      }),
    );
    await this.userRepo.bulkUpsert(users);
    return users;
  }

  async update(id: string, email: string, name: string): Promise<User> {
    const current = await this.userRepo.selectByPk(id);
    if (!current) throw new UserNotFoundError();
    const updated = User.create({ id, email, name, createdAt: current.createdAt });
    await this.userRepo.update(updated);
    return updated;
  }

  delete(id: string): Promise<void> {
    return this.userRepo.delete(id);
  }

  bulkDelete(ids: string[]): Promise<void> {
    return this.userRepo.bulkDelete(ids);
  }

  deleteAll(): Promise<void> {
    return this.userRepo.deleteAll();
  }
}

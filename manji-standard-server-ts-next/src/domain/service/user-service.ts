import { randomUUID } from "node:crypto";
import { User } from "@/domain/entity/user";
import type { UserRepository } from "@/domain/repository/user-repository";

export class EmailAlreadyTakenError extends Error {
  constructor() {
    super("email already taken");
    this.name = "EmailAlreadyTakenError";
  }
}

export class UserService {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async create(email: string, name: string): Promise<User> {
    const existing = await this.userRepo.findByEmail(email);
    if (existing) throw new EmailAlreadyTakenError();
    const user = User.create({
      id: randomUUID(),
      email,
      name,
      createdAt: this.clock(),
    });
    await this.userRepo.save(user);
    return user;
  }

  async getById(id: string): Promise<User | null> {
    return this.userRepo.findById(id);
  }
}

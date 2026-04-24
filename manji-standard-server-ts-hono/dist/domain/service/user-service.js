import { randomUUID } from "node:crypto";
import { User } from "../entity/user.gen.js";
import { UserNotFoundError } from "../repository/user-repository.gen.js";
export class EmailAlreadyTakenError extends Error {
    constructor() {
        super("email already taken");
        this.name = "EmailAlreadyTakenError";
    }
}
export class UserService {
    userRepo;
    clock;
    constructor(userRepo, clock = () => new Date()) {
        this.userRepo = userRepo;
        this.clock = clock;
    }
    list() {
        return this.userRepo.selectAll();
    }
    listByCursor(limit, afterId) {
        return this.userRepo.selectByCursor(limit, afterId === "" ? null : afterId);
    }
    getById(id) {
        return this.userRepo.selectByPk(id);
    }
    getByEmail(email) {
        return this.userRepo.selectByEmail(email);
    }
    async create(email, name) {
        const existing = await this.userRepo.selectByEmail(email);
        if (existing)
            throw new EmailAlreadyTakenError();
        const user = User.create({
            id: randomUUID(),
            email,
            name,
            createdAt: this.clock(),
        });
        await this.userRepo.insert(user);
        return user;
    }
    async bulkCreate(params) {
        const now = this.clock();
        const users = params.map((p) => User.create({ id: randomUUID(), email: p.email, name: p.name, createdAt: now }));
        await this.userRepo.bulkInsert(users);
        return users;
    }
    async upsert(p) {
        const user = User.create({
            id: p.id,
            email: p.email,
            name: p.name,
            createdAt: p.createdAtUnix === 0 ? this.clock() : new Date(p.createdAtUnix * 1000),
        });
        await this.userRepo.upsert(user);
        return user;
    }
    async bulkUpsert(params) {
        const now = this.clock();
        const users = params.map((p) => User.create({
            id: p.id,
            email: p.email,
            name: p.name,
            createdAt: p.createdAtUnix === 0 ? now : new Date(p.createdAtUnix * 1000),
        }));
        await this.userRepo.bulkUpsert(users);
        return users;
    }
    async update(id, email, name) {
        const current = await this.userRepo.selectByPk(id);
        if (!current)
            throw new UserNotFoundError();
        const updated = User.create({ id, email, name, createdAt: current.createdAt });
        await this.userRepo.update(updated);
        return updated;
    }
    delete(id) {
        return this.userRepo.delete(id);
    }
    bulkDelete(ids) {
        return this.userRepo.bulkDelete(ids);
    }
    deleteAll() {
        return this.userRepo.deleteAll();
    }
}
//# sourceMappingURL=user-service.js.map
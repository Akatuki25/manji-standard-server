import { randomUUID } from "node:crypto";
import { User } from "../entity/user.gen.js";
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
    async create(email, name) {
        const existing = await this.userRepo.selectByEmail(email);
        if (existing) {
            throw new EmailAlreadyTakenError();
        }
        const user = User.create({
            id: randomUUID(),
            email,
            name,
            createdAt: this.clock(),
        });
        await this.userRepo.insert(user);
        return user;
    }
    async getById(id) {
        return this.userRepo.selectByPk(id);
    }
}
//# sourceMappingURL=user-service.js.map
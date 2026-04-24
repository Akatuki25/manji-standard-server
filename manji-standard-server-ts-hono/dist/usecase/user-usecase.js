import { fromUser, fromUsers } from "../dto/user.gen.js";
export class UserUsecaseImpl {
    userService;
    constructor(userService) {
        this.userService = userService;
    }
    async listUsers(_input) {
        return fromUsers(await this.userService.list());
    }
    async listUsersByCursor(input) {
        return fromUsers(await this.userService.listByCursor(input.limit, input.afterId));
    }
    async getUser(input) {
        const u = await this.userService.getById(input.id);
        return u ? fromUser(u) : null;
    }
    async getUserByEmail(input) {
        const u = await this.userService.getByEmail(input.email);
        return u ? fromUser(u) : null;
    }
    async createUser(input) {
        return fromUser(await this.userService.create(input.email, input.name));
    }
    async bulkCreateUsers(input) {
        const users = await this.userService.bulkCreate(input.users.map((p) => ({ email: p.email, name: p.name })));
        return fromUsers(users);
    }
    async upsertUser(input) {
        return fromUser(await this.userService.upsert({
            id: input.id,
            email: input.email,
            name: input.name,
            createdAtUnix: input.createdAtUnix,
        }));
    }
    async bulkUpsertUsers(input) {
        const users = await this.userService.bulkUpsert(input.users.map((p) => ({
            id: p.id,
            email: p.email,
            name: p.name,
            createdAtUnix: p.created_at_unix,
        })));
        return fromUsers(users);
    }
    async updateUser(input) {
        return fromUser(await this.userService.update(input.id, input.email, input.name));
    }
    async deleteUser(input) {
        await this.userService.delete(input.id);
    }
    async bulkDeleteUsers(input) {
        await this.userService.bulkDelete(input.ids);
    }
    async deleteAllUsers(_input) {
        await this.userService.deleteAll();
    }
}
//# sourceMappingURL=user-usecase.js.map
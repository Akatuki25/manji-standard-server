export class InMemoryUserRepository {
    items = new Map();
    async save(user) {
        this.items.set(user.id, user);
    }
    async findById(id) {
        return this.items.get(id) ?? null;
    }
    async findByEmail(email) {
        for (const user of this.items.values()) {
            if (user.email === email) {
                return user;
            }
        }
        return null;
    }
}
//# sourceMappingURL=in-memory-user-repository.js.map
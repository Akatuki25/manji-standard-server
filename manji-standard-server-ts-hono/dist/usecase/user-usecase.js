export class UserUsecaseImpl {
    userService;
    constructor(userService) {
        this.userService = userService;
    }
    async createUser(input) {
        return this.userService.create(input.email, input.name);
    }
    async getUser(input) {
        return this.userService.getById(input.id);
    }
}
//# sourceMappingURL=user-usecase.js.map
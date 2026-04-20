export class UserUsecase {
    userService;
    constructor(userService) {
        this.userService = userService;
    }
    createUser(email, name) {
        return this.userService.create(email, name);
    }
    getUser(id) {
        return this.userService.getById(id);
    }
}
//# sourceMappingURL=user-usecase.js.map
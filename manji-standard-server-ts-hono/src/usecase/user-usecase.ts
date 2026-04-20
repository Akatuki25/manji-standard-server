import type { User } from "../domain/entity/user.gen.js";
import type { UserService } from "../domain/service/user-service.js";

export class UserUsecase {
  constructor(private readonly userService: UserService) {}

  createUser(email: string, name: string): Promise<User> {
    return this.userService.create(email, name);
  }

  getUser(id: string): Promise<User | null> {
    return this.userService.getById(id);
  }
}

import type { User } from "../domain/entity/user.gen.js";
import type { UserService } from "../domain/service/user-service.js";
import type {
  CreateUserInput,
  GetUserInput,
  UserUsecase,
} from "./user-usecase-interface.gen.js";

export class UserUsecaseImpl implements UserUsecase {
  constructor(private readonly userService: UserService) {}

  async createUser(input: CreateUserInput): Promise<User> {
    return this.userService.create(input.email, input.name);
  }

  async getUser(input: GetUserInput): Promise<User | null> {
    return this.userService.getById(input.id);
  }
}

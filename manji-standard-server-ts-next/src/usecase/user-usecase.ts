import type { User } from "@/domain/entity/user.gen";
import type { UserService } from "@/domain/service/user-service";
import type {
  CreateUserInput,
  GetUserInput,
  UserUsecase,
} from "@/usecase/user-usecase-interface.gen";

export class UserUsecaseImpl implements UserUsecase {
  constructor(private readonly userService: UserService) {}

  async createUser(input: CreateUserInput): Promise<User> {
    return this.userService.create(input.email, input.name);
  }

  async getUser(input: GetUserInput): Promise<User | null> {
    return this.userService.getById(input.id);
  }
}

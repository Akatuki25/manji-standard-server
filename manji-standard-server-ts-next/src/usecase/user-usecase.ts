import type { User } from "@/domain/entity/user";
import type { UserService } from "@/domain/service/user-service";

export type CreateUserInput = {
  email: string;
  name: string;
};

export class UserUsecase {
  constructor(private readonly userService: UserService) {}

  createUser(input: CreateUserInput): Promise<User> {
    return this.userService.create(input.email, input.name);
  }

  getUser(id: string): Promise<User | null> {
    return this.userService.getById(id);
  }
}

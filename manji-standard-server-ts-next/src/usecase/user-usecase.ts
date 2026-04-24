import { fromUser, fromUsers, type UserDTO } from "@/dto/user.gen";
import type { UserService } from "@/domain/service/user-service";
import type {
  BulkCreateUsersInput,
  BulkDeleteUsersInput,
  BulkUpsertUsersInput,
  CreateUserInput,
  DeleteAllUsersInput,
  DeleteUserInput,
  GetUserByEmailInput,
  GetUserInput,
  ListUsersByCursorInput,
  ListUsersInput,
  UpdateUserInput,
  UpsertUserInput,
  UserUsecase,
} from "@/usecase/user-usecase-interface.gen";

export class UserUsecaseImpl implements UserUsecase {
  constructor(private readonly userService: UserService) {}

  async listUsers(_input: ListUsersInput): Promise<UserDTO[]> {
    return fromUsers(await this.userService.list());
  }

  async listUsersByCursor(input: ListUsersByCursorInput): Promise<UserDTO[]> {
    return fromUsers(await this.userService.listByCursor(input.limit, input.afterId));
  }

  async getUser(input: GetUserInput): Promise<UserDTO | null> {
    const u = await this.userService.getById(input.id);
    return u ? fromUser(u) : null;
  }

  async getUserByEmail(input: GetUserByEmailInput): Promise<UserDTO | null> {
    const u = await this.userService.getByEmail(input.email);
    return u ? fromUser(u) : null;
  }

  async createUser(input: CreateUserInput): Promise<UserDTO | null> {
    return fromUser(await this.userService.create(input.email, input.name));
  }

  async bulkCreateUsers(input: BulkCreateUsersInput): Promise<UserDTO[]> {
    const users = await this.userService.bulkCreate(
      input.users.map((p) => ({ email: p.email, name: p.name })),
    );
    return fromUsers(users);
  }

  async upsertUser(input: UpsertUserInput): Promise<UserDTO | null> {
    return fromUser(
      await this.userService.upsert({
        id: input.id,
        email: input.email,
        name: input.name,
        createdAtUnix: input.createdAtUnix,
      }),
    );
  }

  async bulkUpsertUsers(input: BulkUpsertUsersInput): Promise<UserDTO[]> {
    const users = await this.userService.bulkUpsert(
      input.users.map((p) => ({
        id: p.id,
        email: p.email,
        name: p.name,
        createdAtUnix: p.created_at_unix,
      })),
    );
    return fromUsers(users);
  }

  async updateUser(input: UpdateUserInput): Promise<UserDTO | null> {
    return fromUser(await this.userService.update(input.id, input.email, input.name));
  }

  async deleteUser(input: DeleteUserInput): Promise<void> {
    await this.userService.delete(input.id);
  }

  async bulkDeleteUsers(input: BulkDeleteUsersInput): Promise<void> {
    await this.userService.bulkDelete(input.ids);
  }

  async deleteAllUsers(_input: DeleteAllUsersInput): Promise<void> {
    await this.userService.deleteAll();
  }
}

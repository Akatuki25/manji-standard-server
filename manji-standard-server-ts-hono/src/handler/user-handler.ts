import { Code, ConnectError, type ServiceImpl } from "@connectrpc/connect";
import {
  CreateUserRequest,
  CreateUserResponse,
  GetUserRequest,
  GetUserResponse,
  User as UserPb,
} from "../gen/user/v1/user_pb.js";
import type { UserService as UserServiceDef } from "../gen/user/v1/user_connect.js";
import { EmailAlreadyTakenError } from "../domain/service/user-service.js";
import type { User } from "../domain/entity/user.gen.js";
import type { UserUsecase } from "../usecase/user-usecase.js";

function toPb(user: User): UserPb {
  return new UserPb({
    id: user.id,
    email: user.email,
    name: user.name,
    createdAtUnix: BigInt(Math.floor(user.createdAt.getTime() / 1000)),
  });
}

export function createUserServiceImpl(
  userUsecase: UserUsecase,
): ServiceImpl<typeof UserServiceDef> {
  return {
    async createUser(req: CreateUserRequest): Promise<CreateUserResponse> {
      try {
        const user = await userUsecase.createUser(req.email, req.name);
        return new CreateUserResponse({ user: toPb(user) });
      } catch (err) {
        if (err instanceof EmailAlreadyTakenError) {
          throw new ConnectError(err.message, Code.AlreadyExists);
        }
        const message = err instanceof Error ? err.message : "unknown error";
        throw new ConnectError(message, Code.InvalidArgument);
      }
    },

    async getUser(req: GetUserRequest): Promise<GetUserResponse> {
      const user = await userUsecase.getUser(req.id);
      if (!user) {
        throw new ConnectError("user not found", Code.NotFound);
      }
      return new GetUserResponse({ user: toPb(user) });
    },
  };
}

import { Code, ConnectError } from "@connectrpc/connect";
import { CreateUserResponse, GetUserResponse, User as UserPb, } from "../gen/user/v1/user_pb.js";
import { EmailAlreadyTakenError } from "../domain/service/user-service.js";
function toPb(user) {
    return new UserPb({
        id: user.id,
        email: user.email,
        name: user.name,
        createdAtUnix: BigInt(Math.floor(user.createdAt.getTime() / 1000)),
    });
}
export function createUserServiceImpl(userUsecase) {
    return {
        async createUser(req) {
            try {
                const user = await userUsecase.createUser(req.email, req.name);
                return new CreateUserResponse({ user: toPb(user) });
            }
            catch (err) {
                if (err instanceof EmailAlreadyTakenError) {
                    throw new ConnectError(err.message, Code.AlreadyExists);
                }
                const message = err instanceof Error ? err.message : "unknown error";
                throw new ConnectError(message, Code.InvalidArgument);
            }
        },
        async getUser(req) {
            const user = await userUsecase.getUser(req.id);
            if (!user) {
                throw new ConnectError("user not found", Code.NotFound);
            }
            return new GetUserResponse({ user: toPb(user) });
        },
    };
}
//# sourceMappingURL=user-handler.js.map
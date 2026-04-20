import { UserService } from "@/domain/service/user-service";
import { userRepositorySingleton } from "@/infra/repository/in-memory-user-repository";
import { UserUsecase } from "@/usecase/user-usecase";

const userService = new UserService(userRepositorySingleton);
export const userUsecase = new UserUsecase(userService);

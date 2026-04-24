package usecase

import (
	"context"

	"github.com/example/manji-standard-server-go/internal/domain/service"
	"github.com/example/manji-standard-server-go/internal/dto"
)

// UserUsecaseImpl は生成された UserUsecase interface の実装。
// 戻り値はすべて DTO に変換してから返す（クライアント JSON シリアライズ表現の境界）。
type UserUsecaseImpl struct {
	userService *service.UserService
}

var _ UserUsecase = (*UserUsecaseImpl)(nil)

func NewUserUsecase(userService *service.UserService) *UserUsecaseImpl {
	return &UserUsecaseImpl{userService: userService}
}

func (u *UserUsecaseImpl) ListUsers(ctx context.Context, _ ListUsersInput) ([]*dto.UserDTO, error) {
	users, err := u.userService.List(ctx)
	if err != nil {
		return nil, err
	}
	return dto.FromUsers(users), nil
}

func (u *UserUsecaseImpl) ListUsersByCursor(ctx context.Context, input ListUsersByCursorInput) ([]*dto.UserDTO, error) {
	users, err := u.userService.ListByCursor(ctx, int(input.Limit), input.AfterID)
	if err != nil {
		return nil, err
	}
	return dto.FromUsers(users), nil
}

func (u *UserUsecaseImpl) GetUser(ctx context.Context, input GetUserInput) (*dto.UserDTO, error) {
	user, err := u.userService.GetByID(ctx, input.ID)
	if err != nil {
		return nil, err
	}
	return dto.FromUser(user), nil
}

func (u *UserUsecaseImpl) GetUserByEmail(ctx context.Context, input GetUserByEmailInput) (*dto.UserDTO, error) {
	user, err := u.userService.GetByEmail(ctx, input.Email)
	if err != nil {
		return nil, err
	}
	return dto.FromUser(user), nil
}

func (u *UserUsecaseImpl) CreateUser(ctx context.Context, input CreateUserInput) (*dto.UserDTO, error) {
	user, err := u.userService.Create(ctx, input.Email, input.Name)
	if err != nil {
		return nil, err
	}
	return dto.FromUser(user), nil
}

func (u *UserUsecaseImpl) BulkCreateUsers(ctx context.Context, input BulkCreateUsersInput) ([]*dto.UserDTO, error) {
	params := make([]service.NewUserParams, 0, len(input.Users))
	for _, p := range input.Users {
		params = append(params, service.NewUserParams{Email: p.Email, Name: p.Name})
	}
	users, err := u.userService.BulkCreate(ctx, params)
	if err != nil {
		return nil, err
	}
	return dto.FromUsers(users), nil
}

func (u *UserUsecaseImpl) UpsertUser(ctx context.Context, input UpsertUserInput) (*dto.UserDTO, error) {
	user, err := u.userService.Upsert(ctx, input.ID, input.Email, input.Name, input.CreatedAtUnix)
	if err != nil {
		return nil, err
	}
	return dto.FromUser(user), nil
}

func (u *UserUsecaseImpl) BulkUpsertUsers(ctx context.Context, input BulkUpsertUsersInput) ([]*dto.UserDTO, error) {
	params := make([]service.UpsertUserParams, 0, len(input.Users))
	for _, p := range input.Users {
		params = append(params, service.UpsertUserParams{
			ID:            p.ID,
			Email:         p.Email,
			Name:          p.Name,
			CreatedAtUnix: p.CreatedAtUnix,
		})
	}
	users, err := u.userService.BulkUpsert(ctx, params)
	if err != nil {
		return nil, err
	}
	return dto.FromUsers(users), nil
}

func (u *UserUsecaseImpl) UpdateUser(ctx context.Context, input UpdateUserInput) (*dto.UserDTO, error) {
	user, err := u.userService.Update(ctx, input.ID, input.Email, input.Name)
	if err != nil {
		return nil, err
	}
	return dto.FromUser(user), nil
}

func (u *UserUsecaseImpl) DeleteUser(ctx context.Context, input DeleteUserInput) error {
	return u.userService.Delete(ctx, input.ID)
}

func (u *UserUsecaseImpl) BulkDeleteUsers(ctx context.Context, input BulkDeleteUsersInput) error {
	return u.userService.BulkDelete(ctx, input.Ids)
}

func (u *UserUsecaseImpl) DeleteAllUsers(ctx context.Context, _ DeleteAllUsersInput) error {
	return u.userService.DeleteAll(ctx)
}

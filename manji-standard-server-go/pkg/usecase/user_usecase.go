package usecase

import (
	"context"

	"github.com/example/manji-standard-server-go/pkg/domain/entity"
	"github.com/example/manji-standard-server-go/pkg/domain/service"
)

// UserUsecaseImpl は生成された UserUsecase interface の実装。
type UserUsecaseImpl struct {
	userService *service.UserService
}

var _ UserUsecase = (*UserUsecaseImpl)(nil)

func NewUserUsecase(userService *service.UserService) *UserUsecaseImpl {
	return &UserUsecaseImpl{userService: userService}
}

func (u *UserUsecaseImpl) CreateUser(ctx context.Context, input CreateUserInput) (*entity.User, error) {
	return u.userService.Create(ctx, input.Email, input.Name)
}

func (u *UserUsecaseImpl) GetUser(ctx context.Context, input GetUserInput) (*entity.User, error) {
	return u.userService.GetByID(ctx, input.ID)
}

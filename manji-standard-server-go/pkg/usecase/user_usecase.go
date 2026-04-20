package usecase

import (
	"context"

	"github.com/example/manji-standard-server-go/pkg/domain/entity"
	"github.com/example/manji-standard-server-go/pkg/domain/service"
)

type UserUsecase struct {
	userService *service.UserService
}

func NewUserUsecase(userService *service.UserService) *UserUsecase {
	return &UserUsecase{userService: userService}
}

func (u *UserUsecase) CreateUser(ctx context.Context, email, name string) (*entity.User, error) {
	return u.userService.Create(ctx, email, name)
}

func (u *UserUsecase) GetUser(ctx context.Context, id string) (*entity.User, error) {
	return u.userService.GetByID(ctx, id)
}

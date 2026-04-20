package handler

import (
	"context"
	"errors"

	"connectrpc.com/connect"
	userv1 "github.com/example/manji-standard-server-go/gen/user/v1"
	"github.com/example/manji-standard-server-go/gen/user/v1/userv1connect"
	"github.com/example/manji-standard-server-go/pkg/domain/entity"
	"github.com/example/manji-standard-server-go/pkg/domain/service"
	"github.com/example/manji-standard-server-go/pkg/usecase"
)

type UserHandler struct {
	userUsecase *usecase.UserUsecase
}

var _ userv1connect.UserServiceHandler = (*UserHandler)(nil)

func NewUserHandler(userUsecase *usecase.UserUsecase) *UserHandler {
	return &UserHandler{userUsecase: userUsecase}
}

func toPbUser(u *entity.User) *userv1.User {
	return &userv1.User{
		Id:            u.ID,
		Email:         u.Email,
		Name:          u.Name,
		CreatedAtUnix: u.CreatedAt.Unix(),
	}
}

func (h *UserHandler) CreateUser(
	ctx context.Context,
	req *connect.Request[userv1.CreateUserRequest],
) (*connect.Response[userv1.CreateUserResponse], error) {
	user, err := h.userUsecase.CreateUser(ctx, req.Msg.GetEmail(), req.Msg.GetName())
	if err != nil {
		if errors.Is(err, service.ErrEmailAlreadyTaken) {
			return nil, connect.NewError(connect.CodeAlreadyExists, err)
		}
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}
	return connect.NewResponse(&userv1.CreateUserResponse{User: toPbUser(user)}), nil
}

func (h *UserHandler) GetUser(
	ctx context.Context,
	req *connect.Request[userv1.GetUserRequest],
) (*connect.Response[userv1.GetUserResponse], error) {
	user, err := h.userUsecase.GetUser(ctx, req.Msg.GetId())
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	if user == nil {
		return nil, connect.NewError(connect.CodeNotFound, errors.New("user not found"))
	}
	return connect.NewResponse(&userv1.GetUserResponse{User: toPbUser(user)}), nil
}

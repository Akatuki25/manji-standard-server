package service

import (
	"context"
	"errors"
	"time"

	"github.com/example/manji-standard-server-go/pkg/domain/entity"
	"github.com/example/manji-standard-server-go/pkg/domain/repository"
	"github.com/google/uuid"
)

type UserService struct {
	userRepo repository.UserRepository
	clock    func() time.Time
}

func NewUserService(userRepo repository.UserRepository, clock func() time.Time) *UserService {
	if clock == nil {
		clock = time.Now
	}
	return &UserService{userRepo: userRepo, clock: clock}
}

var ErrEmailAlreadyTaken = errors.New("email already taken")

func (s *UserService) Create(ctx context.Context, email, name string) (*entity.User, error) {
	existing, err := s.userRepo.SelectByEmail(ctx, email)
	if err != nil {
		return nil, err
	}
	if existing != nil {
		return nil, ErrEmailAlreadyTaken
	}

	user, err := entity.NewUser(uuid.NewString(), email, name, s.clock())
	if err != nil {
		return nil, err
	}
	if err := s.userRepo.Insert(ctx, user); err != nil {
		return nil, err
	}
	return user, nil
}

func (s *UserService) GetByID(ctx context.Context, id string) (*entity.User, error) {
	return s.userRepo.SelectByPK(ctx, id)
}

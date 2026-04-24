package service

import (
	"context"
	"errors"
	"time"

	"github.com/example/manji-standard-server-go/internal/domain/entity"
	"github.com/example/manji-standard-server-go/internal/domain/repository"
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

func (s *UserService) List(ctx context.Context) ([]*entity.User, error) {
	return s.userRepo.SelectAll(ctx)
}

// ListByCursor は cursor pagination で users を返す。afterID が空のときは先頭ページ。
func (s *UserService) ListByCursor(ctx context.Context, limit int, afterID string) ([]*entity.User, error) {
	var after *string
	if afterID != "" {
		after = &afterID
	}
	return s.userRepo.SelectByCursor(ctx, limit, after)
}

func (s *UserService) GetByID(ctx context.Context, id string) (*entity.User, error) {
	return s.userRepo.SelectByPK(ctx, id)
}

func (s *UserService) GetByEmail(ctx context.Context, email string) (*entity.User, error) {
	return s.userRepo.SelectByEmail(ctx, email)
}

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

// BulkCreate は複数ユーザーをまとめて作成する。各要素ごとに新規 UUID + 現在時刻を割り振る。
// email の事前重複チェックは行わない（DB 一意制約に任せ、Postgres 側のエラーを ErrUserAlreadyExists で受ける）。
func (s *UserService) BulkCreate(ctx context.Context, params []NewUserParams) ([]*entity.User, error) {
	now := s.clock()
	users := make([]*entity.User, 0, len(params))
	for _, p := range params {
		u, err := entity.NewUser(uuid.NewString(), p.Email, p.Name, now)
		if err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	if err := s.userRepo.BulkInsert(ctx, users); err != nil {
		return nil, err
	}
	return users, nil
}

// NewUserParams は BulkCreate の入力 1 件分。
type NewUserParams struct {
	Email string
	Name  string
}

// Upsert は与えられた id でユーザーを upsert する。created_at は呼び出し側指定（0 の場合は現在時刻）。
func (s *UserService) Upsert(ctx context.Context, id, email, name string, createdAtUnix int64) (*entity.User, error) {
	createdAt := unixOrNow(createdAtUnix, s.clock)
	user, err := entity.NewUser(id, email, name, createdAt)
	if err != nil {
		return nil, err
	}
	if err := s.userRepo.Upsert(ctx, user); err != nil {
		return nil, err
	}
	return user, nil
}

// BulkUpsert は複数ユーザーを upsert する。
type UpsertUserParams struct {
	ID            string
	Email         string
	Name          string
	CreatedAtUnix int64
}

func (s *UserService) BulkUpsert(ctx context.Context, params []UpsertUserParams) ([]*entity.User, error) {
	now := s.clock
	users := make([]*entity.User, 0, len(params))
	for _, p := range params {
		u, err := entity.NewUser(p.ID, p.Email, p.Name, unixOrNow(p.CreatedAtUnix, now))
		if err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	if err := s.userRepo.BulkUpsert(ctx, users); err != nil {
		return nil, err
	}
	return users, nil
}

// Update は既存レコードに対する部分更新。空文字フィールドは更新しない方針にしてもよいが、
// ここでは proto の意味どおり全フィールドを上書きする。存在しなければ ErrUserNotFound。
func (s *UserService) Update(ctx context.Context, id, email, name string) (*entity.User, error) {
	current, err := s.userRepo.SelectByPK(ctx, id)
	if err != nil {
		return nil, err
	}
	if current == nil {
		return nil, repository.ErrUserNotFound
	}
	updated, err := entity.NewUser(id, email, name, current.CreatedAt)
	if err != nil {
		return nil, err
	}
	if err := s.userRepo.Update(ctx, updated); err != nil {
		return nil, err
	}
	return updated, nil
}

func (s *UserService) Delete(ctx context.Context, id string) error {
	return s.userRepo.Delete(ctx, id)
}

func (s *UserService) BulkDelete(ctx context.Context, ids []string) error {
	return s.userRepo.BulkDelete(ctx, ids)
}

func (s *UserService) DeleteAll(ctx context.Context) error {
	return s.userRepo.DeleteAll(ctx)
}

// unixOrNow は createdAtUnix が 0 のとき clock() を、そうでなければ Unix(...) を返す。
func unixOrNow(unixSec int64, clock func() time.Time) time.Time {
	if unixSec == 0 {
		return clock()
	}
	return time.Unix(unixSec, 0)
}

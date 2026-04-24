package main

import (
	"fmt"
	"log"
	"log/slog"
	"net/http"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"

	"github.com/example/manji-standard-server-go/internal/di"
	"github.com/example/manji-standard-server-go/internal/domain/service"
	infrarepo "github.com/example/manji-standard-server-go/internal/infra/repository"
	"github.com/example/manji-standard-server-go/internal/usecase"
	"github.com/example/manji-standard-server-go/pkg/util/env"
	"github.com/example/manji-standard-server-go/pkg/util/logger"
	"github.com/example/manji-standard-server-go/pkg/util/tx"
)

func main() {
	logger.Init()

	dsn := fmt.Sprintf(
		"host=%s port=%d user=%s password=%s dbname=%s sslmode=disable",
		env.DBHost(), env.DBPort(), env.DBUser(), env.DBPassword(), env.DBName(),
	)
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{TranslateError: true})
	if err != nil {
		log.Fatalf("connect db: %v", err)
	}
	tx.Init(db)

	if err := infrarepo.AutoMigrateUser(db); err != nil {
		log.Fatalf("auto-migrate user: %v", err)
	}

	userRepo := infrarepo.NewPostgresUserRepository()
	userService := service.NewUserService(userRepo, nil)
	userUsecase := usecase.NewUserUsecase(userService)

	handlers := di.NewHandlers(userUsecase)

	mux := http.NewServeMux()
	handlers.Register(mux)
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	addr := env.Port()
	slog.Info("listening", "addr", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatal(err)
	}
}

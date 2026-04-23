package main

import (
	"log"
	"net/http"
	"os"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"

	"github.com/example/manji-standard-server-go/pkg/di"
	"github.com/example/manji-standard-server-go/pkg/domain/service"
	infrarepo "github.com/example/manji-standard-server-go/pkg/infra/repository"
	"github.com/example/manji-standard-server-go/pkg/usecase"
)

func main() {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		log.Fatal("DATABASE_URL is required (example: postgres://user:pass@localhost:5432/app?sslmode=disable)")
	}
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{TranslateError: true})
	if err != nil {
		log.Fatalf("connect db: %v", err)
	}
	if err := infrarepo.AutoMigrateUser(db); err != nil {
		log.Fatalf("auto-migrate: %v", err)
	}

	userRepo := infrarepo.NewPostgresUserRepository(db)
	userService := service.NewUserService(userRepo, nil)
	userUsecase := usecase.NewUserUsecase(userService)

	handlers := di.NewHandlers(userUsecase)

	mux := http.NewServeMux()
	handlers.Register(mux)
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	addr := os.Getenv("ADDR")
	if addr == "" {
		addr = ":8080"
	}
	log.Printf("listening on %s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatal(err)
	}
}

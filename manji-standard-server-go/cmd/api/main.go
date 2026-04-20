package main

import (
	"log"
	"net/http"
	"os"

	"github.com/example/manji-standard-server-go/gen/user/v1/userv1connect"
	"github.com/example/manji-standard-server-go/pkg/domain/service"
	"github.com/example/manji-standard-server-go/pkg/handler"
	infrarepo "github.com/example/manji-standard-server-go/pkg/infra/repository"
	"github.com/example/manji-standard-server-go/pkg/usecase"
)

func main() {
	userRepo := infrarepo.NewInMemoryUserRepository()
	userService := service.NewUserService(userRepo, nil)
	userUsecase := usecase.NewUserUsecase(userService)
	userHandler := handler.NewUserHandler(userUsecase)

	mux := http.NewServeMux()
	path, connectHandler := userv1connect.NewUserServiceHandler(userHandler)
	mux.Handle(path, connectHandler)
	mux.HandleFunc("/health", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	addr := os.Getenv("ADDR")
	if addr == "" {
		addr = ":8080"
	}
	log.Printf("listening on %s (Connect RPC: %s)", addr, path)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatal(err)
	}
}

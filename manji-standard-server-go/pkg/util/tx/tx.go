package tx

import (
	"context"
	"log/slog"
	"sync"

	"gorm.io/gorm"
)

type txKey struct{}

var (
	once      sync.Once
	defaultDB *gorm.DB
	warnOnce  sync.Once
)

// Init stores the default DB pool. Call once in cmd/api/main.go after gorm.Open.
func Init(db *gorm.DB) {
	once.Do(func() {
		defaultDB = db
	})
}

// Run executes fn inside a Postgres transaction.
// The ctx passed to fn carries the active *gorm.DB so Repository calls via From(ctx) use the same tx.
// If fn returns an error the transaction is rolled back; on nil it is committed.
// A panic inside fn triggers rollback then re-panics.
// If ctx already carries a transaction (nested call), fn is executed without starting a new one.
func Run(ctx context.Context, fn func(ctx context.Context) error) error {
	if _, ok := ctx.Value(txKey{}).(*gorm.DB); ok {
		return fn(ctx)
	}

	if defaultDB == nil {
		panic("tx.Init not called; call it in cmd/api/main.go before serving")
	}
	tx := defaultDB.Begin()
	if tx.Error != nil {
		return tx.Error
	}

	ctx = context.WithValue(ctx, txKey{}, tx)

	defer func() {
		if p := recover(); p != nil {
			_ = tx.Rollback()
			panic(p)
		}
	}()

	if err := fn(ctx); err != nil {
		_ = tx.Rollback()
		return err
	}
	return tx.Commit().Error
}

// From returns the *gorm.DB associated with the current transaction in ctx.
// If no transaction is found, it returns the default pool and logs a one-time warning.
// Panics if Init has not been called.
func From(ctx context.Context) *gorm.DB {
	if defaultDB == nil {
		panic("tx.Init not called; call it in cmd/api/main.go before serving")
	}
	if db, ok := ctx.Value(txKey{}).(*gorm.DB); ok {
		return db
	}
	warnOnce.Do(func() {
		slog.WarnContext(ctx, "repository called outside tx.Run, using default pool")
	})
	return defaultDB
}

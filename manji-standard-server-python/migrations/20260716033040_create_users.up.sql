-- create table users
CREATE TABLE "users" (
  "id" text PRIMARY KEY,
  "created_at" timestamptz,
  "email" text UNIQUE,
  "name" text NOT NULL
);

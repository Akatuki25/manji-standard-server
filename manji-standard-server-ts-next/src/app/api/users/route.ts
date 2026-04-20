import { NextResponse } from "next/server";
import { EmailAlreadyTakenError } from "@/domain/service/user-service";
import { userUsecase } from "@/lib/container";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: { email?: string; name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const email = body.email ?? "";
  const name = body.name ?? "";
  try {
    const user = await userUsecase.createUser({ email, name });
    return NextResponse.json(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAtUnix: Math.floor(user.createdAt.getTime() / 1000),
      },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof EmailAlreadyTakenError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

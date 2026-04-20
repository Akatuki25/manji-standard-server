import { NextResponse } from "next/server";
import { userUsecase } from "@/lib/container";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await userUsecase.getUser(params.id);
  if (!user) {
    return NextResponse.json({ error: "user not found" }, { status: 404 });
  }
  return NextResponse.json({
    id: user.id,
    email: user.email,
    name: user.name,
    createdAtUnix: Math.floor(user.createdAt.getTime() / 1000),
  });
}

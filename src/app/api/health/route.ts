import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      ok: true,
      app: "projecthub",
      db: true,
      ts: new Date().toISOString(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "database_unavailable";
    return NextResponse.json(
      {
        ok: false,
        app: "projecthub",
        db: false,
        error: msg,
        hint: "Run: npm run setup   or: npx prisma generate && npx prisma db push",
        ts: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}

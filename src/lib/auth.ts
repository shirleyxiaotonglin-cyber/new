import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const COOKIE = "ph_session";

/** 短期会话（未勾选「记住我」） */
export const SESSION_SHORT_DAYS = 1;
/** 勾选「记住我」 */
export const SESSION_LONG_DAYS = 30;

function getSecret() {
  let s = process.env.JWT_SECRET;
  if (!s || s.length < 16) {
    if (process.env.NODE_ENV !== "production") {
      s = "__dev_only_jwt_secret_do_not_use_in_prod__!!";
    } else {
      throw new Error("JWT_SECRET must be set and at least 16 characters");
    }
  }
  return new TextEncoder().encode(s);
}

export type JwtPayload = {
  sub: string;
  email: string;
};

export async function signSessionToken(
  payload: JwtPayload,
  opts?: { expiresInDays?: number },
): Promise<string> {
  const days = opts?.expiresInDays ?? 7;
  const exp =
    typeof days === "number" && days >= 1 && days <= 365 ? `${days}d` : "7d";
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(getSecret());
}

export async function verifySessionToken(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const sub = payload.sub as string | undefined;
    const email = payload.email as string | undefined;
    if (!sub || !email) return null;
    return { sub, email };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<JwtPayload | null> {
  const jar = await cookies();
  const t = jar.get(COOKIE)?.value;
  if (!t) return null;
  return verifySessionToken(t);
}

export { COOKIE };

export type SessionCookieOptions = {
  httpOnly: boolean;
  sameSite: "lax";
  secure: boolean;
  path: string;
  maxAge: number;
};

/**
 * httpOnly Cookie；maxAge 与 JWT 过期天数一致。
 */
export function getSessionCookieOptions(expiresInDays: number): SessionCookieOptions {
  const days =
    typeof expiresInDays === "number" &&
    Number.isFinite(expiresInDays) &&
    expiresInDays >= 1 &&
    expiresInDays <= 365
      ? Math.floor(expiresInDays)
      : 7;
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * days,
  };
}

/** @deprecated 使用 getSessionCookieOptions */
export const sessionCookieOpts = getSessionCookieOptions(7);

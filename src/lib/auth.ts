import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const COOKIE = "ph_session";

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

export async function signSessionToken(payload: JwtPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
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

/**
 * 会话存在 httpOnly Cookie，手机/电脑各自登录同一账号即可共用数据库中的数据。
 * 生产环境需 HTTPS（secure）、各实例共用同一 JWT_SECRET；勿把 DB 绑在单机文件库若要多机同步。
 */
export const sessionCookieOpts = {
  httpOnly: true as const,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 7,
};

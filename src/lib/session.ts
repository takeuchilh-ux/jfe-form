import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

export type AdminSession = { kind: "admin"; sub: string; name: string };
export type InspectorSession = { kind: "inspector"; sub: string; name: string };
type Session = AdminSession | InspectorSession;

const COOKIE = { admin: "kensa_admin", inspector: "kensa_inspector" } as const;
const MAX_AGE = { admin: 60 * 60 * 12, inspector: 60 * 60 * 24 * 30 } as const;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET は 32 文字以上で設定してください");
  return new TextEncoder().encode(s);
}

export async function setSession(session: Session) {
  const token = await new SignJWT({ kind: session.kind, name: session.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(session.sub)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE[session.kind]}s`)
    .sign(secret());
  const jar = await cookies();
  jar.set(COOKIE[session.kind], token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE[session.kind],
  });
}

export async function clearSession(kind: Session["kind"]) {
  (await cookies()).delete(COOKIE[kind]);
}

async function read<K extends Session["kind"]>(kind: K): Promise<Extract<Session, { kind: K }> | null> {
  const token = (await cookies()).get(COOKIE[kind])?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.kind !== kind || !payload.sub) return null;
    return { kind, sub: payload.sub, name: String(payload.name ?? "") } as Extract<Session, { kind: K }>;
  } catch {
    return null;
  }
}

export const getAdmin = () => read("admin");
export const getInspector = () => read("inspector");

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function requireAdmin(): Promise<AdminSession> {
  const s = await getAdmin();
  if (!s) throw new HttpError(401, "管理者ログインが必要です");
  return s;
}

export async function requireInspector(): Promise<InspectorSession> {
  const s = await getInspector();
  if (!s) throw new HttpError(401, "LINE ログインが必要です");
  return s;
}

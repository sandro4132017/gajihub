// Server-only. Pakai di Server Component / Server Action, BUKAN middleware.ts
// (middleware pakai request.cookies langsung + verifikasiTokenSesi dari
// session.ts, karena "next/headers" tidak didukung di Edge middleware).
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, verifikasiTokenSesi, type SessionPayload } from "./session";

export async function getSessionAccount(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifikasiTokenSesi(token);
}

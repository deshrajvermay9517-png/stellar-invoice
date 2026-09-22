import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAuthConfigured } from "@/server/env";

export async function getSession() {
  if (!isAuthConfigured()) return null;
  return auth();
}

// Call at the point of every protected server read/action, not only in a layout.
export async function requireUser() {
  const session = await getSession();
  if (!session?.user?.id) redirect("/sign-in");
  return session.user;
}

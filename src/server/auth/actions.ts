"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn, signOut } from "@/auth";
import { isAuthConfigured } from "@/server/env";
import { requireUser } from "./session";

export async function signInWithGitHub() {
  if (!isAuthConfigured()) redirect("/sign-in?error=Configuration");
  try {
    await signIn("github", { redirectTo: "/dashboard" });
  } catch (error) {
    if (error instanceof AuthError) redirect("/sign-in?error=SignInFailed");
    // Next.js uses a thrown signal for successful redirects; preserve it.
    throw error;
  }
}

export async function signOutOfAccount() {
  await requireUser();
  await signOut({ redirectTo: "/" });
}

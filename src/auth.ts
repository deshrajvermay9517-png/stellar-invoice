import "server-only";
import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { getDatabase } from "@/server/db/client";
import { authTables } from "@/server/db/schema";
import { getAuthEnvironment } from "@/server/env";

export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  const environment = getAuthEnvironment();
  return {
    secret: environment.secret,
    adapter: DrizzleAdapter(getDatabase(), authTables),
    providers: [GitHub({
      clientId: environment.githubId,
      clientSecret: environment.githubSecret,
    })],
    session: { strategy: "database", maxAge: 30 * 24 * 60 * 60 },
    pages: { signIn: "/sign-in", error: "/sign-in" },
    callbacks: {
      session({ session, user }) {
        // Only expose the profile, internal user ID, and expiry; never OAuth tokens.
        return {
          expires: session.expires,
          user: { id: user.id, name: user.name, email: user.email, image: user.image },
        };
      },
    },
  };
});

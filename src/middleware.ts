import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher(["/", "/sign-in(.*)", "/sign-up(.*)", "/no-org", "/auth-sync", "/complete-signup"]);

export default clerkMiddleware(async (auth, request) => {
  const { userId, orgId } = await auth();

  // Redirect logged-in users from "/" to "/dashboard"
  if (userId && request.nextUrl.pathname === "/") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (isPublicRoute(request)) {
    return;
  }

  if (!userId) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  if (!orgId) {
    return NextResponse.redirect(new URL("/no-org", request.url));
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};

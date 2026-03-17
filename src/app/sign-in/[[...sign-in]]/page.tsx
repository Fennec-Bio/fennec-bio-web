"use client";

import { SignIn } from "@clerk/nextjs";
import { useEffect } from "react";

export default function SignInPage() {
  useEffect(() => {
    console.log("CLERK_PUBLISHABLE_KEY:", process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <SignIn fallbackRedirectUrl="/auth-sync" />
    </div>
  );
}

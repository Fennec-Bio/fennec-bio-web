import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function LandingPage() {
  const { userId } = await auth();
  if (userId) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="max-w-2xl text-center space-y-8">
        <h1 className="text-5xl font-bold tracking-tight text-gray-900">
          Fennec Bio
        </h1>
        <p className="text-xl text-gray-600">
          Master the microbes: Advanced data infrastructure for precision fermentation
        </p>
        <Link
          href="/sign-in"
          className="inline-flex items-center px-6 py-3 text-base font-medium text-white rounded-lg transition-colors hover:opacity-90"
          style={{ backgroundColor: "#eb5234" }}
        >
          Get Started
        </Link>
      </div>
    </div>
  );
}

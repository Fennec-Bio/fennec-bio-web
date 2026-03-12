"use client";

import { useClerk } from "@clerk/nextjs";

export default function NoOrgPage() {
  const { signOut } = useClerk();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="max-w-md text-center space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">No Organization Access</h1>
        <p className="text-gray-600">
          Your account is not associated with an organization. Please contact
          your administrator to get access.
        </p>
        <button
          onClick={() => signOut({ redirectUrl: "/" })}
          className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // Always redirect to dashboard (mock user auto-logged in)
    router.push('/dashboard');
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="text-lg text-gray-400">Loading...</div>
    </div>
  );
}

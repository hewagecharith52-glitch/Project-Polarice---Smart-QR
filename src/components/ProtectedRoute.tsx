"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Loader2 } from "lucide-react";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isLoading && isMounted && !isAuthenticated) {
      // Avoid infinite loop if already on login page
      if (pathname !== "/login") {
        router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
      }
    }
  }, [isLoading, isMounted, isAuthenticated, router, pathname]);

  // Show consistent loader during Auth verification and initial hydration
  if (isLoading || !isMounted) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  // If not authenticated, render loader while redirecting
  if (!isAuthenticated) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  return <>{children}</>;
}
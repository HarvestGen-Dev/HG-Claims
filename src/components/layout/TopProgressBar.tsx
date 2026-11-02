"use client";

import React, { useEffect, useState, Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth/context";

interface TopProgressBarProps {
  isBusy?: boolean;
}

function TopProgressBarInner({ isBusy: externalBusy = false }: TopProgressBarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  let authRefreshing = false;
  try {
    const auth = useAuth();
    authRefreshing = auth.isRefreshing;
  } catch {
    // Auth context not available or not mounted yet
  }
  const isBusy = externalBusy || authRefreshing;

  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);

  // Trigger progress animation on route navigation
  useEffect(() => {
    setVisible(true);
    setProgress(30);

    const t1 = setTimeout(() => setProgress(75), 100);
    const t2 = setTimeout(() => {
      setProgress(100);
      const t3 = setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, 250);
      return () => clearTimeout(t3);
    }, 280);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [pathname, searchParams]);

  // Handle external or auth busy state
  useEffect(() => {
    if (isBusy) {
      setVisible(true);
      setProgress((prev) => (prev < 30 ? 30 : prev));
      const interval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 85) return prev;
          return prev + Math.floor(Math.random() * 8 + 4);
        });
      }, 150);
      return () => clearInterval(interval);
    } else {
      setProgress((prev) => {
        if (prev > 0 && prev < 100) {
          return 100;
        }
        return prev;
      });
      const timer = setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [isBusy]);


  if (!visible && progress === 0) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] pointer-events-none h-[3px] bg-transparent overflow-hidden">
      <div
        className="h-full bg-gradient-to-r from-zinc-900 via-zinc-600 to-zinc-900 dark:from-zinc-100 dark:via-zinc-400 dark:to-zinc-100 shadow-[0_0_12px_rgba(24,24,27,0.7)] transition-all ease-out duration-200"
        style={{
          width: `${progress}%`,
          opacity: visible ? 1 : 0,
        }}
      />
    </div>
  );
}

export function TopProgressBar(props: TopProgressBarProps) {
  return (
    <Suspense fallback={null}>
      <TopProgressBarInner {...props} />
    </Suspense>
  );
}


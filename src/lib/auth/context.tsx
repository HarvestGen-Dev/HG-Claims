"use client";
import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { Profile, RoleCode, Claim } from "@/lib/types/database";
import { workspaceStore } from "@/lib/domains";
import { createClient } from "@/lib/supabase/client";
import { userHasRole, canUserCreateClaim, canUserApproveClaim, canUserEditClaim, canUserRecordPayment, canUserVerifyClaim, canUserReviewClaim, isOnboardingCompleted } from "./permissions";

interface AuthContextType {
  user: Profile | null;
  activeRole: RoleCode;
  isAuthenticated: boolean;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setActiveRole: (role: RoleCode) => void;
  hasRole: (role: RoleCode) => boolean;
  canCreateClaim: () => boolean;
  canApprove: (claim: Claim) => boolean;
  canReview: (claim: Claim) => boolean;
  canEdit: (claim: Claim) => boolean;
  canPay: (claim: Claim) => boolean;
  canVerify: (claim: Claim) => boolean;
}
const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null);
  const [activeRole, setActiveRole] = useState<RoleCode>("MINISTRY_LEADER");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState("");
  const pathname = usePathname();
  const refreshUser = useCallback(async () => {
    const profile = await workspaceStore.refresh();
    setUser(profile);
    const primaryRole = (profile?.roles?.[0] as RoleCode) || "MINISTRY_LEADER";
    setActiveRole(primaryRole);
    setError("");
  }, []);
  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};
    async function restore() {
      try {
        const client = createClient();
        const { data: { user: authenticated } } = await client.auth.getUser();
        if (authenticated && !cancelled) await refreshUser();
        const { data } = client.auth.onAuthStateChange(event => {
          if (event === "SIGNED_OUT") { workspaceStore.clear(); setUser(null); }
        });
        unsubscribe = () => data.subscription.unsubscribe();
      } catch (cause) { if (!cancelled) setError(cause instanceof Error ? cause.message : "Unable to load your account."); }
      finally { if (!cancelled) setIsLoading(false); }
    }
    void restore();
    return () => { cancelled = true; unsubscribe(); };
  }, [refreshUser]);
  useEffect(() => {
    if (!user?.id || ["/","/login","/signup","/forgot-password","/reset-password"].includes(pathname)) return;
    let active = true;
    setIsRefreshing(true);
    workspaceStore.refreshIfStale(15000)
      .then(profile => {
        if (active && profile) setUser(profile);
      })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Unable to refresh the workspace."); })
      .finally(() => { if (active) setIsRefreshing(false); });
    return () => { active = false; };
  }, [pathname, user?.id]);

  // Onboarding route enforcement
  useEffect(() => {
    if (isLoading || !user) return;
    const onboarded = isOnboardingCompleted(user);
    if (onboarded && pathname === "/onboarding") {
      window.location.assign("/dashboard");
    }
  }, [user, pathname, isLoading]);

  const login = async (email: string, password: string) => {
    const client = createClient();
    const { error: signInError } = await client.auth.signInWithPassword({ email, password });
    if (signInError) return false;
    try { await refreshUser(); return true; }
    catch (cause) { await client.auth.signOut(); throw cause; }
  };
  const logout = async () => {
    const { error: signOutError } = await createClient().auth.signOut();
    if (signOutError) throw signOutError;
    workspaceStore.clear(); setUser(null);
    window.location.assign("/login");
  };
  const publicPage = ["/","/login","/signup","/forgot-password","/reset-password"].includes(pathname);
  return <AuthContext.Provider value={{
    user, activeRole, isAuthenticated: !!user, isLoading, isRefreshing, error, login, logout, refreshUser, setActiveRole,
    hasRole: role => userHasRole(user, role), canCreateClaim: () => canUserCreateClaim(user), canApprove: claim => canUserApproveClaim(user, claim),
    canReview: claim => canUserReviewClaim(user, claim),
    canEdit: claim => canUserEditClaim(user, claim), canPay: claim => canUserRecordPayment(user, claim),
    canVerify: claim => canUserVerifyClaim(user, claim),
  }}>
    {isLoading && !publicPage ? (
      <div role="status" className="min-h-screen flex flex-col items-center justify-center bg-slate-50/60 dark:bg-zinc-950">
        <div className="h-8 w-8 rounded-full border-2 border-emerald-700 border-t-transparent animate-spin mb-3" />
        <p className="text-xs font-medium text-slate-500">Connecting to workspace...</p>
      </div>
    ) : error && !publicPage ? (
      <main className="max-w-lg mx-auto p-8"><h1 className="text-xl font-semibold">Workspace unavailable</h1><p role="alert" className="mt-3 text-sm">{error}</p><button className="mt-4 underline" onClick={() => window.location.reload()}>Try again</button><a className="ml-4 underline" href="/login">Sign in</a></main>
    ) : children}
  </AuthContext.Provider>;
}
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}

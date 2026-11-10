"use client";
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { usePathname } from "next/navigation";
import { Profile, RoleCode, Claim } from "@/lib/types/database";
import { workspaceStore } from "@/lib/domains";
import { createClient } from "@/lib/supabase/client";
import { sessionExpiredLoginPath } from "./session-expiry";
import { userHasRole, canUserCreateClaim, canUserApproveClaim, canUserEditClaim, canUserRecordPayment, canUserVerifyClaim, canUserReviewClaim, isOnboardingCompleted } from "./permissions";

interface AuthContextType {
  user: Profile | null;
  activeRole: RoleCode | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setActiveRole: (role: RoleCode | null) => void;
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
  const [activeRole, setActiveRole] = useState<RoleCode | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [sessionExpiresAt, setSessionExpiresAt] = useState<number | null>(null);
  const pathname = usePathname();
  const expiring = useRef(false);
  const expireSession = useCallback(async () => {
    if (expiring.current) return;
    expiring.current = true;
    setIsLoading(true);
    workspaceStore.clear();
    setUser(null);
    setSessionExpiresAt(null);
    try {
      await createClient().auth.signOut({ scope: "local" });
    } finally {
      if (window.location.pathname + window.location.search !== sessionExpiredLoginPath) {
        window.location.replace(sessionExpiredLoginPath);
      } else {
        expiring.current = false;
        setIsLoading(false);
      }
    }
  }, []);

  const refreshUser = useCallback(async (hintUserId?: string) => {
    const client = createClient();
    const { data, error } = await client.rpc("hg_session_expires_at");
    if (error) throw new Error("Unable to verify your session. Please sign in again.");
    const deadline = typeof data === "string" ? Date.parse(data) : NaN;
    if (!Number.isFinite(deadline) || deadline <= Date.now()) {
      await expireSession();
      return;
    }
    setSessionExpiresAt(deadline);
    const resolvedUserId = hintUserId || (await client.auth.getUser()).data.user?.id;
    const profile = await workspaceStore.refresh(resolvedUserId);
    if (Date.now() >= deadline) {
      await expireSession();
      return;
    }
    setUser(profile);
    const primaryRole = (profile?.roles?.find(role => role === "FINANCE" || role === "TEAM_LEAD") as RoleCode) || null;
    setActiveRole(primaryRole);
    setError("");
  }, [expireSession]);

  useEffect(() => {
    if (sessionExpiresAt === null) return;
    const checkExpiry = () => {
      if (Date.now() >= sessionExpiresAt) void expireSession();
    };
    const timer = window.setTimeout(checkExpiry, Math.max(0, sessionExpiresAt - Date.now()));
    document.addEventListener("visibilitychange", checkExpiry);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", checkExpiry);
    };
  }, [expireSession, sessionExpiresAt]);

  useEffect(() => {
    let cancelled = false;
    let redirecting = false;
    let unsubscribe = () => {};
    async function restore() {
      try {
        const rawHash = typeof window !== "undefined" ? window.location.hash : "";
        const client = createClient();
        if (rawHash.includes("access_token=")) {
          const hashParams = new URLSearchParams(rawHash.replace(/^#/, ""));
          const accessToken = hashParams.get("access_token");
          const refreshToken = hashParams.get("refresh_token");
          const hashType = hashParams.get("type");
          if (accessToken && refreshToken) {
            await client.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            window.history.replaceState(
              null,
              "",
              window.location.pathname + window.location.search
            );
            if (hashType === "invite" && window.location.pathname !== "/onboarding") {
              redirecting = true;
              window.location.replace("/onboarding?invite=1");
              return;
            }
            if (hashType === "recovery" && window.location.pathname !== "/reset-password") {
              redirecting = true;
              window.location.replace("/reset-password");
              return;
            }
          }
        }
        const { data: { user: authenticated } } = await client.auth.getUser();
        if (authenticated && !cancelled) await refreshUser(authenticated.id);
        const { data } = client.auth.onAuthStateChange(event => {
          if (event === "SIGNED_OUT") { workspaceStore.clear(); setUser(null); setSessionExpiresAt(null); }
        });
        unsubscribe = () => data.subscription.unsubscribe();
      } catch (cause) { if (!cancelled) setError(cause instanceof Error ? cause.message : "Unable to load your account."); }
      finally { if (!cancelled && !redirecting) setIsLoading(false); }
    }
    void restore();
    return () => { cancelled = true; unsubscribe(); };
  }, [refreshUser]);
  useEffect(() => {
    if (!user?.id || ["/","/login","/signup","/forgot-password","/reset-password"].includes(pathname)) return;
    let active = true;
    setIsRefreshing(true);
    workspaceStore.refreshIfStale(15000, user.id)
      .then(profile => {
        if (active && profile) setUser(profile);
      })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Unable to refresh the workspace."); })
      .finally(() => { if (active) setIsRefreshing(false); });
    return () => { active = false; };
  }, [pathname, user?.id]);

  // Onboarding route enforcement
  useEffect(() => {
    if (isLoading || !user || pathname === "/login") return;
    const onboarded = isOnboardingCompleted(user);
    const isInviteFlow =
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("invite") === "1";
    if (!onboarded && pathname !== "/onboarding" && pathname !== "/reset-password") {
      window.location.assign("/onboarding");
    } else if (onboarded && pathname === "/onboarding" && !isInviteFlow) {
      window.location.assign("/dashboard");
    }
  }, [user, pathname, isLoading]);

  const login = async (email: string, password: string) => {
    const client = createClient();
    const { data: signInData, error: signInError } = await client.auth.signInWithPassword({ email, password });
    if (signInError) return false;
    try {
      await refreshUser(signInData?.user?.id);
      return true;
    } catch (cause) {
      console.error("Sign in post-auth refresh error:", cause);
      await client.auth.signOut();
      throw cause;
    }
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
        <div className="h-8 w-8 rounded-full border-2 border-zinc-900 dark:border-zinc-100 border-t-transparent animate-spin mb-3" />
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

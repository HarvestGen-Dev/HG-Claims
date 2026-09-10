"use client";
import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { Profile, RoleCode, Claim } from "@/lib/types/database";
import { db } from "@/lib/data/repository";
import { createClient } from "@/lib/supabase/client";
import { userHasRole, canUserApproveClaim, canUserEditClaim, canUserRecordPayment, canUserVerifyClaim } from "./permissions";

interface AuthContextType {
  user: Profile | null;
  activeRole: RoleCode;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setActiveRole: (role: RoleCode) => void;
  hasRole: (role: RoleCode) => boolean;
  canApprove: (claim: Claim) => boolean;
  canEdit: (claim: Claim) => boolean;
  canPay: (claim: Claim) => boolean;
  canVerify: (claim: Claim) => boolean;
}
const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null);
  const [activeRole, setActiveRole] = useState<RoleCode>("CLAIMANT");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const pathname = usePathname();
  const refreshUser = useCallback(async () => {
    const profile = await db.refresh();
    setUser(profile);
    setActiveRole(profile.roles?.[0] || "CLAIMANT");
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
          if (event === "SIGNED_OUT") { db.clear(); setUser(null); }
        });
        unsubscribe = () => data.subscription.unsubscribe();
      } catch (cause) { if (!cancelled) setError(cause instanceof Error ? cause.message : "Unable to load your account."); }
      finally { if (!cancelled) setIsLoading(false); }
    }
    void restore();
    return () => { cancelled = true; unsubscribe(); };
  }, [refreshUser]);
  useEffect(() => {
    if (!user?.id || ["/","/login","/forgot-password","/reset-password"].includes(pathname)) return;
    let active = true;
    setIsLoading(true);
    refreshUser().catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Unable to refresh the workspace."); })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [pathname, user?.id, refreshUser]);
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
    db.clear(); setUser(null);
    window.location.assign("/login");
  };
  const publicPage = ["/","/login","/forgot-password","/reset-password"].includes(pathname);
  return <AuthContext.Provider value={{
    user, activeRole, isAuthenticated: !!user, isLoading, error, login, logout, refreshUser, setActiveRole,
    hasRole: role => userHasRole(user, role), canApprove: claim => canUserApproveClaim(user, claim),
    canEdit: claim => canUserEditClaim(user, claim), canPay: claim => canUserRecordPayment(user, claim),
    canVerify: claim => canUserVerifyClaim(user, claim),
  }}>
    {isLoading && !publicPage ? <div role="status" className="min-h-screen flex items-center justify-center text-sm">Loading workspace...</div> :
      error && !publicPage ? <main className="max-w-lg mx-auto p-8"><h1 className="text-xl font-semibold">Workspace unavailable</h1><p role="alert" className="mt-3 text-sm">{error}</p><button className="mt-4 underline" onClick={() => window.location.reload()}>Try again</button><a className="ml-4 underline" href="/login">Sign in</a></main> : children}
  </AuthContext.Provider>;
}
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}

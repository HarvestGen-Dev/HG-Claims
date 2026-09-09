"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { Profile, RoleCode, Claim } from "@/lib/types/database";
import { db } from "@/lib/mock-db/repository";
import { userHasRole, canUserApproveClaim, canUserEditClaim, canUserRecordPayment, canUserVerifyClaim } from "./permissions";

interface AuthContextType {
  user: Profile | null;
  activeRole: RoleCode;
  allUsers: Profile[];
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password?: string) => Promise<boolean>;
  logout: () => void;
  switchUser: (userId: string) => void;
  setActiveRole: (role: RoleCode) => void;
  hasRole: (role: RoleCode) => boolean;
  canApprove: (claim: Claim) => boolean;
  canEdit: (claim: Claim) => boolean;
  canPay: (claim: Claim) => boolean;
  canVerify: (claim: Claim) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH_STORAGE_KEY = "nlcc_active_user_id";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null);
  const [activeRole, setActiveRole] = useState<RoleCode>("CLAIMANT");
  const [allUsers, setAllUsers] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    try {
      const profiles = db.getProfiles();
      setAllUsers(profiles);

      const storedUserId = typeof window !== "undefined" ? localStorage.getItem(AUTH_STORAGE_KEY) : null;
      if (storedUserId) {
        const found = profiles.find((p) => p.id === storedUserId);
        if (found) {
          setUser(found);
          setActiveRole(found.roles?.[0] || "CLAIMANT");
        } else {
          if (typeof window !== "undefined") {
            localStorage.removeItem(AUTH_STORAGE_KEY);
          }
          setUser(null);
        }
      } else {
        setUser(null);
      }
    } catch (err) {
      console.error("Failed to restore auth session:", err);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const switchUser = useCallback((userId: string) => {
    const profiles = db.getProfiles();
    const found = profiles.find((p) => p.id === userId);
    if (found) {
      setUser(found);
      setActiveRole(found.roles?.[0] || "CLAIMANT");
      if (typeof window !== "undefined") {
        localStorage.setItem(AUTH_STORAGE_KEY, userId);
      }
    }
  }, []);

  const login = useCallback(async (email: string, _password?: string): Promise<boolean> => {
    const profiles = db.getProfiles();
    const normalized = email.trim().toLowerCase();
    const found = profiles.find((p) => p.email.toLowerCase() === normalized);
    
    if (found) {
      setUser(found);
      setActiveRole(found.roles?.[0] || "CLAIMANT");
      if (typeof window !== "undefined") {
        localStorage.setItem(AUTH_STORAGE_KEY, found.id);
      }
      return true;
    }
    return false;
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    if (typeof window !== "undefined") {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        activeRole,
        allUsers,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
        switchUser,
        setActiveRole,
        hasRole: (role: RoleCode) => userHasRole(user, role),
        canApprove: (claim: Claim) => canUserApproveClaim(user, claim),
        canEdit: (claim: Claim) => canUserEditClaim(user, claim),
        canPay: (claim: Claim) => canUserRecordPayment(user, claim),
        canVerify: (claim: Claim) => canUserVerifyClaim(user, claim),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

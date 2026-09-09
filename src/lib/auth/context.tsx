"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { Profile, RoleCode, Claim } from "@/lib/types/database";
import { db } from "@/lib/mock-db/repository";
import { userHasRole, canUserApproveClaim, canUserEditClaim, canUserRecordPayment, canUserVerifyClaim } from "./permissions";

interface AuthContextType {
  user: Profile | null;
  activeRole: RoleCode;
  allUsers: Profile[];
  isAuthenticated: boolean;
  login: (email: string) => Promise<boolean>;
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null);
  const [activeRole, setActiveRole] = useState<RoleCode>("CLAIMANT");
  const [allUsers, setAllUsers] = useState<Profile[]>([]);

  useEffect(() => {
    const profiles = db.getProfiles();
    setAllUsers(profiles);

    // Default to Jaeden Ting
    const storedUserId = typeof window !== "undefined" ? localStorage.getItem("nlcc_active_user_id") : null;
    const initialUser = (storedUserId && profiles.find(p => p.id === storedUserId)) || profiles[0];
    
    if (initialUser) {
      setUser(initialUser);
      setActiveRole(initialUser.roles?.[0] || "CLAIMANT");
    }
  }, []);

  const switchUser = (userId: string) => {
    const found = allUsers.find(p => p.id === userId);
    if (found) {
      setUser(found);
      setActiveRole(found.roles?.[0] || "CLAIMANT");
      if (typeof window !== "undefined") {
        localStorage.setItem("nlcc_active_user_id", userId);
      }
    }
  };

  const login = async (email: string): Promise<boolean> => {
    const found = allUsers.find(p => p.email.toLowerCase() === email.toLowerCase());
    if (found) {
      setUser(found);
      setActiveRole(found.roles?.[0] || "CLAIMANT");
      if (typeof window !== "undefined") {
        localStorage.setItem("nlcc_active_user_id", found.id);
      }
      return true;
    }
    return false;
  };

  const logout = () => {
    setUser(null);
    if (typeof window !== "undefined") {
      localStorage.removeItem("nlcc_active_user_id");
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        activeRole,
        allUsers,
        isAuthenticated: !!user,
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

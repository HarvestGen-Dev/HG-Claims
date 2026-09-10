"use client";

import React, { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth/context";
import { db } from "@/lib/data/repository";
import { Check, User } from "lucide-react";
import { showToast } from "@/lib/utils/toast";

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const [phone, setPhone] = useState(user?.phone || "");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (user) {
      setPhone(user.phone || "");
    }
  }, [user]);

  const handleSave = async () => {
    try {
      if (!user) return;
      await db.updateProfile(user.id, {
        phone,
      });
      await refreshUser();
      setSaved(true);
      showToast.success("Changes have been made.", "Profile Updated");
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      showToast.error(error instanceof Error ? error.message : "Unable to save changes.", "Save Error");
    }
  };


  return (
    <AppLayout>
      <div className="space-y-4 max-w-2xl mx-auto pb-12">
        <div className="pb-2 border-b border-zinc-200/80 dark:border-zinc-800">
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <User className="w-5 h-5 text-emerald-700" />
            Profile Settings
          </h1>
          <p className="text-xs text-zinc-500">
            Keep your contact details current for notifications and ministry communications.
          </p>
        </div>

        {saved && (
          <div className="p-2.5 bg-emerald-50 border border-emerald-200/80 text-emerald-900 text-xs font-medium rounded-lg flex items-center gap-2 dark:bg-emerald-950/30 dark:border-emerald-900 dark:text-emerald-300">
            <Check className="w-3.5 h-3.5 text-emerald-600" />
            <span>Profile details updated successfully.</span>
          </div>
        )}

        {/* Profile Card */}
        <Card className="border-zinc-200/80 shadow-2xs">
          <CardHeader className="py-3 px-4 border-b border-zinc-100 dark:border-zinc-800">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
              Personal Information
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-[10px] text-zinc-400 uppercase tracking-wider block mb-0.5">Full Name</span>
                <strong className="text-zinc-900 dark:text-zinc-100 text-xs font-medium">{user?.full_name}</strong>
              </div>
              <div>
                <span className="text-[10px] text-zinc-400 uppercase tracking-wider block mb-0.5">Email Address</span>
                <strong className="text-zinc-900 dark:text-zinc-100 text-xs font-medium">{user?.email}</strong>
              </div>
            </div>

            <div className="space-y-1 pt-1">
              <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Mobile Phone Number</label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="h-8 text-xs bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800"
              />
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={handleSave} className="h-8 bg-emerald-700 hover:bg-emerald-800 text-white font-medium text-xs px-4 shadow-2xs">
                Save Changes
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

"use client";

import React, { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { masterDataClient } from "@/lib/domains";
import {
  Settings,
  CheckCircle2,
  Hash,
  Building2,
  Bell,
  FileText,
  Sliders,
  ShieldCheck,
  HelpCircle
} from "lucide-react";
import { showToast } from "@/lib/utils/toast";


export default function SystemSettingsPage() {

  // Load existing settings from DB
  const numberingSetting = masterDataClient.getSetting("claim_numbering") || { prefix: "HG", year_format: "YYYY", digits: 6 };
  const orgSetting = masterDataClient.getSetting("organization_profile") || {
    name: "Harvest Generation",
    short_name: "HG",
    registration_no: "PPM-003-10-14051998",
    address: "Petaling Jaya, Selangor, Malaysia",
    phone: "+60 3-7956 1234",
    email: "finance@harvestgeneration.org",
    currency: "RM",
  };
  const formConfigSetting = masterDataClient.getSetting("claim_form_config") || {
    declaration_text: "I confirm that these expenses were incurred for legitimate ministry purposes in accordance with Harvest Generation financial policies, have not previously been claimed or reimbursed from any other source, and are supported by the authentic receipts and documents provided.",
    allow_claimant_change_ministry: true,
    require_vendor_name: false,
    require_receipt_for_all_expenses: false,
    enable_internal_reference: true,
    form_guidance_banner: "Please ensure all receipts are itemized and clear before submitting for approval.",
    max_file_size_mb: 10,
    max_attachment_count: 15,
  };
  const notifSetting = masterDataClient.getSetting("notification_settings") || {
    email_enabled: true,
    in_app_enabled: true,
    notify_on_submit: true,
    notify_on_approval: true,
    notify_on_payment: true,
  };

  // State
  const [prefix, setPrefix] = useState(numberingSetting.prefix);
  const [digits, setDigits] = useState(numberingSetting.digits || 6);

  const [orgName, setOrgName] = useState(orgSetting.name);
  const [regNo, setRegNo] = useState(orgSetting.registration_no || "");
  const [address, setAddress] = useState(orgSetting.address || "");
  const [phone, setPhone] = useState(orgSetting.phone || "");
  const [email, setEmail] = useState(orgSetting.email || "");
  const [currency, setCurrency] = useState(orgSetting.currency || "RM");

  const jompayConfig = masterDataClient.getSetting("jompay_export_config") || {};
  const [failureEmail, setFailureEmail] = useState(jompayConfig.fail_email_1 || "jonchiam@harvestgen.org");
  const [guidanceBanner, setGuidanceBanner] = useState(formConfigSetting.form_guidance_banner || "");
  const [requireVendor, setRequireVendor] = useState(formConfigSetting.require_vendor_name || false);
  const [requireReceipt, setRequireReceipt] = useState(formConfigSetting.require_receipt_for_all_expenses);
  const [enableInternalRef, setEnableInternalRef] = useState(formConfigSetting.enable_internal_reference);
  const [maxFileSize, setMaxFileSize] = useState(formConfigSetting.max_file_size_mb || 10);
  const [maxFiles, setMaxFiles] = useState(formConfigSetting.max_attachment_count || 15);

  const notifEmail = false;
  const [notifInApp, setNotifInApp] = useState(notifSetting.in_app_enabled);

  const [saved, setSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleSaveAll = async () => {
    try {
      setIsSaving(true);
      await masterDataClient.updateSettings([
        { key: "jompay_export_config", value: { fail_email_1: failureEmail, fail_email_2: "" } },
        { key: "claim_numbering", value: {
        prefix,
        year_format: "YYYY",
        digits: Number(digits),
        } },
        { key: "organization_profile", value: {
        name: orgName,
        registration_no: regNo,
        address,
        phone,
        email,
        currency,
        } },
        { key: "claim_form_config", value: {

        allow_claimant_change_ministry: true,
        require_vendor_name: requireVendor,
        require_receipt_for_all_expenses: requireReceipt,
        enable_internal_reference: enableInternalRef,
        form_guidance_banner: guidanceBanner,
        max_file_size_mb: Number(maxFileSize),
        max_attachment_count: Number(maxFiles),
        } },
        { key: "notification_settings", value: {
        email_enabled: notifEmail,
        in_app_enabled: notifInApp,
        notify_on_submit: true,
        notify_on_approval: true,
        notify_on_payment: true,
        } },
      ]);

      setSaved(true);
      showToast.success("Changes have been made.", "Settings Saved");
      setTimeout(() => setSaved(false), 4000);
    } catch (error) {
      showToast.error(error instanceof Error ? error.message : "Unable to save changes.", "Save Error");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6 max-w-5xl mx-auto pb-16">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-zinc-200/80 dark:border-zinc-800">
          <div>
            <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight flex items-center gap-2">
              <Sliders className="w-5 h-5 text-zinc-900 dark:text-zinc-100" />
              Claim Form Settings
            </h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              Customize the claimant submission form format, field requirements, and organization details.
            </p>
          </div>

          <Button
            onClick={handleSaveAll}
            loading={isSaving}
            disabled={isSaving}
            className="bg-zinc-900 hover:bg-zinc-800 text-white font-bold shadow-md px-6 text-xs"
          >
            {isSaving ? "Saving Configuration..." : "Save All Configuration Changes"}
          </Button>
        </div>

        {saved && (
          <div className="p-4 bg-zinc-50 border border-zinc-200 text-zinc-900 text-xs font-semibold rounded-2xl flex items-center gap-3 shadow-2xs animate-in fade-in">
            <CheckCircle2 className="w-5 h-5 text-zinc-900 shrink-0" />
            <div>
              <p className="font-bold">Settings Saved Successfully!</p>
              <p className="text-zinc-600 font-normal">All claim forms and printable templates have been updated dynamically.</p>
            </div>
          </div>
        )}

        {/* SECTION 1: CLAIM FORM FORMAT & RULES */}
        <Card className="border-zinc-200">
          <CardHeader className="pb-3 border-b border-slate-100">
            <CardTitle className="text-sm font-bold flex items-center gap-2 text-zinc-900">
              <FileText className="w-4 h-4 text-zinc-900" />
              1. Claim Form Format & Field Requirements
            </CardTitle>
            <CardDescription className="text-xs">
              Determine which fields are enabled, mandatory, or locked on the claim submission form.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-4 text-xs">
            {/* Form Guidance Callout Banner */}
            <div className="space-y-1.5">
              <label className="font-bold text-slate-800 flex items-center gap-1.5">
                <HelpCircle className="w-3.5 h-3.5 text-zinc-900" />
                Form Guidance & Help Banner (Displayed to Claimants)
              </label>
              <Input
                value={guidanceBanner}
                onChange={(e) => setGuidanceBanner(e.target.value)}
                placeholder="e.g. Please ensure all receipts are clear, itemized and dated before submitting..."
              />
              <span className="text-[11px] text-slate-400">
                Shown as an informational banner at the top of the claim submission form.
              </span>
            </div>

            <label className="block space-y-1.5 text-sm">JomPAY Fail Email Address 1
              <Input type="email" value={failureEmail} onChange={e=>setFailureEmail(e.target.value)} required />
            </label>

            {/* Field Toggles Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors">
                <input
                  type="checkbox"
                  checked={requireVendor}
                  onChange={(e) => setRequireVendor(e.target.checked)}
                  className="mt-0.5 rounded text-zinc-900 focus:ring-zinc-900 accent-zinc-900"
                />
                <div>
                  <strong className="text-slate-800 block">Mandatory Merchant / Vendor Name</strong>
                  <span className="text-[11px] text-slate-500">Require claimant to input vendor name for every expense row.</span>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors">
                <input
                  type="checkbox"
                  checked={requireReceipt}
                  onChange={(e) => setRequireReceipt(e.target.checked)}
                  className="mt-0.5 rounded text-zinc-900 focus:ring-zinc-900 accent-zinc-900"
                />
                <div>
                  <strong className="text-slate-800 block">Mandatory Receipt Attachments</strong>
                  <span className="text-[11px] text-slate-500">Require at least one supporting receipt document before submission.</span>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors">
                <input
                  type="checkbox"
                  checked={enableInternalRef}
                  onChange={(e) => setEnableInternalRef(e.target.checked)}
                  className="mt-0.5 rounded text-zinc-900 focus:ring-zinc-900 accent-zinc-900"
                />
                <div>
                  <strong className="text-slate-800 block">Enable Internal Reference Code</strong>
                  <span className="text-[11px] text-slate-500">Display optional internal accounting tracking code in section B.</span>
                </div>
              </label>
            </div>

            {/* Limits */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Max Receipt File Size (MB)</label>
                <Input
                  type="number"
                  min="1"
                  max="50"
                  value={maxFileSize}
                  onChange={(e) => setMaxFileSize(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Max Attachments Allowed per Claim</label>
                <Input
                  type="number"
                  min="1"
                  max="30"
                  value={maxFiles}
                  onChange={(e) => setMaxFiles(Number(maxFiles))}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* SECTION 2: CLAIM NUMBERING FORMAT */}
        <Card>
          <CardHeader className="pb-3 border-b border-slate-100">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Hash className="w-4 h-4 text-slate-500" />
              2. Claim Numbering Sequence & Format
            </CardTitle>
            <CardDescription className="text-xs">
              Every submitted claim receives a safe server-generated sequence code: &#123;PREFIX&#125;-&#123;YEAR&#125;-&#123;SEQUENCE&#125;
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Claim Code Prefix</label>
                <Input
                  value={prefix}
                  onChange={(e) => setPrefix(e.target.value.toUpperCase())}
                  className="font-mono font-bold"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Sequence Digits</label>
                <Input
                  type="number"
                  min="4"
                  max="8"
                  value={digits}
                  onChange={(e) => setDigits(Number(e.target.value))}
                  className="font-mono font-bold"
                />
              </div>

              <div className="space-y-1 sm:col-span-1 flex flex-col justify-end">
                <span className="text-slate-400 block mb-1">Generated Preview:</span>
                <span className="px-3 py-2 rounded-lg bg-zinc-900 text-zinc-100 font-mono font-bold text-sm text-center">
                  {prefix}-{new Date().getFullYear()}-{"0".repeat(Math.min(5, Math.max(0, digits - 3)))}125
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* SECTION 3: CHURCH ORGANIZATION DETAILS */}
        <Card>
          <CardHeader className="pb-3 border-b border-slate-100">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Building2 className="w-4 h-4 text-slate-500" />
              3. Organization Information & Voucher Header
            </CardTitle>
            <CardDescription className="text-xs">
              Displayed on printable expense reimbursement vouchers, PDF exports, and official emails.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Organization / Church Name *</label>
                <Input
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Registration / ROS Number</label>
                <Input
                  value={regNo}
                  onChange={(e) => setRegNo(e.target.value)}
                />
              </div>

              <div className="space-y-1 sm:col-span-2">
                <label className="font-semibold text-slate-700">Official Registered Address</label>
                <Input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Finance Email</label>
                <Input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Finance Phone Number</label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Default Currency Symbol</label>
                <Input
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-24 font-bold"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* SECTION 4: NOTIFICATIONS */}
        <Card>
          <CardHeader className="pb-3 border-b border-slate-100">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Bell className="w-4 h-4 text-slate-500" />
              4. Notification Channels
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-4 text-xs">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={notifEmail}
                disabled
                className="rounded text-zinc-900 focus:ring-zinc-900 accent-zinc-900"
              />
              <span className="font-semibold text-slate-800">Claim email notifications (not configured)</span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={notifInApp}
                onChange={(e) => setNotifInApp(e.target.checked)}
                className="rounded text-zinc-900 focus:ring-zinc-900 accent-zinc-900"
              />
              <span className="font-semibold text-slate-800">Enable In-App Notification Bell & Center</span>
            </label>
          </CardContent>
        </Card>

        {/* Save Footer Bar */}
        <div className="flex justify-end pt-4">
          <Button
            onClick={handleSaveAll}
            loading={isSaving}
            disabled={isSaving}
            className="bg-zinc-900 hover:bg-zinc-800 text-white font-bold px-8 shadow-md"
          >
            {isSaving ? "Saving Configuration..." : "Save All Configuration Changes"}
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}

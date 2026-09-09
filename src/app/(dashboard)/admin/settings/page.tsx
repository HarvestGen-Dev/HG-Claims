"use client";

import React, { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { db } from "@/lib/mock-db/repository";
import { useAuth } from "@/lib/auth/context";
import { 
  Settings, 
  CheckCircle2, 
  Hash, 
  Building2, 
  Bell, 
  FileText, 
  Sliders, 
  ShieldCheck, 
  HelpCircle,
  CreditCard
} from "lucide-react";

export default function SystemSettingsPage() {
  const { user } = useAuth();

  // Load existing settings from DB
  const numberingSetting = db.getSetting("claim_numbering") || { prefix: "NLCC", year_format: "YYYY", digits: 6 };
  const orgSetting = db.getSetting("organization_profile") || {
    name: "NewLife Community Church",
    short_name: "NLCC",
    registration_no: "PPM-003-10-14051998",
    address: "Jalan Universiti, 46200 Petaling Jaya, Selangor, Malaysia",
    phone: "+60 3-7956 1234",
    email: "finance@newlife.org.my",
    currency: "RM",
  };
  const formConfigSetting = db.getSetting("claim_form_config") || {
    declaration_text: "I confirm that these expenses were incurred for legitimate church ministry purposes in accordance with NewLife Community Church financial policies, have not previously been claimed or reimbursed from any other source, and are supported by the authentic receipts and documents provided.",
    allow_claimant_change_ministry: true,
    require_vendor_name: false,
    require_receipt_for_all_expenses: true,
    enable_internal_reference: true,
    form_guidance_banner: "Please ensure all receipts are itemized and clear before submitting for approval.",
    max_file_size_mb: 10,
    max_attachment_count: 15,
    allowed_payment_methods: [
      { code: "PERSONAL_REIMBURSEMENT", label: "Personal payment (Reimbursement to claimant)", enabled: true },
      { code: "CHURCH_CARD", label: "Church Corporate Card", enabled: true },
      { code: "DIRECT_VENDOR_PAYMENT", label: "Direct Church Payment to Vendor", enabled: true },
      { code: "OTHER", label: "Other", enabled: true }
    ]
  };
  const notifSetting = db.getSetting("notification_settings") || {
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

  const [declarationText, setDeclarationText] = useState(formConfigSetting.declaration_text);
  const [guidanceBanner, setGuidanceBanner] = useState(formConfigSetting.form_guidance_banner || "");
  const [allowMinistryChange, setAllowMinistryChange] = useState(formConfigSetting.allow_claimant_change_ministry);
  const [requireVendor, setRequireVendor] = useState(formConfigSetting.require_vendor_name || false);
  const [requireReceipt, setRequireReceipt] = useState(formConfigSetting.require_receipt_for_all_expenses);
  const [enableInternalRef, setEnableInternalRef] = useState(formConfigSetting.enable_internal_reference);
  const [maxFileSize, setMaxFileSize] = useState(formConfigSetting.max_file_size_mb || 10);
  const [maxFiles, setMaxFiles] = useState(formConfigSetting.max_attachment_count || 15);
  const [paymentMethods, setPaymentMethods] = useState(formConfigSetting.allowed_payment_methods || []);

  const [notifEmail, setNotifEmail] = useState(notifSetting.email_enabled);
  const [notifInApp, setNotifInApp] = useState(notifSetting.in_app_enabled);

  const [saved, setSaved] = useState(false);

  const togglePaymentMethod = (code: string) => {
    setPaymentMethods(paymentMethods.map((pm: any) => 
      pm.code === code ? { ...pm, enabled: !pm.enabled } : pm
    ));
  };

  const handleSaveAll = () => {
    // 1. Update Claim Numbering
    db.updateSetting("claim_numbering", {
      prefix,
      year_format: "YYYY",
      digits: Number(digits),
    }, user?.id);

    // 2. Update Organization Profile
    db.updateSetting("organization_profile", {
      name: orgName,
      registration_no: regNo,
      address,
      phone,
      email,
      currency,
    }, user?.id);

    // 3. Update Claim Form Format & Rules
    db.updateSetting("claim_form_config", {
      declaration_text: declarationText,
      allow_claimant_change_ministry: allowMinistryChange,
      require_vendor_name: requireVendor,
      require_receipt_for_all_expenses: requireReceipt,
      enable_internal_reference: enableInternalRef,
      form_guidance_banner: guidanceBanner,
      max_file_size_mb: Number(maxFileSize),
      max_attachment_count: Number(maxFiles),
      allowed_payment_methods: paymentMethods,
    }, user?.id);

    // 4. Update Notifications
    db.updateSetting("notification_settings", {
      email_enabled: notifEmail,
      in_app_enabled: notifInApp,
      notify_on_submit: true,
      notify_on_approval: true,
      notify_on_payment: true,
    }, user?.id);

    setSaved(true);
    setTimeout(() => setSaved(false), 4000);
  };

  return (
    <AppLayout>
      <div className="space-y-6 max-w-5xl mx-auto pb-16">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <Sliders className="w-7 h-7 text-emerald-700" />
              Claim Form & System Settings
            </h1>
            <p className="text-xs text-slate-500">
              Customize the claimant submission form format, declaration text, field requirements, and church details.
            </p>
          </div>

          <Button
            onClick={handleSaveAll}
            className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold shadow-md px-6 text-xs"
          >
            Save All Configuration Changes
          </Button>
        </div>

        {saved && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold rounded-2xl flex items-center gap-3 shadow-2xs animate-in fade-in">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <div>
              <p className="font-bold">Settings Saved Successfully!</p>
              <p className="text-emerald-700 font-normal">All claim forms and printable templates have been updated dynamically.</p>
            </div>
          </div>
        )}

        {/* SECTION 1: CLAIM FORM FORMAT & RULES */}
        <Card className="border-emerald-200">
          <CardHeader className="pb-3 border-b border-slate-100">
            <CardTitle className="text-sm font-bold flex items-center gap-2 text-emerald-950">
              <FileText className="w-4 h-4 text-emerald-700" />
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
                <HelpCircle className="w-3.5 h-3.5 text-emerald-700" />
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

            {/* Declaration Textarea */}
            <div className="space-y-1.5">
              <label className="font-bold text-slate-800">
                Official Declaration Agreement Wording *
              </label>
              <Textarea
                rows={3}
                value={declarationText}
                onChange={(e) => setDeclarationText(e.target.value)}
                className="text-xs leading-relaxed"
                required
              />
              <span className="text-[11px] text-slate-400">
                Claimants must review and accept this exact declaration before their claim can be submitted.
              </span>
            </div>

            {/* Field Toggles Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors">
                <input
                  type="checkbox"
                  checked={allowMinistryChange}
                  onChange={(e) => setAllowMinistryChange(e.target.checked)}
                  className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500 accent-emerald-600"
                />
                <div>
                  <strong className="text-slate-800 block">Allow Claimant to Change Ministry</strong>
                  <span className="text-[11px] text-slate-500">If unchecked, claims are locked to the user's assigned default ministry.</span>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors">
                <input
                  type="checkbox"
                  checked={requireVendor}
                  onChange={(e) => setRequireVendor(e.target.checked)}
                  className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500 accent-emerald-600"
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
                  className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500 accent-emerald-600"
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
                  className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500 accent-emerald-600"
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

            {/* Allowed Payment Methods */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <label className="font-bold text-slate-800 block">
                Active Payment Methods Allowed in Claim Form:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {paymentMethods.map((pm: any) => (
                  <label
                    key={pm.code}
                    className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer ${
                      pm.enabled ? "bg-emerald-50 border-emerald-300 text-emerald-950 font-semibold" : "bg-slate-50 border-slate-200 text-slate-500"
                    }`}
                  >
                    <span>{pm.label}</span>
                    <input
                      type="checkbox"
                      checked={pm.enabled}
                      onChange={() => togglePaymentMethod(pm.code)}
                      className="rounded text-emerald-600 focus:ring-emerald-500 accent-emerald-600"
                    />
                  </label>
                ))}
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
                <span className="px-3 py-2 rounded-lg bg-slate-900 text-emerald-400 font-mono font-bold text-sm text-center">
                  {prefix}-2026-{"0".repeat(Math.max(0, digits - 3))}125
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
                onChange={(e) => setNotifEmail(e.target.checked)}
                className="rounded text-emerald-600 focus:ring-emerald-500 accent-emerald-600"
              />
              <span className="font-semibold text-slate-800">Enable Transactional Email Notifications</span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={notifInApp}
                onChange={(e) => setNotifInApp(e.target.checked)}
                className="rounded text-emerald-600 focus:ring-emerald-500 accent-emerald-600"
              />
              <span className="font-semibold text-slate-800">Enable In-App Notification Bell & Center</span>
            </label>
          </CardContent>
        </Card>

        {/* Save Footer Bar */}
        <div className="flex justify-end pt-4">
          <Button
            onClick={handleSaveAll}
            className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-8 shadow-md"
          >
            Save All Configuration Changes
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}

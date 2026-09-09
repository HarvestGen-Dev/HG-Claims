"use client";

import React from "react";
import { Claim } from "@/lib/types/database";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils/formatters";
import { Printer, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

interface PrintClaimViewProps {
  claim: Claim;
}

export function PrintClaimView({ claim }: PrintClaimViewProps) {
  const router = useRouter();

  return (
    <div className="bg-white min-h-screen text-slate-900 p-4 sm:p-8 font-sans">
      {/* Print Control Bar (Hidden on print) */}
      <div className="max-w-4xl mx-auto mb-6 flex items-center justify-between print:hidden p-4 bg-slate-50 rounded-2xl border border-slate-200">
        <Button variant="outline" size="sm" onClick={() => router.back()} className="gap-1.5">
          <ArrowLeft className="w-4 h-4" />
          Back to Claim
        </Button>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Standard A4 Printable Format</span>
          <Button onClick={() => window.print()} className="bg-emerald-800 hover:bg-emerald-900 text-white gap-1.5 shadow-sm">
            <Printer className="w-4 h-4" />
            Print / Save as PDF
          </Button>
        </div>
      </div>

      {/* Printable Sheet */}
      <div className="max-w-4xl mx-auto bg-white border border-slate-300 p-8 rounded-lg shadow-sm print:border-none print:shadow-none print:p-0">
        {/* Church Official Header */}
        <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4 mb-6">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-950">NEWLIFE COMMUNITY CHURCH</h1>
            <p className="text-xs text-slate-600 font-medium">Jalan Universiti, 46200 Petaling Jaya, Selangor, Malaysia</p>
            <p className="text-xs text-slate-500">Registration No: PPM-003-10-14051998 • finance@newlife.org.my</p>
          </div>
          <div className="text-right">
            <h2 className="text-lg font-black uppercase tracking-wider text-emerald-800">EXPENSE REIMBURSEMENT VOUCHER</h2>
            <p className="text-sm font-bold text-slate-900 mt-1">{claim.claim_number || "DRAFT"}</p>
            <p className="text-xs text-slate-500">Status: <strong className="uppercase">{claim.status.replace(/_/g, " ")}</strong></p>
          </div>
        </div>

        {/* Header Metadata Grid */}
        <div className="grid grid-cols-2 gap-4 text-xs border border-slate-300 rounded p-4 mb-6 bg-slate-50/50">
          <div>
            <p className="mb-1"><span className="text-slate-500 inline-block w-28">Claimant Name:</span> <strong>{claim.claimant?.full_name}</strong></p>
            <p className="mb-1"><span className="text-slate-500 inline-block w-28">Email:</span> {claim.claimant?.email}</p>
            <p className="mb-1"><span className="text-slate-500 inline-block w-28">Phone:</span> {claim.claimant?.phone || "-"}</p>
            <p><span className="text-slate-500 inline-block w-28">Bank Account:</span> <strong>{claim.claimant?.bank_name} ({claim.claimant?.bank_account_number})</strong></p>
          </div>
          <div>
            <p className="mb-1"><span className="text-slate-500 inline-block w-28">Ministry / Dept:</span> <strong>{claim.ministry?.name}</strong></p>
            <p className="mb-1"><span className="text-slate-500 inline-block w-28">Programme / Event:</span> <strong>{claim.programme_event}</strong></p>
            <p className="mb-1"><span className="text-slate-500 inline-block w-28">Cost Centre:</span> {claim.cost_centre?.code} ({claim.cost_centre?.name})</p>
            <p><span className="text-slate-500 inline-block w-28">Claim Date:</span> {formatDate(claim.claim_date)}</p>
          </div>
        </div>

        {/* Ministry Purpose */}
        <div className="mb-6">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">Ministry Purpose & Justification</h3>
          <p className="text-xs text-slate-800 border-l-2 border-emerald-600 pl-3 py-1 bg-slate-50 rounded-r">
            {claim.purpose}
          </p>
        </div>

        {/* Itemized Expenses Table */}
        <div className="mb-6">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">Itemized Expense Breakdown</h3>
          <table className="w-full text-left text-xs border-collapse border border-slate-300">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-300 font-bold">
                <th className="p-2 border-r border-slate-300 w-8 text-center">#</th>
                <th className="p-2 border-r border-slate-300 w-24">Date</th>
                <th className="p-2 border-r border-slate-300 w-36">Category</th>
                <th className="p-2 border-r border-slate-300">Description & Vendor</th>
                <th className="p-2 w-28 text-right">Amount (RM)</th>
              </tr>
            </thead>
            <tbody>
              {(claim.expenses || []).map((exp, i) => (
                <tr key={exp.id || i} className="border-b border-slate-200">
                  <td className="p-2 border-r border-slate-300 text-center text-slate-500">{i + 1}</td>
                  <td className="p-2 border-r border-slate-300">{formatDate(exp.expense_date)}</td>
                  <td className="p-2 border-r border-slate-300 font-medium">{exp.expense_category?.name}</td>
                  <td className="p-2 border-r border-slate-300">
                    <span className="font-semibold text-slate-900">{exp.description}</span>
                    {exp.vendor && <span className="text-slate-500 block text-[11px]">Merchant: {exp.vendor}</span>}
                  </td>
                  <td className="p-2 text-right font-bold text-slate-900">{Number(exp.amount).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100 font-black text-xs border-t-2 border-slate-400">
                <td colSpan={4} className="p-2 text-right uppercase tracking-wider">TOTAL CLAIM AMOUNT:</td>
                <td className="p-2 text-right text-emerald-900 text-sm font-black">{formatCurrency(claim.total_amount)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Attached Receipts Summary */}
        <div className="mb-6 text-xs text-slate-600">
          <p className="font-bold text-slate-800 mb-1">Supporting Receipts Attached ({claim.attachments?.length || 0}):</p>
          <ul className="list-disc pl-5 space-y-0.5">
            {(claim.attachments || []).map((att, i) => (
              <li key={att.id || i}>
                {att.original_filename} ({att.file_category})
              </li>
            ))}
          </ul>
        </div>

        {/* Declaration & Approval Signatures */}
        <div className="border border-slate-300 rounded p-4 mb-6 bg-slate-50 text-xs">
          <p className="font-bold text-slate-900 mb-1">Claimant Declaration:</p>
          <p className="text-slate-700 italic mb-2">
            "I confirm that these expenses were incurred for legitimate church ministry purposes, have not previously been claimed, and are supported by the documents provided."
          </p>
          <p className="text-slate-500">
            Digitally Signed by: <strong>{claim.claimant?.full_name}</strong> on {formatDateTime(claim.declaration_timestamp || claim.submitted_at)}
          </p>
        </div>

        {/* Workflow Approval Audit Trail */}
        <div className="border-t border-slate-300 pt-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">Approval Sign-off & Payment Record</h3>
          <div className="grid grid-cols-3 gap-4 text-xs">
            <div className="border border-slate-200 p-2.5 rounded bg-white">
              <span className="text-slate-400 block text-[10px] uppercase">1. Ministry Leader</span>
              <strong className="text-slate-900 block mt-1">{claim.workflow_steps?.[0]?.completed_by_user?.full_name || claim.ministry?.leader?.full_name || "Pending"}</strong>
              <span className="text-[10px] text-slate-500 block mt-0.5">{claim.workflow_steps?.[0]?.completed_at ? formatDateTime(claim.workflow_steps[0].completed_at) : "Status: Pending"}</span>
            </div>

            <div className="border border-slate-200 p-2.5 rounded bg-white">
              <span className="text-slate-400 block text-[10px] uppercase">2. Finance Review</span>
              <strong className="text-slate-900 block mt-1">{claim.workflow_steps?.[1]?.completed_by_user?.full_name || "Finance Officer"}</strong>
              <span className="text-[10px] text-slate-500 block mt-0.5">{claim.workflow_steps?.[1]?.completed_at ? formatDateTime(claim.workflow_steps[1].completed_at) : "Status: Pending"}</span>
            </div>

            <div className="border border-slate-200 p-2.5 rounded bg-white">
              <span className="text-slate-400 block text-[10px] uppercase">3. Payment Settlement</span>
              <strong className="text-emerald-800 block mt-1">{claim.payment?.payment_reference ? `Ref: ${claim.payment.payment_reference}` : "Not Paid"}</strong>
              <span className="text-[10px] text-slate-500 block mt-0.5">{claim.payment?.payment_date ? `Paid on ${formatDate(claim.payment.payment_date)}` : "-"}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

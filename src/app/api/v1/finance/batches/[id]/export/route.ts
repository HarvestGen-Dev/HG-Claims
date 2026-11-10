import { NextRequest, NextResponse } from "next/server";
import {
  NO_STORE_HEADERS,
  executeRpcCommand,
  fetchAuthorizedSnapshot,
} from "@/services/shared/http";
import {
  bankExportAdapter,
  type BankPaymentInstructionRow,
} from "@/lib/banking/bank-export-adapter";
import type { ReimbursementBatch } from "@/lib/types/database";
import { jompayExportAdapter } from "@/lib/banking/jompay-export-adapter";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json(
      { error: "Batch ID is required." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const snapshot = await fetchAuthorizedSnapshot("finance");
  if (snapshot.error || !snapshot.data) {
    return NextResponse.json(
      { error: snapshot.error || "Unauthorized." },
      { status: snapshot.status || 401, headers: NO_STORE_HEADERS },
    );
  }

  const batches = (snapshot.data.reimbursementBatches ||
    []) as ReimbursementBatch[];
  const batch = batches.find((b) => b.id === id);
  if (!batch) {
    return NextResponse.json(
      { error: "Reimbursement batch not found or finance access required." },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  }

  if (batch.status === "VOIDED") {
    return NextResponse.json(
      { error: "Cannot export a voided reimbursement batch." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const instructions = [...(batch.instructions || [])].sort(
    (a, b) => a.line_order - b.line_order,
  );
  if (instructions.length === 0) {
    return NextResponse.json(
      { error: "Reimbursement batch contains no payment instructions." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  try {
    if (batch.payment_method === "JOMPAY") {
      const buffer = jompayExportAdapter.renderXlsx(batch);
      const verified = jompayExportAdapter.parseAndVerifyXlsx(buffer, batch);
      const filename =
        batch.exported_filename ||
        `${batch.batch_number.replace(/[^A-Za-z0-9_-]/g, "_")}.xlsx`;
      const recorded = await executeRpcCommand("record_batch_export", {
        batch_id: batch.id,
        file_hash_sha256: verified.sha256,
        filename,
        template_version: jompayExportAdapter.templateVersion,
      });
      if (recorded.error)
        return NextResponse.json(
          { error: recorded.error },
          { status: recorded.status, headers: NO_STORE_HEADERS },
        );
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          ...NO_STORE_HEADERS,
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "X-Batch-Number": batch.batch_number,
          "X-Batch-SHA256": verified.sha256,
          "X-Template-Version": jompayExportAdapter.templateVersion,
        },
      });
    }
    const rows: BankPaymentInstructionRow[] = instructions.map((inst) => ({
      instructionId: inst.id,
      lineOrder: inst.line_order,
      paymentMode: inst.payment_mode as "LIP" | "LGP",
      beneficiaryUserId: inst.beneficiary_user_id,
      beneficiaryName: inst.beneficiary_name,
      beneficiaryAccountNumber: inst.beneficiary_account_number,
      beneficiaryBankName: inst.beneficiary_bank_name,
      beneficiaryBankCode: inst.beneficiary_bank_code,
      amountCents: Number(inst.amount_cents),
      amount: Number(inst.amount),
      paymentDescription: inst.payment_description,
      paymentReference: inst.payment_reference || "",
      beneficiaryNewIc: inst.beneficiary_new_ic || "",
      beneficiaryOldIc: inst.beneficiary_old_ic || "",
      beneficiaryBusinessReg: inst.beneficiary_business_reg || "",
      beneficiaryOthers: inst.beneficiary_others || "",
      beneficiaryAddress: inst.beneficiary_address || "",
      claimIds: (inst.claims || []).map((c) => c.claim_id),
      claimNumbers: [],
    }));

    const xlsBuffer = bankExportAdapter.renderXls(rows);
    const verified = bankExportAdapter.parseAndVerifyXls(xlsBuffer);

    const safeBatchNum = batch.batch_number.replace(/[^A-Za-z0-9_-]/g, "_");
    const filename = batch.exported_filename || `${safeBatchNum}.xls`;

    const recorded = await executeRpcCommand("record_batch_export", {
      batch_id: batch.id,
      file_hash_sha256: verified.sha256,
      filename,
    });

    if (recorded.error)
      return NextResponse.json(
        { error: recorded.error },
        { status: recorded.status, headers: NO_STORE_HEADERS },
      );
    return new NextResponse(new Uint8Array(xlsBuffer), {
      status: 200,
      headers: {
        ...NO_STORE_HEADERS,
        "Content-Type": "application/vnd.ms-excel",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Batch-Number": batch.batch_number,
        "X-Batch-SHA256": verified.sha256,
        "X-Template-Version": bankExportAdapter.templateVersion,
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to generate the payment workbook.",
      },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }
}

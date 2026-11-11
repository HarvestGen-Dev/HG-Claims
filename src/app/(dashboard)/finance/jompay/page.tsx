import { redirect } from "next/navigation";

// JomPAY is part of Reimbursements; retain existing links and bookmarks.
export default function JompayPage() {
  redirect("/finance/claims?method=JOMPAY");
}

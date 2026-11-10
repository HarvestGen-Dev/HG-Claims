# HG-Claims v2 workflows

The database owns authorization, validation, routing, snapshots, reservations, and settlement. Next.js API routes authenticate sessions and issue transactional commands. Browser permissions provide interaction guidance; they do not grant database access.

```mermaid
flowchart TD
    Login[Active authenticated user<br/>No assigned role required] --> Draft[Draft claim<br/>Upload optional receipts and select Me or supplier]
    Duplicate[Duplicate an owned claim<br/>Finance may duplicate accessible claims] --> Draft
    Draft --> Submit[Validate Team context, expense classifications, beneficiaries and money]
    Submit --> Route{Team Lead approval enabled<br/>and submitter is not an assigned Team Lead?}
    Route -- No --> Finance[Submitted: Finance review]
    Route -- Yes --> TeamLead[Submitted: assigned Team Lead review]
    TeamLead -- Approve --> Finance
    TeamLead -- Return with note --> Returned[Returned]
    TeamLead -- Reject with reason --> Rejected[Rejected]
    Finance -- Return with note --> Returned
    Returned --> Edit[Submitter corrects and resubmits]
    Edit --> Submit
    Finance -- Reject with reason --> Rejected
    Finance -- Approve, including own claims --> Approved[Approved<br/>Freeze approved amount and receiving payee]
    Finance -. Classification edits, old and new values audited .-> Finance
    Finance -. Unverified payee warning<br/>Verification does not block approval .-> Finance
    Approved -- Unreserved claim needs correction --> Returned
    Approved --> Method{Payment method}
    Method -- Bank Transfer --> SBP[Reserve claims atomically<br/>Aggregate by receiving payee and exact bank destination]
    Method -- JomPAY --> Jompay[Reserve claims atomically<br/>One immutable instruction per individual bill]
    SBP --> XLS[Existing Alliance SBP_BIFF8_V1 XLS<br/>Record file SHA-256, preserve payment references]
    XLS --> Upload[Record Bank Upload]
    Jompay --> JompayFile[Alliance JomPAY B1 XLSX<br/>Seven columns, one row per bill, text identifiers and amounts]
    JompayFile --> Upload
    Upload --> Confirm{Finance records actual payment outcome}
    Confirm -- Completed with reference --> Processed[Processed<br/>Payment record and actor audit]
    Confirm -- Failed with reason --> Release[Release claim reservation<br/>Retain failed frozen instruction and history]
    Release --> Approved
    SBP -- Void unpaid batch with reason --> Release
    Jompay -- Void unpaid batch with reason --> Release
```

The six primary display statuses are Draft, Submitted, Returned, Rejected, Approved and Processed. Historical Cancelled records retain a separate label. Internal stored statuses (`PENDING_MINISTRY_APPROVAL`, `PENDING_FINANCE_REVIEW`, `APPROVED_FOR_PAYMENT`, `PAID`) and distinct banking states remain intact. A Team Lead decision is recorded in workflow history and leaves the claim Submitted for Finance. Exporting or recording an upload never sets Processed.

Team assignments are checked for every Team Lead action. Merely choosing a Team does not grant membership or visibility. In-flight workflow snapshots retain their Team Lead review if the configuration is later disabled; an active reviewer must remain assigned until those claims progress. Finance classification changes to a pending claim's Team rebuild its review workflow. Approval histories are retained.

Duplicate Claim creates a new Draft and attachment rows. Part 1 is claimant/payee identity, contact details and payment destination. Part 2 is Team, current date default, purpose, internal reference, context and all expense items. All Part 2 values are cleared/defaulted. Files are shared by storage path through independent attachment rows. Detaching or deleting a duplicate does not delete storage objects or original attachment rows. Supplier snapshots remain unchanged on save unless the submitter explicitly refreshes the supplier details.

## Persistent recurring billing

```mermaid
flowchart TD
    Config[Finance configures one of four supported utilities<br/>JomPAY payee, Team, classification, active dates, due day] --> DB[(Postgres recurring_payments)]
    Cron[Supabase Postgres Cron<br/>Daily 17:05 UTC = 01:05 Asia/Kuala_Lumpur] --> Job[private.run_recurring_payments]
    DB --> Job
    Job --> Lock[Transaction advisory lock]
    Lock --> Periods[Scan due periods since configured start<br/>Clamp day to month end<br/>Respect active flag and start/end dates]
    Periods --> Window{Due date within 14 days<br/>or missed generation?}
    Window -- Yes --> Unique{Schedule and billing period<br/>already recorded?}
    Unique -- No --> Draft[Insert Draft and billing period atomically]
    Unique -- Yes --> Reminder
    Draft --> Amount{Amount mode}
    Amount -- Fixed --> Prefill[Prefill configured amount]
    Amount -- Variable --> Blank[Blank amount in UI<br/>Zero only as Draft storage representation<br/>Show previous calendar month's amount if available]
    Prefill --> Notice[Notify active Finance users in app]
    Blank --> Notice
    Notice --> Review[Finance reviews and submits<br/>Normal claim approval workflow]
    Periods --> Reminder{Variable Draft still blank<br/>at or after due date minus 7 days?}
    Reminder -- Yes, no prior reminder --> Remind[Insert Finance notifications<br/>Stamp billing period reminded_at in same transaction]
    Reminder -- Already reminded --> Done[No duplicate reminder]
    Job --> Monitor[cron.job_run_details<br/>Supabase Cron dashboard]
```

Generation is retry-safe through the advisory lock and unique `(schedule_id, period)` constraint. One active schedule per configured payee prevents accidental duplicate configuration. Missed executions catch up eligible periods, including periods whose due dates have passed. A due day of 31 uses February 28/29 or the final day of other shorter months. A new Draft and its period commit together. Recurring bill records are retained; deactivate the schedule to stop future generation. There are no bill-variation alerts or anomaly thresholds.

Install the persistent job using `supabase/operations/install-recurring-job.sql` during deployment. Its execution does not depend on a Vercel process remaining alive. Monitor the named job daily in the Supabase Cron dashboard or with the query in that script. Failed transactions roll back and the next execution catches up without duplicate periods. See the implementation report for deployment and rollback steps.

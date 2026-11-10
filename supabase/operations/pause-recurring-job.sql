-- Maintenance/rollback: stop future invocations without deleting schedules or bills.
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname='hg-claims-recurring-drafts';

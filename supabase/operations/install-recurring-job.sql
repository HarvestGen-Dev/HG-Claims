-- Run on the intended development/staging project, then production during approved deployment.
-- Persistent database job; 01:05 Malaysia = 17:05 UTC the preceding day.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
SELECT cron.schedule('hg-claims-recurring-drafts','5 17 * * *','SELECT private.run_recurring_payments();');
-- Monitor: SELECT * FROM cron.job_run_details WHERE jobid IN
-- (SELECT jobid FROM cron.job WHERE jobname='hg-claims-recurring-drafts') ORDER BY start_time DESC LIMIT 30;

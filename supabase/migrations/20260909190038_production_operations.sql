-- Legacy helpers are inaccessible to clients; pin their lookup paths as defense in depth.
ALTER FUNCTION public.instantiate_claim_workflow(uuid) SET search_path = '';
ALTER FUNCTION public.has_role(uuid,text) SET search_path = '';
ALTER FUNCTION public.is_admin(uuid) SET search_path = '';

-- Do not publish unverified contact details or advertise unconfigured email delivery.
UPDATE public.system_settings SET value = value || '{"address":"","phone":"","email":""}'::jsonb
WHERE key = 'organization_profile';
UPDATE public.system_settings SET value = jsonb_set(value,'{email_enabled}','false'::jsonb)
WHERE key = 'notification_settings';

-- Read-only review on the intended environment before/after deployment.
-- Do not guess mappings for historical financial classifications or Team values.
SELECT m.id,m.code,m.name,m.context_kind,m.require_team_lead_approval,
       count(c.id) AS historical_claim_count
FROM public.ministries m LEFT JOIN public.claims c ON c.ministry_id=m.id
GROUP BY m.id ORDER BY m.name;
SELECT e.id,e.code,e.name,count(x.id) AS historical_item_count
FROM public.expense_categories e LEFT JOIN public.claim_expenses x ON x.expense_category_id=e.id
WHERE e.code NOT LIKE 'V2_%' GROUP BY e.id ORDER BY e.name;
-- Any result here requires assigning a valid reviewer or disabling approval.
SELECT m.id,m.name FROM public.ministries m WHERE m.require_team_lead_approval
AND NOT EXISTS(SELECT 1 FROM public.ministry_team_leads t JOIN public.profiles p ON p.id=t.user_id
 JOIN public.user_roles ur ON ur.user_id=p.id JOIN public.roles r ON r.id=ur.role_id AND r.code='TEAM_LEAD'
 WHERE t.ministry_id=m.id AND p.status='ACTIVE');

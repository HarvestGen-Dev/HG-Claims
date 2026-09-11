-- ============================================================================
-- New Life Expense Claim Management System (NLCC) - Master Seed Data
-- ============================================================================

-- 1. Insert System Settings
INSERT INTO public.system_settings (key, value, description)
VALUES
    ('claim_numbering', '{"prefix": "NLCC", "year_format": "YYYY", "digits": 6}'::jsonb, 'Configuration for sequential claim numbers'),
    ('approval_thresholds', '{"final_approval_threshold": 500.00, "currency": "MYR"}'::jsonb, 'Thresholds requiring executive final approval'),
    ('organization_profile', '{"name": "NewLife Community Church", "short_name": "NLCC", "address": "Jalan Universiti, 46200 Petaling Jaya, Selangor, Malaysia", "phone": "+60 3-7956 1234", "email": "finance@newlife.org.my"}'::jsonb, 'Church branding and contact details'),
    ('notification_settings', '{"email_enabled": true, "in_app_enabled": true, "notify_on_submit": true, "notify_on_approval": true, "notify_on_payment": true}'::jsonb, 'Global notification switches')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- 2. Insert Standard Roles
INSERT INTO public.roles (id, code, name, description)
VALUES
    ('a0000000-0000-0000-0000-000000000001', 'CLAIMANT', 'Claimant', 'Can create, edit drafts, submit claims, and view own claim history'),
    ('a0000000-0000-0000-0000-000000000002', 'MINISTRY_LEADER', 'Ministry Leader', 'Can review, approve, reject, or return claims for assigned ministry'),
    ('a0000000-0000-0000-0000-000000000003', 'FINANCE_OFFICER', 'Finance Officer', 'Can verify claims, review receipts, record payments, and export reports'),
    ('a0000000-0000-0000-0000-000000000004', 'FINAL_APPROVER', 'Final Approver', 'Can give executive final approval for claims above threshold amount'),
    ('a0000000-0000-0000-0000-000000000005', 'SYSTEM_ADMIN', 'System Administrator', 'Full administrative control over settings, users, and workflows')
ON CONFLICT (code) DO NOTHING;

-- 3. Insert Standard Expense Categories
INSERT INTO public.expense_categories (id, code, name, description, display_order, is_active)
VALUES
    ('c0000000-0000-0000-0000-000000000001', 'TRANS', 'Transportation', 'Grab, taxi, toll, parking, mileage for ministry errands', 1, true),
    ('c0000000-0000-0000-0000-000000000002', 'MEALS', 'Meals / Hospitality', 'Fellowship meals, volunteer refreshments, guest hospitality', 2, true),
    ('c0000000-0000-0000-0000-000000000003', 'HOTEL', 'Accommodation', 'Lodging for camps, conferences, and retreats', 3, true),
    ('c0000000-0000-0000-0000-000000000004', 'SUPPLIES', 'Ministry Supplies', 'Stationery, craft items, printed curriculum, communion items', 4, true),
    ('c0000000-0000-0000-0000-000000000005', 'EQUIP', 'Equipment / Hardware', 'AV cables, microphones, lighting, tools, hardware components', 5, true),
    ('c0000000-0000-0000-0000-000000000006', 'EVENT', 'Event / Programme', 'Camp venue deposits, decoration props, stage materials', 6, true),
    ('c0000000-0000-0000-0000-000000000007', 'TRAIN', 'Training / Conference', 'Registration fees for leadership summits, workshops', 7, true),
    ('c0000000-0000-0000-0000-000000000008', 'MISSION', 'Missions / Outreach', 'Evangelism packs, community hampers, mission trip expenses', 8, true),
    ('c0000000-0000-0000-0000-000000000009', 'COMM', 'Communication / Advertising', 'Social media ads, banners, signage printing', 9, true),
    ('c0000000-0000-0000-0000-000000000010', 'OTHER', 'Other / Miscellaneous', 'Other valid ministry expenses not covered above', 10, true)
ON CONFLICT (code) DO NOTHING;

-- Production master data only. Accounts are provisioned through Supabase Auth.
INSERT INTO public.ministries (code, name) VALUES
('YOUTH', 'Youth Ministry'), ('SUNDAY', 'Sunday Service'),
('CHILDREN', 'Children Ministry'), ('YA', 'Young Adults'),
('WORSHIP', 'Worship & Creative Arts'), ('MEDIA', 'Multimedia'),
('CELL', 'Small Groups'), ('MISSIONS', 'Missions & Outreach'),
('CARE', 'Pastoral Care'), ('ADMIN', 'Administration'), ('PASTORAL', 'Pastoral Team')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.cost_centres (code, name, ministry_id)
SELECT code || '-GENERAL', name || ' General', id FROM public.ministries
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.system_settings (key, value) VALUES
('claim_form_config', '{"declaration_text":"I confirm that these expenses were incurred for church ministry purposes, have not previously been reimbursed, and are supported by the attached receipts.","allow_claimant_change_ministry":true,"require_vendor_name":false,"require_receipt_for_all_expenses":true,"enable_internal_reference":true,"max_file_size_mb":10,"max_attachment_count":15,"allowed_payment_methods":[{"code":"PERSONAL_REIMBURSEMENT","label":"Personal reimbursement","enabled":true},{"code":"CHURCH_CARD","label":"Church card","enabled":true},{"code":"DIRECT_VENDOR_PAYMENT","label":"Direct vendor payment","enabled":true},{"code":"OTHER","label":"Other","enabled":true}]}')
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- NewLife Expense Claim Management System (NLCC) - Master Seed Data
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

-- 4. Seed Profiles
INSERT INTO public.profiles (id, email, full_name, phone, status, bank_name, bank_account_number)
VALUES
    ('u0000000-0000-0000-0000-000000000001', 'jaeden@example.com', 'Jaeden Ting', '+60 12-345 6789', 'ACTIVE', 'Maybank', '114012345678'),
    ('u0000000-0000-0000-0000-000000000002', 'leader@example.com', 'Sarah Tan (Youth Leader)', '+60 16-987 6543', 'ACTIVE', 'CIMB Bank', '701234567890'),
    ('u0000000-0000-0000-0000-000000000003', 'finance@example.com', 'Michael Chen (Finance Officer)', '+60 19-555 1212', 'ACTIVE', 'Public Bank', '3123456789'),
    ('u0000000-0000-0000-0000-000000000004', 'approver@example.com', 'Pastor David Wong (Senior Pastor)', '+60 12-888 9999', 'ACTIVE', 'RHB Bank', '212345678901'),
    ('u0000000-0000-0000-0000-000000000005', 'admin@example.com', 'Rachel Lee (System Administrator)', '+60 17-222 3333', 'ACTIVE', 'Hong Leong Bank', '10987654321')
ON CONFLICT (email) DO NOTHING;

-- 5. Seed Ministries
INSERT INTO public.ministries (id, code, name, description, leader_id, is_active)
VALUES
    ('m0000000-0000-0000-0000-000000000001', 'YOUTH', 'Youth Ministry', 'Junior & Senior High youth activities, discipleship and annual camps', 'u0000000-0000-0000-0000-000000000002', true),
    ('m0000000-0000-0000-0000-000000000002', 'SUNDAY', 'Sunday Service & Usheering', 'Sunday worship service logistics, hospitality, communion', 'u0000000-0000-0000-0000-000000000004', true),
    ('m0000000-0000-0000-0000-000000000003', 'CHILDREN', 'Children Ministry (Kingdom Kids)', 'Toddler to primary school Sunday school and events', 'u0000000-0000-0000-0000-000000000002', true),
    ('m0000000-0000-0000-0000-000000000004', 'YA', 'Young Adults (Ignite)', 'College students and young working adults fellowship', 'u0000000-0000-0000-0000-000000000002', true),
    ('m0000000-0000-0000-0000-000000000005', 'WORSHIP', 'Worship & Creative Arts', 'Musicians, vocalists, acoustic setup, song licenses', 'u0000000-0000-0000-0000-000000000002', true),
    ('m0000000-0000-0000-0000-000000000006', 'MEDIA', 'Multimedia & AV Production', 'Live streaming, camera hardware, soundboard, slide presentation', 'u0000000-0000-0000-0000-000000000005', true),
    ('m0000000-0000-0000-0000-000000000007', 'CELL', 'Small Groups & Discipleship', 'Cell group leader training materials, group studies', 'u0000000-0000-0000-0000-000000000004', true),
    ('m0000000-0000-0000-0000-000000000008', 'MISSIONS', 'Missions & Church Planting', 'Local and overseas missions, missionary support', 'u0000000-0000-0000-0000-000000000004', true),
    ('m0000000-0000-0000-0000-000000000009', 'CARE', 'Community Outreach & Care', 'B40 food aid, elderly care home visits, disaster relief', 'u0000000-0000-0000-0000-000000000003', true),
    ('m0000000-0000-0000-0000-000000000010', 'ADMIN', 'Church Administration & Facilities', 'Building upkeep, utilities, office supplies, software', 'u0000000-0000-0000-0000-000000000005', true),
    ('m0000000-0000-0000-0000-000000000011', 'PASTORAL', 'Pastoral & Ministry Staff', 'Pastoral care, visitation, pastoral team development', 'u0000000-0000-0000-0000-000000000004', true)
ON CONFLICT (code) DO NOTHING;

-- Update Jaeden's default ministry to Youth
UPDATE public.profiles SET ministry_id = 'm0000000-0000-0000-0000-000000000001' WHERE id = 'u0000000-0000-0000-0000-000000000001';

-- 6. Seed Cost Centres
INSERT INTO public.cost_centres (id, code, name, ministry_id, description, is_active)
VALUES
    ('cc00000-0000-0000-0000-000000000001', 'YOUTH-2026', 'Youth Ministry General Budget', 'm0000000-0000-0000-0000-000000000001', 'Regular weekly youth meetings & supplies', true),
    ('cc00000-0000-0000-0000-000000000002', 'YOUTH-CAMP-2026', 'Youth Camp 2026 Special Project', 'm0000000-0000-0000-0000-000000000001', 'Annual youth retreat & leadership camp', true),
    ('cc00000-0000-0000-0000-000000000003', 'WORSHIP-2026', 'Worship Arts & Production', 'm0000000-0000-0000-0000-000000000005', 'Music instruments, cables, in-ear monitors', true),
    ('cc00000-0000-0000-0000-000000000004', 'CHILDREN-2026', 'Kingdom Kids Sunday School', 'm0000000-0000-0000-0000-000000000003', 'Curriculum, lesson snacks, holiday bible club', true),
    ('cc00000-0000-0000-0000-000000000005', 'MISSIONS-2026', 'Outreach & Missions Projects', 'm0000000-0000-0000-0000-000000000008', 'Orang Asli outreach and mission trips', true),
    ('cc00000-0000-0000-0000-000000000006', 'GENERAL-2026', 'Church General Operations', 'm0000000-0000-0000-0000-000000000010', 'Office administrative & stationery supplies', true)
ON CONFLICT (code) DO NOTHING;

-- 7. Assign User Roles
-- Jaeden -> Claimant
INSERT INTO public.user_roles (user_id, role_id) VALUES ('u0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001') ON CONFLICT DO NOTHING;
-- Sarah -> Claimant + Ministry Leader
INSERT INTO public.user_roles (user_id, role_id) VALUES ('u0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001') ON CONFLICT DO NOTHING;
INSERT INTO public.user_roles (user_id, role_id) VALUES ('u0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002') ON CONFLICT DO NOTHING;
-- Michael -> Finance Officer + Claimant
INSERT INTO public.user_roles (user_id, role_id) VALUES ('u0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001') ON CONFLICT DO NOTHING;
INSERT INTO public.user_roles (user_id, role_id) VALUES ('u0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000003') ON CONFLICT DO NOTHING;
-- Pastor David -> Final Approver + Ministry Leader + Claimant
INSERT INTO public.user_roles (user_id, role_id) VALUES ('u0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001') ON CONFLICT DO NOTHING;
INSERT INTO public.user_roles (user_id, role_id) VALUES ('u0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000002') ON CONFLICT DO NOTHING;
INSERT INTO public.user_roles (user_id, role_id) VALUES ('u0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000004') ON CONFLICT DO NOTHING;
-- Rachel -> System Admin + Claimant
INSERT INTO public.user_roles (user_id, role_id) VALUES ('u0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001') ON CONFLICT DO NOTHING;
INSERT INTO public.user_roles (user_id, role_id) VALUES ('u0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000005') ON CONFLICT DO NOTHING;

-- 8. Seed Default Approval Rules
INSERT INTO public.approval_rules (name, description, min_amount, max_amount, sequence, approver_role, is_active, priority)
VALUES
    ('Standard Ministry Claim (<= RM500)', 'Standard two-step workflow for claims up to RM500', 0.00, 500.00, 1, 'MINISTRY_LEADER', true, 10),
    ('Standard Finance Review (<= RM500)', 'Finance verification and payment preparation', 0.00, 500.00, 2, 'FINANCE_OFFICER', true, 10),
    ('High Value Ministry Leader (> RM500)', 'Ministry leader initial check for claims exceeding RM500', 500.01, NULL, 1, 'MINISTRY_LEADER', true, 20),
    ('High Value Finance Review (> RM500)', 'Finance verification for high value claims', 500.01, NULL, 2, 'FINANCE_OFFICER', true, 20),
    ('High Value Executive Final Approval (> RM500)', 'Senior pastor/executive board approval required over RM500', 500.01, NULL, 3, 'FINAL_APPROVER', true, 20);

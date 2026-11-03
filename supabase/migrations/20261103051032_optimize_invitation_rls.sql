-- Evaluate the caller identity once per statement rather than for each
-- invitation row. The admin-only access rule is unchanged.
ALTER POLICY "Admins can manage signup invitations"
ON public.signup_invitations
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON ur.role_id = r.id
    WHERE ur.user_id = (SELECT auth.uid()) AND r.code = 'SYSTEM_ADMIN'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON ur.role_id = r.id
    WHERE ur.user_id = (SELECT auth.uid()) AND r.code = 'SYSTEM_ADMIN'
  )
);

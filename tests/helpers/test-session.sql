-- SQL regressions run as postgres and simulate the claims normally set by the API.
CREATE FUNCTION pg_temp.sign_in_as(user_id uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE session_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.sessions (id, user_id, created_at, updated_at)
  VALUES (session_id, sign_in_as.user_id, now(), now());

  PERFORM set_config('request.jwt.claim.sub', user_id::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', user_id, 'role', 'authenticated', 'session_id', session_id)::text, true);
END $$;

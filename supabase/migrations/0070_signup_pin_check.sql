-- ════════════════════════════════════════════════════════════════════
-- 0070 — PIN-gated sign-up (Open Items: "Build PIN-gated sign-up page").
-- The React /signup page lets an office user create their own Supabase
-- Auth login: PIN + email + password. The atomic link step already
-- exists (pipeline_user_link_self, 0017 — once-ever per row and per
-- auth account, so the PIN is one-time by construction). This adds the
-- missing anon pre-check so a bad or already-used PIN is refused
-- BEFORE the client creates the auth account — no orphan auth users.
--
-- Exposure: a valid PIN already yields the full profile via
-- pipeline_user_check (anon PIN login); this returns only the name for
-- a linkable PIN and a uniform refusal otherwise — nothing new leaks.
-- ════════════════════════════════════════════════════════════════════

create or replace function signup_pin_check(p_pin text) returns json
language plpgsql security definer set search_path = public as $$
declare u pipeline_users%rowtype;
begin
  select * into u from pipeline_users where pin = p_pin and active limit 1;
  if not found then
    return json_build_object('success', false, 'error', 'bad pin');
  end if;
  if u.auth_user_id is not null then
    return json_build_object('success', false, 'error', 'user already linked');
  end if;
  return json_build_object('success', true, 'name', u.name);
end $$;

grant execute on function signup_pin_check(text) to anon, authenticated;

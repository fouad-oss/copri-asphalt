-- ════════════════════════════════════════════════════════════════════
-- 0043 — QUANTITIES: close the work orders the ministry reports as منتهية
--        (Fouad, 2026-08-14 — from the tracking report sheet 5-08-2026
--         of متابعة أوامـر العمــل ونسبة انجاز والمتبقي من عقد 9.-الجديد.xlsx)
--
--   46 of the 70 issued work orders are reported finished: 25 marked
--   منتهي and 21 منتهي وجاري حسابه (physically complete, final account
--   still being settled). Both count toward the report header's
--   "عدد أوامر العمل المنتهية : 46", so both are closed here — the exact
--   wording is kept in the changelog. The other 24 stay open.
--
--   Closing a work order takes it out of the dashboard's delayed /
--   nearing-end lists; nothing else changes and it is reversible from
--   the work-order screen.
-- Idempotent: already-closed work orders are skipped and not re-logged.
-- ════════════════════════════════════════════════════════════════════
do $qmcl$
declare
  v_contract bigint;
  v_k bigint;
  v_n int := 0;
begin
  select id into v_contract from qm_contracts where code = 'HAW9';
  if v_contract is null then raise exception 'run 0033 first'; end if;

  select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 1;
  if v_k is not null then
    update qm_kashefs set closed = true where id = v_k and not closed;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'update', 'closed', '', 'false', 'true — منتهي', 'tracker-import');
      v_n := v_n + 1;
    end if;
  end if;

  select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 2;
  if v_k is not null then
    update qm_kashefs set closed = true where id = v_k and not closed;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'update', 'closed', '', 'false', 'true — منتهي', 'tracker-import');
      v_n := v_n + 1;
    end if;
  end if;

  select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 3;
  if v_k is not null then
    update qm_kashefs set closed = true where id = v_k and not closed;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'update', 'closed', '', 'false', 'true — منتهي', 'tracker-import');
      v_n := v_n + 1;
    end if;
  end if;

  select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 4;
  if v_k is not null then
    update qm_kashefs set closed = true where id = v_k and not closed;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'update', 'closed', '', 'false', 'true — منتهي', 'tracker-import');
      v_n := v_n + 1;
    end if;
  end if;

  select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 5;
  if v_k is not null then
    update qm_kashefs set closed = true where id = v_k and not closed;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'update', 'closed', '', 'false', 'true — منتهي', 'tracker-import');
      v_n := v_n + 1;
    end if;
  end if;

  select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 6;
  if v_k is not null then
    update qm_kashefs set closed = true where id = v_k and not closed;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'update', 'closed', '', 'false', 'true — منتهي', 'tracker-import');
      v_n := v_n + 1;
    end if;
  end if;

  select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 7;
  if v_k is not null then
    update qm_kashefs set closed = true where id = v_k and not closed;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'update', 'closed', '', 'false', 'true — منتهي', 'tracker-import');
      v_n := v_n + 1;
    end if;
  end if;

  select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 8;
  if v_k is not null then
    update qm_kashefs set closed = true where id = v_k and not closed;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'update', 'closed', '', 'false', 'true — منتهي', 'tracker-import');
      v_n := v_n + 1;
    end if;
  end if;

  select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 9;
  if v_k is not null then
    update qm_kashefs set closed = true where id = v_k and not closed;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'update', 'closed', '', 'false', 'true — منتهي وجاري حسابه', 'tracker-import');
      v_n := v_n + 1;
    end if;
  end if;

  select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 10;
  if v_k is not null then
    update qm_kashefs set closed = true where id = v_k and not closed;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'update', 'closed', '', 'false', 'true — منتهي وجاري حسابه', 'tracker-import');
      v_n := v_n + 1;
    end if;
  end if;

  select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 11;
  if v_k is not null then
    update qm_kashefs set closed = true where id = v_k and not closed;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'update', 'closed', '', 'false', 'true — منتهي', 'tracker-import');
      v_n := v_n + 1;
    end if;
  end if;

  select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 14;
  if v_k is not null then
    update qm_kashefs set closed = true where id = v_k and not closed;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'update', 'closed', '', 'false', 'true — منتهي', 'tracker-import');
      v_n := v_n + 1;
    end if;
  end if;

  select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 15;
  if v_k is not null then
    update qm_kashefs set closed = true where id = v_k and not closed;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'update', 'closed', '', 'false', 'true — منتهي', 'tracker-import');
      v_n := v_n + 1;
    end if;
  end if;

  select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 16;
  if v_k is not null then
    update qm_kashefs set closed = true where id = v_k and not closed;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'update', 'closed', '', 'false', 'true — منتهي وجاري حسابه', 'tracker-import');
      v_n := v_n + 1;
    end if;
  end if;

  select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 17;
  if v_k is not null then
    update qm_kashefs set closed = true where id = v_k and not closed;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'update', 'closed', '', 'false', 'true — منتهي', 'tracker-import');
      v_n := v_n + 1;
    end if;
  end if;

  select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 18;
  if v_k is not null then
    update qm_kashefs set closed = true where id = v_k and not closed;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'update', 'closed', '', 'false', 'true — منتهي وجاري حسابه', 'tracker-import');
      v_n := v_n + 1;
    end if;
  end if;

  select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 19;
  if v_k is not null then
    update qm_kashefs set closed = true where id = v_k and not closed;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'update', 'closed', '', 'false', 'true — منتهي', 'tracker-import');
      v_n := v_n + 1;
    end if;
  end if;

  select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 20;
  if v_k is not null then
    update qm_kashefs set closed = true where id = v_k and not closed;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'update', 'closed', '', 'false', 'true — منتهي وجاري حسابه', 'tracker-import');
      v_n := v_n + 1;
    end if;
  end if;

  select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 21;
  if v_k is not null then
    update qm_kashefs set closed = true where id = v_k and not closed;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'update', 'closed', '', 'false', 'true — منتهي', 'tracker-import');
      v_n := v_n + 1;
    end if;
  end if;

  select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 22;
  if v_k is not null then
    update qm_kashefs set closed = true where id = v_k and not closed;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'update', 'closed', '', 'false', 'true — منتهي', 'tracker-import');
      v_n := v_n + 1;
    end if;
  end if;

  select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 23;
  if v_k is not null then
    update qm_kashefs set closed = true where id = v_k and not closed;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'update', 'closed', '', 'false', 'true — منتهي وجاري حسابه', 'tracker-import');
      v_n := v_n + 1;
    end if;
  end if;

  select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 24;
  if v_k is not null then
    update qm_kashefs set closed = true where id = v_k and not closed;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'update', 'closed', '', 'false', 'true — منتهي وجاري حسابه', 'tracker-import');
      v_n := v_n + 1;
    end if;
  end if;

  select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 25;
  if v_k is not null then
    update qm_kashefs set closed = true where id = v_k and not closed;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'update', 'closed', '', 'false', 'true — منتهي وجاري حسابه', 'tracker-import');
      v_n := v_n + 1;
    end if;
  end if;

  select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 26;
  if v_k is not null then
    update qm_kashefs set closed = true where id = v_k and not closed;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'update', 'closed', '', 'false', 'true — منتهي', 'tracker-import');
      v_n := v_n + 1;
    end if;
  end if;

  select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 27;
  if v_k is not null then
    update qm_kashefs set closed = true where id = v_k and not closed;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'update', 'closed', '', 'false', 'true — منتهي وجاري حسابه', 'tracker-import');
      v_n := v_n + 1;
    end if;
  end if;

  select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 28;
  if v_k is not null then
    update qm_kashefs set closed = true where id = v_k and not closed;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'update', 'closed', '', 'false', 'true — منتهي', 'tracker-import');
      v_n := v_n + 1;
    end if;
  end if;

  select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 29;
  if v_k is not null then
    update qm_kashefs set closed = true where id = v_k and not closed;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'update', 'closed', '', 'false', 'true — منتهي وجاري حسابه', 'tracker-import');
      v_n := v_n + 1;
    end if;
  end if;

  select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 30;
  if v_k is not null then
    update qm_kashefs set closed = true where id = v_k and not closed;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'update', 'closed', '', 'false', 'true — منتهي وجاري حسابه', 'tracker-import');
      v_n := v_n + 1;
    end if;
  end if;

  select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 31;
  if v_k is not null then
    update qm_kashefs set closed = true where id = v_k and not closed;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'update', 'closed', '', 'false', 'true — منتهي', 'tracker-import');
      v_n := v_n + 1;
    end if;
  end if;

  select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 32;
  if v_k is not null then
    update qm_kashefs set closed = true where id = v_k and not closed;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'update', 'closed', '', 'false', 'true — منتهي وجاري حسابه', 'tracker-import');
      v_n := v_n + 1;
    end if;
  end if;

  select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 33;
  if v_k is not null then
    update qm_kashefs set closed = true where id = v_k and not closed;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'update', 'closed', '', 'false', 'true — منتهي وجاري حسابه', 'tracker-import');
      v_n := v_n + 1;
    end if;
  end if;

  select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 34;
  if v_k is not null then
    update qm_kashefs set closed = true where id = v_k and not closed;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'update', 'closed', '', 'false', 'true — منتهي وجاري حسابه', 'tracker-import');
      v_n := v_n + 1;
    end if;
  end if;

  select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 35;
  if v_k is not null then
    update qm_kashefs set closed = true where id = v_k and not closed;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'update', 'closed', '', 'false', 'true — منتهي وجاري حسابه', 'tracker-import');
      v_n := v_n + 1;
    end if;
  end if;

  select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 36;
  if v_k is not null then
    update qm_kashefs set closed = true where id = v_k and not closed;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'update', 'closed', '', 'false', 'true — منتهي', 'tracker-import');
      v_n := v_n + 1;
    end if;
  end if;

  select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 37;
  if v_k is not null then
    update qm_kashefs set closed = true where id = v_k and not closed;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'update', 'closed', '', 'false', 'true — منتهي وجاري حسابه', 'tracker-import');
      v_n := v_n + 1;
    end if;
  end if;

  select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 38;
  if v_k is not null then
    update qm_kashefs set closed = true where id = v_k and not closed;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'update', 'closed', '', 'false', 'true — منتهي', 'tracker-import');
      v_n := v_n + 1;
    end if;
  end if;

  select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 39;
  if v_k is not null then
    update qm_kashefs set closed = true where id = v_k and not closed;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'update', 'closed', '', 'false', 'true — منتهي وجاري حسابه', 'tracker-import');
      v_n := v_n + 1;
    end if;
  end if;

  select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 40;
  if v_k is not null then
    update qm_kashefs set closed = true where id = v_k and not closed;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'update', 'closed', '', 'false', 'true — منتهي', 'tracker-import');
      v_n := v_n + 1;
    end if;
  end if;

  select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 41;
  if v_k is not null then
    update qm_kashefs set closed = true where id = v_k and not closed;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'update', 'closed', '', 'false', 'true — منتهي وجاري حسابه', 'tracker-import');
      v_n := v_n + 1;
    end if;
  end if;

  select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 42;
  if v_k is not null then
    update qm_kashefs set closed = true where id = v_k and not closed;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'update', 'closed', '', 'false', 'true — منتهي وجاري حسابه', 'tracker-import');
      v_n := v_n + 1;
    end if;
  end if;

  select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 44;
  if v_k is not null then
    update qm_kashefs set closed = true where id = v_k and not closed;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'update', 'closed', '', 'false', 'true — منتهي', 'tracker-import');
      v_n := v_n + 1;
    end if;
  end if;

  select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 46;
  if v_k is not null then
    update qm_kashefs set closed = true where id = v_k and not closed;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'update', 'closed', '', 'false', 'true — منتهي وجاري حسابه', 'tracker-import');
      v_n := v_n + 1;
    end if;
  end if;

  select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 47;
  if v_k is not null then
    update qm_kashefs set closed = true where id = v_k and not closed;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'update', 'closed', '', 'false', 'true — منتهي', 'tracker-import');
      v_n := v_n + 1;
    end if;
  end if;

  select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 51;
  if v_k is not null then
    update qm_kashefs set closed = true where id = v_k and not closed;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'update', 'closed', '', 'false', 'true — منتهي', 'tracker-import');
      v_n := v_n + 1;
    end if;
  end if;

  select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 56;
  if v_k is not null then
    update qm_kashefs set closed = true where id = v_k and not closed;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'update', 'closed', '', 'false', 'true — منتهي', 'tracker-import');
      v_n := v_n + 1;
    end if;
  end if;

  select id into v_k from qm_kashefs where contract_id = v_contract and kashef_no = 57;
  if v_k is not null then
    update qm_kashefs set closed = true where id = v_k and not closed;
    if found then
      insert into qm_changelog (entity, entity_id, action, field, line_ref, old_value, new_value, actor_email)
      values ('kashef', v_k, 'update', 'closed', '', 'false', 'true — منتهي وجاري حسابه', 'tracker-import');
      v_n := v_n + 1;
    end if;
  end if;

  raise notice 'work orders closed: %', v_n;
end $qmcl$;

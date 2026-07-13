# DECISIONS.md — assumptions made during unattended runs

One line each: what was assumed and why. Newest at the bottom.

## 2026-07-13 — v2 brief adoption run (slices 0–5 continuation)

- The attached `CLAUDE_CODE_BRIEF_commitment_pipeline-v2.md` supersedes the committed `CLAUDE_CODE_BRIEF_commitment_pipeline.md`; both stay in the repo, CLAUDE.md points at the -v2 file — history preserved, no file deleted.
- `copri-frontend-SKILL.md` (Tailwind + shadcn + react-i18next stack) conflicts with the repo convention (single-file vanilla-JS `index.html`, no build step). Per the brief's preamble, memory files win on conventions: control slices continue in the existing single-file convention; the skill governs the separate visual-refresh track and its principles (patterns, bilingual rules, one-accent-action) are applied within the current stack where they don't require a build system. FLAGGED as the brief requires.
- `COPRI_dedup_review.xlsx` added to .gitignore (real vendor names = company books, never enter version control); it stays at the repo root because the accountant is actively filling it.
- Brief says capture is raw with NO PO reference; 0018 had added an optional LPO+line picker to the receiver form. Rework (0020): picker removed from field capture, mapping moved to the accountant daily batch with auto-suggestions; the 0018 no-PO flag machinery is kept as the exception path.
- Approval chains (0020): implemented as `approval_chain_gates` config rows (chain key, gate order, required capability). Seeded chain per brief: accountant-raised requests → finance_approver (Jimmy). Default chain for all other requests = single head-office approver gate (matches v1 behaviour). Adding PM→Jimmy→Admin later = config rows only.
- New pipeline capabilities as boolean columns (finance_approver, management) following the 0017 accountant/admin pattern rather than a roles table — smallest diff on the existing model; `plant manager` = requester whose pipeline_user_centers row is 5205 (no new column needed).
- Item master (0020): new `items` + `item_spectronova_ids` tables mirroring the vendors pattern; `commitment_lines.item_id` and `material_receipts.item_id` added NULLABLE alongside the existing free-text columns — hard FK enforcement deferred until the items master is seeded (dedup ITEMS sheet pending accountant decisions), so nothing breaks at paste time.
- Subcontract register (0021): `subcontracts` extends a CON commitment 1:1 (like blanket_lpos extends LPO) rather than a parallel register — keeps no-orphan rule and numbering intact.
- Materials-issued-to-sub ledger (0021): existing `material_receipts.subcontractor` free-text rows are the capture source; back-charge rows link receipts to subcontracts at accounting time (same map-then-approve pattern as PO matching).
- Blanket lines (0022): existing ceiling-based `blanket_lpos` gains `blanket_lines`; drawdown switches to qty-per-line for line-based blankets while legacy money-ceiling blankets keep working until re-registered (staged: `control_mode` column 'ceiling'|'lines').
- MFA (TOTP) for admin/finance-approver: Supabase Auth supports TOTP enrollment but the portal is plain-REST; enforcement is a pre-launch checklist item in SECURITY.md, not built this run.
- Dedup tool: `apply` consumes the existing root `COPRI_dedup_review.xlsx` format (the accountant already fills it) — the spec's `output\dedup-review-vendors.xlsx` name applies to fresh `propose` output in the same format.

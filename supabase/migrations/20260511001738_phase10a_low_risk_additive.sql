-- Phase 10A.LOW_RISK_ADDITIVE — additive nullable columns across three tables.
--
-- Six ADD COLUMN ops: officer end-reason enum, companies onboarding state (×4),
-- company_people citizenship. All nullable, all idempotent, no pipeline coupling.
--
-- Source locks: docs/phase10a-decomposition-proposal-2026-05-10.md
--   - LOCK-3 (officer_appointments.end_reason)
--   - LOCK-4 (companies onboarding state ×4)
--   - LOCK-5 (company_people.citizenship)
-- Precedent: 20260405000000_sprint6_people_ownership.sql (sibling enum on director_mandates.end_reason).
-- Pipeline preservation: none required. Zero existing callers read any of these columns.
-- Visual gate: not required (additive nullable, no current-state semantics affected).


-- LOCK-3 — officer_appointments.end_reason
-- Mirror of director_mandates.end_reason enum (5 values), per 2026-04-23 audit §6.1 S10-TR-4.
ALTER TABLE officer_appointments
  ADD COLUMN IF NOT EXISTS end_reason TEXT NULL
  CHECK (end_reason IN ('resignation','revocation','term_expired','death','disqualification'));


-- LOCK-4 — companies onboarding state (4 columns)

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS onboarding_branch TEXT NULL
  CHECK (onboarding_branch IN ('rush','complete'));

-- onboarding_step: text keys, app-enforced (no DB CHECK; values evolve faster than DDL cycles).
-- Canonical key set owned by the Phase 10F UX team. Examples:
--   'step_4_incorporation', 'step_5_branch_choice', 'step_6_administrateurs',
--   'step_7_actionnaires', 'step_8a_dirigeants', 'step_8b_movements'.
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS onboarding_step TEXT NULL;

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ NULL;

-- history_phases_status: JSONB canonical shape per spec §1.3.
--   {
--     "directors":     "complete" | "deferred" | "incomplete",
--     "officers":      "complete" | "deferred" | "incomplete",
--     "shareholdings": "complete" | "deferred" | "incomplete"
--   }
-- NULL on existing rows is acceptable; app layer initializes to '{}'::jsonb when onboarding starts.
-- No CHECK constraint at the column level for v1.0 (app-enforced).
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS history_phases_status JSONB NULL;


-- LOCK-5 — company_people.citizenship
-- is_canadian_resident stays unchanged (load-bearing for LSAQ 110 / CBCA s.105 residency rule).
-- citizenship is the legal nationality (passport country), separate from residency.
-- Per Q-A3 resolution: keep both columns. NULL on existing rows ("we don't know yet");
-- Phase 10F UX captures forward.
ALTER TABLE company_people
  ADD COLUMN IF NOT EXISTS citizenship TEXT NULL;

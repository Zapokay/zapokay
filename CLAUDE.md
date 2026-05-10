# Claude Code project conventions — ZapOkay

This file captures conventions for AI-assisted development on ZapOkay. It is auto-loaded by Claude Code at session start.

Conventions are added section-by-section as patterns stabilize. Each section is concise and enforceable. If a rule needs more context, it links to a doc in `docs/`.

---

## 1. Bilingual i18n convention

**Strategic anchor (locked April 28, 2026):** ZapOkay is bilingual at launch. EN is a launch requirement, not aspirational.

**The rule:** all user-facing strings flow through `useTranslations()` + ICU MessageFormat keys in `messages/fr.json` and `messages/en.json`.

### NEVER

- ❌ `<div>{fr ? 'Bonjour' : 'Hello'}</div>` — inline ternary in JSX
- ❌ `<span>Aujourd'hui</span>` — hardcoded FR (or EN) string in JSX
- ❌ `toLocaleDateString('fr-CA')` — hardcoded locale literal
- ❌ Returning `title_fr` only from API routes serving the UI
- ❌ ICU plurals without `=0` clause for French (FR is grammatically singular for zero: "0 document" not "0 documents")

### ALWAYS

- ✅ `<div>{t('greeting')}</div>` — string from JSON via `useTranslations`
- ✅ For dates/numbers: use `useLocale()` to get current locale, then thread to formatters in `lib/utils.ts`
- ✅ API routes serving UI must ship both `_fr` AND `_en` fields, OR accept a locale param and return locale-correct values
- ✅ ICU plurals with explicit `=0` clauses

```
"missingCount": "{count, plural, =0 {Aucun document manquant} =1 {1 document manquant} other {# documents manquants}}"
```

### Exceptions (must be justified inline)

- PDF templates may legitimately be FR-only for QC corporate documents. Mark with comment: `// FR-only: QC corporate doc`
- Internal-only debug strings (console.log, error messages thrown to developers) don't need i18n

### Reference

Full audit of remaining bilingual debt + Phase 1/2/3 phasing: `docs/bilingual-i18n-audit-2026-04-28.md`

---

## 2. Fiscal Year capitalization

**Fiscal Year capitalization (locked May 4, 2026):** EN form is always `Fiscal Year` with capital Y when used as a label, identifier, heading, button text, chip, or form field. Lowercase `fiscal year` is acceptable only mid-sentence as a common noun in flowing prose. FR form `Exercice` is unchanged. Applies to JSX, JSON, API responses, PDF templates.

---

## 3. Two-Layer Language Model — Code Invariant

Locked May 4, 2026 in `ZapOkay_Project_Memory_Core.md`. Code-level rule:

**Any handler that mutates `users.preferred_language` or `companies.preferred_language` MUST NOT call `router.push`, `router.replace`, `setLocale`, or `window.location.assign` to change UI locale.**

UI locale (top-right toggle, URL-based) and document `preferred_language` (per-user/per-company stored value used for PDF generation) are independent concerns. Coupling them violates the locked product model and the user-facing tooltip in Paramètres ("Les deux paramètres sont indépendants").

Canonical reference: architectural comment above `saveProfile()` in `components/dashboard/SettingsClient.tsx` (added in `c8a1377`).

Origin: Settings bundle Bug 1 (May 5, 2026) — Profile save handler had a `router.push(`/${lang}/dashboard/settings`)` that pre-dated the May 4 lock and silently switched UI locale on every save where preferred_language disagreed with URL locale.

---

## 4. Project memory files (read-only by default, ask before writing)

The three project memory files live OUTSIDE the repo at:

  Core:  /Users/droussy/Projects/ZapOkay/Max - CTO/Project Memory Document/ZapOkay_Project_Memory_Core.md
  State: /Users/droussy/Projects/ZapOkay/Max - CTO/Project Memory Document/ZapOkay_Project_Memory_State.md
  Queue: /Users/droussy/Projects/ZapOkay/Max - CTO/Project Memory Document/ZapOkay_Project_Memory_Queue.md

These are not git-tracked. Updates happen via str_replace per WA #8 (append-only to engineering-lessons section unless explicitly authorized otherwise). Per Dom's standing instruction, do NOT search for these files — the paths above are authoritative. The path contains spaces in "Max - CTO" and "Project Memory Document"; the str_replace tool accepts the strings as-is, but bash commands need quoting.

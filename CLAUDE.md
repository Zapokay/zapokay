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

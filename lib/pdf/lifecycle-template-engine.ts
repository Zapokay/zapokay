/**
 * #19d — Lifecycle template fill engine (Option-C "door").
 *
 * Pure function: looks up a template entry by docKey from the registry in
 * `lifecycle-templates.ts`, validates required tokens, composes neqClause
 * from ctx.neq, performs {{token}} substitution against the locale-correct
 * body/title, and returns the filled resolution alongside the entry's
 * instrument + satisfies metadata.
 *
 * Architectural rule (DELIBERATE): this engine reads templates ONLY through
 * the registry module's exported shape. It does NOT hardcode any template
 * text. A future content-as-data source (DB-backed templates, per-tenant
 * overrides, etc.) will implement the same shape and swap in behind this
 * engine without changing it or its callers.
 *
 * Locale safety: bodyFr is rendered under locale='fr' and bodyEn under
 * locale='en' — full stop. This deliberately avoids the existing
 * EN-renders-FR-body defect tracked separately for the resolution shells
 * (board-resolution.ts / shareholder-resolution.ts).
 */

import {
  LIFECYCLE_TEMPLATES,
  type LifecycleInstrument,
  type LifecycleSatisfies,
  type LifecycleTemplateEntry,
} from './lifecycle-templates';

export type LifecycleLocale = 'fr' | 'en';

export interface FilledLifecycleResolution {
  docKey: string;
  locale: LifecycleLocale;
  instrument: LifecycleInstrument;
  satisfies: LifecycleSatisfies;
  resolution: {
    number: 1;
    title: string;
    body: string;
  };
}

/**
 * Compose the NEQ clause that follows {{companyName}} in every body.
 * Returns " (NEQ : <neq>)" when present (note the leading space), "" when absent.
 * Empty/whitespace-only neq counts as absent.
 */
function composeNeqClause(neq: string | undefined | null): string {
  if (!neq || neq.trim() === '') return '';
  return ` (NEQ : ${neq})`;
}

/**
 * Validate that every var in requiredVars is present and non-empty in ctx.
 * Throws a single error listing ALL missing tokens (not just the first).
 */
function assertRequiredVars(
  entry: LifecycleTemplateEntry,
  ctx: Record<string, string>,
): void {
  const missing: string[] = [];
  for (const v of entry.requiredVars) {
    const val = ctx[v];
    if (val === undefined || val === null || String(val).trim() === '') {
      missing.push(v);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `lifecycle-template-engine: missing required vars for docKey="${entry.docKey}": ${missing.join(', ')}`,
    );
  }
}

/**
 * Replace every `{{token}}` occurrence in `text` using values from `vars`.
 * Tokens not in `vars` are left UNTOUCHED so the post-fill residual-token
 * assertion below can detect them.
 */
function substitute(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, token: string) => {
    if (Object.prototype.hasOwnProperty.call(vars, token)) {
      return vars[token];
    }
    return match;
  });
}

/**
 * Fill a lifecycle resolution template.
 *
 * @param docKey  Registry key (one of the 5 in LIFECYCLE_TEMPLATES).
 * @param ctx     Token values. Must contain every var in the entry's
 *                requiredVars (non-empty). `ctx.neq` is optional; the engine
 *                composes `neqClause` from it. Extra unrecognized keys are
 *                ignored (substitution only fires on registered {{tokens}}).
 * @param locale  'fr' or 'en'. Selects bodyFr/titleFr or bodyEn/titleEn.
 * @param framework 'CBCA' | 'LSA'. Selects a per-framework body override from
 *                entry.regimeBodies when present; otherwise the shared
 *                bodyFr/bodyEn renders (fallback). Title is locale-only.
 * @returns       Filled resolution shape `{ number: 1, title, body }` plus
 *                docKey, locale, instrument, and the satisfies tuple — ready
 *                for downstream wiring to event_documents and the existing
 *                board/shareholder resolution shells.
 * @throws        If docKey is unknown, if any required var is missing/empty,
 *                or if any `{{token}}` remains in the output after substitution.
 */
export function fillLifecycleResolution(
  docKey: string,
  ctx: Record<string, string>,
  locale: LifecycleLocale,
  framework: 'CBCA' | 'LSA',
): FilledLifecycleResolution {
  const entry = LIFECYCLE_TEMPLATES[docKey];
  if (!entry) {
    throw new Error(
      `lifecycle-template-engine: unknown docKey="${docKey}". Known keys: ${Object.keys(LIFECYCLE_TEMPLATES).join(', ')}`,
    );
  }

  assertRequiredVars(entry, ctx);

  // Compose neqClause from ctx.neq BEFORE substitution so {{neqClause}}
  // resolves like any other token.
  const vars: Record<string, string> = {
    ...ctx,
    neqClause: composeNeqClause(ctx.neq),
  };

  const title = locale === 'fr' ? entry.titleFr : entry.titleEn;
  // Regime-aware body select WITH FALLBACK: per-framework override IF present for
  // this framework, ELSE shared bodyFr/bodyEn. No regimeBodies (all 8 today) →
  // shared body → byte-identical to pre-upgrade output. Title stays locale-only.
  const regimeBody =
    framework === 'CBCA' ? entry.regimeBodies?.cbca : entry.regimeBodies?.lsa;
  const body = regimeBody
    ? (locale === 'fr' ? regimeBody.fr : regimeBody.en)
    : (locale === 'fr' ? entry.bodyFr : entry.bodyEn);

  const filledTitle = substitute(title, vars);
  const filledBody = substitute(body, vars);

  // Post-fill safety net: if any registered {{token}} was somehow missed
  // (typo in registry, future token added to body but not to substitute
  // pipeline, etc.), fail loudly here rather than ship a half-filled doc.
  const residualPattern = /\{\{/;
  if (residualPattern.test(filledTitle)) {
    throw new Error(
      `lifecycle-template-engine: residual "{{" in filled title for docKey="${docKey}" locale="${locale}": ${filledTitle}`,
    );
  }
  if (residualPattern.test(filledBody)) {
    throw new Error(
      `lifecycle-template-engine: residual "{{" in filled body for docKey="${docKey}" locale="${locale}"`,
    );
  }

  return {
    docKey: entry.docKey,
    locale,
    instrument: entry.instrument,
    satisfies: entry.satisfies,
    resolution: {
      number: 1,
      title: filledTitle,
      body: filledBody,
    },
  };
}

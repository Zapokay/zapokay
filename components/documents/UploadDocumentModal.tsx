'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { getFiscalYearLabel } from '@/lib/fiscal-year-label';
import { uploadErrorMessageKey } from '@/lib/upload-error-message';
import { composeDisplayName } from '@/lib/display-name';
import { mustBlockUpload } from '@/lib/fiscal-year-open';
import { formatDate } from '@/lib/utils';
import { MINUTE_BOOK_SECTIONS, resolveMinuteBookSection } from '@/lib/minute-book-section';
import type { ChecklistItem } from '@/app/api/minute-book/completeness/route';

const DOC_TYPE_KEYS = ['statuts', 'resolution', 'pv', 'registre', 'rapport', 'autre'] as const;
const LANGUAGE_KEYS = ['fr', 'en', 'bilingual'] as const;

type Mode = 'vault' | 'row';
type Step = 'form' | 'confirm' | 'uploading' | 'done';

/**
 * A2a — ONE requirement this document declares it covers. The collection of these
 * replaces the two scalar useStates; requirementKey / requirementYear are DERIVED
 * from its first element (E1), so the seven existing readers keep reading scalars.
 */
type SelectedRequirement = { key: string; year: number | null };

/** Group key for the yearless requirements. Any real year stringifies to digits. */
const FOUNDATIONAL_GROUP = 'foundational';

export interface UploadDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** PDF already validated by the parent (drop zone or row file input). */
  file: File;
  /**
   * 'vault' — classification fields editable; title locks iff a requirement is set.
   * 'row'   — type, fiscal year, "corresponds to", title all locked. Language editable.
   */
  mode: Mode;
  companyId: string;
  framework: 'LSA' | 'CBCA';
  /** Used for canonical FR/EN title resolution + subtitle interpolation. */
  locale: string;
  /**
   * In 'vault' mode: optional starting values, all fields remain editable.
   * In 'row' mode: requirementKey/requirementYear/docType/docYear/title are
   * authoritative and locked.
   */
  prefill?: {
    requirementKey?: string | null;
    requirementYear?: number | null;
    docType?: string;
    docYear?: number | null;
    title?: string;
  };
  /** Vault mode only — populates the FY selector. */
  activeFiscalYears?: number[];
  /** Seeds the language field on open; user can change it in either mode. */
  preferredLanguage?: 'fr' | 'en';
  /**
   * Phase B B4 — when set, the modal renders the destructive-replace
   * warning, swaps the submit label to "Remplacer" / "Replace", and the
   * upload helper deletes this row + its storage object on insert success.
   * Single neutral copy for both 'uploaded' and 'generated' source rows.
   */
  replaceDocumentId?: string;
  /**
   * Selects the replace-warning copy. 'archive' (Complétude archive rows) uses
   * archive-appropriate keys; default 'requirement' keeps the existing copy so
   * current callers render unchanged.
   */
  replaceContext?: 'requirement' | 'archive';
  /**
   * Brief 2b — lifecycle event-row upload. When set, forwarded verbatim into the
   * POST as `eventLink` so the uploaded doc links to its act (event_documents),
   * exactly as the direct-POST path did. Additive: requirement / vault / archive
   * callers omit it and are unaffected.
   */
  eventLink?: { event_type: string; event_id: string; event_phase: string };
  /** Resolves with the new document id on successful upload. */
  onUploadComplete: (documentId: string) => void;
  /** Optional error sink for parents that own toast UX. */
  onError?: (message: string) => void;
}

export default function UploadDocumentModal(props: UploadDocumentModalProps) {
  const {
    isOpen,
    onClose,
    file,
    mode,
    companyId,
    framework,
    locale,
    prefill,
    activeFiscalYears = [],
    preferredLanguage = 'fr',
    replaceDocumentId,
    onUploadComplete,
    onError,
    replaceContext,
    eventLink,
  } = props;
  const isReplace = !!replaceDocumentId;
  const warnTitleKey =
    replaceContext === 'archive' ? 'upload.archiveReplaceWarningTitle' : 'upload.replaceWarningTitle';
  const warnBodyKey =
    replaceContext === 'archive' ? 'upload.archiveReplaceWarningBody' : 'upload.replaceWarningBody';

  const fr = locale === 'fr';
  const t = useTranslations('documents');
  // The gate's sentence is single-sourced with Complétude and the board — the same
  // key, so the three surfaces cannot drift into three phrasings of one fact.
  const tReq = useTranslations('requirementRow');
  // The Livre's own section labels, so the user reads the exact tab name.
  const tSections = useTranslations('minuteBook.binder.sections');

  // -- State --
  const [title, setTitle] = useState(prefill?.title ?? '');
  const [titleDirty, setTitleDirty] = useState(false);
  const [docType, setDocType] = useState(prefill?.docType ?? 'autre');
  const [language, setLanguage] = useState<string>(preferredLanguage);
  // Three states, NOT two. '' = nothing picked yet, and the gate at
  // `yearMissing` below blocks submit on it. A number = a real fiscal year.
  // 'none' = the user deliberately said this document belongs to NO fiscal
  // year — the founding-documents case.
  //
  // Before 'none' existed there was no way to say that. With no requirement
  // selected, `isFoundational` is false, so the field was shown AND mandatory,
  // and it offered nothing but fiscal years. A law-firm PDF bundling several
  // founding pieces has no single requirement to attach and belongs to no
  // year: it could not be uploaded AT ALL. This was a closed door, not a
  // classification problem.
  const [docYear, setDocYear] = useState<number | '' | 'none'>(prefill?.docYear ?? '');
  // A2a — THE COLLECTION IS THE STATE. Two scalars can disagree with each other;
  // one array cannot. Row mode seeds it from its locked prefill, so that path holds
  // exactly one entry and behaves as it always has.
  const [selected, setSelected] = useState<SelectedRequirement[]>(() =>
    prefill?.requirementKey
      ? [{ key: prefill.requirementKey, year: prefill.requirementYear ?? null }]
      : [],
  );
  // P1 — the sticky. Raised as soon as the collection has held TWO requirements in
  // THIS opening, never lowered until the modal reopens. See the effect that raises
  // it, which sits next to the two cascades it disarms.
  const [everMulti, setEverMulti] = useState(false);
  // D3 — the fiscal year is now FILLED by the ticks instead of filtering them, so it
  // needs the same hand-back `titleDirty` gives the title: touched once, it is the
  // user's. Only the derivation below reads it.
  const [docYearDirty, setDocYearDirty] = useState(false);
  // P2 — null means "never touched": the render falls back to the computed default
  // (foundational + current year open) until the user's FIRST toggle, after which
  // this array IS the truth and nothing recomputes over it. The precedent that
  // forced this shape is a lazy initializer on Complétude that never re-ran and
  // left a filtered row inside a collapsed panel; here the inverse — a recompute
  // that erases the group a user just opened — would be worse.
  const [openGroups, setOpenGroups] = useState<string[] | null>(null);
  // Distinguishes "the fetch answered nothing" from "the fetch has not answered",
  // so the empty line never flashes while the request is in flight.
  const [requirementsLoaded, setRequirementsLoaded] = useState(false);
  const [requirements, setRequirements] = useState<ChecklistItem[]>([]);
  // The fiscal-year ENDS, for the upload gate on the corresponds-to options. They
  // ride in on the SAME response as `requirements` below — the fetch was already
  // throwing them away. No second request, no new prop.
  const [fiscalYears, setFiscalYears] = useState<{ year: number; endDate: string }[]>([]);
  // A2c — the user's shelf override: once the user picks, the derived value
  // stops replacing their choice. Like `titleDirty`, the requirement cascade
  // lowers it again, so a NEW requirement re-proposes its own section.
  const [bookSection, setBookSection] = useState('');
  const [sectionDirty, setSectionDirty] = useState(false);
  const [isCertified, setIsCertified] = useState(false);
  const [step, setStep] = useState<Step>('form');
  const [error, setError] = useState('');

  const overlayRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const isLockedAll = mode === 'row';

  // -- Reset on (re)open. Prefill intentionally absent from deps: row-mode
  //    prefill should not re-snap state mid-session if the parent re-renders. --
  useEffect(() => {
    if (!isOpen) return;
    setTitle(prefill?.title ?? '');
    setTitleDirty(false);
    setDocType(prefill?.docType ?? 'autre');
    setLanguage(preferredLanguage);
    setDocYear(prefill?.docYear ?? '');
    setSelected(
      prefill?.requirementKey
        ? [{ key: prefill.requirementKey, year: prefill.requirementYear ?? null }]
        : [],
    );
    setBookSection('');
    setSectionDirty(false);
    setEverMulti(false);
    setDocYearDirty(false);
    setOpenGroups(null);
    setIsCertified(false);
    setStep('form');
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // -- Fetch requirements (both modes — row needs canonical title for the subtitle). --
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    fetch('/api/minute-book/completeness')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data?.checklist) setRequirements(data.checklist);
        if (data?.fiscalYears) setFiscalYears(data.fiscalYears);
        setRequirementsLoaded(true);
      })
      .catch(() => {
        /* non-fatal — but the list must stop saying "loading" either way */
        if (!cancelled) setRequirementsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  // ── E1 — "THE FIRST" IS THE LIST'S ORDER, NEVER THE TICKING ORDER. ──
  //
  // Two users ticking the same boxes in a different sequence must obtain the same
  // document: same scalar, same section, same title. Ticking order is a property of
  // the user's hand; `requirements` order is a property of the data (the server's
  // own sort_order fan-out). Only the second one is reproducible, so the collection
  // is sorted by position in `requirements` before anything reads "the first".
  //
  // Unknown keys sort LAST and keep their relative order — that is the row-mode
  // prefill arriving before the completeness fetch resolves, not an error.
  // With a single selection every branch below is a no-op; it is written now so the
  // invariant is already true when A2a's checkbox list can produce several.
  const orderedSelected = useMemo(() => {
    const positionOf = (s: SelectedRequirement) =>
      requirements.findIndex(
        (r) => r.requirement_key === s.key && (r.year ?? null) === s.year,
      );
    return [...selected].sort((a, b) => {
      const ia = positionOf(a);
      const ib = positionOf(b);
      if (ia === ib) return 0;
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }, [selected, requirements]);

  // The two scalars the SEVEN existing readers consume — now DERIVED from the
  // collection instead of stored beside it. Same names, same types, same nulls, so
  // not one of those readers is touched by this slice.
  const requirementKey = orderedSelected[0]?.key ?? null;
  const requirementYear = orderedSelected[0]?.year ?? null;

  // -- Derived: currently linked requirement --
  const selectedReq = useMemo(
    () =>
      requirementKey
        ? (requirements.find(
            (r) =>
              r.requirement_key === requirementKey &&
              (r.year ?? null) === (requirementYear ?? null),
          ) ?? null)
        : null,
    [requirementKey, requirementYear, requirements],
  );
  // A2a — the WHOLE collection, resolved against the checklist, in E1 order. The
  // multi-aware derivations read this; `selectedReq` above stays "the first, if it
  // resolves" and keeps feeding the readers that still want a single requirement.
  const selectedReqs = useMemo(
    () =>
      orderedSelected
        .map(
          (s) =>
            requirements.find(
              (r) => r.requirement_key === s.key && (r.year ?? null) === s.year,
            ) ?? null,
        )
        .filter((r): r is ChecklistItem => r !== null),
    [orderedSelected, requirements],
  );
  const selectedCount = orderedSelected.length;

  // E5 — foundational means EVERY selection is foundational, and the emptiness
  // guard is explicit: `every` on an empty array answers true, which would hide the
  // Fiscal Year field from a user who has ticked nothing at all.
  const isFoundational =
    selectedReqs.length > 0 && selectedReqs.every((r) => r.category === 'foundational');

  // D3 KILLED THE FILTER. The Fiscal Year field no longer decides WHICH requirements
  // exist — it is filled BY them. A user who picked 2025 can now tick 2022, which is
  // the whole point of a multi-year cabinet bundle.

  /** Membership test for the checkboxes, at the same grain as the collection. */
  const selectedIds = useMemo(
    () => new Set(selected.map((s) => `${s.key}|${s.year ?? ''}`)),
    [selected],
  );

  // ── D1 / E9 — GROUPING WITHOUT RE-SORTING ANYTHING. ──
  // `requirements` already arrives in the only order that matters: foundational
  // first, then one block per fiscal year newest-first, then the anniversary row.
  // Bucketing by `req.year` in order of FIRST APPEARANCE reproduces that exactly.
  // ★ E9 falls out for free: the federal annual return carries its attach year, so
  // it drops into that year's bucket instead of dangling at the end of the list.
  const requirementGroups = useMemo(() => {
    const groups: { key: string; label: string; items: ChecklistItem[] }[] = [];
    const byKey = new Map<string, { key: string; label: string; items: ChecklistItem[] }>();
    for (const req of requirements) {
      const key = req.year === null ? FOUNDATIONAL_GROUP : String(req.year);
      let group = byKey.get(key);
      if (!group) {
        // ⚠️ `documents.filterFoundational` IS NOW READ IN TWO PLACES: the Vault's
        // own year filter and this header. One vocabulary, not two — do not rename
        // it believing you are touching a single surface.
        group = {
          key,
          label:
            req.year === null
              ? t('filterFoundational')
              : getFiscalYearLabel(req.year, locale),
          items: [],
        };
        byKey.set(key, group);
        groups.push(group);
      }
      group.items.push(req);
    }
    return groups;
  }, [requirements, t, locale]);

  // Founding pieces and the CURRENT fiscal year open; everything else collapsed.
  // The data is already newest-first, so the current year is the first year bucket —
  // read, never re-sorted (D1).
  const defaultOpenGroups = useMemo(() => {
    const firstYear = requirementGroups.find((g) => g.key !== FOUNDATIONAL_GROUP);
    return firstYear ? [FOUNDATIONAL_GROUP, firstYear.key] : [FOUNDATIONAL_GROUP];
  }, [requirementGroups]);
  const effectiveOpenGroups = openGroups ?? defaultOpenGroups;

  const toggleGroup = useCallback(
    (key: string) => {
      setOpenGroups((prev) => {
        const base = prev ?? defaultOpenGroups;
        return base.includes(key) ? base.filter((k) => k !== key) : [...base, key];
      });
    },
    [defaultOpenGroups],
  );

  const toggleRequirement = useCallback((req: ChecklistItem) => {
    const year = req.year ?? null;
    setSelected((prev) =>
      prev.some((s) => s.key === req.requirement_key && s.year === year)
        ? prev.filter((s) => !(s.key === req.requirement_key && s.year === year))
        : [...prev, { key: req.requirement_key, year }],
    );
  }, []);

  // A2c — the shelf the server WOULD derive, shown to the user before it does.
  // Same function, same arguments, so the form can never disagree with the insert.
  const derivedSection = useMemo(
    () =>
      resolveMinuteBookSection(requirementKey, docType, requirements, docYear === 'none') ?? '',
    [requirementKey, docType, requirements, docYear],
  );
  const effectiveSection = sectionDirty ? bookSection : derivedSection;

  // ── THE UPLOAD GATE, ON THE CORRESPONDS-TO OPTIONS. ──
  //
  // Third and last surface of the gate (Complétude row, A3 board card, here). Same
  // predicate, same sentence, no second copy of the comparison.
  //
  // ⚠️ IT MATTERS MOST IN THE `docYear === ''` STATE. The filter above shows EVERY
  // requirement while no year is chosen, so an open-year annual resolution is
  // offered before the user has picked anything. Keying on the requirement's own
  // `req.year` — never on `docYear` — makes the gate correct in that state too.
  //
  // ⚠️ NO `eventLink` ARGUMENT, AND IT IS NOT AN OMISSION. Options come from
  // `data.checklist`, which the API contract keeps requirements-only precisely
  // because THIS dropdown iterates it ("would render acts as requirement options",
  // app/api/minute-book/completeness/route.ts). Acts arrive in a separate `acts`
  // field this modal does not read, so the lifecycle-act exclusion is unreachable
  // here. If that contract ever changes, this call must gain the argument.
  const uploadBlockedFor = useCallback(
    (req: ChecklistItem): boolean =>
      mustBlockUpload(
        req.requirement_key,
        req.year,
        req.year === null
          ? null
          : fiscalYears.find((f) => f.year === req.year)?.endDate ?? null,
      ),
    [fiscalYears],
  );

  // ── P1 — THE STICKY IS RAISED HERE, AND NEVER LOWERED UNTIL THE MODAL REOPENS. ──
  //
  // Dom's ruling, 2026-08-23: renaming answers a DESIGNATION; unticking is a
  // SUBTRACTION, not a designation. Once the collection has held two, the surviving
  // requirement does not get to rename the document.
  //
  // A sticky boolean rather than a signature comparison, deliberately: a signature
  // would protect 2 → 1 and destroy 2 → 0 → 1, and nobody could explain why those
  // two differ. The bias always leans the same way — protect what the user typed.
  //
  // ACCEPTED COST (Max, 2026-08-23): after a multi, the annual auto-title stays off
  // until the modal reopens. The box is never empty — it keeps the filename-derived
  // prefill (UploadZone) or whatever a previous cascade wrote.
  useEffect(() => {
    if (selectedCount >= 2) setEverMulti(true);
  }, [selectedCount]);

  // -- Cascade: requirement change → set type/title/docYear (vault mode only) --
  // D4 — at two or more, NO cascade at all, not even a flag reset. P1 — after a
  // multi the title is left alone, while type and shelf still follow the first.
  // `everMulti` and `selectedCount` are read but deliberately NOT in the deps: this
  // must re-run when the requirement changes, never when the sticky flips.
  useEffect(() => {
    if (mode === 'row') return;
    if (selectedCount >= 2) return;
    if (requirementKey && !selectedReq) return;
    if (!everMulti) setTitleDirty(false);
    setSectionDirty(false);
    if (!selectedReq) return;
    setDocType(selectedReq.document_type);
    // ⚠️ NO setDocYear HERE ANY MORE (A2a É5). The year has ONE writer now, the D3
    // effect below — this cascade is frozen at two or more, and the year must still
    // follow there. Same values at one selection, so nothing changed under N ≤ 1.
    if (selectedReq.category === 'foundational' && !everMulti) {
      setTitle(fr ? selectedReq.title_fr : selectedReq.title_en);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requirementKey, requirementYear, requirements]);

  // ── D3 — THE FISCAL YEAR FOLLOWS THE TICKS, AND STAYS EDITABLE. ──
  //
  // The MOST RECENT ticked year, deliberately: a cabinet bundle dated by its OLDEST
  // year would fall into the archive box and drop out of the percentage. Most-recent
  // avoids that by default without forbidding anything — `docYearDirty` hands the
  // field back the instant the user touches it.
  //
  // All-foundational resolves to '' — the same value the cascade used to write, and
  // the field is hidden in that state anyway (E5).
  useEffect(() => {
    if (mode === 'row') return;
    if (docYearDirty) return;
    if (selectedReqs.length === 0) return;
    const years = selectedReqs
      .map((r) => r.year)
      .filter((y): y is number => typeof y === 'number');
    setDocYear(years.length > 0 ? Math.max(...years) : '');
  }, [selectedReqs, docYearDirty, mode]);

  // -- Annual title set (vault mode) --
  // The sole setter of an ANNUAL requirement's title box (the foundational
  // cascade above sets the title only for foundational). Now always the clean
  // localized requirement title: the year does NOT belong in the NAME — it lives
  // in document_year and is rendered once, middot-separated, at each surface
  // (composeDisplayName). Previously this baked "— {docYear}", the vault-mode
  // twin of the row-path bake in useRowUpload.
  //
  // ⚠️ THIS IS A SECOND, INDEPENDENT PATH TO setTitle, AND THE STICKY MUST COVER IT
  // OR IT COVERS NOTHING. Its own guard is `titleDirty`, which is FALSE whenever the
  // user never typed — so without the two guards below, unticking the FIRST of two
  // requirements renames the document to the survivor's title, the exact rewrite P1
  // forbids. Read side by side with the cascade above, not assumed. The count guard
  // also removes a render-ordering race: at 1 → 2 the sticky's state has not
  // committed yet, but the count already reads two.
  useEffect(() => {
    if (mode === 'row') return;
    if (selectedCount >= 2) return;
    if (everMulti) return;
    if (!selectedReq || selectedReq.category !== 'annual') return;
    if (titleDirty) return;
    setTitle(fr ? selectedReq.title_fr : selectedReq.title_en);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requirementKey, requirementYear, requirements, docYear, titleDirty]);

  // -- ESC closes (unless mid-upload) --
  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && step !== 'uploading') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, step, onClose]);

  // -- Focus trap (mirrors BulkCatchUpModal) --
  useEffect(() => {
    if (!isOpen) return;
    const node = modalRef.current;
    if (!node) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    function getFocusable(): HTMLElement[] {
      if (!node) return [];
      return Array.from(
        node.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([readonly]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
    }
    getFocusable()[0]?.focus();
    function handleKey(e: KeyboardEvent) {
      if (e.key !== 'Tab') return;
      const list = getFocusable();
      if (list.length === 0) {
        e.preventDefault();
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !node?.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        e.preventDefault();
        first.focus();
      }
    }
    node.addEventListener('keydown', handleKey);
    return () => {
      node.removeEventListener('keydown', handleKey);
      previouslyFocused?.focus?.();
    };
  }, [isOpen]);

  // -- Final-replace detection (Part 4, #135) — Vault path only. A CERTIFIED
  //    upload onto a "correspond à" requirement that ALREADY holds a final
  //    must be confirmed before it supersedes that final. Draft replaces and
  //    non-vault paths are unaffected. selectedReq is derived from the already
  //    -fetched completeness checklist, so detection needs no extra fetch. --
  //    E7 — ANY of the N, not only the first: a conflict the user cannot see is a
  //    conflict the warning owes them. The confirm copy receives the COUNT, because
  //    a warning that names the wrong peril warns of nothing.
  //    ⚠️ LIMIT, STATED RATHER THAN HIDDEN: `replaceDocumentId` retires ONE document,
  //    so at two or more conflicts only the FIRST is superseded — and the copy says
  //    so. Retiring all N belongs to the #135 predicate work (A7), not here.
  const conflictingReqs = useMemo(
    () => selectedReqs.filter((r) => r.satisfied && r.document_is_finalized === true),
    [selectedReqs],
  );
  const isFinalConflict = mode === 'vault' && isCertified && conflictingReqs.length > 0;
  const detectedFinalId = isFinalConflict
    ? (conflictingReqs[0]?.document_id ?? undefined)
    : undefined;

  // -- Submit gate --
  // Phase B B5: certification is no longer mandatory. The checkbox is still
  // rendered and toggleable; its state determines `is_finalized` at insert
  // time (B5-edit-4 below). Title non-empty; allow the form step AND the
  // final-replace confirm step (the confirm button re-enters handleSubmit).
  // Vault mandatory year (3b): when the FY field is shown (vault, has years,
  // not foundational) a real fiscal year must be picked. Row mode + foundational
  // (field hidden / year auto-set) and requirement-selected vault (year
  // auto-set, select disabled) all satisfy this without a manual pick.
  const fyFieldShown = mode === 'vault' && activeFiscalYears.length > 0 && !isFoundational;
  const yearMissing = fyFieldShown && docYear === '';
  const canSubmit = !!title.trim() && !yearMissing && (step === 'form' || step === 'confirm');

  const handleSubmit = useCallback(async (opts?: { confirmed?: boolean }) => {
    if (!canSubmit) return;
    // Final-replace gate (Vault): divert to the confirm step unless the user
    // already confirmed via the confirm view. Never POST while diverting.
    if (isFinalConflict && !opts?.confirmed) {
      setStep('confirm');
      return;
    }
    setStep('uploading');
    setError('');
    const fd = new FormData();
    fd.append('file', file);
    fd.append('companyId', companyId);
    fd.append('title', title);
    fd.append('docType', docType);
    fd.append('language', language);
    // '' and 'none' both mean "no fiscal year": omit the field rather than let
    // String('none') reach the route, where numOrNull would coerce it to NaN and
    // answer null by accident. Same result, stated instead of inferred.
    if (typeof docYear === 'number') fd.append('docYear', String(docYear));
    // A2b — the third year state, on its own field precisely because the comment
    // above forbids it riding on docYear. Lets the server derive as the client did.
    if (docYear === 'none') fd.append('noFiscalYear', 'true');
    if (requirementKey) fd.append('requirementKey', requirementKey);
    if (requirementYear != null) fd.append('requirementYear', String(requirementYear));
    // ★ A2a — THE DOUBLE WRITE. The whole collection goes to requirement_documents;
    // the FIRST (E1) also stays on the two scalars above, so the seven scalar readers
    // see no difference at all. That is what will let them be switched one at a time.
    // VAULT ONLY, and the test is explicit because row mode shares this very function
    // and this very route: its link would be an exact copy of the scalar, so it
    // carries zero information, and A4's backfill covers that path anyway.
    if (mode === 'vault' && orderedSelected.length > 0) {
      fd.append(
        'requirementLinks',
        JSON.stringify(
          orderedSelected.map((s) => ({ requirement_key: s.key, requirement_year: s.year })),
        ),
      );
    }
    // A2c — always sent when the field was shown; the helper validates it and
    // derives instead if it is not one of the nine.
    if (effectiveSection) fd.append('minuteBookSection', effectiveSection);
    fd.append('framework', framework);
    fd.append('requirements', JSON.stringify(requirements));
    // Phase B B5: actual checkbox state — true ⇒ 'téléversé', false ⇒ WIP
    // upload that the three-state model rebuckets to 'généré' (see
    // lib/minute-book/state.ts) until the user finalizes via re-upload.
    fd.append('isFinalized', String(isCertified));
    // Single source for the replace target: the explicit prop (Completeness
    // row path) OR the Vault-detected existing final id (Part 4). Either way
    // it flows into the Pass-B supersede in uploadDocument.
    const effectiveReplaceId = replaceDocumentId ?? detectedFinalId;
    if (effectiveReplaceId) fd.append('replaceDocumentId', effectiveReplaceId);
    // No userId field — the route derives it from the session (closes the
    // trusted-param hole). eventLink (Brief 2b): forwarded when the event-row
    // caller sets it, so uploadDocument writes the event_documents link (the
    // act's identity — orthogonal to Binder placement, which follows document_type).
    if (eventLink) fd.append('eventLink', JSON.stringify(eventLink));

    // ⚠️ fetch and res.json() are the only steps on this path that can REJECT
    // rather than return an { ok:false } body, so they are the only ones inside
    // the try. A dropped connection — or a non-JSON body from an edge/proxy
    // error — used to reject into nothing: no message, and the modal stayed
    // frozen on 'uploading' forever. The rest of the path was already sound:
    // the route answers { ok, error } on every branch and the { ok:false }
    // handler below reports it.
    let res: Response | null = null;
    let result: any = null;
    try {
      res = await fetch('/api/documents/upload', { method: 'POST', body: fd });
      result = await res.json();
    } catch {
      // Same treatment as the { ok:false } branch, with the mapper's generic
      // fallback: no error code and no status is exactly the case
      // uploadErrorMessageKey() answers 'uploadFailed' to. No new key.
      const msg = t(uploadErrorMessageKey());
      setError(msg);
      onError?.(msg);
      setStep('form');
      return;
    }

    if (!result || !result.ok) {
      const msg = t(uploadErrorMessageKey(result?.error, res?.status));
      setError(msg);
      onError?.(msg);
      setStep('form');
      return;
    }

    setStep('done');
    onUploadComplete(result.documentId);
    setTimeout(() => onClose(), 600);
  }, [
    canSubmit,
    file,
    companyId,
    title,
    docType,
    language,
    docYear,
    mode,
    requirementKey,
    requirementYear,
    orderedSelected,
    framework,
    requirements,
    effectiveSection,
    isCertified,
    replaceDocumentId,
    eventLink,
    isFinalConflict,
    detectedFinalId,
    t,
    onError,
    onUploadComplete,
    onClose,
  ]);

  // -- Row-mode subtitle: canonical title with annual year (middot, shared format) --
  const subtitleRow = useMemo(() => {
    if (mode !== 'row') return '';
    const req = selectedReq;
    if (!req) return prefill?.title ?? '';
    const base = fr ? req.title_fr : req.title_en;
    return composeDisplayName(
      base,
      null,
      req.category === 'annual' && typeof req.year === 'number' ? req.year : null,
    );
  }, [mode, selectedReq, prefill?.title, fr]);

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={overlayRef}
      onClick={(e) => {
        if (e.target === overlayRef.current && step !== 'uploading') onClose();
      }}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4"
    >
      <div
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        className="bg-[var(--card-bg)] rounded-xl max-w-lg w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="mb-4">
          <h3 className="text-base font-semibold text-[var(--text-heading)]">
            {t('upload.modalTitle')}
          </h3>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            {mode === 'vault'
              ? t('upload.modalSubtitleVault')
              : t('upload.modalSubtitleRow', { requirement: subtitleRow })}
          </p>
        </div>

        {/* Replace warning (Phase B B4) — amber treatment per Dom's call:
            consequential but recoverable (regenerate-from-template recourse). */}
        {isReplace && (
          <div
            role="alert"
            className="mb-4 flex items-start gap-3 rounded-lg border border-[var(--amber-400)] bg-[var(--warning-bg)] p-4"
          >
            <AlertTriangle
              className="h-5 w-5 text-[var(--warning-text)] flex-shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <div>
              <h4 className="text-sm font-semibold text-[var(--warning-text)]">
                {t(warnTitleKey)}
              </h4>
              <p className="mt-1 text-sm text-[var(--warning-text)]">
                {t(warnBodyKey)}
              </p>
            </div>
          </div>
        )}

        {/* Final-replace confirm (Part 4, #135) — Vault certified upload over an
            existing final. Same amber treatment as the B4 replace warning;
            distinct copy (the old final is retired, with a 10-day undo). The
            actions row below owns the Annuler / Remplacer buttons. */}
        {step === 'confirm' && (
          <div
            role="alert"
            className="mb-4 flex items-start gap-3 rounded-lg border border-[var(--amber-400)] bg-[var(--warning-bg)] p-4"
          >
            <AlertTriangle
              className="h-5 w-5 text-[var(--warning-text)] flex-shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <div>
              <h4 className="text-sm font-semibold text-[var(--warning-text)]">
                {t('upload.finalReplaceTitle')}
              </h4>
              <p className="mt-1 text-sm text-[var(--warning-text)]">
                {t('upload.finalReplaceBody', { count: conflictingReqs.length })}
              </p>
            </div>
          </div>
        )}

        {/* File summary (read-only) */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-lg bg-[var(--error-bg)] flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-[var(--error-text)]" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-[var(--text-body)] truncate">{file.name}</p>
            <p className="text-xs text-[var(--text-muted)]">
              {(file.size / 1024 / 1024).toFixed(2)} MB
            </p>
          </div>
        </div>

        {/* Form */}
        <div className="space-y-3">
          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
              {t('metaTitle')}
            </label>
            <input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setTitleDirty(true);
              }}
              readOnly={isLockedAll}
              placeholder={t('metaTitlePlaceholder')}
              className={`w-full px-3 py-2 rounded-xl text-sm border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-body)] placeholder:text-[var(--input-placeholder)] focus:outline-none focus:border-[var(--input-border-focus)] transition-colors ${isLockedAll ? 'opacity-60 cursor-not-allowed' : ''}`}
            />
          </div>

          {/* Type + Language */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                {t('metaType')}
              </label>
              {/* A2a É6 — le type suit UNE exigence, il ne peut pas suivre deux.
                  À une sélection : dérivé et verrouillé, exactement comme avant A2a,
                  aucun changement de comportement.
                  À deux ou plus : la cascade est gelée (D4), donc le champ garderait
                  indéfiniment le type de la PREMIÈRE case cochée — « statuts » sur un
                  lot qui contient aussi des résolutions annuelles — sans que personne
                  puisse le corriger. Un champ gelé sur une vérité partielle ET grisé,
                  c'est la faute de A2a-0 recommise ailleurs. On le libère.
                  Retour à une seule sélection : la cascade repart et le redérive, et
                  le champ se reverrouille. C'est voulu : décocher est une SOUSTRACTION,
                  et le type suit, contrairement au titre que le collant protège.
                  `isLockedAll` d'abord, pour que le mode ligne reste verrouillé par sa
                  propre raison et non par accident de comptage. */}
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                disabled={isLockedAll || (!!requirementKey && selectedCount <= 1)}
                className="w-full px-3 py-2 rounded-xl text-sm border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-body)] focus:outline-none focus:border-[var(--input-border-focus)] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {DOC_TYPE_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {t(`types.${k}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                {t('metaLanguage')}
              </label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-sm border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-body)] focus:outline-none focus:border-[var(--input-border-focus)] transition-colors"
              >
                {LANGUAGE_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {t(`languages.${k}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Fiscal Year — vault mode only, hidden when foundational */}
          {mode === 'vault' && activeFiscalYears.length > 0 && !isFoundational && (
            <div>
              <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                {t('upload.fiscalYear')}
              </label>
              <select
                value={docYear}
                onChange={(e) => {
                  // D3 — the field is pre-filled from the ticks and stays the user's
                  // the moment they touch it. No longer disabled by a selection.
                  setDocYearDirty(true);
                  setDocYear(
                    e.target.value === ''
                      ? ''
                      : e.target.value === 'none'
                        ? 'none'
                        : parseInt(e.target.value)
                  );
                }}
                className="w-full px-3 py-2 rounded-xl text-sm border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-body)] focus:outline-none focus:border-[var(--input-border-focus)] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <option value="" disabled>{t('upload.fiscalYearPlaceholder')}</option>
                <option value="none">{t('filterFoundational')}</option>
                {activeFiscalYears.map((y) => (
                  <option key={y} value={y}>
                    {getFiscalYearLabel(y, locale)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Corresponds-to — vault mode only. A2a: MULTI-SELECT, grouped by year,
              with collapsible headers. One document may cover several requirements:
              the cabinet PDF holding the whole founding file, or one PDF grouping
              five years of annual resolutions. */}
          {mode === 'vault' && (
            <div>
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <label className="block text-xs font-semibold text-[var(--text-muted)]">
                  {t('upload.correspondsTo')}
                </label>
                {/* D2 — absence is the signal: no counter at zero, never "0 selected". */}
                {selectedCount > 0 && (
                  <span className="text-xs font-medium text-[var(--text-body)]">
                    {t('upload.selectedCount', { count: selectedCount })}
                  </span>
                )}
              </div>
              {/* ★ THE WORD "OPTIONAL" SURVIVES THE SELECT. It used to live in the
                  placeholder, and a checkbox list has none — so without this line the
                  field would look MANDATORY while staying optional, which D5 forbids
                  outright (Dom, 2026-08-15: a user must be able to file a document the
                  platform never anticipated). Zero ticks IS "none": there is no
                  "None" checkbox to fabricate. */}
              <p className="text-xs text-[var(--text-muted)] mb-1.5">
                {t('upload.correspondsToOptional')}
              </p>
              {requirementGroups.length === 0 ? (
                requirementsLoaded && (
                  <p className="rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text-muted)]">
                    {t('upload.correspondsToEmpty')}
                  </p>
                )
              ) : (
                /* The list scrolls in ITS OWN box: this is a seventh field in a modal
                   that already scrolls, and forty rows would push "Téléverser" out of
                   sight. The button stays reachable without moving the page. */
                <div className="max-h-64 overflow-y-auto rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)]">
                  {requirementGroups.map((group) => {
                    const groupSelected = group.items.filter((r) =>
                      selectedIds.has(`${r.requirement_key}|${r.year ?? ''}`),
                    ).length;
                    const isGroupOpen = effectiveOpenGroups.includes(group.key);
                    return (
                      <div
                        key={group.key}
                        className="border-b border-[var(--input-border)] last:border-b-0"
                      >
                        <button
                          type="button"
                          onClick={() => toggleGroup(group.key)}
                          aria-expanded={isGroupOpen}
                          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-[var(--card-bg)]"
                        >
                          <span className="flex min-w-0 items-center gap-1.5">
                            <ChevronRight
                              aria-hidden="true"
                              className={`h-3.5 w-3.5 flex-shrink-0 text-[var(--text-muted)] transition-transform ${isGroupOpen ? 'rotate-90' : ''}`}
                            />
                            <span className="truncate text-xs font-semibold text-[var(--text-body)]">
                              {group.label}
                            </span>
                          </span>
                          {/* D2 — a collapsed group holding a tick SAYS SO. This is
                              what makes collapsing safe: no tick is ever invisible.
                              It counts what is TICKED, never what is tickable. */}
                          {groupSelected > 0 && (
                            <span className="flex-shrink-0 text-xs font-medium text-[var(--text-muted)]">
                              {t('upload.selectedCount', { count: groupSelected })}
                            </span>
                          )}
                        </button>
                        {isGroupOpen && (
                          <div className="pb-1">
                            {group.items.map((req) => {
                              // The gate is unchanged: a blocked requirement stays
                              // VISIBLE and disabled with its reason. An unclosed
                              // fiscal year must be seen refused, not vanish.
                              const blocked = uploadBlockedFor(req);
                              const endDate =
                                req.year === null
                                  ? null
                                  : fiscalYears.find((f) => f.year === req.year)?.endDate ??
                                    null;
                              const id = `${req.requirement_key}|${req.year ?? ''}`;
                              return (
                                <label
                                  key={id}
                                  className={`flex items-start gap-2 px-3 py-1.5 text-sm ${blocked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-[var(--card-bg)]'}`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={selectedIds.has(id)}
                                    disabled={blocked}
                                    onChange={() => toggleRequirement(req)}
                                    className="mt-0.5 h-4 w-4 flex-shrink-0 disabled:cursor-not-allowed"
                                  />
                                  <span className="min-w-0">
                                    <span className="text-[var(--text-body)]">
                                      {fr ? req.title_fr : req.title_en}
                                      {/* E8 — ONE name for a fiscal year, the same
                                          helper the field above uses. */}
                                      {req.year ? ` · ${getFiscalYearLabel(req.year, locale)}` : ''}
                                    </span>
                                    {blocked && endDate && (
                                      <span className="block text-xs text-[var(--text-muted)]">
                                        {tReq('generateUnavailableUntil', {
                                          date: formatDate(endDate, locale),
                                        })}
                                      </span>
                                    )}
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Book section — vault mode only, like corresponds-to.
              ⚠️ PLACEMENT AND GROUPING AWAIT ARIA: this is a seventh field in a
              modal that had six, and no design pass has ever been made on it.
              The form here is deliberately the plainest copy of the existing
              selects, not a decision. */}
          {mode === 'vault' && (
            <div>
              <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                {t('upload.bookSection')}
              </label>
              <select
                value={effectiveSection}
                onChange={(e) => {
                  setSectionDirty(true);
                  setBookSection(e.target.value);
                }}
                className="w-full px-3 py-2 rounded-xl text-sm border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-body)] focus:outline-none focus:border-[var(--input-border-focus)] transition-colors"
              >
                {MINUTE_BOOK_SECTIONS.map((k) => (
                  <option key={k} value={k}>
                    {tSections(k)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Certification */}
          <div className="pt-2">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isCertified}
                onChange={(e) => setIsCertified(e.target.checked)}
                className="mt-0.5 flex-shrink-0"
              />
              <span className="text-sm text-[var(--text-body)]">{t('upload.certify')}</span>
            </label>
            <p className="text-xs text-[var(--text-muted)] ml-6 mt-1">
              {t('upload.certifyHelp')}
            </p>
          </div>

          {error && <p className="text-xs text-[var(--error-text)]">{error}</p>}
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-5">
          <button
            type="button"
            onClick={step === 'confirm' ? () => setStep('form') : onClose}
            disabled={step === 'uploading'}
            className="flex-1 px-4 py-2 rounded-lg text-sm font-medium border border-[var(--card-border)] text-[var(--text-body)] bg-[var(--card-bg)] hover:bg-[var(--page-bg)] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={() => handleSubmit(step === 'confirm' ? { confirmed: true } : undefined)}
            disabled={!canSubmit}
            className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold bg-[var(--navy-600)] text-white hover:bg-[var(--navy-800)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {step === 'uploading'
              ? t('upload.submitting')
              : step === 'confirm' || isReplace
                ? t('upload.replaceSubmit')
                : t('upload.submit')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

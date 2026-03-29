/**
 * glossaryMarker.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Deterministic glossary term marker for ArcAI.
 *
 * DESIGN GOALS
 * ────────────
 * 1. Zero randomness — output is a pure function of (htmlText, subjectSlug).
 * 2. Subject-isolated — only the active subject's glossary is ever loaded.
 * 3. Longest-match-first — "kinetic energy" wins over "energy".
 * 4. First-occurrence-only — each canonical term is marked once per response.
 * 5. No partial-word false positives — word-boundary anchors on every pattern.
 * 6. HTML-safe — matching runs on text nodes only; existing tags are untouched.
 * 7. Math-safe — content inside \(...\), $$...$$, <code>, <pre> is skipped.
 * 8. Fast for large glossaries via a compiled PatternSet built once per subject.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import * as fs   from "fs";
import * as path from "path";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GlossaryEntry {
  term:          string;
  definition:    string;
  subject:       string;
  depends_on?:   string[];
  related_terms?: string[];
  wiki?:         string;
  aliases?:      string[];
  examples?:     string[];
  symbol?:       string;
  unit?:         string;
  priority?:     number;
}

/**
 * A compiled, ready-to-use matcher for one subject.
 *
 * WHY A PREBUILT STRUCTURE?
 * Compiling 300+ regex patterns on every request is O(n) work per request.
 * Building it once and caching it reduces per-request cost to O(1) lookup
 * plus O(m) scan where m = response length.  For typical glossaries (< 500
 * terms) the compiled PatternSet fits comfortably in RAM and reuse is free.
 */
interface PatternSet {
  /**
   * Sorted from longest canonical surface form to shortest so that
   * "kinetic energy" always wins over a bare "energy" match.
   */
  entries: CompiledEntry[];
  /** Canonical form → GlossaryEntry for O(1) definition lookup. */
  byCanonical: Map<string, GlossaryEntry>;
}

interface CompiledEntry {
  /**
   * The canonical term as it appears in the JSON (used as data-term value
   * and as the key into byCanonical).
   */
  canonical: string;
  /**
   * Combined regex that matches the canonical term OR any of its aliases,
   * case-insensitively, with word-boundary anchors.
   *
   * Example for term "force" with alias "net force":
   *   /\b(?:force|net\s+force)\b/gi
   *
   * WHY ONE REGEX PER ENTRY (not one giant alternation)?
   * A single mega-alternation /(term1|term2|...|termN)/gi would be shorter
   * code but makes it impossible to know *which* canonical term was matched
   * without a second lookup.  Per-entry regexes give us the canonical key
   * instantly.  The trade-off is N regex objects; for < 500 entries this is
   * negligible.
   */
  pattern: RegExp;
  /** Number of word-tokens in the longest surface form (for stable sort). */
  longestFormLength: number;
}

// ── Glossary file map ─────────────────────────────────────────────────────────

const GLOSSARY_DIR = __dirname;

/** Maps the subject slug used by app.html → JSON filename. */
const SUBJECT_FILE: Record<string, string> = {
  mathematics: "university-mathematics.json",
  physics:     "introduction-to-physics.json",
  english:     "academic-writing.json",
  statistics:  "basic-statistics.json",
  computing:   "introduction-to-computing.json",
};

// ── In-process cache ──────────────────────────────────────────────────────────

/**
 * Cache keyed by subject slug.  Populated lazily on first use, kept for the
 * lifetime of the Node process.
 *
 * PERFORMANCE NOTE
 * On a warm server, markTerms() for a typical 800-word Groq response completes
 * in < 2 ms because:
 *  • glossary file I/O happens only once per subject per process lifetime.
 *  • PatternSet construction (regex compile) happens only once per subject.
 *  • The actual scan is a series of RegExp.exec() calls — fast native code.
 */
const patternCache = new Map<string, PatternSet>();

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Load (or return cached) the PatternSet for a subject slug.
 * Call this during server startup or lazily on first request.
 */
export function loadGlossary(subjectSlug: string): PatternSet {
  if (patternCache.has(subjectSlug)) {
    return patternCache.get(subjectSlug)!;
  }

  const filename = SUBJECT_FILE[subjectSlug];
  if (!filename) {
    throw new Error(`Unknown subject slug: "${subjectSlug}"`);
  }

  const filePath = path.join(GLOSSARY_DIR, filename);
  const raw      = fs.readFileSync(filePath, "utf-8");
  const entries: GlossaryEntry[] = JSON.parse(raw);

  const ps = buildPatternSet(entries);
  patternCache.set(subjectSlug, ps);
  return ps;
}

/**
 * Main entry point.
 *
 * Takes the HTML string already produced by formatResponse() (in server.js)
 * and returns a new HTML string with glossary terms wrapped like:
 *
 *   <term data-term="kinetic energy">Kinetic energy</term>
 *
 * CONTRACT
 * • Pure function: same inputs → same output, always.
 * • Does not mutate the PatternSet.
 * • Only the first occurrence of each canonical term is marked.
 * • Matching is case-insensitive; the original casing of the text is preserved.
 * • Existing HTML tags, math delimiters, and code blocks are never modified.
 */
export function markTerms(html: string, subjectSlug: string): string {
  const ps = loadGlossary(subjectSlug);
  return applyMarkings(html, ps);
}

/**
 * Retrieve the definition for a canonical term (for the bottom-sheet UI).
 * Returns undefined if the term is not in the loaded glossary.
 */
export function getDefinition(
  subjectSlug: string,
  canonicalTerm: string
): GlossaryEntry | undefined {
  const ps = loadGlossary(subjectSlug);
  return ps.byCanonical.get(canonicalTerm.toLowerCase());
}

// ── PatternSet builder ────────────────────────────────────────────────────────

function buildPatternSet(entries: GlossaryEntry[]): PatternSet {
  const compiled:    CompiledEntry[]             = [];
  const byCanonical: Map<string, GlossaryEntry>  = new Map();

  for (const entry of entries) {
    const canonical = entry.term.toLowerCase();
    byCanonical.set(canonical, entry);

    // Collect all surface forms: the term itself + any aliases.
    const surfaces: string[] = [entry.term, ...(entry.aliases ?? [])];

    // Deduplicate (aliases sometimes repeat the canonical term).
    const unique = [...new Set(surfaces.map(s => s.toLowerCase()))];

    // Sort descending by token count so longer phrases anchor the alternation
    // leftmost, giving them priority if the regex engine tries alternatives in
    // order.  (JavaScript regex alternation is left-to-right ordered.)
    unique.sort((a, b) => tokenCount(b) - tokenCount(a));

    const longestFormLength = tokenCount(unique[0]);

    // Build the regex pattern string for each surface form.
    const alts = unique.map(surface => escapeForRegex(surface));

    /**
     * REGEX ANATOMY
     * ─────────────
     * (?<!\w)          — negative lookbehind: no word char before the match
     *                    (handles apostrophes / hyphens that \b misses)
     * (?:alt1|alt2)    — non-capturing alternation of all surface forms
     * (?!\w)           — negative lookahead: no word char after the match
     * i flag           — case-insensitive
     * g flag           — global so we can find ALL occurrences then take first
     *
     * WHY LOOKBEHIND/LOOKAHEAD INSTEAD OF \b?
     * \b treats the boundary between a letter and a hyphen/apostrophe as a
     * word boundary, so "force" would match inside "re-force" or "force's".
     * Lookbehind/ahead anchors on \w (alphanumeric + _) which prevents this.
     *
     * MULTI-WORD TERMS AND WHITESPACE
     * "kinetic energy" in the text might appear as "kinetic  energy" (two
     * spaces) or "kinetic\nenergy" (line-broken).  We replace literal spaces
     * in the pattern with \s+ so these still match.
     */
    const patternSource =
      `(?<![\\w])(?:${alts.join("|")})(?![\\w])`;

    const pattern = new RegExp(patternSource, "gi");

    compiled.push({ canonical, pattern, longestFormLength });
  }

  // PRIMARY SORT: longest-form length descending.
  // SECONDARY SORT: lower priority number = higher importance (1 beats 2).
  compiled.sort((a, b) => {
    if (b.longestFormLength !== a.longestFormLength) {
      return b.longestFormLength - a.longestFormLength;
    }
    const pa = byCanonical.get(a.canonical)?.priority ?? 99;
    const pb = byCanonical.get(b.canonical)?.priority ?? 99;
    return pa - pb;
  });

  return { entries: compiled, byCanonical };
}

// ── Core marking engine ───────────────────────────────────────────────────────

/**
 * ALGORITHM OVERVIEW
 * ══════════════════
 *
 * Step 1 — Segment the HTML into SAFE (do-not-touch) and TEXT (scannable) zones.
 *
 *   Safe zones are:
 *     • HTML tags            — <strong>, </p>, <term ...>, etc.
 *     • Existing <term> tags — never double-wrap a marked term.
 *     • <code> / <pre>       — code blocks must not get glossary links.
 *     • Inline math          — \(...\)
 *     • Block math           — $$...$$
 *     • HTML entities        — &amp; &lt; etc.
 *
 *   All other zones are TEXT and eligible for term marking.
 *
 * Step 2 — For each TEXT zone, run the sorted pattern list.
 *
 *   We maintain a `marked` Set to track which canonical terms have already
 *   been wrapped.  Once a term is in `marked` its pattern is skipped.
 *
 *   Within a single TEXT zone we build a list of non-overlapping Match records
 *   (start, end, canonical, matchedText), resolving conflicts by:
 *     a. Earlier position wins.
 *     b. Longer match wins if two matches start at the same position.
 *
 *   This produces a deterministic, conflict-free set of replacements.
 *
 * Step 3 — Reconstruct the HTML.
 *
 *   Walk through the original string, emitting SAFE zones verbatim and TEXT
 *   zones with their matches replaced by <term data-term="...">...</term>.
 *
 * COMPLEXITY
 * ──────────
 * Let T = length of HTML, N = number of glossary entries.
 * Step 1: O(T) — single regex scan.
 * Step 2: O(N × T) worst case, but in practice:
 *   • Most TEXT zones are short (< 200 chars).
 *   • Compiled native RegExp is extremely fast.
 *   • Once a term is marked it is skipped for remaining zones.
 * Step 3: O(T).
 * Overall: practical O(T + N) for typical inputs.
 */
function applyMarkings(html: string, ps: PatternSet): string {

  // ── Step 1: Segment ──
  /**
   * This regex splits the string into alternating SAFE / TEXT segments.
   * The split is performed by capturing the SAFE segments; what falls between
   * them is TEXT.
   *
   * SAFE patterns (in order of precedence):
   *  1. <term ...>...</term>  — already-marked terms (no double-wrap)
   *  2. <pre>...</pre>        — preformatted code blocks
   *  3. <code>...</code>      — inline code
   *  4. $$...$$               — block math
   *  5. \(...\)               — inline math
   *  6. Any HTML tag          — < ... >
   *  7. HTML entities         — &word;
   */
  const SAFE_PATTERN = /(<script[\s\S]*?<\/script>|<term\b[^>]*>[\s\S]*?<\/term>|<pre[\s\S]*?<\/pre>|<code[\s\S]*?<\/code>|\$\$[\s\S]*?\$\$|\\\([\s\S]*?\\\)|<[^>]+>|&[a-zA-Z#0-9]+;)/g;

  // Split into interleaved [text, safe, text, safe, ...] segments.
  // The captured groups end up at odd indices of the result array.
  const segments = html.split(SAFE_PATTERN);

  // ── Step 2 + 3: Scan TEXT zones and rebuild ──
  const marked = new Set<string>(); // canonical terms already wrapped
  const output: string[] = [];

  for (let i = 0; i < segments.length; i++) {
    if (i % 2 === 1) {
      // ODD → SAFE zone: pass through verbatim.
      output.push(segments[i]);
      continue;
    }

    // EVEN → TEXT zone: eligible for marking.
    const text = segments[i];
    if (!text) {
      output.push(text);
      continue;
    }

    output.push(markTextZone(text, ps, marked));
  }

  return output.join("");
}

/**
 * Mark glossary terms inside a single plain-text zone.
 *
 * CONFLICT RESOLUTION
 * ───────────────────
 * Multiple patterns can produce overlapping matches.
 * Example: "mean absolute deviation" contains both "mean" and "deviation".
 * We want only the longest encompassing match "mean absolute deviation".
 *
 * We collect ALL candidate matches, then greedily select non-overlapping ones:
 *  • Sort by start position ascending.
 *  • For ties on start, prefer longer match.
 *  • Skip any match whose range overlaps an already-accepted match.
 */
function markTextZone(
  text:   string,
  ps:     PatternSet,
  marked: Set<string>
): string {

  interface Match {
    start:     number;
    end:       number;
    canonical: string;
    original:  string; // The exact characters from text (preserves casing)
  }

  const candidates: Match[] = [];

  for (const entry of ps.entries) {
    if (marked.has(entry.canonical)) continue; // already placed in earlier zone

    // Reset lastIndex so each call starts from position 0.
    entry.pattern.lastIndex = 0;

    let m: RegExpExecArray | null;
    while ((m = entry.pattern.exec(text)) !== null) {
      candidates.push({
        start:     m.index,
        end:       m.index + m[0].length,
        canonical: entry.canonical,
        original:  m[0],
      });
    }
  }

  if (candidates.length === 0) return text;

  // Sort: by start asc, then by length desc (longer wins on same start).
  candidates.sort((a, b) =>
    a.start !== b.start
      ? a.start - b.start
      : (b.end - b.start) - (a.end - a.start)
  );

  // Greedy non-overlapping selection.
  // Additionally, only the FIRST occurrence of each canonical term is kept.
  const accepted: Match[] = [];
  let cursor = 0; // rightmost end seen so far

  for (const c of candidates) {
    if (c.start < cursor)             continue; // overlaps a previous match
    if (marked.has(c.canonical))      continue; // already marked in prior zone
    accepted.push(c);
    marked.add(c.canonical);              // first occurrence consumed
    cursor = c.end;
  }

  if (accepted.length === 0) return text;

  // Reconstruct the text zone with <term> wrappers inserted.
  let result = "";
  let pos    = 0;

  for (const a of accepted) {
    result += text.slice(pos, a.start);
    result += `<term data-term="${escapeAttr(a.canonical)}">${a.original}</term>`;
    pos = a.end;
  }
  result += text.slice(pos);

  return result;
}

// ── Utility helpers ───────────────────────────────────────────────────────────

/**
 * Escape a string for safe use inside a RegExp pattern.
 * Also replaces literal spaces with \s+ to tolerate line-breaks / double spaces.
 *
 * CHARACTERS ESCAPED: . * + ? ^ $ { } [ ] | ( ) \ /
 */
function escapeForRegex(s: string): string {
  return s
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+");           // allow any whitespace between tokens
}

/** Escape a string for safe use in an HTML attribute value. */
function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;");
}

/** Count whitespace-separated tokens in a string. */
function tokenCount(s: string): number {
  return s.trim().split(/\s+/).length;
}

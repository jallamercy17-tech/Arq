/**
 * glossary-ui.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Drop-in addition to main.js.
 *
 * Architecture: open-then-fetch (industry standard)
 *  1. On tap: open sheet immediately with a loading spinner — zero async gap
 *     between user gesture and visual response. This eliminates all synthetic
 *     click / bubble timing bugs that plagued the old fetch-then-open approach.
 *  2. Fetch runs while the sheet is already visible.
 *  3. On resolve: swap spinner for real content.
 *  4. On error: swap spinner for graceful fallback message.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Bottom sheet DOM ──────────────────────────────────────────────────────────

const sheet = document.createElement("div");
sheet.id        = "gloss-sheet";
sheet.className = "gloss-sheet";
sheet.setAttribute("role", "dialog");
sheet.setAttribute("aria-modal", "true");
sheet.setAttribute("aria-labelledby", "gloss-sheet-title");
sheet.innerHTML = `
  <div class="gloss-sheet-handle" aria-hidden="true"></div>
  <div class="gloss-sheet-inner">
    <div class="gloss-sheet-header">
      <span class="gloss-sheet-term" id="gloss-sheet-title"></span>
      <button class="gloss-sheet-close" aria-label="Close definition">
        <i class="ph ph-x"></i>
      </button>
    </div>
    <div class="gloss-sheet-body" id="gloss-sheet-body">
      <!-- populated by showLoading() / showContent() / showError() -->
    </div>
  </div>
`;
document.body.appendChild(sheet);
console.log("[DBG] gloss-sheet created and appended to body"); // [DBG]

const backdrop = document.createElement("div");
backdrop.id        = "gloss-backdrop";
backdrop.className = "gloss-backdrop";
document.body.appendChild(backdrop);
console.log("[DBG] gloss-backdrop created and appended to body"); // [DBG]

// Shortcut refs into the sheet
const sheetTitle = document.getElementById("gloss-sheet-title");
const sheetBody  = document.getElementById("gloss-sheet-body");

// ── State ─────────────────────────────────────────────────────────────────────

let activeTermEl  = null; // <term> element currently highlighted
let activeFetchId = 0;    // increments on every new open; stale fetches are ignored

// ── Sheet content helpers ─────────────────────────────────────────────────────

function showLoading() {
  sheetBody.innerHTML = `<div class="gloss-loading"><span class="gloss-spinner"></span></div>`;
}

// Convert Unicode math characters to LaTeX equivalents
function toLatex(str) {
  return str
    .replace(/²/g, "^{2}").replace(/³/g, "^{3}").replace(/⁴/g, "^{4}")
    .replace(/⁵/g, "^{5}").replace(/⁶/g, "^{6}").replace(/⁷/g, "^{7}")
    .replace(/⁸/g, "^{8}").replace(/⁹/g, "^{9}").replace(/⁰/g, "^{0}")
    .replace(/ⁿ/g, "^{n}").replace(/₀/g, "_{0}").replace(/₁/g, "_{1}")
    .replace(/₂/g, "_{2}").replace(/₃/g, "_{3}").replace(/ₙ/g, "_{n}")
    .replace(/×/g, "\\times").replace(/·/g, "\\cdot")
    .replace(/α/g, "\\alpha").replace(/β/g, "\\beta").replace(/γ/g, "\\gamma")
    .replace(/δ/g, "\\delta").replace(/θ/g, "\\theta").replace(/λ/g, "\\lambda")
    .replace(/μ/g, "\\mu").replace(/π/g, "\\pi").replace(/σ/g, "\\sigma")
    .replace(/τ/g, "\\tau").replace(/φ/g, "\\phi").replace(/ω/g, "\\omega")
    .replace(/Δ/g, "\\Delta").replace(/Σ/g, "\\Sigma").replace(/Ω/g, "\\Omega")
    .replace(/∞/g, "\\infty").replace(/∂/g, "\\partial").replace(/∇/g, "\\nabla")
    .replace(/∫/g, "\\int").replace(/√/g, "\\sqrt").replace(/∑/g, "\\sum")
    .replace(/≤/g, "\\leq").replace(/≥/g, "\\geq").replace(/≠/g, "\\neq")
    .replace(/≈/g, "\\approx");
}

// For pure math values (symbol, unit) — wrap the whole thing in \(...\)
function asMath(str) {
  if (!str) return escapeHtml(str);
  return "\\(" + toLatex(str) + "\\)";
}

// For example sentences — pass through as-is so MathJax can render any
// LaTeX delimiters the server includes. Only escape HTML-special chars that
// are NOT part of LaTeX syntax (backslashes and braces must be preserved).
function asMathSentence(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function showContent(entry) {
  let html = `<p class="gloss-sheet-def">${escapeHtml(entry.definition)}</p>`;

  if (entry.examples?.length) {
    html += `<div class="gloss-example">` +
      `<span class="gloss-example-label">Example:</span> ` +
      `<span class="gloss-example-value">${asMathSentence(entry.examples[0])}</span>` +
      `</div>`;
  }

  const chips = [];
  if (entry.symbol) {
    chips.push(
      `<span class="gloss-chip">` +
        `<span class="gloss-chip-label">Symbol:</span> ` +
        `<strong>${asMath(entry.symbol)}</strong>` +
      `</span>`
    );
  }
  if (entry.unit) {
    chips.push(
      `<span class="gloss-chip">` +
        `<span class="gloss-chip-label">Unit:</span> ` +
        `<strong>${asMath(entry.unit)}</strong>` +
      `</span>`
    );
  }
  if (entry.related_terms?.length) {
    chips.push(
      `<span class="gloss-chip">` +
        `<span class="gloss-chip-label">Related:</span> ` +
        `<strong>${entry.related_terms.map(escapeHtml).join(", ")}</strong>` +
      `</span>`
    );
  }

  if (chips.length) {
    html += `<div class="gloss-sheet-meta">${chips.join("")}</div>`;
  }

  sheetBody.innerHTML = html;
  if (window.MathJax && MathJax.typesetPromise) {
    MathJax.typesetPromise([sheetBody]).catch(function(){});
  }
}

function showError() {
  sheetBody.innerHTML = `<p class="gloss-sheet-def gloss-sheet-error">Definition not available.</p>`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Open / close ──────────────────────────────────────────────────────────────

function openSheet(termEl, canonicalName) {
  console.log("[DBG] openSheet() called synchronously for:", canonicalName); // [DBG]

  // Highlight the tapped term, clear any previous
  if (activeTermEl) activeTermEl.classList.remove("term--open");
  activeTermEl = termEl;
  termEl.classList.add("term--open");
  termEl.classList.add("term--visited");

  // Set title immediately so user sees the term name while content loads
  sheetTitle.textContent = canonicalName;

  // Show spinner while fetch is in flight
  showLoading();

  // Open — synchronous, in the same call stack as the user's tap.
  // No async gap means no synthetic click can sneak in and close it.
  sheet.classList.add("open");
  backdrop.classList.add("open");

  console.log("[DBG] sheet opened synchronously, classes:", sheet.className); // [DBG]
}

function closeSheet() {
  console.log("[DBG] closeSheet() called"); // [DBG]
  sheet.classList.remove("open");
  backdrop.classList.remove("open");
  if (activeTermEl) {
    activeTermEl.classList.remove("term--open");
    // term--visited intentionally kept
    activeTermEl = null;
  }
  // Advancing the id invalidates any in-flight fetch
  activeFetchId++;
}

// ── Event wiring ──────────────────────────────────────────────────────────────

sheet.querySelector(".gloss-sheet-close").addEventListener("click", closeSheet);
backdrop.addEventListener("click", closeSheet);

document.addEventListener("keydown", e => {
  if (e.key === "Escape" && sheet.classList.contains("open")) closeSheet();
});

/**
 * Event delegation on chat-area.
 * Sheet opens SYNCHRONOUSLY on tap — fetch runs after, inside the open sheet.
 */
document.getElementById("chat-area").addEventListener("click", (e) => {
  console.log("[DBG] chat-area clicked, target:", e.target.tagName, "|", e.target.className); // [DBG]

  const termEl = e.target.closest("term[data-term]");
  console.log("[DBG] termEl found:", termEl ? termEl.dataset.term : "NULL — not a term click"); // [DBG]
  if (!termEl) return;

  e.stopPropagation(); // prevent document-level listeners from seeing this tap

  const canonical = termEl.dataset.term;
  console.log("[DBG] canonical:", canonical, "| subject:", currentSubject); // [DBG]

  // Toggle: tap the same open term → close
  if (activeTermEl === termEl && sheet.classList.contains("open")) {
    console.log("[DBG] Toggle close"); // [DBG]
    closeSheet();
    return;
  }

  // ── Step 1: open sheet immediately (synchronous) ──
  openSheet(termEl, canonical);

  // ── Step 2: fetch definition while sheet is already visible ──
  // Snapshot the fetch id — if the user closes the sheet before the fetch
  // resolves, activeFetchId will have advanced and we discard the result.
  const fetchId = ++activeFetchId;
  const url = `/glossary/${encodeURIComponent(currentSubject)}/${encodeURIComponent(canonical)}`;
  console.log("[DBG] Fetching:", url); // [DBG]

  fetch(url)
    .then(res => {
      console.log("[DBG] Fetch response status:", res.status); // [DBG]
      if (!res.ok) throw new Error("Not found");
      return res.json();
    })
    .then(entry => {
      if (fetchId !== activeFetchId) {
        console.log("[DBG] Stale fetch ignored (sheet was closed or changed)"); // [DBG]
        return;
      }
      console.log("[DBG] Entry received:", JSON.stringify(entry).slice(0, 80)); // [DBG]
      sheetTitle.textContent = entry.term; // use display casing from server
      showContent(entry);
    })
    .catch(err => {
      if (fetchId !== activeFetchId) return;
      console.log("[DBG] Fetch error:", err.message); // [DBG]
      showError();
    });
});

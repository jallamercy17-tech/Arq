/**
 * server.js  (updated)
 * ─────────────────────────────────────────────────────────────────────────────
 * Changes vs. original:
 *  • Imports and integrates glossaryMarker (compiled from glossaryMarker.ts).
 *  • Calls markTerms() on the formatted HTML before sending to client.
 *  • Adds GET /glossary/:subject route so the front-end can fetch definitions
 *    for the bottom-sheet without re-loading the JSON on every click.
 *  • Adds route to serve glossary/ directory for JS-side lookups.
 * ─────────────────────────────────────────────────────────────────────────────
 */
require("ts-node").register();
require("dotenv").config();

const express = require("express");
const path    = require("path");
const fs      = require("fs");

// ── Glossary marker (compiled TS → JS via tsc or ts-node) ──
// If using ts-node:  require("ts-node").register(); then require below works.
// If pre-compiled:   point to dist/glossaryMarker.js
const { markTerms, loadGlossary, getDefinition } = require("./glossaryMarker");
const { renderingRules }    = require("./renderingRules");
const { assignmentPrompt }  = require("./assignmentPrompt");

const app          = express();
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const prompts      = JSON.parse(fs.readFileSync(path.join(__dirname, "prompt.json"), "utf-8"));

app.use(express.json({ limit: "10mb" }));

// ── DEBUG: browser console → Termux terminal ──
app.post("/log", (req, res) => {
  res.sendStatus(204);
});

// ── Static routes ──
app.get("/",            (req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/app",         (req, res) => res.sendFile(path.join(__dirname, "app.html")));
app.get("/main.js",     (req, res) => res.sendFile(path.join(__dirname, "main.js")));
app.get("/glossary-ui.js",     (req, res) => res.sendFile(path.join(__dirname, "glossary-ui.js")));
app.get("/styles.css",  (req, res) => res.sendFile(path.join(__dirname, "styles.css")));
app.get("/topics.json", (req, res) => res.sendFile(path.join(__dirname, "topics.json")));

// ── Subject / mode maps ──
const subjectPromptMap = {
  mathematics: "mathematicsPrompt",
  physics:     "physicsPrompt",
  english:     "englishPrompt",
  statistics:  "statisticsPrompt",
  computing:   "computingPrompt",
};

const modePromptMap = {
  concept:    "conceptPrompt",
  assignment: "assignmentPrompt",
};

// ── Warm the glossary cache at startup ──
// This ensures the first request for each subject pays no I/O cost.
Object.keys(subjectPromptMap).forEach(slug => {
  try {
    loadGlossary(slug);
  } catch (e) {
    console.warn(`Glossary not found for subject "${slug}":`, e.message);
  }
});

// ── Glossary definition API ──
// GET /glossary/:subject/:term
// Returns the full GlossaryEntry JSON for a canonical term.
// Used by the front-end bottom sheet to fetch the definition on click.
app.get("/glossary/:subject/:term", (req, res) => {
  try {
    const { subject, term } = req.params;
    const entry = getDefinition(subject, decodeURIComponent(term));
    if (!entry) {
      return res.status(404).json({ error: "Term not found." });
    }
    res.json(entry);
  } catch (err) {
    console.error("Glossary route error:", err.message);
    res.status(400).json({ error: err.message });
  }
});

// ── Response formatter (unchanged from original) ──
let graphCounter = 0;

// Detects a bullet line (any indent, any of *, -, •)


function formatResponse(text) {
  graphCounter = 0;
  const blocks     = [];

  // ── Pre-process: extract ALL [graph:] / [desmos:] tags before anything else ──
  // Replace each tag with a unique placeholder so paragraph splitting and
  // markdown transforms cannot interfere with them.
  function toDesmosLatex(latex) {
    return latex
      .replace(/\bsin\b/g,   "\\sin")
      .replace(/\bcos\b/g,   "\\cos")
      .replace(/\btan\b/g,   "\\tan")
      .replace(/\bsec\b/g,   "\\sec")
      .replace(/\bcsc\b/g,   "\\csc")
      .replace(/\bcot\b/g,   "\\cot")
      .replace(/\barcsin\b/g,"\\arcsin")
      .replace(/\barccos\b/g,"\\arccos")
      .replace(/\barctan\b/g,"\\arctan")
      .replace(/\bln\b/g,    "\\ln")
      .replace(/\blog\b/g,   "\\log")
      .replace(/\bexp\b/g,   "\\exp")
      .replace(/\bsqrt\b/g,  "\\sqrt")
      .replace(/\*/g,         " \\cdot ");
  }

  const graphStore = []; // { id, latex }
  const prepped1 = text.replace(/\[(?:graph|desmos):\s*(.+?)\]/gi, (_, latex) => {
    const id = `__GRAPH_${graphStore.length}__`;
    graphStore.push({ id, latex: toDesmosLatex(latex.trim()) });
    return id;
  });

  // Stash <table>...</table> blocks before paragraph splitting so their
  // internal newlines are never split into separate paragraphs or converted to <br>.
  const tableStore = []; // raw table HTML strings
  const prepped = prepped1.replace(/<table[\s\S]*?<\/table>/gi, (match) => {
    const id = `__TABLE_${tableStore.length}__`;
    tableStore.push(match);
    return id;
  });

  const paragraphs = prepped.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);

  for (const trimmed of paragraphs) {
    if (!trimmed) continue;

    // Restore stashed table blocks — emit as-is, no markdown or <p> wrapping
    if (/^__TABLE_\d+__$/.test(trimmed)) {
      const idx = parseInt(trimmed.match(/\d+/)[0]);
      blocks.push(tableStore[idx]);
      continue;
    }

    // Check if this paragraph contains any graph placeholders
    if (graphStore.some(g => trimmed.includes(g.id))) {
      // Split on placeholders, preserving order
      let parts = [trimmed];
      for (const g of graphStore) {
        const next = [];
        for (const part of parts) {
          if (typeof part !== "string") { next.push(part); continue; }
          const idx = part.indexOf(g.id);
          if (idx === -1) { next.push(part); continue; }
          const before = part.slice(0, idx).trim();
          const after  = part.slice(idx + g.id.length).trim();
          if (before) next.push(before);
          next.push({ graphId: true, latex: g.latex });
          if (after)  next.push(after);
        }
        parts = next;
      }

      for (const part of parts) {
        if (typeof part === "string" && part.trim()) {
          const escaped   = escapeHtmlOutsideMath(convertBullets(part.trim()));
          let   formatted = applyMarkdown(escaped);
          if (!/^<(h[1-6]|pre|div)/.test(formatted)) formatted = `<p>${formatted}</p>`;
          const hasMath = /\\[\(\[]|\\[\)\]]|\$\$/.test(part);
          if (hasMath) formatted += `<script>if(window.MathJax)MathJax.typesetPromise();</script>`;
          blocks.push(formatted);
        } else if (part && part.graphId) {
          graphCounter++;
          const gid = `graph${graphCounter}`;
          blocks.push(
            `<div class="desmos-graph" id="${gid}" style="width:100%;height:320px;"></div>` +
            `<script>` +
            `(function(){` +
            `function init(){` +
            `var elt=document.getElementById('${gid}');` +
            `var calc=Desmos.GraphingCalculator(elt,{expressions:false,settingsMenu:false,zoomButtons:false});elt.__desmos=calc;` +
            `calc.setExpression({id:'r',latex:'${part.latex.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}' });` +
            `setTimeout(function(){calc.resize();},100);` +
            `setTimeout(function(){calc.resize();},1200);` +
            `}` +
            `if(window.Desmos){init();}else{var t=setInterval(function(){if(window.Desmos){clearInterval(t);init();}},50);}` +
            `})();` +
            `</script>`
          );
        }
      }
      continue;
    }

    // ── Block math: $$ ... $$ ──
    const blockMathDollar = trimmed.match(/^\$\$[\s\S]+?\$\$$/);
    if (blockMathDollar) {
      blocks.push(
        `<div class="mathjax-scroll"><div class="mathjax">${trimmed}</div></div>` +
        `<script>if(window.MathJax)MathJax.typesetPromise();</script>`
      );
      continue;
    }

    // ── Block math: \[ ... \] ──
    const blockMathBracket = trimmed.match(/^\\\[[\s\S]+?\\\]$/);
    if (blockMathBracket) {
      blocks.push(
        `<div class="mathjax-scroll"><div class="mathjax">${trimmed}</div></div>` +
        `<script>if(window.MathJax)MathJax.typesetPromise();</script>`
      );
      continue;
    }

    const htmlEscaped = escapeHtmlOutsideMath(convertBullets(trimmed));
    let formatted = applyMarkdown(htmlEscaped);
    if (!/^<(h[1-6]|pre|div|p|strong|table)/.test(formatted)) {
      formatted = `<p>${formatted}</p>`;
    }
    const hasMath = /\\(|\\)|\\[|\\]|\$\$/.test(trimmed);
    if (hasMath) formatted += `<script>if(window.MathJax)MathJax.typesetPromise();</script>`;
    blocks.push(formatted);
  }

  return blocks.join("\n");
}

function escapeHtmlOutsideMath(text) {
  // Protect math zones and existing HTML tags from escaping.
  // Split on: \(...\), \[...\], $$...$$, and any HTML tag <...>
  const parts = text.split(/(\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]|\$\$[\s\S]*?\$\$|<[^>]+>)/g);
  return parts.map((part, i) => {
    if (i % 2 === 1) return part; // math zone or HTML tag — pass through verbatim
    return part
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }).join("");
}



function toRoman(n) {
  const vals = [1000,900,500,400,100,90,50,40,10,9,5,4,1];
  const syms = ["M","CM","D","CD","C","XC","L","XL","X","IX","V","IV","I"];
  let result = "";
  for (let i = 0; i < vals.length; i++) {
    while (n >= vals[i]) { result += syms[i]; n -= vals[i]; }
  }
  return result;
}

function convertBullets(paragraph) {
  const lines = paragraph.split('\n');
  const out = [];
  const counters = { level1: 0, level2: 0, level3: 0 };
  // Detect the minimum indentation among bullet lines to determine relative levels
  const bulletLines = lines.filter(l => /^\s*[-*•]\s+/.test(l));
  const minSpaces = bulletLines.length
    ? Math.min(...bulletLines.map(l => l.match(/^(\s*)/)[1].length))
    : 0;
  for (const line of lines) {
    const spaces = line.match(/^(\s*)/)[1].length;
    const isBullet = /^\s*[-*•]\s+/.test(line);
    if (!isBullet) {
      counters.level1 = 0;
      counters.level2 = 0;
      counters.level3 = 0;
      out.push(line);
      continue;
    }
    const content = line.replace(/^\s*[-*•]\s+/, '');
    const rel = spaces - minSpaces;
    const startsWithNumber = /^\d+\.\s/.test(paragraph);
    if (rel >= 2) {
      // deeper indent = level3 (lowercase roman)
      counters.level3++;
      out.push(toRoman(counters.level3).toLowerCase() + '. ' + content);
    } else if (rel === 0 && startsWithNumber) {
      // flat bullet inside a numbered paragraph = level2 (letters)
      counters.level2++;
      counters.level3 = 0;
      out.push(String.fromCharCode(96 + counters.level2) + '. ' + content);
    } else if (startsWithNumber) {
      // first indent level inside numbered paragraph = level2 (letters)
      counters.level2++;
      counters.level3 = 0;
      out.push(String.fromCharCode(96 + counters.level2) + '. ' + content);
    } else {
      // standalone bullets = level1 (uppercase roman)
      counters.level1++;
      counters.level2 = 0;
      counters.level3 = 0;
      out.push(toRoman(counters.level1) + '. ' + content);
    }
  }
  return out.join('\n\n');
}

/**
 * applyMarkdown
 * Full markdown transform for non-bullet paragraphs.
 * so this function no longer needs to touch them.
 */
function applyMarkdown(h) {
  h = h.replace(/```[\w]*\n?([\s\S]*?)```/g, (_, c) => `<pre><code>${c.trim()}</code></pre>`);
  h = h.replace(/`([^`]+)`/g,       "<code>$1</code>");
  h = h.replace(/\*\*(.+?)\*\*/g,   "<strong>$1</strong>");
  h = h.replace(/\*(.+?)\*/g,      "<em>$1</em>");
  h = h.replace(/^### (.+)$/gm,     "<h4>$1</h4>");
  h = h.replace(/^## (.+)$/gm,      "<h3>$1</h3>");
  h = h.replace(/^(\d+)\.\s+/gm,   (_, n) => `${toRoman(parseInt(n, 10))}. `);

  // Stash <table>...</table> blocks before \n→<br> so their structure is preserved
  const stash = [];
  h = h.replace(/(<table[\s\S]*?<\/table>)/gi, (match) => {
    stash.push(match);
    return `\x00STASH${stash.length - 1}\x00`;
  });
  h = h.replace(/\n/g, "<br>");
  h = h.replace(/(<\/h[1-6]>)(<br>)+/g, "$1");
  // Restore stashed tables
  h = h.replace(/\x00STASH(\d+)\x00/g, (_, i) => stash[parseInt(i)]);
  return h;
}

// ── Chat endpoint (text-only — concept + text assignment) ──
app.post("/chat", async (req, res) => {
  const { message, subject, mode, history } = req.body;

  if (!message || !subject || !mode) {
    return res.status(400).json({ error: "Missing message, subject, or mode." });
  }

  const subjectKey = subjectPromptMap[subject];
  const modeKey    = modePromptMap[mode];

  if (!subjectKey || !modeKey) {
    return res.status(400).json({ error: "Invalid subject or mode." });
  }

  const systemPrompt = mode === "assignment"
    ? [prompts.basePrompt, prompts[subjectKey], assignmentPrompt, renderingRules].join("\n\n")
    : [prompts.basePrompt, prompts[subjectKey], prompts[modeKey],  renderingRules].join("\n\n");

  const messages = Array.isArray(history) ? [...history] : [];
  messages.push({ role: "user", content: message });

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model:    "llama-3.3-70b-versatile",
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        temperature: 0.7,
      }),
    });

    const data    = await response.json();
    const rawText = data.choices[0].message.content;
    const normText = rawText.replace(/(?<!\$)\$(?!\$)((?:[^$]|\\\$)+?)\$(?!\$)/g, (_, inner) => `\\(${inner}\\)`);

    // 1. Format Groq plain text → HTML (MathJax, Desmos, markdown-lite)
    const formatted = formatResponse(normText);

    // 2. Deterministically mark glossary terms in the HTML.
    //    markTerms() is a pure function — no Groq involvement.
    const content = markTerms(formatted, subject);

    res.json({ content, reply: rawText });
  } catch (err) {
    console.error("Groq API error:", err);
    res.status(500).json({ error: "Failed to get a response. Please try again." });
  }
});

const PORT = process.env.PORT || 3000;

// ── Vision endpoint (image assignment help) ──
app.post("/chat-image", async (req, res) => {
  const { imageBase64, mimeType = "image/jpeg", caption = "", subject } = req.body;

  if (!imageBase64 || !subject) {
    return res.status(400).json({ error: "Missing image or subject." });
  }

  const subjectKey = subjectPromptMap[subject];
  if (!subjectKey) {
    return res.status(400).json({ error: "Invalid subject." });
  }

  const systemPrompt = [
    prompts.basePrompt,
    prompts[subjectKey],
    assignmentPrompt,
    renderingRules,
  ].join("\n\n");

  // Build user message content: image + optional caption
  const userContent = [
    {
      type: "image_url",
      image_url: { url: `data:${mimeType};base64,${imageBase64}` },
    },
    {
      type: "text",
      text: caption
        ? `The student added this note: "${caption}"\n\nPlease solve the assignment question shown in the image.`
        : "Please solve the assignment question shown in the image.",
    },
  ];

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model:       "meta-llama/llama-4-scout-17b-16e-instruct",
        messages:    [{ role: "system", content: systemPrompt }, { role: "user", content: userContent }],
        temperature: 0.7,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.choices?.[0]?.message?.content) {
      console.error("Vision model error:", data);
      return res.status(502).json({
        error: "The image could not be processed. Please re-upload a clearer image or type your question instead.",
      });
    }

    const rawText  = data.choices[0].message.content;

    // Normalise single $...$ inline math → \(...\) before formatting
    // Must run before formatResponse so the renderer handles it correctly.
    // Excludes $$ ... $$ block math by using a negative lookahead/lookbehind.
    const normText = rawText.replace(/(?<!\$)\$(?!\$)((?:[^$]|\\\$)+?)\$(?!\$)/g, (_, inner) => `\\(${inner}\\)`);
    const formatted = formatResponse(normText);
    const content   = markTerms(formatted, subject);

    res.json({ content, reply: rawText });
  } catch (err) {
    console.error("Vision API error:", err);
    res.status(500).json({
      error: "The image could not be processed. Please re-upload a clearer image or type your question instead.",
    });
  }
});

// ── Health check (UptimeRobot keep-alive ping) ──
app.get("/health", (req, res) => res.status(200).json({ status: "ok" }));

app.listen(PORT, () => {
});

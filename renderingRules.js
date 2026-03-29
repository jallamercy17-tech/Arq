/**
 * renderingRules.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Centralised academic rendering rules for ArcAI.
 *
 * This file is the single source of truth for all HTML/LaTeX/Desmos formatting
 * instructions that are injected into the LLM system prompt.
 *
 * Import and use:
 *   const { renderingRules } = require("./renderingRules");
 *
 * Then append to any system prompt:
 *   const systemPrompt = [basePrompt, subjectPrompt, modePrompt, renderingRules].join("\n\n");
 * ─────────────────────────────────────────────────────────────────────────────
 */

const renderingRules = `
ACADEMIC RENDERING RULES — follow these exactly, every time:

────────────────────────────────────────────────────────────
1. FORMULAS (LaTeX)
────────────────────────────────────────────────────────────
Always write ALL mathematical expressions using LaTeX delimiters. Never use plain text like x^2 or sqrt(x).

- Inline math (inside a sentence):  \\( ... \\)
  Example: The formula is \\( x^2 + y^2 = r^2 \\)

- Block math (on its own line, for important equations):  $$ ... $$
  Example:
  $$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$

NEVER use single $ signs for math (e.g. $2x^2$) — always use \\( ... \\) for inline and $$ ... $$ for block.
NEVER use \\[ ... \\] for block math. Always use $$ ... $$ only.

Use block math for key formulas, final answers, and equations that deserve emphasis.
Use inline math for variables and expressions within sentences.

────────────────────────────────────────────────────────────
2. FRACTIONS
────────────────────────────────────────────────────────────
All fractions must use MathJax block rendering immediately after the explanation that introduces them.
Never leave fractions as plain text when mathematical meaning is important.

Example output format:
  <p>Example of a fraction:</p>
  <div class="mathjax">$$\\frac{a+b}{c+d}$$</div>
  <script>MathJax.typesetPromise();</script>

────────────────────────────────────────────────────────────
3. MATRICES
────────────────────────────────────────────────────────────
Matrices must use MathJax bmatrix notation, rendered immediately after the explanation.

Example output format:
  <div class="mathjax">
  $$
  \\begin{bmatrix}
  1 & 2 \\\\
  3 & 4
  \\end{bmatrix}
  $$
  </div>
  <script>MathJax.typesetPromise();</script>

────────────────────────────────────────────────────────────
4. VECTORS
────────────────────────────────────────────────────────────
Vectors must use proper LaTeX vector notation with arrows or unit vectors.
Never leave vectors as plain text when symbolic meaning matters.

Example: $$\\vec{F} = 3\\hat{i} + 2\\hat{j}$$

────────────────────────────────────────────────────────────
5. GRAPHS (Desmos)
────────────────────────────────────────────────────────────
Whenever a graph would help the student understand (functions, curves, data trends), include it using this exact format on its own line:

  [graph: latex_expression]

Examples:
  [graph: y=x^2]
  [graph: y=\\sin(x)]
  [graph: y=x\\sin(x)]
  [graph: y=e^x]
  [graph: y=x^2-3x+2]

Always place the [graph: ...] tag AFTER the explanation it illustrates, on its own separate line.
Only use expressions that Desmos can plot directly. Use standard Desmos latex: y=, implicit equations, or single-variable expressions. Never use LaTeX display formatting like \\frac inside [graph: ...] — use plain Desmos syntax instead (e.g. [graph: y=(a+b)/(c)] not [graph: y=\\frac{a+b}{c}]).

────────────────────────────────────────────────────────────
6. TABLES
────────────────────────────────────────────────────────────
Use HTML tables for: formula comparisons, statistics summaries, unit conversions, and variable explanations.

Example output format:
  <table>
    <tr><th>Variable</th><th>Value</th></tr>
    <tr><td>Mean</td><td>12</td></tr>
  </table>

Keep tables simple and readable.

────────────────────────────────────────────────────────────
7. THEOREM BOXES
────────────────────────────────────────────────────────────
Use a theorem box for theorems, laws, principles, and important statistical rules.
The theorem box must appear immediately before the example that demonstrates it.

Example output format:
  <div class="theorem-box">
    <strong>Theorem:</strong> If two vectors are parallel, their cross product is zero.
  </div>

────────────────────────────────────────────────────────────
8. ACADEMIC PARAGRAPHS
────────────────────────────────────────────────────────────
Use short academic paragraphs — one concept per <p> tag.
Avoid long blocks of text. Each paragraph explains one idea clearly.
Examples must follow the explanation immediately; never separate them.

────────────────────────────────────────────────────────────
9. POSITIONING RULE (Critical)
────────────────────────────────────────────────────────────
Math formulas and Desmos graphs must render IMMEDIATELY after the example they belong to.
Never collect formulas or graphs at the bottom.

Correct order: Explanation → Formula or Graph → Continue explanation.

────────────────────────────────────────────────────────────
10. GENERAL
────────────────────────────────────────────────────────────
- When numbering sections or main items, always use uppercase Roman numerals (I, II, III, IV, V ...). Always wrap the Roman numeral and its heading label in <strong> tags, e.g. <strong>I. Introduction</strong>.
- When numbering sub-steps within a section, use Arabic numerals (1, 2, 3 ...).
- NEVER use markdown headings (## or ###). Use <strong> tags for all headings and section labels.
- NEVER mix markdown syntax with HTML tags in the same line (e.g. never write ## <strong>heading</strong>).
- NEVER use single $ signs for math. Only \\( ... \\) for inline and $$ ... $$ for block.
- Never use plain text math like x^2, sqrt(x), or (a+b)^2. Always use LaTeX delimiters.
- Separate each paragraph, formula block, and graph with a blank line.
- Return responses as clean plain text with only the HTML tags explicitly described in these rules.

────────────────────────────────────────────────────────────
11. ACADEMIC ENGLISH WRITING FORMAT
────────────────────────────────────────────────────────────
Apply this section ONLY when the response contains academic writing output: essays, summaries, passages, letters, example paragraphs, or any structured writing sample.

STRUCTURE RULE — Every major writing section must be wrapped in an academic block:

  <div class="academic-block">
    <h4>Essay</h4>
    <p>First paragraph content here...</p>
    <p>Second paragraph content here...</p>
  </div>

Use these heading labels inside <h4> tags:
  - Essay
  - Summary
  - Passage 1 / Passage 2 / Passage 3 (for multiple passages)
  - Paragraph 1 / Paragraph 2 (for standalone example paragraphs)
  - Letter
  - Introduction / Body / Conclusion (for essay sections when broken apart)

PARAGRAPH RULES:
- One idea per paragraph. Never combine two separate ideas in one <p>.
- Keep paragraphs concise — 3 to 6 sentences maximum.
- First line of each paragraph must be visually indented using inline style: <p style="text-indent:1.5em">
- Leave clear visual space between paragraphs (each <p> is already block-level — do not add extra <br> between them).
- Avoid long unbroken walls of text.

QUOTATION RULE:
- All direct quotations must use <blockquote> — never inline quotes with just quotation marks alone.

Example:
  <blockquote>"To be or not to be, that is the question." — Shakespeare</blockquote>

STRUCTURED POINTS RULE:
- When listing academic arguments, criteria, or formal points within a writing response, use Roman numeral structure wrapped in <strong> tags.
- Do not use bullet points or dashes for formal academic writing output.

COMPLETE EXAMPLE OUTPUT:

  <div class="academic-block">
    <h4>Essay</h4>
    <p style="text-indent:1.5em">Academic writing requires clarity, coherence, and precision. Each argument must be supported by evidence and presented in a logical sequence that guides the reader through the writer's reasoning.</p>
    <p style="text-indent:1.5em">Furthermore, the use of formal register distinguishes academic prose from everyday writing. Contractions, colloquialisms, and vague expressions are avoided in favour of precise, discipline-specific language.</p>
  </div>

  <div class="academic-block">
    <h4>Summary</h4>
    <p style="text-indent:1.5em">The passage argues that language acquisition in early childhood is influenced by both biological predisposition and environmental exposure. The author concludes that neither factor alone is sufficient to explain fluency.</p>
  </div>

IMPORTANT:
- academic-block divs must never contain math formulas, graphs, or theorem boxes — those belong outside the block in their own sections.
- Always place the heading <h4> immediately before the content it labels, inside the same academic-block div.
- Never use <div class="academic-block"> for non-writing content such as explanations, steps, or definitions.
`.trim();

module.exports = { renderingRules };

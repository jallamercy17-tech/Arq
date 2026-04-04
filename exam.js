// ArcAI · exam.js
// Exam Simulation — state machine, timer, scoring, corrections

// ── Topic map ──────────────────────────────────────────────────────────────────
const TOPIC_MAP = {
  mathematics: [
    "Limits & Continuity",
    "Differentiation",
    "Integration",
    "Functions & Algebra",
    "Sequences & Series",
  ],
  physics: [
    "Kinematics & Motion",
    "Forces & Newton's Laws",
    "Energy & Work",
    "Momentum",
    "Basic Mechanics",
  ],
  statistics: [
    "Mean, Median & Mode",
    "Variance & Standard Deviation",
    "Probability",
    "Distributions",
    "Sampling & Estimation",
  ],
  english: [
    "Thesis & Argument",
    "Sentence Structure",
    "Paragraph Cohesion",
    "Academic Referencing",
    "Grammar & Style",
  ],
};

// ── State ──────────────────────────────────────────────────────────────────────
let questions    = [];       // Array of { question, options[4], answer(0-3), explanation }
let answers      = [];       // Array of selected indices (null = unanswered)
let currentIndex = 0;
let timerSeconds = 20 * 60; // 20 minutes
let timerInterval = null;

// ── Elements ──────────────────────────────────────────────────────────────────
const screens = {
  setup:       document.getElementById("screen-setup"),
  generating:  document.getElementById("screen-generating"),
  question:    document.getElementById("screen-question"),
  results:     document.getElementById("screen-results"),
  corrections: document.getElementById("screen-corrections"),
};

const setupSubject    = document.getElementById("setup-subject");
const setupTopic      = document.getElementById("setup-topic");
const diffPills       = document.querySelectorAll(".diff-pill");
const startExamBtn    = document.getElementById("start-exam-btn");

const examTimer       = document.getElementById("exam-timer");
const timerDisplay    = document.getElementById("timer-display");

const progressBar     = document.getElementById("exam-progress-bar");
const questionCounter = document.getElementById("question-counter");
const questionText    = document.getElementById("question-text");
const optionsList     = document.getElementById("options-list");
const prevBtn         = document.getElementById("prev-btn");
const nextBtn         = document.getElementById("next-btn");
const submitBtn       = document.getElementById("submit-btn");

const resultsIconWrap       = document.getElementById("results-icon-wrap");
const resultsScore          = document.getElementById("results-score");
const statCorrect           = document.getElementById("stat-correct");
const statWrong             = document.getElementById("stat-wrong");
const resultsBand           = document.getElementById("results-band");
const viewCorrectionsBtn    = document.getElementById("view-corrections-btn");
const retakeBtn             = document.getElementById("retake-btn");

const correctionsList       = document.getElementById("corrections-list");
const newExamBtn            = document.getElementById("new-exam-btn");

// ── Helpers ───────────────────────────────────────────────────────────────────

function showScreen(name) {
  Object.values(screens).forEach(s => {
    s.classList.remove("active");
    s.style.display = "none";
  });
  const target = screens[name];
  target.style.display = "flex";
  target.classList.add("active");
}

function getDifficulty() {
  const sel = document.querySelector(".diff-pill.selected");
  return sel ? sel.dataset.value : "medium";
}

function formatTime(secs) {
  const m = Math.floor(secs / 60).toString().padStart(2, "0");
  const s = (secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function renderMath(el) {
  if (window.MathJax && MathJax.typesetPromise) {
    MathJax.typesetPromise([el]).catch(console.warn);
  }
}

// ── Custom dropdown wiring ─────────────────────────────────────────────────────

function initCustomSelect(wrapperId, triggerId, dropdownId, displayId, hiddenSelectId, onChangeCb) {
  const wrap      = document.getElementById(wrapperId);
  const trigger   = document.getElementById(triggerId);
  const dropdown  = document.getElementById(dropdownId);
  const display   = document.getElementById(displayId);
  const hidden    = document.getElementById(hiddenSelectId);

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    // Close any other open dropdowns
    document.querySelectorAll(".custom-select-wrap.open").forEach(w => {
      if (w !== wrap) w.classList.remove("open");
    });
    wrap.classList.toggle("open");
  });

  dropdown.addEventListener("click", (e) => {
    const opt = e.target.closest(".custom-select-option");
    if (!opt) return;
    const value = opt.dataset.value;
    // Update selected state
    dropdown.querySelectorAll(".custom-select-option").forEach(o => o.classList.remove("selected"));
    opt.classList.add("selected");
    // Update display + hidden select
    display.textContent = opt.textContent;
    hidden.value = value;
    wrap.classList.remove("open");
    if (onChangeCb) onChangeCb(value);
  });

  // Close on outside click
  document.addEventListener("click", (e) => {
    if (!wrap.contains(e.target)) wrap.classList.remove("open");
  });
}

// ── Topic population ──────────────────────────────────────────────────────────

function populateTopics(subject) {
  const topics = TOPIC_MAP[subject] || [];
  const hidden    = document.getElementById("setup-topic");
  const dropdown  = document.getElementById("topic-dropdown");
  const display   = document.getElementById("topic-display");

  // Update hidden select
  hidden.innerHTML = topics.map(t => `<option value="${t}">${t}</option>`).join("");

  // Update custom dropdown options
  dropdown.innerHTML = topics.map((t, i) =>
    `<div class="custom-select-option${i === 0 ? " selected" : ""}" data-value="${t}">${t}</div>`
  ).join("");

  // Update trigger display
  display.textContent = topics[0] || "";
}

const SUBJECT_OPTIONS = [
  { value: "mathematics", label: "University Mathematics" },
  { value: "physics",     label: "Introductory Physics" },
  { value: "statistics",  label: "Basic Statistics" },
  { value: "english",     label: "Academic Writing" },
];

function populateSubjects(selectedValue) {
  const hidden   = document.getElementById("setup-subject");
  const dropdown = document.getElementById("subject-dropdown");
  const display  = document.getElementById("subject-display");

  hidden.innerHTML = SUBJECT_OPTIONS
    .map(s => `<option value="${s.value}">${s.label}</option>`)
    .join("");

  dropdown.innerHTML = SUBJECT_OPTIONS
    .map(s => `<div class="custom-select-option${s.value === selectedValue ? " selected" : ""}" data-value="${s.value}">${s.label}</div>`)
    .join("");

  const active = SUBJECT_OPTIONS.find(s => s.value === selectedValue) || SUBJECT_OPTIONS[0];
  display.textContent = active.label;
  hidden.value = active.value;
}

// Init subject custom select
initCustomSelect("subject-wrap", "subject-trigger", "subject-dropdown", "subject-display", "setup-subject", (val) => {
  populateTopics(val);
});

// Init topic custom select
initCustomSelect("topic-wrap", "topic-trigger", "topic-dropdown", "topic-display", "setup-topic", null);

// Initialise both dropdowns
const savedSubject = sessionStorage.getItem("arcai_subject");
const initSubject = (savedSubject && TOPIC_MAP[savedSubject]) ? savedSubject : "mathematics";
populateSubjects(initSubject);
populateTopics(initSubject);

// ── Difficulty pills ───────────────────────────────────────────────────────────
diffPills.forEach(pill => {
  pill.addEventListener("click", () => {
    diffPills.forEach(p => p.classList.remove("selected"));
    pill.classList.add("selected");
  });
});

// ── Timer ─────────────────────────────────────────────────────────────────────

function startTimer() {
  timerSeconds = 20 * 60;
  timerDisplay.textContent = formatTime(timerSeconds);
  examTimer.classList.remove("hidden");

  timerInterval = setInterval(() => {
    timerSeconds--;
    timerDisplay.textContent = formatTime(timerSeconds);

    if (timerSeconds <= 120) {
      examTimer.classList.add("urgent");
    }

    if (timerSeconds <= 0) {
      clearInterval(timerInterval);
      submitExam();
    }
  }, 1000);
}

function stopTimer() {
  clearInterval(timerInterval);
  examTimer.classList.add("hidden");
  examTimer.classList.remove("urgent");
}

// ── AI question generation ────────────────────────────────────────────────────

const SUBJECT_LABELS = {
  mathematics: "Mathematics",
  physics:     "Physics",
  statistics:  "Statistics",
  english:     "Academic Writing",
};

async function generateQuestions(subject, topic, difficulty) {
  const difficultyDesc = {
    easy:   "introductory, requiring recall of fundamental concepts",
    medium: "standard first-year undergraduate, requiring application of concepts",
    hard:   "challenging first-year undergraduate, requiring multi-step reasoning",
  }[difficulty] || "standard first-year undergraduate";

  const prompt = `Generate exactly 10 multiple-choice exam questions for first-year university students.

Subject: ${SUBJECT_LABELS[subject] || subject}
Topic: ${topic}
Difficulty: ${difficulty} — ${difficultyDesc}

Use this EXACT format for every question, with no deviations:

QUESTION
[question text]
A) [option A]
B) [option B]
C) [option C]
D) [option D]
ANSWER: [A, B, C, or D]
EXPLANATION: [1-2 sentence explanation]
---

Rules:
- Repeat the block above exactly 10 times, separated by ---
- Use LaTeX for all math: \\( ... \\) for inline, $$ ... $$ for block
- Do not add question numbers
- Do not add any text outside the blocks`;

  const response = await fetch("/exam-generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Server error ${response.status}`);
  }

  const data = await response.json();
  return data.questions; // array of 10
}

// ── Start exam flow ───────────────────────────────────────────────────────────

startExamBtn.addEventListener("click", async () => {
  const subject    = setupSubject.value;
  const topic      = setupTopic.value;
  const difficulty = getDifficulty();

  showScreen("generating");
  startExamBtn.disabled = true;

  try {
    questions    = await generateQuestions(subject, topic, difficulty);
    answers      = new Array(questions.length).fill(null);
    currentIndex = 0;

    // Validate basic shape
    if (!Array.isArray(questions) || questions.length < 10) {
      throw new Error("Not enough questions were generated. Please try again.");
    }

    // Store subject for tag display
    questions._subject = SUBJECT_LABELS[subject] || subject;
    questions._topic   = topic;

    document.getElementById("nav-exam-title").textContent = topic;
    showScreen("question");
    startTimer();
    renderQuestion(currentIndex);

  } catch (err) {
    // Show error inside generating screen
    showScreen("generating");
    document.querySelector(".generating-wrap").innerHTML = `
      <div class="exam-error-card">
        <i class="ph ph-warning-circle"></i>
        <div class="exam-error-title">Could not generate questions</div>
        <div class="exam-error-msg">${err.message || "Something went wrong. Please try again."}</div>
        <button class="exam-primary-btn" style="margin-top:8px" onclick="resetToSetup()">
          <i class="ph ph-arrow-counter-clockwise"></i> Try Again
        </button>
      </div>`;
  } finally {
    startExamBtn.disabled = false;
  }
});

// ── Render question ───────────────────────────────────────────────────────────

function renderQuestion(index) {
  const q        = questions[index];
  const total    = questions.length;
  const letters  = ["A", "B", "C", "D"];

  // Progress
  const pct = ((index + 1) / total) * 100;
  progressBar.style.width = pct + "%";

  // Counter
  questionCounter.textContent = `Question ${index + 1} of ${total}`;

  // Question text — support LaTeX
  questionText.innerHTML = `<p>${q.question}</p>`;
  renderMath(questionText);

  // Options
  optionsList.innerHTML = "";
  q.options.forEach((opt, i) => {
    const btn = document.createElement("button");
    btn.className = "option-btn" + (answers[index] === i ? " selected" : "");
    btn.dataset.index = i;
    btn.innerHTML = `
      <span class="option-letter">${letters[i]}</span>
      <span class="option-text">${opt}</span>
    `;
    btn.addEventListener("click", () => selectOption(index, i));
    optionsList.appendChild(btn);
  });

  // Re-render math inside options
  renderMath(optionsList);

  // Navigation buttons
  prevBtn.disabled = index === 0;

  if (index === total - 1) {
    nextBtn.classList.add("hidden");
    submitBtn.classList.remove("hidden");
  } else {
    nextBtn.classList.remove("hidden");
    submitBtn.classList.add("hidden");
    nextBtn.disabled = answers[index] === null;
  }

  // Animate card in
  const card = document.getElementById("question-card");
  card.classList.remove("shake");
  void card.offsetWidth; // reflow
}

// ── Select option ─────────────────────────────────────────────────────────────

function selectOption(qIndex, optIndex) {
  answers[qIndex] = optIndex;
  // Update UI — re-highlight buttons
  optionsList.querySelectorAll(".option-btn").forEach((btn, i) => {
    btn.classList.toggle("selected", i === optIndex);
  });
  // Unlock Next now that this question is answered
  nextBtn.disabled = false;
}

// ── Navigation ────────────────────────────────────────────────────────────────

prevBtn.addEventListener("click", () => {
  if (currentIndex > 0) {
    currentIndex--;
    renderQuestion(currentIndex);
  }
});

nextBtn.addEventListener("click", () => {
  if (currentIndex < questions.length - 1) {
    currentIndex++;
    renderQuestion(currentIndex);
  }
});

submitBtn.addEventListener("click", () => {
  // Check all answered
  const unanswered = answers.filter(a => a === null).length;
  if (unanswered > 0) {
    const card = document.getElementById("question-card");
    card.classList.remove("shake");
    void card.offsetWidth;
    card.classList.add("shake");
    return;
  }

  submitExam();
});

// ── Submit & score ────────────────────────────────────────────────────────────

function submitExam() {
  stopTimer();

  let correct = 0;
  questions.forEach((q, i) => {
    if (answers[i] === q.answer) correct++;
  });

  const total   = questions.length;
  const wrong   = total - correct;
  const percent = (correct / total) * 100;

  // Show results screen
  showScreen("results");

  resultsScore.textContent = `${correct}/${total}`;
  statCorrect.textContent  = `${correct} Correct`;
  statWrong.textContent    = `${wrong} Wrong`;

  // Icon + band message
  if (percent >= 80) {
    resultsIconWrap.className = "results-icon-wrap great";
    resultsBand.textContent   = "Excellent — you're well prepared.";
  } else if (percent >= 50) {
    resultsIconWrap.className = "results-icon-wrap pass";
    resultsBand.textContent   = "Good effort — review the corrections below.";
  } else {
    resultsIconWrap.className = "results-icon-wrap fail";
    resultsBand.textContent   = "Keep studying — go through the corrections carefully.";
  }
}

// ── View corrections ──────────────────────────────────────────────────────────

viewCorrectionsBtn.addEventListener("click", () => {
  renderCorrections();
  showScreen("corrections");
});

function renderCorrections() {
  const letters = ["A", "B", "C", "D"];
  correctionsList.innerHTML = "";

  questions.forEach((q, i) => {
    const userAns    = answers[i];
    const isCorrect  = userAns === q.answer;
    const skipped    = userAns === null;

    const item = document.createElement("div");
    item.className = `correction-item ${isCorrect ? "correct" : "wrong"}`;

    const userAnswerText = skipped
      ? `<span class="correction-answer-val skipped">Not answered</span>`
      : `<span class="correction-answer-val">${letters[userAns]}. ${q.options[userAns]}</span>`;

    item.innerHTML = `
      <div class="correction-header">
        <span class="correction-q-num">Q${i + 1}</span>
        <span class="correction-status">
          ${isCorrect
            ? `<i class="ph ph-check-circle"></i> Correct`
            : `<i class="ph ph-x-circle"></i> Wrong`}
        </span>
      </div>
      <div class="correction-body">
        <div class="correction-question-text">${q.question}</div>
        <div class="correction-answers">
          <div class="correction-answer-row">
            <span class="correction-answer-label your-label">Your answer:</span>
            ${userAnswerText}
          </div>
          <div class="correction-answer-row">
            <span class="correction-answer-label correct-label">Correct answer:</span>
            <span class="correction-answer-val">${letters[q.answer]}. ${q.options[q.answer]}</span>
          </div>
        </div>
        <div class="correction-explanation">${q.explanation}</div>
      </div>
    `;

    correctionsList.appendChild(item);
  });

  // Render any LaTeX in corrections
  renderMath(correctionsList);
}

// ── Retake / New exam ─────────────────────────────────────────────────────────

retakeBtn.addEventListener("click", () => {
  retake();
});

newExamBtn.addEventListener("click", () => {
  resetToSetup();
});

function retake() {
  answers      = new Array(questions.length).fill(null);
  currentIndex = 0;
  showScreen("question");
  startTimer();
  renderQuestion(0);
}

function resetToSetup() {
  stopTimer();
  questions    = [];
  answers      = [];
  currentIndex = 0;

  document.getElementById("nav-exam-title").textContent = "";

  document.querySelector(".generating-wrap").innerHTML = `
    <div class="generating-row">
      <div class="generating-spinner"></div>
      <p class="generating-text">Generating questions…</p>
    </div>
    <p class="generating-sub">This takes about 10–15 seconds.</p>
  `;

  showScreen("setup");
}

// Expose for inline onclick in error card
window.resetToSetup = resetToSetup;

// ── Initialise ────────────────────────────────────────────────────────────────
showScreen("setup");

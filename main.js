// ArcAI · main.js
console.log('recent updated file');

// ── State ──
let currentSubject = sessionStorage.getItem("arcai_subject") || "mathematics";
let currentMode    = "concept";
let history        = [];
let isLoading      = false;

// ── Elements ──
const chatArea     = document.getElementById("chat-area");
const welcomeState = document.getElementById("welcome-state");
const userInput    = document.getElementById("user-input");
const sendBtn      = document.getElementById("send-btn");
const inputShell   = document.getElementById("input-shell");

const subjectBtn      = document.getElementById("subject-btn");
const subjectLabel    = document.getElementById("subject-label");
const subjectDropdown = document.getElementById("subject-dropdown");
const modeBtn         = document.getElementById("mode-btn");
const modeDropdown    = document.getElementById("mode-dropdown");

const suggestionPills = document.getElementById("suggestion-pills");
const topicsCard      = document.getElementById("topics-card");
const topicsCloseBtn  = document.getElementById("topics-close-btn");
const topicsList      = document.querySelector(".topics-list");

const sidebar        = document.getElementById("sidebar");
const sidebarOverlay = document.getElementById("sidebar-overlay");
const sidebarOpenBtn = document.getElementById("sidebar-open-btn");
const sidebarCloseBtn= document.getElementById("sidebar-close-btn");

// ── Sidebar toggle ──
function openSidebar() {
  sidebar.classList.remove("hidden");
  sidebar.classList.add("open");
  sidebarOverlay.classList.remove("hidden");
  sidebarOverlay.classList.add("open");
}

function closeSidebar() {
  sidebar.classList.remove("open");
  sidebarOverlay.classList.remove("open");
  setTimeout(() => {
    sidebar.classList.add("hidden");
    sidebarOverlay.classList.add("hidden");
  }, 250); // match transition duration
}

sidebarOpenBtn.addEventListener("click", openSidebar);
sidebarCloseBtn.addEventListener("click", closeSidebar);
sidebarOverlay.addEventListener("click", closeSidebar);

// ── Topics data ──
let topicsData = {};

async function loadTopics() {
  const res  = await fetch("topics.json");
  topicsData = await res.json();
  renderSubject(currentSubject);
}

function renderSubject(slug) {
  const data = topicsData[slug];
  if (!data) return;

  // Render pills (topic pills + See all)
  suggestionPills.innerHTML = data.pills
    .map(label => `<button class="pill">${label}</button>`)
    .join("") + `<button class="pill see-all">See all</button>`;

  // Bind See all after re-render
  suggestionPills.querySelector(".pill.see-all").addEventListener("click", openTopicsCard);

  // Bind pill topic clicks — populate input and focus, stay visible
  suggestionPills.querySelectorAll(".pill:not(.see-all)").forEach(pill => {
    pill.addEventListener("click", () => {
      userInput.value = pill.textContent;
      userInput.dispatchEvent(new Event("input"));
      userInput.focus();
    });
  });

  // Render topics list
  topicsList.innerHTML = data.topics
    .map(t => `<button class="topic-item">${t}</button>`)
    .join("");

  // Selecting a topic populates the input and focuses it — card stays open
  topicsList.querySelectorAll(".topic-item").forEach(item => {
    item.addEventListener("click", () => {
      userInput.value = item.textContent;
      userInput.dispatchEvent(new Event("input"));
      userInput.focus();
    });
  });
}

function openTopicsCard() {
  welcomeState.classList.add("hidden");
  topicsCard.classList.remove("hidden");
  suggestionPills.classList.add("hidden");
}

topicsCloseBtn.addEventListener("click", () => {
  topicsCard.classList.add("hidden");
  welcomeState.classList.remove("hidden");
  suggestionPills.classList.remove("hidden");
});

loadTopics();

// ── Restore persisted subject selection in dropdown UI ──
(function restorePersistedState() {
  subjectDropdown.querySelectorAll(".dropdown-item").forEach(item => {
    item.classList.remove("selected");
    if (item.dataset.value === currentSubject) {
      item.classList.add("selected");
      const clone = item.cloneNode(true);
      clone.querySelectorAll("span").forEach(s => s.remove());
      subjectLabel.textContent = clone.textContent.trim();
    }
  });
})();

// ── Input sizing constants ──
// Line height matches CSS: font-base(15px) * line-height(1.6) = 24px
const LINE_HEIGHT   = 24;
const MAX_LINES     = 7;
const PADDING_V     = 12; // top + bottom padding inside textarea (6px each)
const MAX_HEIGHT    = LINE_HEIGHT * MAX_LINES + PADDING_V;
const PILL_RADIUS   = "999px";
const SQUARE_RADIUS = "16px";

// ── Dropdown Logic ──

function openDropdown(btn, dropdown) {
  btn.classList.add("open");
  btn.setAttribute("aria-expanded", "true");
  dropdown.classList.add("visible");
}

function closeDropdown(btn, dropdown) {
  btn.classList.remove("open");
  btn.setAttribute("aria-expanded", "false");
  dropdown.classList.remove("visible");
}

function closeAll() {
  closeDropdown(subjectBtn, subjectDropdown);
  closeDropdown(modeBtn, modeDropdown);
}

subjectBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  const isOpen = subjectDropdown.classList.contains("visible");
  closeAll();
  if (!isOpen) openDropdown(subjectBtn, subjectDropdown);
});

modeBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  const isOpen = modeDropdown.classList.contains("visible");
  closeAll();
  if (!isOpen) openDropdown(modeBtn, modeDropdown);
});

document.addEventListener("click", closeAll);

// Subject items
subjectDropdown.querySelectorAll(".dropdown-item").forEach((item) => {
  item.addEventListener("click", (e) => {
    e.stopPropagation();
    subjectDropdown.querySelectorAll(".dropdown-item").forEach(i => i.classList.remove("selected"));
    item.classList.add("selected");
    currentSubject = item.dataset.value;
    sessionStorage.setItem("arcai_subject", currentSubject);
    posthog.capture('subject_selected', { subject: currentSubject });
    // Extract text by cloning and stripping child elements (icon + check spans)
    const clone = item.cloneNode(true);
    clone.querySelectorAll("span").forEach(s => s.remove());
    subjectLabel.textContent = clone.textContent.trim();
    history = [];
    renderSubject(currentSubject);
    // If topics card is open, close it back to welcome state
    if (!topicsCard.classList.contains("hidden")) {
      topicsCard.classList.add("hidden");
      welcomeState.classList.remove("hidden");
      suggestionPills.classList.remove("hidden");
    }
    closeDropdown(subjectBtn, subjectDropdown);
  });
});

// Mode items
modeDropdown.querySelectorAll(".dropdown-item").forEach((item) => {
  item.addEventListener("click", (e) => {
    e.stopPropagation();
    modeDropdown.querySelectorAll(".dropdown-item").forEach(i => i.classList.remove("selected"));
    item.classList.add("selected");
    currentMode = item.dataset.value;
    history = [];
    closeDropdown(modeBtn, modeDropdown);
    posthog.capture('mode_selected', { mode: currentMode });
    onModeChange();
  });
});

// ── Input resize + dynamic border-radius ──
function autoResize() {
  // Reset height to measure natural scroll height
  userInput.style.height = "auto";
  const newHeight = Math.min(userInput.scrollHeight, MAX_HEIGHT);
  userInput.style.height = newHeight + "px";

  // Enable scroll once content exceeds 7 lines
  userInput.style.overflowY = userInput.scrollHeight > MAX_HEIGHT ? "auto" : "hidden";

  // Pill when single-line, rounded rect as it grows
  const isSingleLine = newHeight <= LINE_HEIGHT + PADDING_V;
  inputShell.style.borderRadius = isSingleLine ? PILL_RADIUS : SQUARE_RADIUS;
}

userInput.addEventListener("input", () => {
  if ((userInput.value.trim() || assignImageBase64) && !isLoading) {
    sendBtn.classList.remove("hidden");
  } else {
    sendBtn.classList.add("hidden");
  }
  autoResize();
});

// ── Keyboard: Enter sends, all newlines (incl. mobile return) insert \n ──
userInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    if (e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) {
      // Modified Enter — let browser insert newline naturally
      return;
    }
    // Plain Enter on desktop — send
    e.preventDefault();
    if (!sendBtn.classList.contains("hidden")) sendMessage();
  }
});

// Handle mobile virtual keyboard paragraph/return key:
// On mobile, "Enter" fires as an insertText composition event, not keydown.
// We intercept beforeinput to block newlines-only inputs from sending.
userInput.addEventListener("beforeinput", (e) => {
  if (e.inputType === "insertLineBreak" || e.inputType === "insertParagraph") {
    // On mobile, these should insert a newline, not send
    e.preventDefault();
    insertNewlineAtCursor();
  }
});

function insertNewlineAtCursor() {
  const start = userInput.selectionStart;
  const end   = userInput.selectionEnd;
  const val   = userInput.value;
  userInput.value = val.slice(0, start) + "\n" + val.slice(end);
  userInput.selectionStart = userInput.selectionEnd = start + 1;
  // Trigger input event to update button state and resize
  userInput.dispatchEvent(new Event("input"));
}

sendBtn.addEventListener("click", sendMessage);

// ── Assignment upload feature ──────────────────────────────────────────────

const plusBtn            = document.getElementById("plus-btn");
const assignGalleryInput = document.getElementById("assign-gallery-input");
const assignImageStrip   = document.getElementById("assign-image-strip");
const assignStripImg     = document.getElementById("assign-strip-img");
const assignStripRemove  = document.getElementById("assign-strip-remove");

let assignImageBase64 = null;
let assignMimeType    = "image/jpeg";

// ── Mode UI: toggle pills vs assignment strip ──────────────────────────────

function onModeChange() {
  if (currentMode === "assignment") {
    suggestionPills.classList.add("hidden");
    userInput.placeholder = "Describe your assignment or ask a question…";
    subjectBtn.disabled = true;
    subjectBtn.title    = "Subject cannot be changed in Assignment mode";
  } else {
    clearAssignImage();
    userInput.placeholder = "Ask anything…";
    subjectBtn.disabled = false;
    subjectBtn.title    = "";
    // Only restore welcome UI if no messages have been sent yet
    const hasMessages = chatArea.querySelector(".message") !== null;
    if (!hasMessages) {
      suggestionPills.classList.remove("hidden");
      if (welcomeState) welcomeState.classList.remove("hidden");
    }
  }
  updatePlusBtn();
}

function updatePlusBtn() {
  const btn = document.getElementById("plus-btn");
  if (currentMode === "assignment") {
    btn.disabled = false;
    btn.title = "Upload assignment image";
  } else {
    btn.disabled = true;
    btn.title = "Available in Assignment mode";
  }
}

// Set initial state on load
updatePlusBtn();

// ── Image state ────────────────────────────────────────────────────────────

function clearAssignImage() {
  assignImageBase64      = null;
  assignStripImg.src     = "";
  assignImageStrip.classList.add("hidden");
  assignGalleryInput.value = "";
  userInput.placeholder  = currentMode === "assignment"
    ? "Describe your assignment or ask a question…"
    : "Ask anything…";
}

function showAssignImage(objectUrl) {
  assignStripImg.src = objectUrl;
  assignImageStrip.classList.remove("hidden");
  userInput.placeholder = "Add a note about your assignment image…";
  userInput.focus();
}

// ── Image compression ──────────────────────────────────────────────────────

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// ── Sheet open/close ───────────────────────────────────────────────────────

plusBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (currentMode === "assignment") assignGalleryInput.click();
});

// ── Handle image selection ─────────────────────────────────────────────────

async function handleAssignImage(file) {
  if (!file) return;
  const objectUrl = URL.createObjectURL(file);
  showAssignImage(objectUrl);
  assignImageBase64 = await readFileAsBase64(file);
  URL.revokeObjectURL(objectUrl);
  assignMimeType = file.type || "image/jpeg";
  sendBtn.classList.remove("hidden");
  posthog.capture('assignment_image_uploaded', { subject: currentSubject });
}

assignGalleryInput.addEventListener("change", () => handleAssignImage(assignGalleryInput.files[0]));

assignStripRemove.addEventListener("click", () => {
  clearAssignImage();
  // Hide send button only if input is also empty
  if (!userInput.value.trim()) sendBtn.classList.add("hidden");
});

// ── Fullscreen image overlay ───────────────────────────────────────────────

const imgOverlay      = document.getElementById("img-overlay");
const imgOverlayImg   = document.getElementById("img-overlay-img");
const imgOverlayClose = document.getElementById("img-overlay-close");

function openImgOverlay(src) {
  imgOverlayImg.src = src;
  imgOverlay.classList.remove("hidden");
}

function closeImgOverlay() {
  imgOverlay.classList.add("hidden");
  imgOverlayImg.src = "";
}

imgOverlayClose.addEventListener("click", closeImgOverlay);
imgOverlay.addEventListener("click", (e) => {
  if (e.target === imgOverlay) closeImgOverlay();
});

// ── Send ──
async function sendMessage() {
  const text = userInput.value.trim();
  if ((!text && !assignImageBase64) || isLoading) return;

  if (welcomeState) welcomeState.classList.add("hidden");
  if (topicsCard)   topicsCard.classList.add("hidden");
  suggestionPills.classList.add("hidden");

  const caption   = text;
  const hasImage  = Boolean(assignImageBase64);
  const imageB64  = assignImageBase64;
  const imageMime = assignMimeType;

  // ── PostHog: message sent ──
  posthog.capture('message_sent', {
    mode:       currentMode,
    subject:    currentSubject,
    has_image:  hasImage,
    char_count: caption.length,
  });

  const previewUrl = hasImage ? assignStripImg.src : null;
  appendMessage("user", caption, false, previewUrl);
  userInput.value = "";
  userInput.style.height = "auto";
  userInput.style.overflowY = "hidden";
  inputShell.style.borderRadius = PILL_RADIUS;
  sendBtn.classList.add("hidden");
  clearAssignImage();

  history.push({ role: "user", content: caption || "[image]" });
  setLoading(true);
  const typingEl = appendTyping();

  try {
    let res;
    if (hasImage) {
      res = await fetch("/chat-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: imageB64,
          mimeType:    imageMime,
          caption,
          subject:     currentSubject,
        }),
      });
    } else {
      res = await fetch("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: caption,
          subject: currentSubject,
          mode:    currentMode,
          history: history.slice(0, -1),
        }),
      });
    }

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Server error");

    typingEl.remove();
    const aiContent = data.content || data.reply;
    const isHtml    = Boolean(data.content);
    appendMessage("ai", aiContent, isHtml);
    history.push({ role: "assistant", content: data.reply || data.content });

    // ── PostHog: response received ──
    posthog.capture('ai_response_received', {
      mode:    currentMode,
      subject: currentSubject,
      has_image: hasImage,
    });

  } catch (err) {
    typingEl.remove();
    appendMessage("ai", "⚠️ " + (err.message || "Something went wrong. Please try again."));

    // ── PostHog: response error ──
    posthog.capture('ai_response_error', {
      mode:    currentMode,
      subject: currentSubject,
      error:   err.message || 'unknown',
    });
  } finally {
    setLoading(false);
  }
}

// ── Render messages ──
function appendMessage(role, text, isHtml = false, imageUrl = null) {
  const msg = document.createElement("div");
  msg.className = `message ${role}`;

  if (imageUrl && role === "user") {
    msg.classList.add("with-image");
    const imgEl = document.createElement("img");
    imgEl.src = imageUrl;
    imgEl.className = "msg-uploaded-img";
    imgEl.addEventListener("click", () => openImgOverlay(imageUrl));
    msg.appendChild(imgEl);
  }

  const bubble = document.createElement("div");
  bubble.className = "msg-bubble";

  // Hide bubble entirely when there is an image but no caption text
  if (imageUrl && role === "user" && !text) {
    bubble.style.display = "none";
  }

  if (isHtml) {
    // Pre-formatted HTML from server — inject into DOM first so that
    // getElementById() finds graph divs before Desmos scripts execute.
    bubble.innerHTML = text;
    msg.appendChild(bubble);
    chatArea.appendChild(msg);
    scrollBottom();
    // Defer script execution until after the browser has painted and
    // laid out the desmos-graph div so Desmos measures correct dimensions.
    setTimeout(() => {
      bubble.querySelectorAll("script").forEach(orig => {
        const live = document.createElement("script");
        live.textContent = orig.textContent;
        orig.replaceWith(live);
      });
      // After MathJax finishes typesetting, resize all Desmos calculators
      // so they fill their containers correctly.
      if (window.MathJax && MathJax.typesetPromise) {
        MathJax.typesetPromise([bubble]).then(() => {
          bubble.querySelectorAll(".desmos-graph").forEach(el => {
            if (el.__desmos) el.__desmos.resize();
          });
        });
      }
    }, 0);
    return msg;
  } else {
    bubble.innerHTML = formatText(text);
  }

  msg.appendChild(bubble);
  chatArea.appendChild(msg);
  scrollBottom();
  return msg;
}

function appendTyping() {
  const msg = document.createElement("div");
  msg.className = "message ai";

  const bubble = document.createElement("div");
  bubble.className = "msg-bubble";
  bubble.innerHTML = `<div class="typing-indicator"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div>`;

  msg.appendChild(bubble);
  chatArea.appendChild(msg);
  scrollBottom();
  return msg;
}



function formatText(text) {
  let h = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  h = h.replace(/```[\w]*\n?([\s\S]*?)```/g, (_, c) => `<pre><code>${c.trim()}</code></pre>`);

  const paras = h.split(/\n\n+/);
  return paras.map(para => {
    const trimmed = para.trim();
    if (!trimmed) return "";
    let block = trimmed;
    block = block.replace(/`([^`]+)`/g, "<code>$1</code>");
    block = block.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    block = block.replace(/\*(.+?)\*/g, "<em>$1</em>");
    block = block.replace(/^### (.+)$/gm, "<h4>$1</h4>");
    block = block.replace(/^## (.+)$/gm,  "<h3>$1</h3>");
    if (/^<(h[34]|pre)/.test(block.trim())) return block;
    return `<p>${block.replace(/\n/g, "<br>")}</p>`;
  }).join("");
}

// ── Helpers ──
function setLoading(on) {
  isLoading = on;
  if (on) {
    sendBtn.classList.add("hidden");
  } else if (userInput.value.trim()) {
    sendBtn.classList.remove("hidden");
  }
}

function scrollBottom() {
  chatArea.scrollTop = chatArea.scrollHeight;
}
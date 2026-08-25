/* =============================================
   SNAP Research — AI Research Assistant
   static/app.js — Frontend Logic (Flask backend)
   ============================================= */

'use strict';

// ── State ──────────────────────────────────────
const state = {
  currentMode: 'explain',
  sessions: JSON.parse(localStorage.getItem('snap_sessions') || '[]'),
  activeSessionId: null,
  highlights: JSON.parse(localStorage.getItem('snap_highlights') || '[]'),
  history: [],
  isLoading: false,
};

// ── DOM References ──────────────────────────────
const $ = (id) => document.getElementById(id);
const sendBtn          = $('send-btn');
const researchInput    = $('research-input');
const researchCanvas   = $('research-canvas');
const welcomeState     = $('welcome-state');
const sessionsList     = $('sessions-list');
const newSessionBtn    = $('new-session-btn');
const highlightsPanel  = $('highlights-panel');
const highlightsList   = $('highlights-list');
const highlightsToggle = $('highlights-toggle-btn');
const exportBtn        = $('export-btn');
const clearSessionBtn  = $('clear-session-btn');
const clearHighlightsBtn = $('clear-highlights-btn');
const toastContainer   = $('toast-container');
const bgCanvas         = $('bg-canvas');
const apiDot           = $('api-dot');
const apiLabel         = $('api-label');
const modeBtns         = document.querySelectorAll('.mode-btn');
const starterChips     = document.querySelectorAll('.starter-chip');

// ── Health Check ────────────────────────────────
async function checkHealth() {
  try {
    const res = await fetch('/api/health');
    const data = await res.json();
    if (data.api_configured) {
      apiDot.classList.add('connected');
      apiLabel.textContent = 'Connected · ' + data.model;
      apiLabel.style.color = 'var(--accent-green)';
    } else {
      apiDot.classList.remove('connected');
      apiLabel.textContent = 'API Key Missing';
      apiLabel.style.color = 'var(--accent-rose)';
    }
  } catch {
    apiDot.classList.remove('connected');
    apiLabel.textContent = 'Server offline';
    apiLabel.style.color = 'var(--accent-rose)';
  }
}
checkHealth();

// ── Particle Background ─────────────────────────
(function initParticles() {
  const ctx = bgCanvas.getContext('2d');
  let W, H, particles = [];

  function resize() {
    W = bgCanvas.width  = window.innerWidth;
    H = bgCanvas.height = window.innerHeight;
  }

  class Particle {
    constructor() { this.reset(true); }
    reset(init = false) {
      this.x     = Math.random() * W;
      this.y     = init ? Math.random() * H : H + 10;
      this.r     = Math.random() * 1.5 + 0.4;
      this.vx    = (Math.random() - 0.5) * 0.3;
      this.vy    = -(Math.random() * 0.4 + 0.1);
      this.alpha = Math.random() * 0.5 + 0.1;
      this.color = Math.random() > 0.6 ? '#6c63ff' : Math.random() > 0.5 ? '#00d4ff' : '#ffffff';
    }
    update() {
      this.x += this.vx;
      this.y += this.vy;
      if (this.y < -10) this.reset();
    }
    draw() {
      ctx.save();
      ctx.globalAlpha = this.alpha;
      ctx.fillStyle   = this.color;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function initParticleList() {
    particles = [];
    const count = Math.min(120, Math.floor((W * H) / 12000));
    for (let i = 0; i < count; i++) particles.push(new Particle());
  }

  function drawConnections() {
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx   = particles[i].x - particles[j].x;
        const dy   = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 130) {
          ctx.save();
          ctx.globalAlpha = (1 - dist / 130) * 0.12;
          ctx.strokeStyle = '#6c63ff';
          ctx.lineWidth   = 0.6;
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.stroke();
          ctx.restore();
        }
      }
    }
  }

  function loop() {
    ctx.clearRect(0, 0, W, H);
    particles.forEach(p => { p.update(); p.draw(); });
    drawConnections();
    requestAnimationFrame(loop);
  }

  window.addEventListener('resize', () => { resize(); initParticleList(); });
  resize();
  initParticleList();
  loop();
})();

// ── Research Mode Switching ─────────────────────
modeBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    modeBtns.forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); });
    btn.classList.add('active');
    btn.setAttribute('aria-pressed', 'true');
    state.currentMode = btn.dataset.mode;
    showToast(`Mode: ${btn.textContent.trim()}`);
  });
});

// ── Input Auto-Resize ───────────────────────────
researchInput.addEventListener('input', () => {
  researchInput.style.height = 'auto';
  researchInput.style.height = researchInput.scrollHeight + 'px';
  sendBtn.disabled = researchInput.value.trim() === '' || state.isLoading;
});

researchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (!sendBtn.disabled) handleSubmit();
  }
});

// ── Starter Chips ───────────────────────────────
starterChips.forEach(chip => {
  chip.addEventListener('click', () => {
    researchInput.value = chip.textContent;
    researchInput.dispatchEvent(new Event('input'));
    researchInput.focus();
    setTimeout(() => { if (!sendBtn.disabled) handleSubmit(); }, 100);
  });
});

// ── Submit ──────────────────────────────────────
sendBtn.addEventListener('click', handleSubmit);

async function handleSubmit() {
  const query = researchInput.value.trim();
  if (!query || state.isLoading) return;

  if (!state.activeSessionId) createNewSession(query);

  // Show canvas, hide welcome
  welcomeState.style.display = 'none';
  researchCanvas.style.display = 'flex';

  // Reset input
  researchInput.value = '';
  researchInput.style.height = 'auto';
  sendBtn.disabled = true;
  state.isLoading  = true;

  const loadingEl = addLoadingCard(query);

  try {
    const result = await callFlaskAPI(query, state.currentMode);
    loadingEl.remove();
    addResearchCard(query, result, state.currentMode);

    // Add to history for context
    state.history.push({ role: 'user', content: query });
    state.history.push({ role: 'model', content: result.answer || '' });
    if (state.history.length > 12) state.history = state.history.slice(-12);

    updateSessionTimestamp();
  } catch (err) {
    loadingEl.remove();
    showToast('❌ ' + (err.message || 'Server error'), 'error');
  } finally {
    state.isLoading  = false;
    sendBtn.disabled = false;
  }
}

// ── Flask API Call ──────────────────────────────
async function callFlaskAPI(query, mode) {
  const res = await fetch('/api/research', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, mode, history: state.history }),
  });

  const data = await res.json();

  if (!res.ok || data.error) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }

  return data.result;
}

// ── Loading Card ────────────────────────────────
function addLoadingCard(query) {
  const msgs = ['Searching through knowledge', 'Synthesizing insights', 'Analyzing sources', 'Crafting a deep response'];
  const msg  = msgs[Math.floor(Math.random() * msgs.length)];

  const el = document.createElement('div');
  el.className = 'loading-card';
  el.innerHTML = `
    <div class="loading-spinner"></div>
    <div>
      <div class="loading-text"><span class="loading-dots">${msg}</span></div>
      <div style="font-size:0.78rem;color:var(--text-muted);margin-top:4px;font-style:italic;">"${truncate(query, 60)}"</div>
    </div>
  `;
  researchCanvas.appendChild(el);
  el.scrollIntoView({ behavior: 'smooth', block: 'end' });
  return el;
}

// ── Research Card ───────────────────────────────
function addResearchCard(query, result, mode) {
  const cardId = 'card-' + Date.now();
  const modeMeta = {
    explain: { label: 'Explain',    badgeClass: 'badge-mode-explain', icon: '📖' },
    deep:    { label: 'Deep Dive',  badgeClass: 'badge-mode-deep',    icon: '🔬' },
    compare: { label: 'Compare',    badgeClass: 'badge-mode-compare', icon: '🆚' },
    synth:   { label: 'Synthesize', badgeClass: 'badge-mode-synth',   icon: '🧩' },
  };
  const m          = modeMeta[mode] || modeMeta.explain;
  const confidence = result.confidence || 'medium';
  const confLabel  = confidence.charAt(0).toUpperCase() + confidence.slice(1);
  const confClass  = `confidence-${confidence}`;

  const conceptsHTML = (result.concepts || []).length
    ? `<div class="concepts-section">
        <div class="concepts-label">🏷 Key Concepts</div>
        <div class="concepts-tags">${(result.concepts || []).map(c =>
          `<button class="concept-tag" onclick="searchConcept('${escapeAttr(c)}')">${escapeHtml(c)}</button>`
        ).join('')}</div>
       </div>` : '';

  const followupsHTML = (result.followups || []).length
    ? `<div class="followup-section">
        <div class="followup-label">💡 Explore Further</div>
        <div class="followup-chips">${(result.followups || []).map(f =>
          `<button class="followup-chip" onclick="askFollowup('${escapeAttr(f)}')">${escapeHtml(f)}</button>`
        ).join('')}</div>
       </div>` : '';

  const srcIcons = { Academic: '🎓', Book: '📚', Journal: '📄', Website: '🌐' };
  const sourcesHTML = (result.sources || []).length
    ? `<div class="sources-section">
        <div class="sources-label">📌 Suggested Sources</div>
        ${(result.sources || []).map(s =>
          `<div class="source-item">
            <span class="source-icon">${srcIcons[s.type] || '📎'}</span>
            <span class="source-name">${escapeHtml(s.name)}</span>
            <span class="source-type">${escapeHtml(s.type || '')}</span>
           </div>`
        ).join('')}
       </div>` : '';

  const card = document.createElement('div');
  card.className = 'research-card';
  card.id = cardId;
  card.innerHTML = `
    <div class="card-header">
      <div class="card-query">
        <div class="query-icon">🔍</div>
        <span>${escapeHtml(query)}</span>
      </div>
      <div class="card-badges">
        <span class="badge ${m.badgeClass}">${m.icon} ${m.label}</span>
        <span class="confidence-badge ${confClass}">
          <span class="confidence-dot"></span>${confLabel} Confidence
        </span>
      </div>
    </div>
    <div class="card-body">
      <div class="response-text" id="text-${cardId}"></div>
      ${conceptsHTML}${followupsHTML}${sourcesHTML}
    </div>
    <div class="card-actions">
      <button class="card-action-btn" id="bookmark-${cardId}" onclick="toggleBookmark('${cardId}', '${escapeAttr(query)}')">☆ Bookmark</button>
      <button class="card-action-btn" onclick="copyCardText('${cardId}')">📋 Copy</button>
      <button class="card-action-btn" onclick="removeCard('${cardId}')">🗑 Remove</button>
    </div>
  `;

  researchCanvas.appendChild(card);
  typewriterEffect($(`text-${cardId}`), result.answer || '');
  card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  saveToSession(query, result, mode);
}

// ── Typewriter Effect ───────────────────────────
function typewriterEffect(el, text, speed = 6) {
  const formatted = formatText(text);
  let i = 0;
  function type() {
    if (i <= formatted.length) {
      el.innerHTML = formatted.substring(0, i) + '<span class="cursor-blink"></span>';
      i += Math.ceil(Math.random() * 4 + 1);
      setTimeout(type, speed);
    } else {
      el.innerHTML = formatted;
    }
  }
  type();
}

function formatText(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>');
}

// ── Follow-up & Concept ─────────────────────────
function askFollowup(q) {
  researchInput.value = q;
  researchInput.dispatchEvent(new Event('input'));
  researchInput.focus();
  setTimeout(() => { if (!sendBtn.disabled) handleSubmit(); }, 300);
}

function searchConcept(c) {
  researchInput.value = `Explain: ${c}`;
  researchInput.dispatchEvent(new Event('input'));
  researchInput.focus();
  setTimeout(() => { if (!sendBtn.disabled) handleSubmit(); }, 300);
}

window.askFollowup   = askFollowup;
window.searchConcept = searchConcept;

// ── Bookmark / Highlights ───────────────────────
function toggleBookmark(cardId, query) {
  const btn     = $(`bookmark-${cardId}`);
  const textEl  = $(`text-${cardId}`);
  const snippet = textEl ? textEl.innerText.substring(0, 140) + '…' : '';
  const idx     = state.highlights.findIndex(h => h.cardId === cardId);

  if (idx >= 0) {
    state.highlights.splice(idx, 1);
    btn.classList.remove('bookmarked');
    btn.innerHTML = '☆ Bookmark';
    showToast('Bookmark removed');
  } else {
    state.highlights.push({ cardId, query, snippet, ts: Date.now() });
    btn.classList.add('bookmarked');
    btn.innerHTML = '★ Bookmarked';
    showToast('⭐ Bookmarked!', 'success');
  }
  localStorage.setItem('snap_highlights', JSON.stringify(state.highlights));
  renderHighlights();
}
window.toggleBookmark = toggleBookmark;

function renderHighlights() {
  if (!state.highlights.length) {
    highlightsList.innerHTML = '<div style="padding:8px;font-size:0.8rem;color:var(--text-muted);">No bookmarks yet.</div>';
    return;
  }
  highlightsList.innerHTML = state.highlights.map(h => `
    <div class="highlight-item">
      <span class="highlight-star">★</span>
      <div>
        <div style="font-weight:600;font-size:0.82rem;color:var(--text-primary);margin-bottom:4px;">${escapeHtml(h.query)}</div>
        <div style="font-size:0.78rem;">${escapeHtml(h.snippet)}</div>
      </div>
    </div>`).join('');
}

highlightsToggle.addEventListener('click', () => {
  highlightsPanel.classList.toggle('visible');
  if (highlightsPanel.classList.contains('visible')) renderHighlights();
});

clearHighlightsBtn.addEventListener('click', () => {
  state.highlights = [];
  localStorage.setItem('snap_highlights', '[]');
  renderHighlights();
  document.querySelectorAll('.card-action-btn.bookmarked').forEach(btn => {
    btn.classList.remove('bookmarked');
    btn.innerHTML = '☆ Bookmark';
  });
  showToast('Highlights cleared');
});

// ── Copy & Remove ───────────────────────────────
function copyCardText(cardId) {
  const el = $(`text-${cardId}`);
  if (!el) return;
  navigator.clipboard.writeText(el.innerText)
    .then(() => showToast('📋 Copied!', 'success'))
    .catch(() => showToast('Copy failed', 'error'));
}
window.copyCardText = copyCardText;

function removeCard(cardId) {
  const card = $(cardId);
  if (!card) return;
  card.style.opacity   = '0';
  card.style.transform = 'scale(0.95)';
  card.style.transition= 'all 0.3s ease';
  setTimeout(() => {
    card.remove();
    if (!researchCanvas.children.length) {
      welcomeState.style.display = 'flex';
      researchCanvas.style.display = 'none';
    }
  }, 300);
}
window.removeCard = removeCard;

// ── Export Markdown ─────────────────────────────
exportBtn.addEventListener('click', () => {
  const cards = researchCanvas.querySelectorAll('.research-card');
  if (!cards.length) { showToast('Nothing to export yet!', 'error'); return; }

  let md = `# 🔬 SNAP Research Export\n_Exported: ${new Date().toLocaleString()}_\n\n---\n\n`;
  cards.forEach((card, i) => {
    const queryEl = card.querySelector('.card-query span');
    const textEl  = card.querySelector('.response-text');
    const modeEl  = card.querySelector('.badge');
    if (!queryEl || !textEl) return;
    md += `## ${i + 1}. ${queryEl.textContent}\n`;
    if (modeEl) md += `> **Mode:** ${modeEl.textContent}\n\n`;
    md += textEl.innerText + '\n\n';
    const concepts = [...card.querySelectorAll('.concept-tag')].map(t => t.textContent);
    if (concepts.length) md += `**Key Concepts:** ${concepts.join(', ')}\n\n`;
    md += '---\n\n';
  });

  const blob = new Blob([md], { type: 'text/markdown' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `snap-research-${Date.now()}.md`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('⬇ Exported as Markdown!', 'success');
});

// ── Session Management ──────────────────────────
function createNewSession(firstQuery) {
  const session = { id: 'session-' + Date.now(), title: truncate(firstQuery, 32), ts: Date.now(), cards: [] };
  state.sessions.unshift(session);
  state.activeSessionId = session.id;
  saveSessionsToStorage();
  return session;
}

function saveToSession(query, result, mode) {
  const session = state.sessions.find(s => s.id === state.activeSessionId);
  if (session) { session.cards.push({ query, mode, ts: Date.now() }); saveSessionsToStorage(); }
}

function updateSessionTimestamp() {
  const session = state.sessions.find(s => s.id === state.activeSessionId);
  if (session) { session.ts = Date.now(); saveSessionsToStorage(); }
}

function saveSessionsToStorage() {
  localStorage.setItem('snap_sessions', JSON.stringify(state.sessions));
  renderSessions();
}

function renderSessions() {
  if (!state.sessions.length) {
    sessionsList.innerHTML = '<div style="padding:8px;font-size:0.78rem;color:var(--text-muted);text-align:center;">No sessions yet</div>';
    return;
  }
  sessionsList.innerHTML = state.sessions.map(s => `
    <div class="session-item ${s.id === state.activeSessionId ? 'active' : ''}"
         onclick="loadSession('${s.id}')" role="listitem" tabindex="0">
      <div class="session-item-title">${escapeHtml(s.title)}</div>
      <div class="session-item-meta">${s.cards.length} card${s.cards.length !== 1 ? 's' : ''} · ${timeAgo(s.ts)}</div>
    </div>`).join('');
}

function loadSession(id) {
  state.activeSessionId = id;
  renderSessions();
  showToast('📂 Session selected');
}
window.loadSession = loadSession;

newSessionBtn.addEventListener('click', () => {
  state.activeSessionId = null;
  state.history = [];
  researchCanvas.innerHTML  = '';
  researchCanvas.style.display = 'none';
  welcomeState.style.display   = 'flex';
  renderSessions();
});

clearSessionBtn.addEventListener('click', () => {
  if (!confirm('Clear this session?')) return;
  researchCanvas.innerHTML  = '';
  researchCanvas.style.display = 'none';
  welcomeState.style.display   = 'flex';
  state.history = [];
  if (state.activeSessionId) {
    state.sessions = state.sessions.filter(s => s.id !== state.activeSessionId);
    state.activeSessionId = null;
    saveSessionsToStorage();
  }
  showToast('Session cleared');
});

// ── Toast ───────────────────────────────────────
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity   = '0';
    toast.style.transform = 'translateY(8px)';
    toast.style.transition= 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 2800);
}

// ── Utilities ───────────────────────────────────
function truncate(str, n) { return str.length > n ? str.substring(0, n) + '…' : str; }
function escapeHtml(str) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(str).replace(/[&<>"']/g, m => map[m]);
}
function escapeAttr(str) { return String(str).replace(/'/g, "\\'").replace(/"/g, '&quot;'); }
function timeAgo(ts) {
  const diff = Date.now() - ts, mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Init ────────────────────────────────────────
renderSessions();
renderHighlights();

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    researchInput.focus();
  }
});

console.log('%c🔬 SNAP Research Assistant ready!', 'color:#6c63ff;font-size:14px;font-weight:bold;');

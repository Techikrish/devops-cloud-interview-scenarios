// ── DATA ──
const DOMAINS = [
  {
    id: 'kubernetes',
    emoji: '☸️',
    title: 'Kubernetes',
    desc: 'Container orchestration, pod debugging, deployments, networking',
    count: 150,
    color: '#326ce5',
    file: 'kubernetes/scenarios.md'
  },
  {
    id: 'aws',
    emoji: '☁️',
    title: 'AWS',
    desc: 'EC2, S3, RDS, IAM, Networking, Cost Optimization',
    count: 120,
    color: '#ff9900',
    file: 'aws/scenarios.md'
  },
  {
    id: 'ci-cd',
    emoji: '🔄',
    title: 'CI/CD',
    desc: 'Pipelines, GitOps, deployments, testing, secret management',
    count: 100,
    color: '#28a745',
    file: 'ci-cd/scenarios.md'
  },
  {
    id: 'terraform',
    emoji: '🏗️',
    title: 'Terraform',
    desc: 'State management, modules, locking, imports, best practices',
    count: 80,
    color: '#7b42bc',
    file: 'terraform/scenarios.md'
  },
  {
    id: 'docker',
    emoji: '🐳',
    title: 'Docker',
    desc: 'Images, containers, networking, multi-stage builds, security',
    count: 80,
    color: '#2496ed',
    file: 'docker/scenarios.md'
  },
  {
    id: 'linux-sre',
    emoji: '🐧',
    title: 'Linux / SRE',
    desc: 'System administration, performance tuning, incident response',
    count: 47,
    color: '#e95420',
    file: 'linux-sre/scenarios.md'
  },
  {
    id: 'observability',
    emoji: '📊',
    title: 'Observability',
    desc: 'Monitoring, logging, metrics, tracing, alerting',
    count: 47,
    color: '#f5a623',
    file: 'observability/scenarios.md'
  },
  {
    id: 'networking',
    emoji: '🌐',
    title: 'Networking',
    desc: 'VPCs, security groups, routing, DNS, load balancing',
    count: 46,
    color: '#00a8e8',
    file: 'networking/scenarios.md'
  },
  {
    id: 'security',
    emoji: '🔒',
    title: 'Security',
    desc: 'IAM, secrets, encryption, compliance, supply chain',
    count: 40,
    color: '#e74c3c',
    file: 'security/scenarios.md'
  },
  {
    id: 'general-devops',
    emoji: '⚙️',
    title: 'General DevOps',
    desc: 'Cross-domain, disaster recovery, automation',
    count: 40,
    color: '#1abc9c',
    file: 'general-devops/scenarios.md'
  }
];

// ── STATE ──
let currentDomain = null;
let allQuestions = {}; // domain id → [{num, level, question, note, answer, group, isRapid}]
let activeLevel = 'all';
let sidebarFilter = '';
let searchLevel = 'all';
let searchOpen = false;

// ── DOM REFS ──
const themeToggle   = document.getElementById('theme-toggle');
const searchToggle  = document.getElementById('search-toggle');
const heroSearchBtn = document.getElementById('hero-search-btn');
const searchOverlay = document.getElementById('search-overlay');
const searchInput   = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');
const searchEmpty   = document.getElementById('search-empty');
const navDomains    = document.getElementById('nav-domains');
const domainGrid    = document.getElementById('domain-grid');
const domainsSection = document.getElementById('domains');
const qaSection     = document.getElementById('qa-section');
const qaContent     = document.getElementById('qa-content');
const loadingState  = document.getElementById('loading-state');
const qaToc         = document.getElementById('qa-toc');
const backBtn       = document.getElementById('back-btn');
const sidebarSearch = document.getElementById('sidebar-search');
const levelBtns     = document.querySelectorAll('.level-btn');
const filterChips   = document.querySelectorAll('.filter-chip');
const sidebarDomainInfo = document.getElementById('sidebar-domain-info');

// ── THEME ──
const savedTheme = localStorage.getItem('theme') || 'dark';
document.documentElement.dataset.theme = savedTheme;
themeToggle.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('theme', next);
});

// ── RENDER DOMAIN GRID ──
function renderDomainGrid() {
  domainGrid.innerHTML = '';
  navDomains.innerHTML = '';

  DOMAINS.forEach(d => {
    // nav chip
    const chip = document.createElement('button');
    chip.className = 'nav-chip';
    chip.textContent = d.emoji + ' ' + d.title;
    chip.addEventListener('click', () => openDomain(d));
    navDomains.appendChild(chip);

    // card
    const card = document.createElement('div');
    card.className = 'domain-card';
    card.style.setProperty('--card-accent', d.color);
    card.innerHTML = `
      <span class="card-emoji">${d.emoji}</span>
      <div class="card-title">${d.title}</div>
      <div class="card-desc">${d.desc}</div>
      <div class="card-meta">
        <span class="card-count">${d.count} questions</span>
        <svg class="card-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
      </div>`;
    card.addEventListener('click', () => openDomain(d));
    domainGrid.appendChild(card);
  });
}

// ── MARKDOWN PARSER ──
function parseMarkdown(md, domainId) {
  const questions = [];
  const lines = md.split('\n');
  let currentGroup = 'General';
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // section headers (## ...) → group
    if (/^## /.test(line)) {
      currentGroup = line.replace(/^## /, '').replace(/[🔴🔵🟢🟡🟣🟠]/g, '').trim();
      i++; continue;
    }

    // question line: **Q\d+. [Lx] ...**
    const qMatch = line.match(/^\*\*Q(\d+)\.\s+\[(L[123])\]\s+(.*?)\*\*\s*$/);
    if (qMatch) {
      const num = parseInt(qMatch[1]);
      const level = qMatch[2];
      const questionText = qMatch[3].trim();

      // check for rapid-fire (single line Q+A)
      const rapidMatch = line.match(/^\*\*(Q\d+\.\s+\[L[123]\]\s+.*?)\*\*\s+\*\*Answer:\*\*\s+(.*)/);

      let note = '';
      let answerLines = [];
      let isRapid = false;

      // look ahead
      i++;
      // interviewer note
      if (i < lines.length && lines[i].startsWith('> *What the interviewer')) {
        note = lines[i].replace(/^> \*/, '').replace(/\*$/, '').trim();
        i++;
      }
      // blank lines
      while (i < lines.length && lines[i].trim() === '') i++;

      // **Answer:** line
      if (i < lines.length && lines[i].match(/^\*\*Answer:\*\*\s*(.*)/)) {
        const firstAnswerLine = lines[i].match(/^\*\*Answer:\*\*\s*(.*)/)[1];
        if (firstAnswerLine.trim()) answerLines.push(firstAnswerLine);
        i++;
        // collect until next question or heading
        while (i < lines.length) {
          if (/^\*\*Q\d+\./.test(lines[i]) || /^## /.test(lines[i]) || /^---/.test(lines[i])) break;
          answerLines.push(lines[i]);
          i++;
        }
      }

      // trim trailing empty lines
      while (answerLines.length && answerLines[answerLines.length - 1].trim() === '') answerLines.pop();

      questions.push({ num, level, question: questionText, note, answer: answerLines.join('\n'), group: currentGroup, isRapid: false, domainId });
      continue;
    }

    // rapid-fire block: **Q30-Q60 — Rapid-fire ...**
    const rfBlock = line.match(/^\*\*(Q\d+-Q\d+[^*]*)\*\*/);
    if (rfBlock) { i++; continue; }

    // rapid-fire single: **Q30. [L1]** text **Answer:** ...
    const rfMatch = line.match(/^\*\*(Q(\d+)\.\s+\[(L[123])\])\*\*\s+(.*?)\s+\*\*Answer:\*\*\s+(.*)/);
    if (rfMatch) {
      const num = parseInt(rfMatch[2]);
      const level = rfMatch[3];
      const questionText = rfMatch[4].trim().replace(/\*\*$/, '');
      const answerText = rfMatch[5].trim();
      questions.push({ num, level, question: questionText, note: '', answer: answerText, group: currentGroup, isRapid: true, domainId });
      i++; continue;
    }

    i++;
  }

  return questions;
}

// ── MINI MARKDOWN RENDERER ──
function renderAnswerMd(md) {
  if (!md) return '';
  let html = escapeHtml(md);

  // code blocks
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) =>
    `<pre><code class="lang-${lang}">${code.trimEnd()}</code></pre>`);

  // inline code
  html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');

  // bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // italic
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // unordered lists
  html = html.replace(/^(\s*)[-*]\s+(.*)$/gm, '<li>$2</li>');
  html = html.replace(/(<li>[\s\S]*?<\/li>\n?)+/g, m => `<ul>${m}</ul>`);

  // numbered lists
  html = html.replace(/^\d+\.\s+(.*)$/gm, '<li>$1</li>');

  // headings
  html = html.replace(/^### (.*)$/gm, '<strong>$1</strong>');

  // newlines → paragraphs (outside pre)
  const parts = html.split(/(<pre>[\s\S]*?<\/pre>)/g);
  html = parts.map((p, i) => {
    if (i % 2 === 1) return p; // it's a pre block
    return p.split(/\n\n+/).map(block => {
      block = block.trim();
      if (!block) return '';
      if (block.startsWith('<ul>') || block.startsWith('<ol>') || block.startsWith('<li>')) return block;
      return `<p>${block.replace(/\n/g, '<br>')}</p>`;
    }).join('');
  }).join('');

  return html;
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function highlight(text, query) {
  if (!query) return escapeHtml(text);
  const re = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return escapeHtml(text).replace(re, '<mark>$1</mark>');
}

// ── LEVEL BADGE ──
function levelBadge(level, cls = 'qa-level') {
  const colors = { L1: '#3fb950', L2: '#e3b341', L3: '#f85149' };
  const bg = colors[level] || '#8b949e';
  return `<span class="${cls} lvl-${level}" style="background:${bg}22;color:${bg}">${level}</span>`;
}

// ── OPEN DOMAIN ──
async function openDomain(domain) {
  currentDomain = domain;
  activeLevel = 'all';
  sidebarFilter = '';
  sidebarSearch.value = '';
  levelBtns.forEach(b => b.classList.toggle('active', b.dataset.level === 'all'));

  // update nav chips
  document.querySelectorAll('.nav-chip').forEach((c, i) => {
    c.classList.toggle('active', DOMAINS[i].id === domain.id);
  });

  // hide hero + domains, show qa
  domainsSection.style.display = 'none';
  document.getElementById('hero').style.display = 'none';
  qaSection.style.display = '';
  qaContent.innerHTML = '';
  qaToc.innerHTML = '';
  loadingState.style.display = 'flex';

  // sidebar domain info
  sidebarDomainInfo.innerHTML = `
    <span class="sidebar-emoji">${domain.emoji}</span>
    <div>
      <div class="sidebar-domain-name">${domain.title}</div>
      <div class="sidebar-domain-count">${domain.count} questions</div>
    </div>`;

  // fetch & parse
  try {
    if (!allQuestions[domain.id]) {
      // Try multiple base paths to handle different serving configurations
      let text = null;
      const paths = [domain.file, '../' + domain.file, './' + domain.file];
      for (const p of paths) {
        try {
          const r = await fetch(p);
          if (r.ok) { text = await r.text(); break; }
        } catch (_) {}
      }
      if (!text) throw new Error('Could not fetch ' + domain.file);
      allQuestions[domain.id] = parseMarkdown(text, domain.id);
    }
    renderQA(domain, allQuestions[domain.id]);
  } catch (e) {
    loadingState.style.display = 'flex';
    loadingState.innerHTML = `<p style="color:var(--red)">⚠️ Could not load questions.<br><small>${e.message}</small></p>`;
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── RENDER Q&A ──
function renderQA(domain, questions) {
  loadingState.style.display = 'none';

  // group questions
  const groups = {};
  questions.forEach(q => {
    if (!groups[q.group]) groups[q.group] = [];
    groups[q.group].push(q);
  });

  // header
  const header = document.createElement('div');
  header.className = 'domain-header';
  header.innerHTML = `
    <h1>${domain.emoji} ${domain.title} — Scenario Interview Questions</h1>
    <p>${domain.desc}</p>
    <div class="level-legend">
      <span class="legend-item"><span class="legend-dot" style="background:#3fb950"></span>L1 — Fresher / 0-1yr</span>
      <span class="legend-item"><span class="legend-dot" style="background:#e3b341"></span>L2 — Mid / 2-4yr</span>
      <span class="legend-item"><span class="legend-dot" style="background:#f85149"></span>L3 — Senior / 5+yr</span>
    </div>`;
  qaContent.appendChild(header);

  // toc & cards per group
  qaToc.innerHTML = '';
  Object.entries(groups).forEach(([groupName, qs]) => {
    // toc group
    const tocGroup = document.createElement('div');
    tocGroup.className = 'toc-group';
    const tocLabel = document.createElement('div');
    tocLabel.className = 'toc-group-label';
    tocLabel.textContent = groupName;
    tocGroup.appendChild(tocLabel);

    // card group
    const cardGroup = document.createElement('div');
    cardGroup.className = `qa-group ${qs.some(q => q.isRapid) ? 'rapid-fire' : ''}`;
    const groupTitle = document.createElement('div');
    groupTitle.className = 'qa-group-title';
    groupTitle.textContent = groupName;
    cardGroup.appendChild(groupTitle);

    qs.forEach(q => {
      // toc item
      const tocItem = document.createElement('button');
      tocItem.className = 'toc-item';
      tocItem.dataset.num = q.num;
      tocItem.dataset.level = q.level;
      tocItem.innerHTML = `<span class="toc-qnum">Q${q.num}</span><span class="toc-q">${escapeHtml(q.question).substring(0, 72)}${q.question.length > 72 ? '…' : ''}</span>${levelBadge(q.level, 'toc-lvl')}`;
      tocItem.addEventListener('click', () => {
        const card = document.getElementById(`card-${q.num}`);
        if (card) {
          card.scrollIntoView({ behavior: 'smooth', block: 'start' });
          if (!card.classList.contains('open')) card.classList.add('open');
          highlightToc(q.num);
        }
      });
      tocGroup.appendChild(tocItem);

      // card
      const card = document.createElement('div');
      card.className = 'qa-card';
      card.id = `card-${q.num}`;
      card.dataset.level = q.level;
      card.dataset.question = q.question.toLowerCase();

      const noteHtml = q.note ? `<div class="interviewer-note">🎯 ${escapeHtml(q.note)}</div>` : '';
      const answerHtml = q.isRapid
        ? `<div class="answer-content"><p>${escapeHtml(q.answer)}</p></div>`
        : `<div class="answer-content">${renderAnswerMd(q.answer)}</div>`;

      card.innerHTML = `
        <div class="qa-card-header" role="button" aria-expanded="false" tabindex="0">
          <span class="qa-num">Q${q.num}</span>
          <span class="qa-q-text">${escapeHtml(q.question)}</span>
          <div class="qa-meta">
            ${levelBadge(q.level)}
            <svg class="qa-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
          </div>
        </div>
        <div class="qa-body">
          <div class="qa-body-inner">
            ${noteHtml}
            ${answerHtml}
          </div>
        </div>`;

      const hdr = card.querySelector('.qa-card-header');
      hdr.addEventListener('click', () => toggleCard(card, q.num));
      hdr.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleCard(card, q.num); } });
      cardGroup.appendChild(card);
    });

    qaToc.appendChild(tocGroup);
    qaContent.appendChild(cardGroup);
  });
}

function toggleCard(card, num) {
  const isOpen = card.classList.toggle('open');
  card.querySelector('.qa-card-header').setAttribute('aria-expanded', isOpen);
  if (isOpen) highlightToc(num);
}

function highlightToc(num) {
  document.querySelectorAll('.toc-item').forEach(t => t.classList.toggle('active', parseInt(t.dataset.num) === num));
}

// ── LEVEL FILTER (sidebar) ──
levelBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    activeLevel = btn.dataset.level;
    levelBtns.forEach(b => b.classList.toggle('active', b === btn));
    applyFilters();
  });
});

sidebarSearch.addEventListener('input', () => {
  sidebarFilter = sidebarSearch.value.toLowerCase().trim();
  applyFilters();
});

function applyFilters() {
  const cards = document.querySelectorAll('.qa-card');
  const tocItems = document.querySelectorAll('.toc-item');

  cards.forEach(card => {
    const lvlOk = activeLevel === 'all' || card.dataset.level === activeLevel;
    const txtOk = !sidebarFilter || card.dataset.question.includes(sidebarFilter);
    const visible = lvlOk && txtOk;
    card.style.display = visible ? '' : 'none';

    // highlight matching text
    const qText = card.querySelector('.qa-q-text');
    if (qText && sidebarFilter) {
      const orig = qText.textContent;
      qText.innerHTML = highlight(orig, sidebarFilter);
    } else if (qText) {
      qText.innerHTML = escapeHtml(qText.textContent);
    }
  });

  tocItems.forEach(item => {
    const lvlOk = activeLevel === 'all' || item.dataset.level === activeLevel;
    const num = item.dataset.num;
    const card = document.getElementById(`card-${num}`);
    const visible = lvlOk && (!sidebarFilter || (card && card.dataset.question.includes(sidebarFilter)));
    item.classList.toggle('hidden', !visible);
  });

  // hide empty group titles
  document.querySelectorAll('.qa-group').forEach(g => {
    const anyVisible = [...g.querySelectorAll('.qa-card')].some(c => c.style.display !== 'none');
    g.style.display = anyVisible ? '' : 'none';
  });
}

// ── BACK BUTTON ──
backBtn.addEventListener('click', () => {
  qaSection.style.display = 'none';
  domainsSection.style.display = '';
  document.getElementById('hero').style.display = '';
  currentDomain = null;
  document.querySelectorAll('.nav-chip').forEach(c => c.classList.remove('active'));
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

// ── SEARCH ──
function openSearch() {
  searchOpen = true;
  searchOverlay.classList.add('open');
  searchOverlay.setAttribute('aria-hidden', 'false');
  searchInput.focus();
  searchInput.select();
}
function closeSearch() {
  searchOpen = false;
  searchOverlay.classList.remove('open');
  searchOverlay.setAttribute('aria-hidden', 'true');
}

searchToggle.addEventListener('click', openSearch);
heroSearchBtn.addEventListener('click', openSearch);
searchOverlay.addEventListener('click', e => { if (e.target === searchOverlay) closeSearch(); });
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); openSearch(); }
  if (e.key === 'Escape' && searchOpen) closeSearch();
});

// filter chips
filterChips.forEach(chip => {
  chip.addEventListener('click', () => {
    searchLevel = chip.dataset.level;
    filterChips.forEach(c => c.classList.toggle('active', c === chip));
    doSearch(searchInput.value);
  });
});

searchInput.addEventListener('input', () => doSearch(searchInput.value));

async function ensureAllLoaded() {
  for (const d of DOMAINS) {
    if (!allQuestions[d.id]) {
      try {
        const r = await fetch(d.file);
        if (r.ok) {
          const text = await r.text();
          allQuestions[d.id] = parseMarkdown(text, d.id);
        } else {
          allQuestions[d.id] = [];
        }
      } catch (_) {
        allQuestions[d.id] = [];
      }
    }
  }
}

// Returns true if all words in the query appear in the haystack
function matchesQuery(haystack, words) {
  return words.every(w => haystack.includes(w));
}

let searchTimer = null;
function doSearch(query) {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(async () => {
    const q = query.trim().toLowerCase();
    if (!q) {
      searchResults.innerHTML = '';
      searchEmpty.style.display = '';
      searchResults.appendChild(searchEmpty);
      return;
    }
    searchEmpty.style.display = 'none';
    searchResults.innerHTML = '<div class="search-empty"><p>Searching…</p></div>';
    await ensureAllLoaded();
    const words = q.split(/\s+/).filter(Boolean);
    const results = [];
    DOMAINS.forEach(d => {
      (allQuestions[d.id] || []).forEach(qItem => {
        if (searchLevel !== 'all' && qItem.level !== searchLevel) return;
        const haystack = qItem.question.toLowerCase() + ' ' + qItem.answer.toLowerCase();
        if (matchesQuery(haystack, words)) {
          results.push({ ...qItem, domain: d });
        }
      });
    });

    searchResults.innerHTML = '';
    if (!results.length) {
      searchResults.innerHTML = `<div class="search-empty"><p>No results for "<strong>${escapeHtml(query)}</strong>"</p></div>`;
      return;
    }
    const count = document.createElement('div');
    count.className = 'result-count';
    count.textContent = `${results.length} result${results.length !== 1 ? 's' : ''} found`;
    searchResults.appendChild(count);

    results.slice(0, 40).forEach(item => {
      const el = document.createElement('div');
      el.className = 'search-result-item';
      el.setAttribute('role', 'option');
      el.innerHTML = `
        <div class="result-meta">
          <span class="result-domain">${item.domain.emoji} ${item.domain.title}</span>
          ${levelBadge(item.level, 'result-level')}
        </div>
        <div class="result-q">Q${item.num}. ${highlight(item.question, query)}</div>`;
      el.addEventListener('click', async () => {
        closeSearch();
        await openDomain(item.domain);
        setTimeout(() => scrollToCard(item.num), 300);
      });
      searchResults.appendChild(el);
    });
  }, 200);
}

function scrollToCard(num) {
  const card = document.getElementById(`card-${num}`);
  if (card) {
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (!card.classList.contains('open')) card.classList.add('open');
    highlightToc(num);
  }
}

// ── INIT ──
renderDomainGrid();

// pre-load all domains in background after page idle
if ('requestIdleCallback' in window) {
  requestIdleCallback(ensureAllLoaded, { timeout: 5000 });
} else {
  setTimeout(ensureAllLoaded, 2000);
}

// Motion helpers for the Borrow App look. Purely decorative: every element added here is
// aria-hidden, nothing in the page content changes, and it all switches off for
// users who prefer reduced motion.
const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const PALETTE = ['#12a594', '#ffc83d', '#f0654a', '#9b6cf0', '#3f7be8', '#e5557a', '#f07f2e'];
const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2l2.6 6.9L22 10l-5.6 4.6L18.2 22 12 18.1 5.8 22l1.8-7.4L2 10l7.4-1.1z"/></svg>';

function el(tag, className, attrs = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'style') Object.assign(node.style, value);
    else node.setAttribute(key, value);
  }
  return node;
}

function decorateHero() {
  const hero = document.querySelector('.hero .hero-grid');
  if (!hero || hero.querySelector('.fx-deco')) return;
  const items = [
    ['fx-deco fx-star', { top: '9%', left: '46%' }, 0],
    ['fx-deco fx-star', { top: '74%', left: '41%', width: '12px', height: '12px' }, 1.1],
    ['fx-deco fx-star', { top: '18%', right: '5%' }, 0.5],
    ['fx-deco fx-dot', { top: '12%', left: '36%', width: '14px', height: '14px' }, 0],
    ['fx-deco fx-dot mint', { bottom: '14%', left: '4%', width: '12px', height: '12px' }, 0.4],
    ['fx-deco fx-dot mint', { top: '8%', right: '30%', width: '20px', height: '20px' }, 1],
    ['fx-deco fx-ring', { bottom: '-34px', left: '44%' }, 0]
  ];
  for (const [className, style, delay] of items) {
    const node = el('span', className, { 'aria-hidden': 'true', style: { ...style, animationDelay: `${delay}s` } });
    if (className.includes('fx-star')) node.innerHTML = STAR;
    hero.appendChild(node);
  }
}

function addRibbon() {
  const search = document.querySelector('.search-section');
  if (!search || document.querySelector('.fx-ribbon')) return;
  const words = [...document.querySelectorAll('.category-card strong')].map(node => node.textContent.trim()).filter(Boolean);
  const extra = ['จองตามวันใช้งาน', 'นัดรับในมหาวิทยาลัย', 'จ่ายด้วย QR PromptPay', 'มัดจำได้คืนเมื่อคืนของ', 'นำทางไปจุดนัด'];
  const list = [...words, ...extra];
  if (!list.length) return;
  const ribbon = el('div', 'fx-ribbon container', { 'aria-hidden': 'true' });
  const track = el('div', 'fx-ribbon-track');
  const icons = ['📷', '📐', '🎵', '👔', '📦', '📅', '📍', '💳', '🔁', '🧭'];
  const makeItem = (text, i) => {
    const item = el('span', 'fx-ribbon-item');
    const icon = el('i', '', { style: { background: PALETTE[i % PALETTE.length] } });
    icon.textContent = icons[i % icons.length];
    const label = el('span'); label.textContent = text;
    const sep = el('b'); sep.textContent = '★';
    item.append(icon, label, sep);
    return item;
  };
  // the list twice so translateX(-50%) loops seamlessly
  [...list, ...list].forEach((text, i) => track.appendChild(makeItem(text, i % list.length)));
  ribbon.appendChild(track);
  search.parentNode.insertBefore(ribbon, search);
}

function addDriftLayer() {
  if (document.querySelector('.fx-drift-layer')) return;
  const layer = el('div', 'fx-drift-layer', { 'aria-hidden': 'true' });
  for (let i = 0; i < 12; i++) {
    const size = 10 + (i % 4) * 6;
    layer.appendChild(el('span', 'fx-drift', {
      style: {
        left: `${(i * 8.3 + 3) % 100}%`, width: `${size}px`, height: `${size}px`,
        borderRadius: i % 3 === 0 ? '50%' : '5px',
        background: PALETTE[i % PALETTE.length],
        '--d': `${16 + (i % 5) * 3}s`, '--delay': `${-(i * 2.3).toFixed(1)}s`,
        '--o': (0.18 + (i % 3) * 0.06).toFixed(2), '--r': `${(i % 2 ? 1 : -1) * (180 + i * 20)}deg`
      }
    }));
  }
  document.body.prepend(layer);
}

// Staggered pop-in for cards as they appear (also for cards rendered later by main.js).
const REVEAL = '.listing-card, .category-card, .how-card, .wanted-card, .account-row, .notification-item, .review-card, .conversation-row, .payment-type-row, .owner-payout-row';
const RISE = '.section h2, .section-desc, .demand-card, .trust-strip, .search-panel, .toolbar, .payment-settings';
let io = null;
function observe(node, kind, index) {
  if (node.dataset.fxBound) return;
  node.dataset.fxBound = '1';
  node.classList.add(kind);
  node.style.setProperty('--fx-delay', `${Math.min(index, 10) * 0.05}s`);
  if (io) io.observe(node); else node.classList.add('fx-in');
}
function scan(root = document) {
  if (!(root instanceof Element) && root !== document) return;
  const groups = new Map();
  for (const node of root.querySelectorAll(REVEAL)) {
    const parent = node.parentElement; const i = groups.get(parent) || 0; groups.set(parent, i + 1);
    observe(node, 'fx-reveal', i);
  }
  for (const node of root.querySelectorAll(RISE)) observe(node, 'fx-rise', 0);
  for (const pill of root.querySelectorAll('.status-pill')) {
    if (!pill.dataset.fxBound) { pill.dataset.fxBound = '1'; requestAnimationFrame(() => pill.classList.add('fx-in')); }
  }
}

function burstAt(x, y, count = 10) {
  const host = el('div', 'fx-burst', { 'aria-hidden': 'true', style: { left: `${x}px`, top: `${y}px` } });
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count;
    const dist = 26 + (i % 3) * 10;
    host.appendChild(el('i', '', { style: {
      background: PALETTE[i % PALETTE.length],
      '--tx': `${Math.cos(angle) * dist}px`, '--ty': `${Math.sin(angle) * dist}px`, '--rot': `${i * 40}deg`
    } }));
  }
  document.body.appendChild(host);
  setTimeout(() => host.remove(), 800);
}

function confetti() {
  if (document.querySelector('.fx-confetti')) return;
  const host = el('div', 'fx-confetti', { 'aria-hidden': 'true' });
  for (let i = 0; i < 46; i++) {
    host.appendChild(el('i', '', { style: {
      left: `${(i * 2.2 + (i % 7) * 3) % 100}%`, background: PALETTE[i % PALETTE.length],
      borderRadius: i % 3 === 0 ? '50%' : '3px',
      '--d': `${(1.9 + (i % 5) * 0.3).toFixed(2)}s`, '--delay': `${(0.05 + (i % 9) * 0.08).toFixed(2)}s`
    } }));
  }
  document.body.appendChild(host);
  setTimeout(() => host.remove(), 3800);
}

const SUCCESS = /(สำเร็จ|ส่งคำขอจองแล้ว|บันทึกการโอน|ส่งหลักฐานแล้ว|บันทึกจุดนัด)/;

function init() {
  if (reduceMotion) return;
  if ('IntersectionObserver' in window) {
    io = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) { entry.target.classList.add('fx-in'); io.unobserve(entry.target); }
      }
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  }
  decorateHero();
  addRibbon();
  addDriftLayer();
  scan(document);

  new MutationObserver(mutations => {
    for (const m of mutations) for (const node of m.addedNodes) if (node instanceof Element) {
      if (node.matches?.(REVEAL) || node.matches?.(RISE)) scan(node.parentElement || document);
      else scan(node);
    }
  }).observe(document.body, { childList: true, subtree: true });

  // springy "pop" on chips/tabs/hearts + small burst on primary buttons
  document.addEventListener('click', event => {
    const target = event.target.closest('.chip, .account-tab, .view-switch button, .heart');
    if (target) { target.classList.remove('fx-pop'); void target.offsetWidth; target.classList.add('fx-pop'); }
    const primary = event.target.closest('.btn-primary, .search-submit');
    if (primary) burstAt(event.clientX, event.clientY, 10);
  }, true);

  // bell rings while there are unread notifications
  const count = document.getElementById('notificationCount');
  const bell = document.getElementById('openNotificationsTop');
  if (count && bell) {
    const sync = () => bell.classList.toggle('fx-has-new', !count.hidden && count.textContent.trim() !== '0');
    new MutationObserver(sync).observe(count, { attributes: true, childList: true, characterData: true, subtree: true });
    sync();
  }

  // confetti when a success toast appears
  const toast = document.getElementById('toast');
  if (toast) {
    new MutationObserver(() => {
      if (toast.classList.contains('show') && SUCCESS.test(toast.textContent || '')) confetti();
    }).observe(toast, { attributes: true, attributeFilter: ['class'], childList: true, characterData: true, subtree: true });
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

/* ══════════════════════════════════════════════════════════
   EAIM 체육 — 교실 연결 (체육 전용)  pe-class.js  v1.0 (2026-09-26)
   - 공통 교실 모듈(shared/eaim-classroom-core.js v1.0, 사회·역사 기준본 사본)을
     고치지 않고 그 위에 체육에 필요한 것만 더합니다. (체육 부록 1번)
   - 세 가지 모드
       공개   : 주소에 ?code= 도 ?teach= 도 없음 → Firebase 를 불러오지 않음, 기록 없음
       수업   : ?code=ABC123 → 입장 관문(학년·반·번호 + 성 한 글자, 선택) → 기록 저장
       선생님 : ?teach=<roomId> → 구글 로그인한 선생님만, 수업 방의 선생님 자료(pe) 편집
   - 수업 방 하나(app:'pe')에서 앱마다 QR 을 따로 뽑습니다. 선생님 자료는
     수업 방 문서의 pe 칸(pe.poses, pe.songs, pe.quiz)에 둡니다 — 새 컬렉션 없음.
   - 페이지에서 쓰는 법: <script type="module" src="pe-class.js"></script>
       const st = await PEClass.ready;   // { mode:'public'|'class'|'teach'|'blocked', ... }
       PEClass.inClass()  /  PEClass.content('quiz')  /  PEClass.saveResult({...})
       PEClass.saveWork({...})  /  PEClass.listenMine(cb)  /  PEClass.teachSave('poses', [...])
   ══════════════════════════════════════════════════════════ */

const FB = 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// 체육 앱 표 — 공개/수업, 기록 종류, 학생 입장 파일 (체육 부록 0번·3번)
export const PE_APPS = {
  record:  { file: 'eaim-pe-record.html',    title: '기록 측정',          classLink: false },
  league:  { file: 'team-league.html',       title: '팀 편성 · 학급 리그', classLink: false },
  circuit: { file: 'circuit-timer.html',     title: '서킷 트레이닝 타이머', classLink: false },
  basket:  { file: 'eaim-beat-basket-3.html', title: '비트 & 바스켓',      classLink: true, record: 'submissions' },
  stretch: { file: 'eaim-pose-stretch.html', title: '스트레칭 따라하기',   classLink: true, record: 'gameResults' },
  rhythm:  { file: 'rhythm-pose.html',       title: '리듬 포즈 게임',      classLink: true, record: 'gameResults' },
  dance:   { file: 'dance-maker.html',       title: '창작 안무 만들기',    classLink: true, record: 'submissions' },
  slowcam: { file: 'slow-cam.html',          title: '동작 분석 슬로우 캠', classLink: false },
  tactics: { file: 'tactics-board.html',     title: '전술 보드',          classLink: true, record: 'submissions' },
  referee: { file: 'referee-quiz.html',      title: '심판 판정 퀴즈',      classLink: true, record: 'gameResults' },
  cpr:     { file: 'cpr-rhythm.html',        title: '가슴압박 박자 연습',  classLink: true, record: 'gameResults' },
  fitness: { file: 'fitness-log.html',       title: '건강체력 자기관리',   classLink: false },
};

// 공통 모듈이 읽는 값 (모듈을 불러오기 전에 정함)
window.EAIM_PLATFORM = 'pe';
window.EAIM_APP_TYPE = 'pe';
window.EAIM_APP_FILES = Object.fromEntries(Object.entries(PE_APPS).map(([k, v]) => [k, v.file]));

const params = new URLSearchParams(location.search);
const CODE = (params.get('code') || '').trim().toUpperCase();
const TEACH = (params.get('teach') || '').trim();
const thisApp = () => Object.keys(PE_APPS).find(k => location.pathname.endsWith('/' + PE_APPS[k].file) || location.pathname.endsWith(PE_APPS[k].file)) || '';

let core = null, fs = null, state = { mode: 'public' }, roomData = null, closedNow = false;
const listeners = new Set();

/* ── 작은 화면 도우미 (다른 CSS 에 기대지 않음) ── */
const css = `
.pc-veil{position:fixed;inset:0;z-index:9999;background:rgba(2,6,23,.92);display:flex;align-items:center;justify-content:center;padding:18px;word-break:keep-all;font-family:'Noto Sans KR',sans-serif;color:#f8fafc}
.pc-box{background:#0f172a;border:1px solid #334155;border-radius:20px;padding:22px;max-width:420px;width:100%;line-height:1.6}
.pc-box h2{margin:0 0 8px;font-size:20px;color:#fb923c}
.pc-box p{margin:6px 0;color:#cbd5e1;font-size:14px}
.pc-row{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}
.pc-box button{font:inherit;font-weight:700;border:0;border-radius:12px;padding:11px 14px;cursor:pointer;background:#1e293b;color:#f8fafc}
.pc-box button.on,.pc-box button.pri{background:#f97316;color:#fff}
.pc-box input{font:inherit;font-size:16px;background:#020617;color:#f8fafc;border:1px solid #334155;border-radius:10px;padding:10px;width:100%;box-sizing:border-box}
.pc-lab{font-size:13px;color:#94a3b8;margin-top:10px;display:block}
.pc-err{color:#fca5a5;font-size:13px;min-height:18px}
.pc-seat{position:fixed;left:8px;bottom:calc(8px + env(safe-area-inset-bottom));z-index:9000;background:rgba(15,23,42,.9);border:1px solid #334155;color:#e2e8f0;border-radius:999px;padding:5px 11px;font:12px 'Noto Sans KR',sans-serif;pointer-events:none;max-width:70vw;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pc-seat.off{border-color:#ef4444;color:#fecaca}
`;
function addCss() { if (document.getElementById('pc-css')) return; const s = document.createElement('style'); s.id = 'pc-css'; s.textContent = css; document.head.appendChild(s); }
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function veil(html) { addCss(); const v = document.createElement('div'); v.className = 'pc-veil'; v.innerHTML = `<div class="pc-box">${html}</div>`; document.body.appendChild(v); return v; }
function publicUrl() { const u = new URL(location.href); u.searchParams.delete('code'); u.searchParams.delete('teach'); return u.pathname.split('/').pop() + (u.search || ''); }
function seatBadge() {
  addCss();
  let b = document.getElementById('pc-seat');
  if (!b) { b = document.createElement('div'); b.id = 'pc-seat'; b.className = 'pc-seat'; document.body.appendChild(b); }
  const s = state.seat;
  b.classList.toggle('off', closedNow);
  b.textContent = closedNow ? '🔒 수업이 닫혔어요 · 기록은 보내지지 않아요' : `📚 ${s.classNo}반 ${s.studentNo}번 ${s.displayName || ''} · 수업 중`;
}
function emit() { document.dispatchEvent(new CustomEvent('pe-class', { detail: state })); listeners.forEach(f => { try { f(state); } catch (e) { console.warn(e); } }); }

/* ── 수업 방 찾기: 없는 방 / 닫힌 방 / 다른 과목·예전 방을 나눠서 알려 줌 ── */
async function findRoom(code) {
  const snap = await fs.getDoc(fs.doc(core.db, 'roomCodes', code));
  if (!snap.exists()) return { why: 'none' };
  const { teacherUid, roomId } = snap.data();
  const r = await fs.getDoc(fs.doc(core.db, `teachers/${teacherUid}/rooms/${roomId}`));
  if (!r.exists()) return { why: 'none' };
  const d = r.data();
  if (d.platform !== 'pe') return { why: 'other' };
  if (!d.isOpen) return { why: 'closed' };
  return { teacherUid, roomId, room: d };
}

function blocked(why) {
  const msg = {
    none: ['수업 방을 찾을 수 없어요', '주소나 QR 을 다시 확인해 주세요.'],
    closed: ['수업이 닫혀 있어요', '선생님이 수업을 열면 다시 들어올 수 있어요.'],
    other: ['체육 수업 방이 아니에요', '다른 과목이나 예전 수업 방의 QR 이에요. 선생님께 새 QR 을 받아 주세요.'],
    error: ['수업 방에 연결하지 못했어요', '인터넷 연결을 확인하고 다시 들어와 주세요.'],
  }[why] || ['들어갈 수 없어요', ''];
  const v = veil(`<h2>${msg[0]}</h2><p>${msg[1]}</p><p>기록 없이 연습은 할 수 있어요.</p>
    <div class="pc-row"><button class="pri" id="pcPractice">기록 없이 연습하기</button></div>`);
  v.querySelector('#pcPractice').onclick = () => { location.href = publicUrl(); };
  state = { mode: 'blocked', why };
}

/* ── 입장 관문: 학년·반·번호 + 성 한 글자(선택). 이름 전체는 받지 않음 (공통규칙 4-3) ── */
function askSeat(room) {
  return new Promise((resolve) => {
    const classes = Array.isArray(room.classes) ? room.classes.map(c => (typeof c === 'string' ? c : c && c.name) || '').filter(x => /^\d-\d{1,2}$/.test(x)) : [];
    const v = veil(`<h2>🏃 ${esc(room.title || '체육 수업')}</h2>
      <p>반과 번호만 적어요. 이름은 적지 않아도 돼요.</p>
      ${classes.length ? `<span class="pc-lab">반</span><div class="pc-row" id="pcCls">${classes.map(c => `<button data-c="${c}">${c}반</button>`).join('')}</div>`
        : `<span class="pc-lab">학년</span><div class="pc-row" id="pcGrade">${[1, 2, 3].map(g => `<button data-g="${g}">${g}학년</button>`).join('')}</div>
           <span class="pc-lab">반</span><input id="pcClass" type="number" inputmode="numeric" min="1" max="20" placeholder="예: 3">`}
      <span class="pc-lab">번호</span><input id="pcNo" type="number" inputmode="numeric" min="1" max="60" placeholder="예: 7">
      <span class="pc-lab">성 한 글자 (선택)</span><input id="pcSur" maxlength="1" placeholder="예: 김" autocomplete="off">
      <p class="pc-err" id="pcErr"></p>
      <div class="pc-row"><button class="pri" id="pcGo" style="flex:1">들어가기</button></div>`);
    let grade = '', cls = '';
    v.addEventListener('click', (e) => {
      const g = e.target.closest('[data-g]'), c = e.target.closest('[data-c]');
      if (g) { grade = g.dataset.g; v.querySelectorAll('[data-g]').forEach(x => x.classList.toggle('on', x === g)); }
      if (c) { cls = c.dataset.c; v.querySelectorAll('[data-c]').forEach(x => x.classList.toggle('on', x === c)); }
    });
    v.querySelector('#pcGo').onclick = () => {
      const err = v.querySelector('#pcErr');
      let classNo = cls;
      if (!classes.length) {
        const n = parseInt(v.querySelector('#pcClass').value, 10);
        if (!grade) { err.textContent = '학년을 골라 주세요.'; return; }
        if (!(n >= 1 && n <= 20)) { err.textContent = '반을 숫자로 적어 주세요.'; return; }
        classNo = `${grade}-${n}`;
      } else if (!classNo) { err.textContent = '반을 골라 주세요.'; return; }
      const no = parseInt(v.querySelector('#pcNo').value, 10);
      if (!(no >= 1 && no <= 60)) { err.textContent = '번호를 숫자로 적어 주세요.'; return; }
      const sur = (v.querySelector('#pcSur').value || '').trim();
      if (sur && !/^[가-힣]$/.test(sur)) { err.textContent = '성은 한글 한 글자만 적어요. 비워 둬도 돼요.'; return; }
      v.remove();
      resolve({ classNo, studentNo: no, displayName: sur ? sur + '**' : '' });
    };
  });
}

async function startClass() {
  try {
    core = await import('./shared/eaim-classroom-core.js');
    fs = await import(FB);
    const found = await findRoom(CODE);
    if (!found.roomId) { blocked(found.why); return; }
    const key = 'eaim_pe_seat_' + CODE;
    let seat = null;
    try { seat = JSON.parse(sessionStorage.getItem(key) || 'null'); } catch (e) { seat = null; }
    if (!seat) seat = await askSeat(found.room);
    await core.joinRoom({ teacherUid: found.teacherUid, roomId: found.roomId, className: seat.classNo, number: seat.studentNo, name: seat.displayName || null });
    const uid = core.auth.currentUser.uid;
    await fs.setDoc(fs.doc(core.db, `teachers/${found.teacherUid}/rooms/${found.roomId}/students/${uid}`),
      { platform: 'pe', app: thisApp(), classNo: seat.classNo, studentNo: seat.studentNo, displayName: seat.displayName || '' }, { merge: true });
    sessionStorage.setItem(key, JSON.stringify(seat));
    roomData = found.room;
    state = { mode: 'class', teacherUid: found.teacherUid, roomId: found.roomId, seat, app: thisApp(), title: found.room.title || '' };
    seatBadge();
    fs.onSnapshot(fs.doc(core.db, `teachers/${found.teacherUid}/rooms/${found.roomId}`), (s) => {
      if (!s.exists()) return;
      roomData = s.data();
      const was = closedNow; closedNow = !roomData.isOpen;
      seatBadge();
      if (was !== closedNow) emit();
      emit();
    });
  } catch (e) {
    console.warn('수업 연결 실패', e);
    blocked('error');
  }
}

/* ── 선생님 모드: 시범 동작·추천곡처럼 카메라·영상이 필요한 선생님 자료를 그 앱 화면에서 만듦 ── */
async function startTeach() {
  core = await import('./shared/eaim-classroom-core.js');
  fs = await import(FB);
  await new Promise((resolve) => {
    let v = null;
    core.onTeacherAuthChange(async (user) => {
      if (!user || user.isAnonymous) {
        if (!v) {
          v = veil(`<h2>🧑‍🏫 선생님 화면</h2><p>수업 방의 선생님 자료를 고치는 화면이에요. 구글 계정으로 로그인해 주세요.</p>
            <p class="pc-err" id="pcErr"></p><div class="pc-row"><button class="pri" id="pcLogin">구글 로그인</button><button id="pcPub">학생 화면으로</button></div>`);
          v.querySelector('#pcLogin').onclick = () => core.teacherLogin().catch(e => { v.querySelector('#pcErr').textContent = '로그인하지 못했어요: ' + (e.code || e.message); });
          v.querySelector('#pcPub').onclick = () => { location.href = publicUrl(); };
        }
        return;
      }
      try {
        const r = await fs.getDoc(fs.doc(core.db, `teachers/${user.uid}/rooms/${TEACH}`));
        if (!r.exists() || r.data().platform !== 'pe') {
          if (v) v.remove();
          v = veil(`<h2>수업 방을 찾을 수 없어요</h2><p>이 계정의 체육 수업 방이 아니에요. 교사 페이지에서 다시 들어와 주세요.</p><div class="pc-row"><button class="pri" id="pcBack">교사 페이지로</button></div>`);
          v.querySelector('#pcBack').onclick = () => { location.href = 'teacher.html'; };
          return;
        }
        if (v) v.remove();
        roomData = r.data();
        state = { mode: 'teach', teacherUid: user.uid, roomId: TEACH, title: roomData.title || '' };
        resolve();
      } catch (e) {
        console.warn(e);
        if (v) v.remove();
        v = veil(`<h2>수업 방을 읽지 못했어요</h2><p>인터넷 연결을 확인해 주세요.</p>`);
      }
    });
  });
}

/* ── 기록 저장 (공통규칙 5-1: 점수는 gameResults, 결과물은 submissions) ── */
function meta(extra = {}) {
  const s = state.seat || {};
  return { platform: 'pe', appId: 'pe/' + (state.app || thisApp()), classNo: s.classNo, studentNo: s.studentNo, displayName: s.displayName || '', ...extra };
}
function canSave() {
  if (state.mode !== 'class') return { ok: false, reason: '수업 QR 로 들어왔을 때만 선생님께 보낼 수 있어요.' };
  if (closedNow) return { ok: false, reason: '수업이 닫혀서 보내지 못했어요.' };
  if (!core.auth.currentUser) return { ok: false, reason: '수업 방 연결이 끊겼어요. 다시 들어와 주세요.' };
  return { ok: true };
}
async function saveResult({ game, score = null, correct = null, total = null, wrongLog = [], detail = {} }) {
  const c = canSave(); if (!c.ok) return c;
  try {
    await core.saveGameResult({ teacherUid: state.teacherUid, roomId: state.roomId, studentMeta: meta({ activityType: 'game', detail }), game, score, correct, total, wrongLog: wrongLog.slice(0, 30) });
    return { ok: true };
  } catch (e) { console.warn(e); return { ok: false, reason: '저장하지 못했어요. 인터넷 연결을 확인해 주세요.' }; }
}
async function saveWork({ kind, title, content, activityType = 'creation', detail = {} }) {
  const c = canSave(); if (!c.ok) return c;
  try {
    await core.saveSubmission({ teacherUid: state.teacherUid, roomId: state.roomId, studentMeta: meta({ activityType, detail, feedback: '' }), kind, title, content });
    return { ok: true };
  } catch (e) { console.warn(e); return { ok: false, reason: '저장하지 못했어요. 인터넷 연결을 확인해 주세요.' }; }
}
/* 학생이 자기 결과물(과 선생님 답장)만 봄 — 이름이 아니라 입장 계정(studentId)으로 찾음 */
function listenMine(cb) {
  if (state.mode !== 'class') return () => {};
  const q = fs.query(fs.collection(core.db, `teachers/${state.teacherUid}/rooms/${state.roomId}/submissions`), fs.where('studentId', '==', core.auth.currentUser.uid));
  return fs.onSnapshot(q, (s) => cb(s.docs.map(d => ({ id: d.id, ...d.data() })).filter(d => d.appId === 'pe/' + state.app)), (e) => console.warn(e));
}
/* 선생님 모드: 수업 방 문서의 pe.<key> 저장 */
async function teachSave(key, value) {
  if (state.mode !== 'teach') return { ok: false, reason: '선생님 화면이 아니에요.' };
  try {
    await fs.updateDoc(fs.doc(core.db, `teachers/${state.teacherUid}/rooms/${state.roomId}`), { ['pe.' + key]: value });
    roomData = { ...roomData, pe: { ...(roomData.pe || {}), [key]: value } };
    return { ok: true };
  } catch (e) { console.warn(e); return { ok: false, reason: '수업 방에 저장하지 못했어요. 인터넷 연결을 확인해 주세요.' }; }
}

let resolveReady;
const ready = new Promise(r => { resolveReady = r; });
window.PEClass = {
  ready,
  get state() { return state; },
  inClass: () => state.mode === 'class' && !closedNow,
  isTeach: () => state.mode === 'teach',
  content: (key) => (roomData && roomData.pe && roomData.pe[key]) || null,
  saveResult, saveWork, listenMine, teachSave,
  onChange: (f) => { listeners.add(f); return () => listeners.delete(f); },
  apps: PE_APPS,
};

(async () => {
  if (TEACH) await startTeach();
  else if (CODE) await startClass();
  resolveReady(state);
  emit();
})();

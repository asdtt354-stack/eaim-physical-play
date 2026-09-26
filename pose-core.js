// EAIM 포즈 인식 공통 모듈  pose-core.js  v2.0 (2026-09-26)
// - 영상은 이 기기 안에서만 자세(관절 위치)를 읽는 데 쓰고, 저장하거나 보내지 않아요.
// - 인식 프로그램(@mediapipe/tasks-vision)과 모델 파일은 처음 한 번 인터넷에서 받아 와요(받기만 함).
// - 동작 목록: 수업 QR 로 들어오면 그 수업 방의 선생님 시범 동작(pe.poses), 아니면 이 기기 동작(eaim_pe_poses_v1), 없으면 기본 5개.
import { PoseLandmarker, FilesetResolver } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';

export const IDX = { nose: 0, ls: 11, rs: 12, le: 13, re: 14, lw: 15, rw: 16, lh: 23, rh: 24, lk: 25, rk: 26, la: 27, ra: 28 };
export const BONES = [['ls','rs'],['ls','le'],['le','lw'],['rs','re'],['re','rw'],['ls','lh'],['rs','rh'],['lh','rh'],['lh','lk'],['lk','la'],['rh','rk'],['rk','ra']];
export const FEATURES = [
    { key: 'le', pts: ['ls','le','lw'], joint: 'le', tol: 12, range: 40 },
    { key: 're', pts: ['rs','re','rw'], joint: 're', tol: 12, range: 45 },
    { key: 'lsh', pts: ['lh','ls','le'], joint: 'ls', tol: 12, range: 45 },
    { key: 'rsh', pts: ['rh','rs','re'], joint: 'rs', tol: 12, range: 45 },
    { key: 'lhip', pts: ['ls','lh','lk'], joint: 'lh', tol: 12, range: 45 },
    { key: 'rhip', pts: ['rs','rh','rk'], joint: 'rh', tol: 12, range: 45 },
    { key: 'lkn', pts: ['lh','lk','la'], joint: 'lk', tol: 12, range: 45 },
    { key: 'rkn', pts: ['rh','rk','ra'], joint: 'rk', tol: 12, range: 45 },
    { key: 'torso', pts: ['ls','rs','lh','rh'], joint: null, tol: 4, range: 18 },
    { key: 'lleg', pts: ['ls','rs','lh','rh','la'], joint: 'la', tol: 10, range: 50 },
    { key: 'rleg', pts: ['ls','rs','lh','rh','ra'], joint: 'ra', tol: 10, range: 50 },
];

export const angle = (a, b, c) => {
    const v1x = a.x - b.x, v1y = a.y - b.y, v2x = c.x - b.x, v2y = c.y - b.y;
    const d = (v1x * v2x + v1y * v2y) / ((Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y)) || 1);
    return Math.acos(Math.max(-1, Math.min(1, d))) * 180 / Math.PI;
};
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

// 좌표: 카메라 원본 이미지 기준 (사람의 왼쪽 = +x)
export const computeFeatures = (P) => {
    const ok = (k) => P[k] && (P[k].v ?? 1) >= 0.5;
    const out = {};
    const sm = ok('ls') && ok('rs') ? mid(P.ls, P.rs) : null;
    const hm = ok('lh') && ok('rh') ? mid(P.lh, P.rh) : null;
    const torsoLen = sm && hm ? Math.hypot(sm.x - hm.x, sm.y - hm.y) : 0;
    for (const f of FEATURES) {
        if (!f.pts.every(ok)) { out[f.key] = null; continue; }
        if (f.key === 'torso') out.torso = Math.atan2(sm.x - hm.x, hm.y - sm.y) * 180 / Math.PI;
        else if (f.key === 'lleg') out.lleg = torsoLen ? (P.la.y - P.lh.y) / torsoLen * 100 : null;
        else if (f.key === 'rleg') out.rleg = torsoLen ? (P.ra.y - P.rh.y) / torsoLen * 100 : null;
        else out[f.key] = angle(P[f.pts[0]], P[f.pts[1]], P[f.pts[2]]);
    }
    return out;
};

// ── 기본 동작 (스트레칭 앱과 같은 5개) ──
const BASE = { nose: [0,-0.12], ls: [-0.08,0], rs: [0.08,0], lh: [-0.05,0.3], rh: [0.05,0.3], lk: [-0.05,0.52], rk: [0.05,0.52], la: [-0.05,0.74], ra: [0.05,0.74] };
const rotateUpper = (pts, deg) => {
    const t = deg * Math.PI / 180, out = { ...pts };
    for (const k of ['nose','ls','rs','le','re','lw','rw']) { const [x, y] = pts[k], ry = y - 0.3; out[k] = [x * Math.cos(t) + ry * Math.sin(t), -x * Math.sin(t) + ry * Math.cos(t) + 0.3]; }
    return out;
};
const swapKey = (k) => k === 'nose' ? k : k[0] === 'l' ? 'r' + k.slice(1) : k[0] === 'r' ? 'l' + k.slice(1) : k;
const mirrorPose = (pts) => Object.fromEntries(Object.entries(pts).map(([k, [x, y]]) => [swapKey(k), [-x, y]]));
const mirrorWeights = (w) => Object.fromEntries(Object.entries(w).map(([k, v]) => [swapKey(k), v]));
const toImage = (disp) => Object.fromEntries(Object.entries(disp).map(([k, [x, y]]) => [k, { x: -x, y, v: 1 }]));
const sideL = rotateUpper({ ...BASE, le: [-0.12,0.14], lw: [-0.12,0.28], re: [0.12,-0.14], rw: [0.05,-0.30] }, 20);
const sideW = { le: 0.3, lsh: 0.3, torso: 4, rsh: 2 };

export const DEFAULT_POSES = [
    { id: 'd1', name: '양팔 위로 뻗기', disp: { ...BASE, le: [-0.10,-0.16], re: [0.10,-0.16], lw: [-0.11,-0.32], rw: [0.11,-0.32] }, weights: { lsh: 2, rsh: 2, torso: 2 } },
    { id: 'd2', name: '왼쪽 옆구리 늘리기', disp: sideL, weights: sideW },
    { id: 'd3', name: '오른쪽 옆구리 늘리기', disp: mirrorPose(sideL), weights: mirrorWeights(sideW) },
    { id: 'd4', name: '스쿼트', disp: { nose: [0,0.02], ls: [-0.08,0.12], rs: [0.08,0.12], lh: [-0.06,0.42], rh: [0.06,0.42], lk: [-0.12,0.56], rk: [0.12,0.56], la: [-0.08,0.74], ra: [0.08,0.74], le: [-0.10,0.24], re: [0.10,0.24], lw: [-0.03,0.22], rw: [0.03,0.22] }, weights: { le: 0, re: 0, lsh: 0, rsh: 0, lleg: 2, rleg: 2, lkn: 1.5, rkn: 1.5 } },
    { id: 'd5', name: '한 발 서기 균형', disp: { ...BASE, rk: [0.18,0.42], ra: [0.03,0.50], le: [-0.09,-0.15], re: [0.09,-0.15], lw: [-0.01,-0.30], rw: [0.01,-0.30] }, weights: { rleg: 3, rkn: 2, lsh: 1.5, rsh: 1.5 } },
].map(p => ({ id: p.id, name: p.name, builtin: true, points: toImage(p.disp), weights: p.weights }));

export const loadPoses = () => {
    try { const v = JSON.parse(localStorage.getItem('eaim_pe_poses_v1')); if (Array.isArray(v) && v.length) return v; } catch (e) {}
    return JSON.parse(JSON.stringify(DEFAULT_POSES));
};
// 수업 연결이 준비된 뒤의 동작 목록 (수업 방 동작 우선)
export async function posesNow() {
    const st = window.PEClass ? await window.PEClass.ready : { mode: 'public' };
    if (st.mode === 'class') {
        const rp = window.PEClass.content('poses');
        return rp && rp.length ? JSON.parse(JSON.stringify(rp)) : JSON.parse(JSON.stringify(DEFAULT_POSES));
    }
    return loadPoses();
}

const tcache = new WeakMap();
export const targetOf = (pose) => { if (!tcache.has(pose)) tcache.set(pose, computeFeatures(pose.points)); return tcache.get(pose); };

export const scorePose = (live, pose) => {
    const tgt = targetOf(pose);
    let sum = 0, wsum = 0, wall = 0, worst = null;
    const per = {};
    for (const f of FEATURES) {
        const w = pose.weights?.[f.key] ?? 1;
        if (!w || tgt[f.key] == null) continue;
        wall += w;
        if (live[f.key] == null) continue;
        const s = Math.max(0, 1 - Math.max(0, Math.abs(live[f.key] - tgt[f.key]) - f.tol) / f.range);
        per[f.key] = s; sum += w * s; wsum += w;
        if (w >= 0.5 && (!worst || s < worst.s)) worst = { f, s, cur: live[f.key], tgt: tgt[f.key] };
    }
    if (!wall || wsum / wall < 0.6) return null;
    return { score: sum / wsum * 100, per, worst };
};

// 여러 사람의 자세가 서로 얼마나 비슷한지 (0~100)
export const syncScore = (featList) => {
    if (featList.length < 2) return null;
    let tot = 0, n = 0;
    for (const f of FEATURES) {
        const vals = featList.map(x => x[f.key]).filter(v => v != null);
        if (vals.length < 2) continue;
        const m = vals.reduce((a, b) => a + b, 0) / vals.length;
        const sd = Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / vals.length);
        tot += Math.max(0, 1 - Math.max(0, sd - f.tol / 2) / f.range); n++;
    }
    return n ? tot / n * 100 : null;
};

// ── 그리기 ──
export const colorFor = (s) => s == null ? '#94a3b8' : s > 0.8 ? '#22c55e' : s > 0.5 ? '#eab308' : '#ef4444';

export const drawFigure = (canvas, P, color = '#f97316') => {
    const ctx = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    const keys = Object.keys(IDX).filter(k => P[k]);
    const xs = keys.map(k => -P[k].x), ys = keys.map(k => P[k].y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const head = (maxY - minY) * 0.08;
    const sc = Math.min(W * 0.8 / ((maxX - minX) || 1), H * 0.82 / ((maxY - minY + head * 2) || 1));
    const ox = W / 2 - (minX + maxX) / 2 * sc, oy = H / 2 - (minY + maxY) / 2 * sc;
    const pt = (k) => [-P[k].x * sc + ox, P[k].y * sc + oy];
    ctx.lineCap = 'round'; ctx.strokeStyle = color; ctx.lineWidth = Math.max(4, W / 30);
    for (const [a, b] of BONES) { if (!P[a] || !P[b]) continue; const [x1, y1] = pt(a), [x2, y2] = pt(b); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
    if (P.nose && P.ls && P.rs) {
        const [nx, ny] = pt('nose'), [sx1] = pt('ls'), [sx2] = pt('rs');
        ctx.fillStyle = color; ctx.beginPath(); ctx.arc(nx, ny, Math.max(W / 14, Math.abs(sx1 - sx2) * 0.32), 0, Math.PI * 2); ctx.fill();
    }
};

// 카메라 화면(거울) + 여러 사람의 뼈대
export const PERSON_COLORS = ['#ffffff', '#38bdf8', '#f472b6', '#a3e635'];
export const drawLive = (canvas, video, people, pers = []) => {
    const ctx = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
    ctx.save(); ctx.translate(W, 0); ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, W, H);
    ctx.fillStyle = 'rgba(2,6,23,.25)'; ctx.fillRect(0, 0, W, H);
    people.forEach((P, i) => {
        const per = pers[i];
        ctx.lineCap = 'round'; ctx.lineWidth = Math.max(4, W / 180); ctx.strokeStyle = PERSON_COLORS[i % 4];
        for (const [a, b] of BONES) { if (P[a].v < 0.5 || P[b].v < 0.5) continue; ctx.beginPath(); ctx.moveTo(P[a].x, P[a].y); ctx.lineTo(P[b].x, P[b].y); ctx.stroke(); }
        const js = {};
        if (per) for (const f of FEATURES) if (f.joint && per[f.key] != null) js[f.joint] = Math.min(js[f.joint] ?? 1, per[f.key]);
        for (const k of Object.keys(IDX)) {
            if (k === 'nose' || P[k].v < 0.5) continue;
            ctx.fillStyle = per ? colorFor(js[k]) : PERSON_COLORS[i % 4];
            ctx.beginPath(); ctx.arc(P[k].x, P[k].y, Math.max(7, W / 110), 0, Math.PI * 2); ctx.fill();
        }
    });
    ctx.restore();
};

// ── 모델 · 카메라 ──
let landmarker = null;
export async function initPose({ numPoses = 1 } = {}) {
    if (landmarker) { await landmarker.setOptions({ numPoses }); return landmarker; }
    const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm');
    const opts = (delegate) => ({
        baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task', delegate },
        runningMode: 'VIDEO', numPoses,
    });
    try { landmarker = await PoseLandmarker.createFromOptions(vision, opts('GPU')); }
    catch (e) { landmarker = await PoseLandmarker.createFromOptions(vision, opts('CPU')); }
    return landmarker;
}
export async function startCamera(video, canvas) {
    if (video.srcObject) return;
    // 처음 켤 때 안내 창 (영상은 기기 안에서만, 저장 안 함) — 체육 부록 4번
    if (typeof PE !== 'undefined' && PE.cameraOk && !(await PE.cameraOk())) throw Object.assign(new Error('카메라를 켜지 않음'), { name: 'Declined' });
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    video.srcObject = stream; await video.play();
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
}
// 한 프레임에서 사람들의 관절 좌표 (화면 픽셀 기준)
export const detect = (video, canvas, now) => {
    if (!landmarker || video.readyState < 2) return [];
    const res = landmarker.detectForVideo(video, now);
    // 화면 왼쪽(거울 기준)부터 순서대로 정렬 → 사람 번호가 자리와 맞음
    return (res.landmarks || []).map(lm => {
        const P = {};
        for (const [k, i] of Object.entries(IDX)) P[k] = { x: lm[i].x * canvas.width, y: lm[i].y * canvas.height, v: lm[i].visibility ?? 1 };
        return P;
    }).sort((a, b) => b.nose.x - a.nose.x);
};
export const cameraErrorText = (e) => e && e.name === 'Declined'
    ? '카메라를 켜지 않았어요. 준비되면 다시 눌러 주세요.'
    : e && e.name === 'NotAllowedError'
    ? '카메라 권한이 막혀 있어요. 주소창 옆 자물쇠 아이콘에서 카메라를 허용해 주세요.'
    : '카메라나 인식 프로그램을 켜지 못했어요. 인터넷 연결과, 학교 인터넷이 인식 프로그램 주소를 막고 있지 않은지 확인해 주세요.';

// ── 드럼 반주 (저작권 걱정 없는 기본 비트) ──
export class DrumLoop {
    constructor(bpm) { this.bpm = bpm; this.timer = null; this.c = null; }
    start(delay = 0.15) {
        const c = this.c = PE.ctx();
        if (!this.noise) {
            const len = c.sampleRate * 0.5, b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
            for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
            this.noise = b;
        }
        this.t0 = c.currentTime + delay; this.n = 0;
        const tick = () => {
            const half = 30 / this.bpm, horizon = c.currentTime + 0.15;
            while (this.t0 + this.n * half < horizon) { this.hit(this.n, this.t0 + this.n * half); this.n++; }
        };
        tick(); this.timer = setInterval(tick, 25);
    }
    stop() { clearInterval(this.timer); this.timer = null; }
    beatPos() { return this.c ? (this.c.currentTime - (this.c.outputLatency || 0) - this.t0) * this.bpm / 60 : -1; }
    hit(i, t) {
        if (i % 2 === 0) { const b = (i / 2) % 4; if (b === 0 || b === 2) this.kick(t); else this.snare(t); }
        this.hat(t, i % 2 === 0 ? 0.07 : 0.04);
    }
    kick(t) {
        const c = this.c, o = c.createOscillator(), g = c.createGain();
        o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.15);
        g.gain.setValueAtTime(0.8, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + 0.32);
    }
    noiseHit(t, freq, vol, dur) {
        const c = this.c, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
        s.buffer = this.noise; f.type = 'highpass'; f.frequency.value = freq;
        g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        s.connect(f); f.connect(g); g.connect(c.destination); s.start(t); s.stop(t + dur + 0.02);
    }
    snare(t) { this.noiseHit(t, 1200, 0.35, 0.16); }
    hat(t, v) { this.noiseHit(t, 7000, v, 0.04); }
}

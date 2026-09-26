// EAIM 체육교과 플랫폼 공통 도우미  pe-common.js  v2.0 (2026-09-26)
// 소리, 기기 저장, 화면 켜짐, 카메라 안내 창, 단축키 도우미, 예전 기기 기록 정리
// ※ AI 는 여기서 부르지 않습니다. 학생 화면에는 AI 가 없고(체육 부록 2번), 교사 페이지만 pe-ai.js 로 부릅니다.
const PE = (() => {
    let actx = null, lock = null;
    const ctx = () => {
        if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
        if (actx.state === 'suspended') actx.resume();
        return actx;
    };
    const tone = (freq, dur = 0.15, when = 0, type = 'square', vol = 0.25) => {
        const c = ctx(), o = c.createOscillator(), g = c.createGain(), t = c.currentTime + when;
        o.type = type; o.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
    };
    const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch (e) { return d; } };
    const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { alert('저장 공간이 부족해요. 오래된 기록을 지워 주세요.'); return false; } };
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const $ = (id) => document.getElementById(id);
    const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const wake = async (on) => {
        try {
            if (on && navigator.wakeLock && !lock) { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); }
            if (!on && lock) { await lock.release(); lock = null; }
        } catch (e) {}
    };
    const fullscreen = (el = document.documentElement) => {
        if (document.fullscreenElement) document.exitFullscreen();
        else if (el.requestFullscreen) el.requestFullscreen();
    };
    const today = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };

    // 공통규칙 3번: 글을 쓰는 중에는 단축키가 동작하지 않게
    const typing = (e) => { const el = e && e.target; return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)); };

    // ── 카메라를 켜기 전 안내 창 (영어 회화 방 마이크 안내 방식) ──
    // 동의는 이 탭에서만 기억합니다(탭을 닫으면 다시 물어봄).
    const CAM_OK = 'eaim_pe_cam_ok';
    const cameraOk = () => new Promise((resolve) => {
        try { if (sessionStorage.getItem(CAM_OK) === '1') return resolve(true); } catch (e) {}
        const v = document.createElement('div');
        v.setAttribute('role', 'dialog'); v.setAttribute('aria-modal', 'true');
        v.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(2,6,23,.9);display:flex;align-items:center;justify-content:center;padding:18px;word-break:keep-all';
        v.innerHTML = `<div style="background:#0f172a;border:1px solid #334155;border-radius:20px;padding:22px;max-width:430px;width:100%;line-height:1.7;color:#f8fafc;font-family:'Noto Sans KR',sans-serif">
            <div style="font-size:20px;font-weight:900;color:#fb923c;margin-bottom:6px">📷 카메라를 켜기 전에</div>
            <p style="margin:6px 0">영상은 <b>이 기기 안에서만</b> 자세를 읽는 데 쓰고, <b>저장하지 않아요.</b> 서버나 AI 로 보내지도 않아요.</p>
            <p style="margin:6px 0;color:#cbd5e1;font-size:14px">자세를 읽는 프로그램은 처음 한 번 인터넷에서 받아 와요. 프로그램을 받아 오는 것이지, 영상을 보내는 것은 아니에요.</p>
            <p style="margin:6px 0;color:#cbd5e1;font-size:14px">친구가 화면에 나올 때는 먼저 친구에게 물어봐요.</p>
            <div style="display:flex;gap:8px;margin-top:14px"><button id="camYes" style="flex:1;font:inherit;font-weight:700;border:0;border-radius:12px;padding:12px;background:#f97316;color:#fff;cursor:pointer">알겠어요, 켜기</button><button id="camNo" style="font:inherit;font-weight:700;border:0;border-radius:12px;padding:12px 16px;background:#1e293b;color:#f8fafc;cursor:pointer">안 켜기</button></div></div>`;
        document.body.appendChild(v);
        v.querySelector('#camYes').onclick = () => { try { sessionStorage.setItem(CAM_OK, '1'); } catch (e) {} v.remove(); resolve(true); };
        v.querySelector('#camNo').onclick = () => { v.remove(); resolve(false); };
        v.querySelector('#camYes').focus();
    });

    // 수업 연결(pe-class.js)이 준비되면 부르기 — 공개 화면에서는 mode:'public'
    const onClass = (cb) => {
        if (window.PEClass) window.PEClass.ready.then(cb);
        else document.addEventListener('pe-class', (e) => cb(e.detail), { once: true });
    };

    return { ctx, tone, load, save, esc, $, uid, wake, fullscreen, today, typing, cameraOk, onClass };
})();

// ── 예전 기기 기록 정리 (체육 부록 5번, 2026-09-26 선생님 결정) ──
// 한 번만 실행. 선생님이 만든 자료는 새 이름으로 옮기고, 키와 실명·건강 칸은 지움.
(() => {
    const FLAG = 'eaim_pe_cleanup_v2';
    try {
        if (localStorage.getItem(FLAG)) return;
        const move = (from, to) => { const v = localStorage.getItem(from); if (v != null && localStorage.getItem(to) == null) localStorage.setItem(to, v); localStorage.removeItem(from); };
        move('eaim_pose_stretch_v1', 'eaim_pe_poses_v1');          // 선생님 시범 동작 (관절 좌표 숫자만)
        move('eaim_basket_library_v1', 'eaim_pe_basket_songs_v1'); // 선생님 추천곡
        localStorage.removeItem('gemini_api_key_basket_pro');     // 브라우저에 넣었던 Gemini 키
        localStorage.removeItem('eaim_gemini_key');
        // 건강체력: 이름과 운동부(훈련 일지) 모드의 수면·컨디션·근육 뻐근함 칸 지움
        const fit = JSON.parse(localStorage.getItem('eaim_pe_fitness_v1') || 'null');
        if (fit && typeof fit === 'object') {
            if (fit.profile) fit.profile = { mode: fit.profile.mode === 'athlete' ? 'athlete' : 'general' };
            if (Array.isArray(fit.logs)) fit.logs = fit.logs.map(({ sleep, cond, sore, ...rest }) => rest);
            localStorage.setItem('eaim_pe_fitness_v1', JSON.stringify(fit));
        }
        // 기록 측정의 예전 실명 명단(eaim_pe_record_v1)은 여기서 지우지 않음 —
        // 기록 측정 화면이 "CSV 내려받기 → 지우기"를 안내함 (선생님이 직접 지움)
        localStorage.setItem(FLAG, '1');
    } catch (e) { /* 기기 저장이 막힌 브라우저 — 그냥 넘어감 */ }
})();

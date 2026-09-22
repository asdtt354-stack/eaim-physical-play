// EAIM 체육교과 플랫폼 공통 도우미 (소리, 저장, 화면 켜짐 등)
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
    // 여러 앱이 같이 쓰는 Gemini 키 (기존 비트&바스켓 키도 인식)
    const geminiKey = () => localStorage.getItem('eaim_gemini_key') || localStorage.getItem('gemini_api_key_basket_pro') || '';
    const gemini = async (prompt) => {
        const key = geminiKey();
        if (!key) throw new Error('NO_KEY');
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key.trim()}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.7, maxOutputTokens: 1200, thinkingConfig: { thinkingBudget: 0 } } }),
        });
        if (!res.ok) throw new Error('API');
        const data = await res.json();
        return (data?.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim();
    };
    return { ctx, tone, load, save, esc, $, uid, wake, fullscreen, today, geminiKey, gemini };
})();

/* EAIM 체육 — AI 연결 (교사 페이지 전용)  pe-ai.js  v1.0 (2026-09-26)
   - 학생 화면은 AI 를 부르지 않습니다(체육 부록 2번, 공통규칙 6-5). 이 파일은 teacher.html 만 씁니다.
   - 키는 브라우저에 두지 않고 중계 함수 api/ai(음악과 기준본 v0.5 사본)가 서버에서 씁니다(공통규칙 6-1).
   - 앱은 모델 이름을 보내지 않고 별칭(text)만 보냅니다(공통규칙 6-2).
   - 마크다운 금지 + 정리, 혼잡(503)·요청 몰림(429) 자동 재시도, 원인별 문구(공통규칙 6-3). */
const ENDPOINT = 'api/ai';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export function stripMarkdown(t) {
  return String(t || '')
    .replace(/```[\s\S]*?```/g, m => m.replace(/```\w*\n?|```/g, ''))
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1')
    .replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1$2')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\n{3,}/g, '\n\n').trim();
}

// 중계 함수 문구를 체육에 맞게 (ai.js 는 고치지 않음 — 음악 창 전달 사항)
export function why(message) {
  return String(message || 'AI 에 연결하지 못했어요.').replace(/뮤지컬메이커 교사 대시보드/g, '체육 교사 페이지');
}

export async function text(prompt, { teacher, temperature = 0.7, maxOutputTokens = 1500, tries = 3 } = {}) {
  const body = {
    teacher, model: 'text',
    contents: [{ role: 'user', parts: [{ text: prompt + '\n\n마크다운 기호(#, *, -, ` 등)를 쓰지 말고 평범한 문장으로만 써.' }] }],
    generationConfig: { temperature, maxOutputTokens },
  };
  let last = '';
  for (let i = 0; i < tries; i++) {
    let r;
    try { r = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
    catch (e) { last = '인터넷 연결을 확인해 주세요.'; await sleep(1500); continue; }
    let d = null; try { d = await r.json(); } catch (e) { d = null; }
    if (r.ok) {
      const out = (d?.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
      if (out.trim()) return stripMarkdown(out);
      last = 'AI 가 빈 답을 보냈어요. 다시 눌러 주세요.';
    } else {
      last = why(d?.error?.message || `AI 오류 ${r.status}`);
      if (r.status === 503 || r.status === 429 || r.status === 502) {
        const ra = Number(r.headers.get('Retry-After')) || (r.status === 429 ? 10 : 2);
        if (i < tries - 1) { await sleep(Math.min(ra, 20) * 1000); continue; }
      }
      break;                              // 키 없음·AI 꺼짐 같은 오류는 다시 보내도 같음
    }
  }
  throw new Error(last);
}

export async function ping(teacher) {
  try {
    const r = await fetch(`${ENDPOINT}?action=ping&teacher=${encodeURIComponent(teacher)}`);
    const d = await r.json();
    return { ok: !!d.ok, reason: why(d.reason || '') };
  } catch (e) { return { ok: false, reason: 'AI 중계 함수에 연결하지 못했어요(배포 주소에서 열었는지 확인해 주세요).' }; }
}

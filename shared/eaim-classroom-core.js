/* ══════════════════════════════════════════════════════════
   EAIM Classroom Core  v1.0 (2026-09-25)
   - 기준본: 사회·역사 저장소(eaim-social-history). 고칠 때는 기준본을 먼저
     고치고 버전을 올린 뒤, 다른 저장소의 사본을 같은 버전으로 맞춥니다.
     (다른 저장소는 shared/eaim-classroom-core.js 로 복사하고, 같은 폴더에
      qrcode-generator.js 도 함께 복사합니다.)
   - 기존 eaim-classroom Firebase 프로젝트를 그대로 재사용합니다.
   - 공통규칙이 목표로 하는 교실 구조:
       teachers/{uid}/rooms/{roomId}
       roomCodes/{code} → {teacherUid, roomId}   (학생 공개 조회용)
       teachers/{uid}/rooms/{roomId}/students/{studentId}
       teachers/{uid}/rooms/{roomId}/submissions/{subId}
   - 사회·역사에서는 허브와 4개 앱(역사신문/사회사전/게임방/세계탐구)이
     <script type="module" src="eaim-classroom-core.js"> 로 불러옵니다.
   - 변경 기록
     v1.0 (2026-09-25) 버전 표시 시작 / QR을 저장소 안 라이브러리로 화면에서
          그림(외부 QR 서비스 제거) / 모르는 앱이면 역사신문으로 보내지 않고
          오류를 냄, 앱 파일 표를 각 저장소에서 넣을 수 있게 함 / 수업 방에
          교과(platform) 값 저장 / 머리 주석 바로잡음(국어·과학은 아직 이
          모듈을 쓰지 않음)
   ══════════════════════════════════════════════════════════ */

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut,
  signInAnonymously, onAuthStateChanged, setPersistence, browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, setDoc, getDoc, updateDoc, deleteDoc,
  collection, addDoc, query, where, orderBy, getDocs,
  onSnapshot, serverTimestamp, runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import qrcode from "./qrcode-generator.js";

// ⚠️ 기존 eaim-classroom 프로젝트의 값을 그대로 넣으세요 (다른 앱들과 동일한 값)
const firebaseConfig = {
  apiKey: "AIzaSyBalg0f5x0ydfHxn_nzgZ1pAELvJw6PzoY",
  authDomain: "eaim-classroom.firebaseapp.com",
  projectId: "eaim-classroom",
  storageBucket: "eaim-classroom.firebasestorage.app",
  messagingSenderId: "294479576192",
  appId: "1:294479576192:web:c60e994e319dbd2f11ba65",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// ⚠️ 공용 컴퓨터 보호용: 로그인 상태를 "브라우저 세션"에만 저장합니다.
// 새로고침/탭 재열기에는 로그인이 유지되지만, 브라우저를 완전히 종료하면
// 자동으로 로그아웃돼요 (다음 사람이 그대로 이어서 쓰는 걸 방지).
// 이 설정이 끝나기 전에 로그인/입장을 시도하면 실패할 수 있으므로,
// teacherLogin()과 studentEnter()는 아래 Promise가 끝날 때까지 기다립니다.
const persistenceReady = setPersistence(auth, browserSessionPersistence).catch((e) => {
  console.warn('로그인 지속성 설정 실패(기본값으로 동작):', e);
});

/* ── 이 파일을 쓰는 앱의 이름을 각 HTML에서 지정 ──
   예) window.EAIM_APP_TYPE = 'history' | 'dict' | 'game' | 'world'; */
const APP_TYPE = () => window.EAIM_APP_TYPE || 'unknown';

/* ── 이 저장소의 교과 이름 (공통규칙 10-1: 수업 방에 교과와 앱을 적는다) ──
   다른 저장소에서 쓸 때는 HTML에서 모듈보다 먼저 지정합니다.
   예) <script>window.EAIM_PLATFORM = 'science';</script> */
const PLATFORM = () => window.EAIM_PLATFORM || 'social-history';

/* ════════ 교사 인증 ════════ */
export async function teacherLogin() {
  await persistenceReady;
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' }); // 자동 로그인 대신 매번 계정 선택 창을 띄움
  try {
    return await signInWithPopup(auth, provider);
  } catch (e) {
    // ⚠️ 학교 보안 프로그램 등으로 팝업이 조용히 막히는 환경(auth/popup-blocked)에서는
    // 팝업 대신 리디렉션 방식(같은 페이지에서 구글 로그인 페이지로 이동했다가 돌아옴)으로 자동 전환.
    if (e?.code === 'auth/popup-blocked') {
      return signInWithRedirect(auth, provider);
    }
    throw e;
  }
}
// 리디렉션으로 돌아왔을 때 로그인 결과를 확인(에러가 있으면 콘솔에 기록만 하고 넘어감)
getRedirectResult(auth).catch((e) => {
  console.warn('리디렉션 로그인 처리 중 오류(무시 가능):', e);
});
export function teacherLogout() {
  return signOut(auth);
}
export function onTeacherAuthChange(cb) {
  return onAuthStateChanged(auth, cb);
}

/* ════════ 학생 익명 입장 ════════ */
export async function studentEnter() {
  await persistenceReady;
  if (!auth.currentUser) await signInAnonymously(auth);
  return auth.currentUser;
}

/* ════════ 방(수업) 코드 생성 ════════ */
function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 헷갈리는 문자 제외
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

/**
 * 교사: 새 수업방 생성
 * mode: 'class' (반 전체) | 'group' (모둠별, groupSize 필요) | 'individual' (개인별)
 * classes: [{name:'1반', count:24}, ...]  — 반 일괄 생성 시
 */
export async function createRoom({ title, mode, classes = [], groupSize = 4 }) {
  const uid = auth.currentUser.uid;
  const roomsCol = collection(db, `teachers/${uid}/rooms`);
  const roomRef = await addDoc(roomsCol, {
    platform: PLATFORM(),
    app: APP_TYPE(),
    title, mode, classes, groupSize,
    isOpen: true,
    createdAt: serverTimestamp(),
  });

  // 코드 충돌 방지 트랜잭션
  let code = genCode();
  const codeRef0 = doc(db, 'roomCodes', code);
  await runTransaction(db, async (tx) => {
    let ref = codeRef0, snap = await tx.get(ref), tries = 0;
    while (snap.exists() && tries < 5) {
      code = genCode();
      ref = doc(db, 'roomCodes', code);
      snap = await tx.get(ref);
      tries++;
    }
    tx.set(ref, { teacherUid: uid, roomId: roomRef.id, app: APP_TYPE() });
  });

  await updateDoc(roomRef, { code });
  return { roomId: roomRef.id, code };
}

export async function toggleRoomOpen(roomId, isOpen) {
  const uid = auth.currentUser.uid;
  await updateDoc(doc(db, `teachers/${uid}/rooms/${roomId}`), { isOpen });
}

export async function listMyRooms() {
  const uid = auth.currentUser.uid;
  const q = query(collection(db, `teachers/${uid}/rooms`), where('app', '==', APP_TYPE()));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/* ════════ 학생: 코드로 방 찾기 (URL의 ?code=XXXXXX 로 들어옴) ════════ */
export async function resolveRoomByCode(code) {
  const snap = await getDoc(doc(db, 'roomCodes', code.toUpperCase()));
  if (!snap.exists()) return null;
  const { teacherUid, roomId } = snap.data();
  const roomSnap = await getDoc(doc(db, `teachers/${teacherUid}/rooms/${roomId}`));
  if (!roomSnap.exists() || !roomSnap.data().isOpen) return null;
  return { teacherUid, roomId, ...roomSnap.data() };
}

/**
 * 학생 입장 기록 (번호 입력 → 모둠은 인원수 기준 자동 계산)
 */
export async function joinRoom({ teacherUid, roomId, className, number, name }) {
  await studentEnter();
  const room = (await getDoc(doc(db, `teachers/${teacherUid}/rooms/${roomId}`))).data();
  let group = null;
  if (room.mode === 'group' && room.groupSize) {
    group = Math.ceil(Number(number) / room.groupSize);
  }
  const studentId = auth.currentUser.uid;
  await setDoc(doc(db, `teachers/${teacherUid}/rooms/${roomId}/students/${studentId}`), {
    className: className || null, number: number || null, group,
    name: name || null, joinedAt: serverTimestamp(),
  }, { merge: true });
  return { studentId, group };
}

/* ════════ 학생 결과물 저장 (세특 생성 원료) ════════ */
export async function saveSubmission({ teacherUid, roomId, studentMeta, kind, title, content }) {
  const studentId = auth.currentUser?.uid;
  if (!studentId) return;
  await addDoc(collection(db, `teachers/${teacherUid}/rooms/${roomId}/submissions`), {
    studentId, ...studentMeta,
    app: APP_TYPE(), kind, title, content,
    createdAt: serverTimestamp(),
  });
}

/* ════════ 교사: 방의 모든 결과물 가져오기 (세특/시트 내보내기용) ════════ */
export async function listSubmissions(roomId) {
  const uid = auth.currentUser.uid;
  const q = query(
    collection(db, `teachers/${uid}/rooms/${roomId}/submissions`),
    orderBy('createdAt', 'asc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/* ════════ 게임 결과 저장/조회 (세특용 submissions와는 별도 컬렉션) ════════
   ⚠️ 의도적으로 saveSubmission()과 분리했습니다.
   listSubmissions()가 읽는 `submissions` 컬렉션에는 절대 쓰지 않으므로,
   세특 생성 화면(genSaenteuk)에는 게임 결과가 절대 나타나지 않습니다.
   교사가 "몇 점인지 / 뭘 틀렸는지"만 확인하는 용도로만 씁니다.       */
export async function saveGameResult({ teacherUid, roomId, studentMeta, game, score, correct, total, wrongLog = [] }) {
  const studentId = auth.currentUser?.uid;
  if (!studentId) return;
  await addDoc(collection(db, `teachers/${teacherUid}/rooms/${roomId}/gameResults`), {
    studentId, ...studentMeta,
    game, score, correct, total, wrongLog,
    createdAt: serverTimestamp(),
  });
}

export async function listGameResults(roomId) {
  const uid = auth.currentUser.uid;
  const q = query(
    collection(db, `teachers/${uid}/rooms/${roomId}/gameResults`),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/* ════════ 실시간 퀴즈 (카훗 스타일) ════════
   ⚠️ 경로를 얕게 유지합니다 — teachers/{uid}/rooms/{roomId}/{subcollection}/{docId}
   (딱 2단계)까지만 기존 Firestore 규칙의 "if true" 와일드카드가 적용되기 때문에,
   liveQuiz/current/answers 처럼 더 깊이 중첩하면 규칙을 추가로 안 걸어준 한
   막힙니다. 그래서 답안은 별도 규칙 없이도 통과하도록 liveQuizAnswers를
   rooms/{roomId} 바로 아래 평평한 컬렉션으로 둡니다.

   teachers/{uid}/rooms/{roomId}/liveQuiz/current
     { questions, currentIndex:-1, status:'lobby'|'question'|'reveal'|'ended',
       sessionId, questionStartedAt }
   teachers/{uid}/rooms/{roomId}/liveQuizAnswers/{sessionId}_{studentId}_{qIndex}
     { sessionId, studentId, ...studentMeta, qIndex, choiceIndex, correct, msTaken, points }
   (sessionId를 넣는 이유: 같은 방에서 퀴즈를 다시 만들어도 지난 회차 답안이
    새 순위에 안 섞이도록 하기 위함)                                        */

export async function createLiveQuiz({ teacherUid, roomId, questions }) {
  const sessionId = String(Date.now());
  const ref = doc(db, `teachers/${teacherUid}/rooms/${roomId}/liveQuiz/current`);
  await setDoc(ref, {
    questions, currentIndex: -1, status: 'lobby', sessionId,
    questionStartedAt: null, createdAt: serverTimestamp(),
  });
  return { ref, sessionId };
}

export function listenLiveQuiz(teacherUid, roomId, cb) {
  const ref = doc(db, `teachers/${teacherUid}/rooms/${roomId}/liveQuiz/current`);
  return onSnapshot(ref, (snap) => cb(snap.exists() ? snap.data() : null));
}

export async function advanceLiveQuiz(teacherUid, roomId, index) {
  const ref = doc(db, `teachers/${teacherUid}/rooms/${roomId}/liveQuiz/current`);
  await updateDoc(ref, { currentIndex: index, status: 'question', questionStartedAt: serverTimestamp() });
}

export async function revealLiveQuiz(teacherUid, roomId) {
  const ref = doc(db, `teachers/${teacherUid}/rooms/${roomId}/liveQuiz/current`);
  await updateDoc(ref, { status: 'reveal' });
}

export async function endLiveQuiz(teacherUid, roomId) {
  const ref = doc(db, `teachers/${teacherUid}/rooms/${roomId}/liveQuiz/current`);
  await updateDoc(ref, { status: 'ended' });
}

/** 학생이 답을 제출. 문항당 한 번만 기록되도록 결정론적 문서ID 사용(재제출 방지는 클라이언트에서 버튼 비활성화로 처리). */
export async function submitLiveAnswer({ teacherUid, roomId, sessionId, qIndex, choiceIndex, correct, msTaken, studentMeta }) {
  const studentId = auth.currentUser?.uid;
  if (!studentId) return;
  const points = correct ? Math.max(50, 1000 - Math.round(msTaken / 20)) : 0; // 빠를수록 높은 점수(카훗 방식)
  const ansRef = doc(db, `teachers/${teacherUid}/rooms/${roomId}/liveQuizAnswers/${sessionId}_${studentId}_${qIndex}`);
  await setDoc(ansRef, {
    sessionId, studentId, ...studentMeta, qIndex, choiceIndex, correct, msTaken, points,
    createdAt: serverTimestamp(),
  });
  return points;
}

/** 특정 문항의 실시간 응답 스트림 (호스트가 응답 수/정답률 표시할 때) */
export function listenLiveAnswers(teacherUid, roomId, sessionId, qIndex, cb) {
  const q = query(
    collection(db, `teachers/${teacherUid}/rooms/${roomId}/liveQuizAnswers`),
    where('sessionId', '==', sessionId), where('qIndex', '==', qIndex)
  );
  return onSnapshot(q, (snap) => cb(snap.docs.map(d => d.data())));
}

/** 전체 문항 누적 순위 (한 번 읽기 — 최종 순위 화면용) */
export async function getLiveLeaderboard(teacherUid, roomId, sessionId) {
  const q = query(
    collection(db, `teachers/${teacherUid}/rooms/${roomId}/liveQuizAnswers`),
    where('sessionId', '==', sessionId)
  );
  const snap = await getDocs(q);
  const byStudent = {};
  snap.docs.forEach(d => {
    const a = d.data();
    const key = a.studentId;
    if (!byStudent[key]) byStudent[key] = { studentId: key, className: a.className, number: a.number, totalPoints: 0, correct: 0, total: 0 };
    byStudent[key].totalPoints += a.points || 0;
    byStudent[key].total += 1;
    if (a.correct) byStudent[key].correct += 1;
  });
  return Object.values(byStudent).sort((a, b) => b.totalPoints - a.totalPoints);
}

/* ════════ QR 코드 (저장소 안 라이브러리로 화면에서 그림) ════════
   ⚠️ 외부 QR 서비스를 쓰지 않습니다(공통규칙 3번): 배포 환경에서 막힐 수 있고,
   수업 코드가 든 주소가 외부로 전송되기 때문입니다.
   이름은 예전과 같지만, 이제 인터넷 주소 대신 그림 자체(data: 주소)를 돌려줍니다.
   그래서 <img src="${qrImageUrl(link)}"> 처럼 쓰던 코드는 그대로 동작합니다. */
export function qrImageUrl(link, size = 260) {
  const qr = qrcode(0, 'M');          // 0 = 주소 길이에 맞춰 크기 자동
  qr.addData(link);
  qr.make();
  const count = qr.getModuleCount();
  const margin = 4;                    // QR 표준의 흰 테두리(칸 4개)
  const cell = Math.max(2, Math.floor(size / (count + margin * 2)));
  const svg = qr.createSvgTag({ cellSize: cell, margin: cell * margin, scalable: false });
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

/** 방이 속한 앱(app)에 맞는 실제 파일로 학생 입장 링크를 만듭니다.
 *  ⚠️ 'student.html' 같은 공용 페이지는 존재하지 않으므로, 반드시 app별 실제 파일명으로 매핑합니다.
 *  다른 저장소에서 쓸 때는 HTML에서 앱 파일 표를 넣습니다.
 *  예) <script>window.EAIM_APP_FILES = { space: 'space.html' };</script>
 *  표에 없는 앱이면 엉뚱한 앱으로 보내지 않고 오류를 냅니다. */
const APP_FILE = {
  history: 'eaim-history-news.html',
  dict: 'eaim-social-dict.html',
  world: 'eaim-world-explorer.html',
  game: 'eaim-social-game.html',
};
export function studentLink(code, app, baseUrl = location.origin + location.pathname.replace(/[^/]+$/, '')) {
  const files = { ...APP_FILE, ...(window.EAIM_APP_FILES || {}) };
  const file = files[app];
  if (!file) {
    throw new Error(`"${app}" 앱의 학생 입장 파일을 찾을 수 없어요. 앱 파일 표(EAIM_APP_FILES)에 추가해 주세요.`);
  }
  return `${baseUrl}${file}?code=${code}`;
}

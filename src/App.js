import React, { useState, useEffect } from 'react';
import { PiggyBank, Wallet, History, RotateCcw, PlusCircle, Zap, Edit2, ArrowRight, Lock, AlertCircle, CheckCircle2, LogOut, LogIn } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, deleteDoc, doc, updateDoc } from 'firebase/firestore';

// ★[중요] 여기에 1단계에서 복사해둔 진짜 firebaseConfig를 덮어쓰세요! ★
const firebaseConfig = {
  apiKey: "AIzaSyAx5yJq-JKDhpqV3Wrwbyszwz1ELUOSpas",
  authDomain: "sihwan-wallet.firebaseapp.com",
  projectId: "sihwan-wallet",
  storageBucket: "sihwan-wallet.firebasestorage.app",
  messagingSenderId: "873921925538",
  appId: "1:873921925538:web:90aa829d6c49abc95ea2fb",
  measurementId: "G-MR0QRB4TY1"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = 'sihwan-wallet';

// ★ 허용된 이메일 목록 (알려주신 4개 계정)
const ALLOWED_EMAILS =[
  'your4leaf@gmail.com',
  'rego.readytogo@gmail.com',
  'minijam89@gmail.com',
  'rlight1843@gmail.com'
];

const BASE_DATE = new Date('2026-03-15');
const getWeekDate = (week) => {
  const d = new Date(BASE_DATE);
  d.setDate(d.getDate() + (week - 1) * 7);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

// 연속 저금 주수 계산 (historyAsc: 오름차순 정렬된 배열, upToIndex: 포함할 마지막 인덱스)
const getConsecutiveSavingCount = (historyAsc, upToIndex) => {
  let count = 0;
  for (let i = upToIndex; i >= 0; i--) {
    if (historyAsc[i].saving > 0) {
      count++;
    } else {
      break;
    }
  }
  return count;
};

// 보너스 여부 판단: 연속 저금 수가 3의 배수이고 saving > 0
const shouldApplyBonus = (consecutiveCount) => {
  return consecutiveCount > 0 && consecutiveCount % 3 === 0;
};

// 히스토리 테이블용 streak 그룹 정보 계산
// 반환: { [recordId]: { position: 1|2|3 (0=연속아님), consecutive: N } }
const computeStreakInfo = (historyAsc) => {
  const result = {};
  let consecutive = 0;
  historyAsc.forEach((record) => {
    if ((record.saving || 0) > 0) {
      consecutive++;
      const position = ((consecutive - 1) % 3) + 1; // 1, 2, 3 반복
      result[record.id] = { position, consecutive };
    } else {
      consecutive = 0;
      result[record.id] = { position: 0, consecutive: 0 };
    }
  });
  return result;
};

export default function App() {
  const ALLOWANCE_BASE = 10000;
  
  const [user, setUser] = useState(null);
  const[authError, setAuthError] = useState('');
  const [spentInput, setSpentInput] = useState('');
  const[history, setHistory] = useState([]);
  const [isInitializing, setIsInitializing] = useState(true);

  const [alertData, setAlertData] = useState(null);
  const[confirmData, setConfirmData] = useState(null);
  const [editState, setEditState] = useState(null);
  const [celebrationData, setCelebrationData] = useState(null);

  // 축하/아쉬움 오버레이 자동 닫힘 (조건부 return 전에 위치해야 함 - Rules of Hooks)
  useEffect(() => {
    if (!celebrationData) return;
    const timeout = celebrationData.type === 'bonus' ? 4500 : 3500;
    const timer = setTimeout(() => setCelebrationData(null), timeout);
    return () => clearTimeout(timer);
  }, [celebrationData]);

  // 구글 로그인 처리 및 이메일 검사
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        if (ALLOWED_EMAILS.includes(currentUser.email)) {
          setUser(currentUser);
          setAuthError('');
        } else {
          await signOut(auth);
          setUser(null);
          setAuthError('접근 권한이 없는 계정입니다.\n가족 구글 계정으로 다시 로그인해주세요.');
        }
      } else {
        setUser(null);
      }
      setIsInitializing(false);
    });
    return () => unsubscribe();
  },[]);

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("로그인 에러:", error);
      setAuthError('로그인 창을 닫았거나 오류가 발생했습니다.');
    }
  };

  const handleLogout = async () => {
    if(window.confirm("로그아웃 하시겠습니까?")) {
      await signOut(auth);
    }
  };

  // DB에서 용돈 기록 가져오기
  useEffect(() => {
    if (!user) return;
    const historyRef = collection(db, 'artifacts', appId, 'users', 'family_data', 'allowance_history');
    
    const unsubscribe = onSnapshot(historyRef, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      data.sort((a, b) => b.week - a.week);
      setHistory(data);
    });
    return () => unsubscribe();
  }, [user]);

  // --- 핵심 계산 로직 ---
  const latestRecord = history.length > 0 ? history[0] : null;
  const currentWeek = latestRecord ? latestRecord.week + 1 : 1;
  const totalSavings = history.reduce((sum, record) => sum + record.saving, 0);
  const carryOverFromLastWeek = latestRecord ? latestRecord.halfRemaining : 0;
  const currentAvailableMoney = ALLOWANCE_BASE + carryOverFromLastWeek;

  const handleSettlement = async () => {
    if (!user) return;
    const spent = parseInt(spentInput);
    
    if (isNaN(spent) || spent < 0 || spent > currentAvailableMoney) {
      setAlertData(`이번 주 예산은 ${currentAvailableMoney.toLocaleString()}원입니다.\n0원에서 ${currentAvailableMoney.toLocaleString()}원 사이로 입력해주세요.`);
      return;
    }

    const remaining = currentAvailableMoney - spent;
    const exactHalf = remaining / 2;
    const roundedCarryOver = Math.ceil(exactHalf / 100) * 100;
    let saving = exactHalf * 2;
    const nextWeekAvailable = ALLOWANCE_BASE + roundedCarryOver;

    // 연속 저금 보너스 계산
    const historyAsc = [...history].sort((a, b) => a.week - b.week);
    let consecutiveCount = saving > 0 ? 1 : 0; // 현재 주차 포함
    if (saving > 0) {
      for (let i = historyAsc.length - 1; i >= 0; i--) {
        if (historyAsc[i].saving > 0) consecutiveCount++;
        else break;
      }
    }
    const bonus = shouldApplyBonus(consecutiveCount) ? saving : 0;
    saving = saving + bonus;

    try {
      const historyRef = collection(db, 'artifacts', appId, 'users', 'family_data', 'allowance_history');
      await addDoc(historyRef, {
        week: currentWeek,
        availableMoney: currentAvailableMoney,
        spent: spent,
        remaining: remaining,
        halfRemaining: roundedCarryOver,
        saving: saving,
        bonus: bonus,
        nextWeekAvailable: nextWeekAvailable,
        createdAt: new Date().toISOString(),
        createdBy: user.email // 누가 기록했는지 이메일 저장
      });
      setSpentInput('');
      if (bonus > 0) {
        setCelebrationData({ type: 'bonus', bonus, saving, streakCount: consecutiveCount });
      } else if (saving === 0) {
        setCelebrationData({ type: 'broke' });
      }
    } catch (error) {
      setAlertData("정산 기록을 저장하는 중 오류가 발생했습니다.");
    }
  };

  const handleReset = () => {
    setConfirmData({
      message: "모든 정산 기록을 영구적으로 삭제하시겠습니까?\n(이 작업은 되돌릴 수 없습니다!)",
      onConfirm: async () => {
        if (!user) return;
        try {
          for (const record of history) {
            await deleteDoc(doc(db, 'artifacts', appId, 'users', 'family_data', 'allowance_history', record.id));
          }
        } catch (error) {
          setAlertData("초기화 중 오류가 발생했습니다.");
        }
        setConfirmData(null);
      }
    });
  };

  const handleEditClick = (record) => {
    setEditState({
      record: record,
      step: 'auth',
      passwordInput: '',
      spentInput: record.spent.toString(),
      error: ''
    });
  };

  const handlePasswordSubmit = () => {
    if (editState.passwordInput === '262303') {
      setEditState({ ...editState, step: 'edit', error: '' });
    } else {
      setEditState({ ...editState, error: '비밀번호가 일치하지 않습니다.' });
    }
  };

  const executeEdit = async () => {
    const newSpent = parseInt(editState.spentInput);
    const targetRecord = editState.record;

    if (isNaN(newSpent) || newSpent < 0) {
      setEditState({ ...editState, error: '올바른 금액을 입력해주세요.' });
      return;
    }
    if (newSpent > targetRecord.availableMoney) {
      setEditState({ ...editState, error: `총 예산(${targetRecord.availableMoney.toLocaleString()}원)보다 많이 쓸 수 없습니다.` });
      return;
    }

    try {
      const historyAsc = [...history].sort((a, b) => a.week - b.week);
      const startIndex = historyAsc.findIndex(r => r.id === targetRecord.id);
      let currentAvailable = targetRecord.availableMoney;

      for (let i = startIndex; i < historyAsc.length; i++) {
        const rec = historyAsc[i];
        let spentToUse = (i === startIndex) ? newSpent : rec.spent;
        if (spentToUse > currentAvailable) spentToUse = currentAvailable;

        const remaining = currentAvailable - spentToUse;
        const exactHalf = remaining / 2;
        const roundedCarryOver = Math.ceil(exactHalf / 100) * 100;
        let saving = exactHalf * 2;
        const nextWeekAvailable = ALLOWANCE_BASE + roundedCarryOver;

        // 연속 저금 보너스 재계산 (이전 주차들의 saving을 이미 업데이트한 상태 기준)
        const consecutiveCount = saving > 0 ? getConsecutiveSavingCount(historyAsc, i) : 0;
        const bonus = shouldApplyBonus(consecutiveCount) ? saving : 0;
        saving = saving + bonus;

        await updateDoc(doc(db, 'artifacts', appId, 'users', 'family_data', 'allowance_history', rec.id), {
          availableMoney: currentAvailable,
          spent: spentToUse,
          remaining: remaining,
          halfRemaining: roundedCarryOver,
          saving: saving,
          bonus: bonus,
          nextWeekAvailable: nextWeekAvailable
        });

        // 로컬 배열도 업데이트 (이후 주차의 연속 계산에 필요)
        historyAsc[i] = { ...historyAsc[i], saving, bonus, spent: spentToUse };
        currentAvailable = nextWeekAvailable;
      }
      setEditState(null); 
    } catch (error) {
      setEditState({ ...editState, error: '수정 중 오류가 발생했습니다.' });
    }
  };

  // 현재 연속 저금 streak 계산 (history는 내림차순)
  const historyAscForStreak = [...history].sort((a, b) => a.week - b.week);
  // 히스토리 테이블용 streak 그룹 정보
  const streakInfo = computeStreakInfo(historyAscForStreak);
  let currentStreak = 0;
  for (let i = historyAscForStreak.length - 1; i >= 0; i--) {
    if (historyAscForStreak[i].saving > 0) currentStreak++;
    else break;
  }

  const inputSpent = parseInt(spentInput);
  const isValidInput = !isNaN(inputSpent) && inputSpent >= 0 && inputSpent <= currentAvailableMoney;
  let visRemaining = 0, visExactHalf = 0, visRoundedCarryOver = 0, visSaving = 0, visBonus = 0;
  let visNextStreak = currentStreak;
  if (isValidInput) {
    visRemaining = currentAvailableMoney - inputSpent;
    visExactHalf = visRemaining / 2;
    visRoundedCarryOver = Math.ceil(visExactHalf / 100) * 100;
    visSaving = visExactHalf * 2;

    // 프리뷰 보너스 계산
    visNextStreak = visSaving > 0 ? currentStreak + 1 : 0;
    if (shouldApplyBonus(visNextStreak) && visSaving > 0) {
      visBonus = visSaving;
      visSaving = visSaving + visBonus;
    }
  }

  // --- 로그인 화면 ---
  if (isInitializing) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center font-bold text-slate-500 text-xl">마법 지갑 로딩 중... 🚀</div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-md text-center">
          <div className="inline-block mb-6">
            <img src={`${process.env.PUBLIC_URL}/IMG_1756_nobg.PNG`} alt="캐릭터" className="w-36 h-36 rounded-full object-cover shadow-lg" style={{objectPosition: '85% center'}} />
          </div>
          <h1 className="text-2xl font-black text-slate-800 mb-2">시환이의 용돈 매니저</h1>
          <p className="text-slate-500 mb-8">가족 계정으로 로그인해주세요 👨‍👩‍👦</p>
          
          {authError && (
            <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm font-bold mb-6 whitespace-pre-line">
              {authError}
            </div>
          )}

          <button onClick={handleLogin} className="w-full flex items-center justify-center space-x-2 bg-white border-2 border-slate-200 hover:bg-slate-50 text-slate-700 font-bold py-4 rounded-xl transition-all">
            <svg className="w-6 h-6" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            <span>Google로 시작하기</span>
          </button>
        </div>
      </div>
    );
  }

  // --- 메인 화면 ---
  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans pb-20">
      
      {/* 축하/아쉬움 애니메이션 오버레이 */}
      {celebrationData && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm anim-fade-in cursor-pointer"
          style={{ background: celebrationData.type === 'bonus' ? 'rgba(0,0,0,0.75)' : 'rgba(0,0,0,0.55)' }}
          onClick={() => setCelebrationData(null)}
        >
          {celebrationData.type === 'bonus' && (
            <div className="relative flex flex-col items-center text-center">
              {/* 파티클 */}
              {['🎉','🌟','💫','✨','🎊','⭐','🌟','💫','🎉'].map((emoji, i) => (
                <span
                  key={i}
                  className="absolute text-2xl anim-float-up pointer-events-none select-none"
                  style={{
                    left: `${-120 + i * 30}px`,
                    bottom: '60px',
                    animationDelay: `${i * 0.12}s`,
                    animationDuration: `${1.2 + (i % 3) * 0.3}s`,
                  }}
                >{emoji}</span>
              ))}
              {/* 카드 */}
              <div className="anim-pop-in bg-white rounded-3xl px-10 py-10 shadow-2xl max-w-sm w-full flex flex-col items-center">
                <div className="text-6xl mb-3">🎉</div>
                <h2 className="text-2xl font-black text-slate-800 mb-1">
                  🔥 {celebrationData.streakCount}주 연속 저금 달성!
                </h2>
                <p className="text-slate-500 text-sm mb-6">3주 연속 성공으로 저금통 ×2 보너스 발동!</p>
                <div className="bg-orange-50 rounded-2xl px-8 py-5 w-full text-center anim-pulse-glow">
                  <p className="text-sm text-orange-500 font-bold mb-1">저금통에 추가된 금액</p>
                  <p className="text-4xl font-black text-orange-600">+{celebrationData.saving.toLocaleString()}원</p>
                  <p className="text-xs text-orange-400 mt-1">보너스 {celebrationData.bonus.toLocaleString()}원 포함 🐷</p>
                </div>
                <p className="text-xs text-slate-400 mt-5">화면을 탭하면 닫힙니다</p>
              </div>
            </div>
          )}

          {celebrationData.type === 'broke' && (
            <div className="relative flex flex-col items-center text-center">
              {/* 코인 떨어지기 파티클 */}
              {['💸','💸','💸','💸','💸'].map((emoji, i) => (
                <span
                  key={i}
                  className="absolute text-2xl anim-coin-fall pointer-events-none select-none"
                  style={{
                    left: `${-80 + i * 40}px`,
                    top: '-10px',
                    animationDelay: `${i * 0.18}s`,
                    animationDuration: `${1 + (i % 2) * 0.3}s`,
                  }}
                >{emoji}</span>
              ))}
              {/* 카드 */}
              <div className="anim-droop-in bg-white rounded-3xl px-10 py-10 shadow-2xl max-w-sm w-full flex flex-col items-center">
                <div className="text-6xl mb-3">😢</div>
                <h2 className="text-2xl font-black text-slate-700 mb-2">이번 주는 아쉽지만...</h2>
                <p className="text-slate-400 text-sm mb-6">용돈을 모두 사용했어요. 연속 저금이 초기화됩니다.</p>
                <div
                  className="bg-blue-50 rounded-2xl px-8 py-5 w-full text-center anim-slide-up"
                  style={{ animationDelay: '1.2s', opacity: 0, animationFillMode: 'forwards' }}
                >
                  <p className="text-2xl font-black text-blue-600">다음 주에 다시 도전! 💪</p>
                  <p className="text-sm text-blue-400 mt-1">조금만 남겨도 연속 저금 시작!</p>
                </div>
                <p className="text-xs text-slate-400 mt-5">화면을 탭하면 닫힙니다</p>
              </div>
            </div>
          )}
        </div>
      )}

      {alertData && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl flex flex-col items-center text-center">
            <AlertCircle size={48} className="text-amber-500 mb-4" />
            <p className="text-slate-800 font-medium whitespace-pre-line mb-6">{alertData}</p>
            <button onClick={() => setAlertData(null)} className="bg-slate-800 text-white px-6 py-2 rounded-xl font-bold w-full hover:bg-slate-900 transition-colors">확인</button>
          </div>
        </div>
      )}

      {confirmData && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl flex flex-col items-center text-center">
            <AlertCircle size={48} className="text-red-500 mb-4" />
            <p className="text-slate-800 font-medium whitespace-pre-line mb-6">{confirmData.message}</p>
            <div className="flex gap-3 w-full">
              <button onClick={() => setConfirmData(null)} className="flex-1 bg-slate-100 text-slate-700 px-4 py-3 rounded-xl font-bold hover:bg-slate-200 transition-colors">취소</button>
              <button onClick={confirmData.onConfirm} className="flex-1 bg-red-500 text-white px-4 py-3 rounded-xl font-bold hover:bg-red-600 transition-colors">초기화</button>
            </div>
          </div>
        </div>
      )}

      {editState && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-6 md:p-8 w-full max-w-md shadow-2xl relative">
            <button onClick={() => setEditState(null)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 font-bold p-2">✕</button>
            
            {editState.step === 'auth' ? (
              <div className="flex flex-col items-center text-center">
                <div className="bg-blue-100 p-4 rounded-full mb-4"><Lock size={32} className="text-blue-600" /></div>
                <h3 className="text-xl font-black text-slate-800 mb-2">부모님 인증 필요</h3>
                <p className="text-sm text-slate-500 mb-6">기록을 수정하려면 관리자 비밀번호를 입력해주세요.</p>
                <input 
                  type="password" 
                  value={editState.passwordInput}
                  onChange={(e) => setEditState({...editState, passwordInput: e.target.value, error: ''})}
                  placeholder="비밀번호 6자리"
                  maxLength={6}
                  className="w-full text-center text-2xl tracking-widest font-bold text-slate-800 bg-slate-50 border-2 border-slate-200 rounded-xl py-3 px-6 mb-2 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                  onKeyDown={(e) => e.key === 'Enter' && handlePasswordSubmit()}
                />
                {editState.error && <p className="text-red-500 text-sm font-bold w-full text-center mb-4">{editState.error}</p>}
                <button onClick={handlePasswordSubmit} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl mt-4 transition-colors">인증하기</button>
              </div>
            ) : (
              <div className="flex flex-col items-center text-center">
                <div className="bg-emerald-100 p-4 rounded-full mb-4"><Edit2 size={32} className="text-emerald-600" /></div>
                <h3 className="text-xl font-black text-slate-800 mb-1">{editState.record.week}주차 기록 수정</h3>
                <p className="text-sm text-slate-500 mb-6 bg-slate-50 px-3 py-2 rounded-lg border border-slate-100">
                  해당 주차 예산: <strong>{editState.record.availableMoney.toLocaleString()}원</strong>
                </p>
                
                <div className="w-full text-left mb-2">
                  <label className="text-xs font-bold text-slate-500 ml-1">사용한 돈 변경 (원)</label>
                  <input 
                    type="number" 
                    value={editState.spentInput}
                    onChange={(e) => setEditState({...editState, spentInput: e.target.value, error: ''})}
                    className="w-full text-center text-3xl font-bold text-slate-800 bg-slate-50 border-2 border-slate-200 rounded-xl py-4 px-6 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition-all"
                    onKeyDown={(e) => e.key === 'Enter' && executeEdit()}
                  />
                </div>
                {editState.error && <p className="text-red-500 text-sm font-bold w-full text-center mb-2">{editState.error}</p>}
                <p className="text-xs text-amber-600 font-bold bg-amber-50 p-2 rounded w-full mt-2 mb-4">
                  ⚠️ 주의: 연쇄 업데이트가 작동하여 이후 주차들의 이월금과 1년 저금통 금액이 자동으로 다시 계산됩니다.
                </p>
                <button onClick={executeEdit} className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 rounded-xl transition-colors text-lg flex justify-center items-center gap-2">
                  <CheckCircle2 size={20} /> 수정 완료
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="max-w-5xl mx-auto space-y-6">
        
        {/* Header - 로그아웃 버튼 추가 */}
        <header className="flex flex-col sm:flex-row items-center justify-between bg-white p-6 rounded-2xl shadow-sm border border-slate-100 gap-4">
          <div className="flex items-center space-x-4 w-full sm:w-auto">
            <div className="p-3 bg-blue-100 text-blue-600 rounded-xl"><Wallet size={32} /></div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">👑 시환이의 용돈 매니저</h1>
              <p className="text-slate-500">
                마법처럼 예산이 불어나는 {currentWeek}주차 도전!
                {currentStreak > 0 && <span className="ml-2 inline-flex items-center bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full text-xs font-bold">🔥 {currentStreak}주 연속 저금!</span>}
              </p>
            </div>
          </div>
          <div className="flex gap-2 w-full sm:w-auto justify-end">
            <button onClick={handleLogout} className="flex items-center space-x-2 text-slate-500 hover:text-slate-800 transition-colors text-sm font-medium bg-slate-100 px-3 py-2 rounded-lg">
              <LogOut size={16} /> <span className="hidden sm:inline">로그아웃</span>
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-gradient-to-br from-emerald-400 to-teal-500 p-6 md:p-8 rounded-2xl shadow-md text-white flex flex-col justify-between transform transition-transform hover:scale-[1.02]">
             <div className="flex justify-between items-start">
              <div>
                <p className="text-emerald-100 font-medium mb-1">이번 주 총 예산 🎒</p>
                <h2 className="text-4xl md:text-5xl font-black drop-shadow-md">{currentAvailableMoney.toLocaleString()}원</h2>
              </div>
              <Wallet size={48} className="text-emerald-100 opacity-90" />
            </div>
            <div className="mt-6 bg-white/20 rounded-xl p-4 flex justify-between items-center text-sm md:text-base font-medium border border-emerald-300/30">
              <div className="flex flex-col"><span className="text-emerald-100">기본 용돈</span><span className="font-bold">10,000원</span></div>
              <div className="text-emerald-200 font-black text-xl">+</div>
              <div className="flex flex-col text-right"><span className="text-emerald-100">지난주 이월금</span><span className="font-bold text-yellow-200">{carryOverFromLastWeek.toLocaleString()}원</span></div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-amber-400 to-orange-500 p-6 md:p-8 rounded-2xl shadow-md text-white flex flex-col justify-between transform transition-transform hover:scale-[1.02]">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-amber-100 font-medium mb-1">1년 뒤 받을 총액 🐷</p>
                <h2 className="text-4xl md:text-5xl font-black drop-shadow-md">{totalSavings.toLocaleString()}원</h2>
              </div>
              <PiggyBank size={48} className="text-amber-100 opacity-90" />
            </div>
            <div className="mt-6 pt-4 border-t border-amber-300/30 text-base text-amber-50 font-bold flex items-center space-x-2">
              <Zap size={20} className="text-yellow-200" /><span>매주 남긴 돈의 절반이 2배씩 뻥튀기!</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-8 text-center relative overflow-hidden">
          <h2 className="text-2xl font-black text-slate-800 mb-2">💰 {currentWeek}주차 정산하기 <span className="text-base font-normal text-slate-400">({getWeekDate(currentWeek)})</span></h2>
          <p className="text-slate-500 mb-6">이번 주 총 예산 <strong>{currentAvailableMoney.toLocaleString()}원</strong> 중 얼마를 사용했나요?</p>
          
          <div className="max-w-md mx-auto flex flex-col sm:flex-row items-center space-y-4 sm:space-y-0 sm:space-x-4">
            <div className="relative w-full">
              <input type="number" value={spentInput} onChange={(e) => setSpentInput(e.target.value)} className="w-full text-center text-3xl font-bold text-slate-800 bg-slate-50 border-2 border-slate-200 rounded-xl py-4 px-6 focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 transition-all" placeholder="0" />
              <span className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-400 font-medium">원</span>
            </div>
            <button onClick={handleSettlement} disabled={spentInput === ''} className="w-full sm:w-auto bg-slate-800 hover:bg-slate-900 disabled:bg-slate-300 text-white font-bold py-4 px-8 rounded-xl transition-colors shadow-lg shadow-slate-200 whitespace-nowrap text-lg">
              마법 발동!
            </button>
          </div>
          
          {isValidInput && (
            <div className="mt-8 pt-8 border-t border-dashed border-slate-200">
              {visSaving > 0 && (
                <div className="mb-4">
                  {visBonus > 0 ? (
                    <div className="inline-block bg-gradient-to-r from-orange-100 to-amber-100 text-orange-700 px-4 py-2 rounded-full font-bold border border-orange-200 shadow-sm animate-pulse">
                      🔥 {visNextStreak}주 연속 저금 달성! 저금통 ×2 보너스 발동!
                    </div>
                  ) : visNextStreak > 0 && visNextStreak % 3 !== 0 ? (
                    <div className="inline-block bg-blue-50 text-blue-600 px-4 py-2 rounded-full font-bold border border-blue-200 shadow-sm">
                      🔥 {visNextStreak}주 연속 저금 중! {3 - (visNextStreak % 3)}주 더 저금하면 ×2 보너스!
                    </div>
                  ) : null}
                </div>
              )}
              <div className="inline-block bg-slate-100 text-slate-600 px-4 py-2 rounded-full font-bold mb-6 border border-slate-200 shadow-sm">
                남은 돈: {visRemaining.toLocaleString()}원의 절반을 나눕니다! <span className="text-emerald-500">(이월금 100원 단위 올림 혜택 🎁)</span> 👇
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-teal-50 border border-teal-200 p-5 rounded-2xl flex flex-col justify-center items-center">
                  <span className="text-teal-600 font-bold mb-2 flex items-center gap-1">🎒 다음 주 내 지갑으로! (절반)</span>
                  {visExactHalf !== visRoundedCarryOver ? (
                     <div className="flex flex-col items-center">
                       <span className="text-sm text-teal-400 line-through mb-1">{visExactHalf.toLocaleString()}원</span>
                       <div className="text-2xl font-black text-teal-700 mb-2 flex items-center gap-2">
                         <span className="text-sm text-teal-500 bg-teal-100 px-2 py-1 rounded">올림!</span>{visRoundedCarryOver.toLocaleString()}원
                       </div>
                     </div>
                  ) : (
                     <div className="text-2xl font-black text-teal-700 mb-2">{visRoundedCarryOver.toLocaleString()}원 이월</div>
                  )}
                  <div className="text-sm text-teal-600/80 bg-teal-100/50 px-3 py-1 rounded-lg">
                    예상 예산: <strong>{(ALLOWANCE_BASE + visRoundedCarryOver).toLocaleString()}원!</strong>
                  </div>
                </div>

                <div className={`${visBonus > 0 ? 'bg-gradient-to-br from-amber-50 to-orange-100 border-orange-300' : 'bg-amber-50 border-amber-200'} border p-5 rounded-2xl flex flex-col justify-center items-center relative overflow-hidden`}>
                  <div className="absolute -right-4 -bottom-4 opacity-10"><Zap size={100} /></div>
                  <span className="text-amber-600 font-bold mb-2 flex items-center gap-1">
                    🐷 1년 저금통으로! (절반의 2배)
                    {visBonus > 0 && <span className="ml-1 bg-orange-500 text-white text-xs px-2 py-0.5 rounded-full font-bold">×2 보너스!</span>}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-lg text-amber-700 line-through decoration-amber-400 decoration-2">{visExactHalf.toLocaleString()}원</span>
                    <ArrowRight className="text-amber-400" size={20} />
                    {visBonus > 0 ? (
                      <div className="flex flex-col items-center">
                        <span className="text-sm text-amber-500 line-through">{(visSaving - visBonus).toLocaleString()}원</span>
                        <span className="text-3xl font-black text-orange-600">+{visSaving.toLocaleString()}원 🔥</span>
                      </div>
                    ) : (
                      <span className="text-3xl font-black text-amber-600">+{visSaving.toLocaleString()}원</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <History className="text-slate-500" size={20} />
              <h3 className="font-bold text-slate-800 text-lg">마법 저축 기록장</h3>
            </div>
            <span className="text-xs bg-blue-100 text-blue-600 px-2 py-1 rounded font-bold flex items-center gap-1">Cloud Sync ☁️</span>
          </div>
          
          {history.length === 0 ? (
            <div className="p-12 text-center text-slate-400 flex flex-col items-center">
              <Zap size={48} className="text-slate-200 mb-4" />
              <p>아직 정산 기록이 없습니다.<br/>마법 발동 버튼을 눌러 첫 기록을 만들어주세요!</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm md:text-base whitespace-nowrap">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4 font-bold">주차</th>
                    <th className="px-6 py-4 font-bold text-right">이번 주 예산</th>
                    <th className="px-6 py-4 font-bold text-right text-red-500">사용한 돈</th>
                    <th className="px-6 py-4 font-bold text-right text-teal-600">이월금(올림)</th>
                    <th className="px-6 py-4 font-bold text-right text-amber-500">저금통(2배)</th>
                    <th className="px-6 py-4 font-bold text-center">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {history.map((record) => {
                    const si = streakInfo[record.id] || { position: 0, consecutive: 0 };
                    const isStreak = si.position > 0;
                    const isBonus = si.position === 3;
                    const streakLabel = isBonus
                      ? <span className="ml-1.5 text-xs font-black text-orange-600">🔥3/3 달성!</span>
                      : si.position === 2
                      ? <span className="ml-1.5 text-xs font-bold text-orange-400">🔥2/3</span>
                      : si.position === 1
                      ? <span className="ml-1.5 text-xs font-medium text-slate-400">🔥1/3</span>
                      : null;

                    return (
                    <tr key={record.id} className={`transition-colors ${isStreak ? 'bg-orange-50/40 hover:bg-orange-50/70 border-l-4 border-orange-300' : 'hover:bg-slate-50'}`}>
                      <td className="px-6 py-4 font-bold text-slate-700">
                        <span className="inline-flex items-center space-x-1 bg-slate-100 text-slate-600 px-2 py-1 rounded">
                          <PlusCircle size={14} /> <span>{record.week}주차</span>
                          <span className="text-xs text-slate-400 font-normal">({getWeekDate(record.week)})</span>
                        </span>
                        {streakLabel}
                      </td>
                      <td className="px-6 py-4 text-right text-slate-700 font-bold">
                        {record.availableMoney ? record.availableMoney.toLocaleString() : ALLOWANCE_BASE.toLocaleString()}원
                      </td>
                      <td className="px-6 py-4 text-right text-red-400 font-medium">-{record.spent.toLocaleString()}원</td>
                      <td className="px-6 py-4 text-right text-teal-600 font-bold bg-teal-50/30">{record.halfRemaining.toLocaleString()}원</td>
                      <td className="px-6 py-4 text-right font-black text-lg bg-amber-50/30">
                        {(record.bonus || 0) > 0 ? (
                          <span className="text-orange-600">
                            +{record.saving.toLocaleString()}
                            <span className="ml-1 text-xs bg-orange-500 text-white px-1.5 py-0.5 rounded-full font-bold align-middle">🔥×2</span>
                          </span>
                        ) : (
                          <span className="text-amber-500">+{record.saving.toLocaleString()}</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button onClick={() => handleEditClick(record)} className="text-slate-400 hover:text-blue-600 transition-colors p-2 rounded-full hover:bg-blue-50">
                          <Edit2 size={18} />
                        </button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

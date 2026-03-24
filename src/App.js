import React, { useState, useEffect } from 'react';
import { PiggyBank, Wallet, History, RotateCcw, PlusCircle, Zap, Edit2, ArrowRight, Lock, AlertCircle, CheckCircle2, LogOut } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, deleteDoc, doc, updateDoc, query, orderBy } from 'firebase/firestore';

// 디자인 마법 주문 (경고는 뜨지만 무시 가능)
if (typeof document !== 'undefined' && !document.getElementById('tailwind-cdn')) {
  const tailwindScript = document.createElement("script");
  tailwindScript.id = 'tailwind-cdn';
  tailwindScript.src = "https://cdn.tailwindcss.com";
  document.head.appendChild(tailwindScript);
}

// 회원님의 진짜 Firebase 설정값입니다.
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

const ALLOWED_EMAILS = [
  'your4leaf@gmail.com',
  'rego.readytogo@gmail.com',
  'minijam89@gmail.com',
  'rlight1843@gmail.com'
];

export default function App() {
  const ALLOWANCE_BASE = 10000;
  const [user, setUser] = useState(null);
  const [history, setHistory] = useState([]);
  const [spentInput, setSpentInput] = useState('');
  const [isInitializing, setIsInitializing] = useState(true);
  const [alertData, setAlertData] = useState(null);
  const [confirmData, setConfirmData] = useState(null);

  // 1. 인증 처리
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser && ALLOWED_EMAILS.includes(currentUser.email)) {
        setUser(currentUser);
      } else if (currentUser) {
        await signOut(auth);
        alert("접근 권한이 없는 계정입니다.");
      }
      setIsInitializing(false);
    });
    return () => unsubscribe();
  }, []);

  // 2. 실시간 데이터 가져오기
  useEffect(() => {
    if (!user) return;
    
    const historyRef = collection(db, 'sihwan_wallet_records');
    const q = query(historyRef, orderBy('week', 'desc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setHistory(data);
    }, (error) => {
      console.error("데이터 읽기 에러:", error);
    });
    
    return () => unsubscribe();
  }, [user]);

  const latestRecord = history.length > 0 ? history[0] : null;
  const currentWeek = latestRecord ? latestRecord.week + 1 : 1;
  const totalSavings = history.reduce((sum, record) => sum + record.saving, 0);
  const carryOverFromLastWeek = latestRecord ? latestRecord.halfRemaining : 0;
  const currentAvailableMoney = ALLOWANCE_BASE + carryOverFromLastWeek;

  // 3. 정산 저장
  const handleSettlement = async () => {
    if (!user) return;
    const spent = parseInt(spentInput);
    
    if (isNaN(spent) || spent < 0 || spent > currentAvailableMoney) {
      setAlertData("이번 주 예산 내에서 올바른 금액을 입력해주세요.");
      return;
    }

    const remaining = currentAvailableMoney - spent;
    const exactHalf = remaining / 2;
    const roundedCarryOver = Math.ceil(exactHalf / 100) * 100;
    const saving = exactHalf * 2;

    try {
      await addDoc(collection(db, 'sihwan_wallet_records'), {
        week: currentWeek,
        availableMoney: currentAvailableMoney,
        spent: spent,
        remaining: remaining,
        halfRemaining: roundedCarryOver,
        saving: saving,
        createdAt: new Date().toISOString(),
        email: user.email
      });
      setSpentInput('');
    } catch (error) {
      setAlertData("저장에 실패했습니다. 잠시 후 다시 시도해주세요.");
    }
  };

  // 4. 초기화
  const handleReset = () => {
    setConfirmData({
      message: "모든 정산 기록을 영구적으로 삭제할까요?",
      onConfirm: async () => {
        try {
          for (const record of history) {
            await deleteDoc(doc(db, 'sihwan_wallet_records', record.id));
          }
        } catch (e) { setAlertData("삭제 중 오류 발생"); }
        setConfirmData(null);
      }
    });
  };

  if (isInitializing) return <div className="min-h-screen bg-slate-50 flex items-center justify-center font-bold">마법 지갑 로딩 중...</div>;
  if (!user) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <button onClick={() => signInWithPopup(auth, new GoogleAuthProvider())} className="bg-white border-2 border-slate-200 p-6 rounded-2xl shadow-xl font-bold flex items-center gap-3 hover:bg-slate-50 transition-all">
        <img src="https://www.google.com/favicon.ico" className="w-6 h-6" alt="google" />
        Google로 시작하기
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans pb-20">
      {/* 알림 모달 */}
      {alertData && <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"><div className="bg-white p-6 rounded-2xl max-w-sm w-full text-center"><AlertCircle size={48} className="mx-auto text-amber-500 mb-4"/><p className="mb-6 font-medium whitespace-pre-line">{alertData}</p><button onClick={() => setAlertData(null)} className="bg-slate-800 text-white px-6 py-2 rounded-xl w-full font-bold">확인</button></div></div>}
      
      {/* 확인 모달 */}
      {confirmData && <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"><div className="bg-white p-6 rounded-2xl max-w-sm w-full text-center"><AlertCircle size={48} className="mx-auto text-red-500 mb-4"/><p className="mb-6 font-medium">{confirmData.message}</p><div className="flex gap-2"><button onClick={() => setConfirmData(null)} className="flex-1 bg-slate-100 p-3 rounded-xl font-bold">취소</button><button onClick={confirmData.onConfirm} className="flex-1 bg-red-500 text-white p-3 rounded-xl font-bold">삭제</button></div></div></div>}

      <div className="max-w-4xl mx-auto space-y-6">
        <header className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center gap-4">
             <div className="p-3 bg-blue-100 text-blue-600 rounded-xl"><Wallet size={24}/></div>
             <div><h1 className="text-xl font-black text-slate-800">시환이 용돈 매니저</h1><p className="text-xs text-slate-500">{user.email}</p></div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleReset} title="초기화" className="p-2 text-slate-300 hover:text-red-500"><RotateCcw size={20}/></button>
            <button onClick={() => signOut(auth)} title="로그아웃" className="p-2 text-slate-300 hover:text-slate-800"><LogOut size={20}/></button>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-gradient-to-br from-emerald-400 to-teal-500 p-6 rounded-3xl text-white shadow-lg">
            <p className="opacity-80 font-medium mb-1 flex items-center gap-1"><PlusCircle size={16}/> 이번 주 총 예산</p>
            <h2 className="text-4xl font-black tracking-tight">{currentAvailableMoney.toLocaleString()}원</h2>
          </div>
          <div className="bg-gradient-to-br from-amber-400 to-orange-500 p-6 rounded-3xl text-white shadow-lg">
            <p className="opacity-80 font-medium mb-1 flex items-center gap-1"><PiggyBank size={16}/> 1년 뒤 받을 저금통</p>
            <h2 className="text-4xl font-black tracking-tight">{totalSavings.toLocaleString()}원</h2>
          </div>
        </div>

        <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5"><Zap size={100}/></div>
          <h3 className="text-lg font-black text-slate-800 mb-4 tracking-tight">💰 {currentWeek}주차 정산하기</h3>
          <div className="flex flex-col sm:flex-row gap-3 max-w-sm mx-auto relative z-10">
            <input type="number" value={spentInput} onChange={(e) => setSpentInput(e.target.value)} className="w-full text-center text-2xl font-black bg-slate-50 border-2 border-slate-100 p-4 rounded-2xl focus:outline-none focus:border-emerald-400 transition-all" placeholder="쓴 돈 입력" />
            <button onClick={handleSettlement} className="bg-slate-800 hover:bg-black text-white px-8 py-4 rounded-2xl font-bold whitespace-nowrap shadow-lg transition-all active:scale-95">마법 발동!</button>
          </div>
        </div>

        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-5 border-b border-slate-50 flex items-center gap-2 font-black text-slate-800">
             <History size={18} className="text-slate-400"/> 마법 저축 기록장
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[10px] uppercase tracking-widest bg-slate-50 text-slate-400 border-b border-slate-100">
                  <th className="p-5 font-bold">주차</th>
                  <th className="p-5 font-bold text-right">사용한 돈</th>
                  <th className="p-5 font-bold text-right">이월금(올림)</th>
                  <th className="p-4 font-bold text-right">저금통(2배)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {history.length === 0 ? (
                  <tr><td colSpan="4" className="p-10 text-center text-slate-300 font-medium italic">정산 기록이 아직 없어요!</td></tr>
                ) : (
                  history.map(record => (
                    <tr key={record.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-5 font-bold text-slate-700">{record.week}주차</td>
                      <td className="p-5 text-right text-red-400 font-medium">-{record.spent.toLocaleString()}원</td>
                      <td className="p-5 text-right text-emerald-600 font-bold bg-emerald-50/30">{record.halfRemaining.toLocaleString()}원</td>
                      <td className="p-5 text-right text-amber-500 font-black">+{record.saving.toLocaleString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { PiggyBank, Wallet, History, RotateCcw, PlusCircle, Zap, Edit2, ArrowRight, Lock, AlertCircle, CheckCircle2, LogOut } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, deleteDoc, doc, updateDoc, query, orderBy } from 'firebase/firestore';
// 디자인 마법 주문 (경고는 뜨지만 무시 가능)
if (!document.getElementById('tailwind-cdn')) {
const tailwindScript = document.createElement("script");
tailwindScript.id = 'tailwind-cdn';
tailwindScript.src = "https://cdn.tailwindcss.com";
document.head.appendChild(tailwindScript);
}
// ★ [중요] 여기에 본인의 firebaseConfig를 꼭 다시 넣어주세요!
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
const [editState, setEditState] = useState(null);
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
// 2. 실시간 데이터 가져오기 (경로 단순화)
useEffect(() => {
if (!user) return;
code
Code
// 단순화된 경로: sihwan_wallet_records
const historyRef = collection(db, 'sihwan_wallet_records');
const q = query(historyRef, orderBy('week', 'desc'));

const unsubscribe = onSnapshot(q, (snapshot) => {
  const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  console.log("실시간 데이터 수신:", data); // 개발자도구에서 확인 가능
  setHistory(data);
}, (error) => {
  console.error("데이터 읽기 에러:", error);
  setAlertData("데이터를 불러오지 못했습니다. 파이어베이스 규칙을 확인해주세요.");
});

return () => unsubscribe();
}, [user]);
const latestRecord = history.length > 0 ? history[0] : null;
const currentWeek = latestRecord ? latestRecord.week + 1 : 1;
const totalSavings = history.reduce((sum, record) => sum + record.saving, 0);
const carryOverFromLastWeek = latestRecord ? latestRecord.halfRemaining : 0;
const currentAvailableMoney = ALLOWANCE_BASE + carryOverFromLastWeek;
// 3. 정산 저장 (에러 로그 추가)
const handleSettlement = async () => {
if (!user) return;
const spent = parseInt(spentInput);
code
Code
if (isNaN(spent) || spent < 0 || spent > currentAvailableMoney) {
  setAlertData("금액을 올바르게 입력해주세요.");
  return;
}

const remaining = currentAvailableMoney - spent;
const exactHalf = remaining / 2;
const roundedCarryOver = Math.ceil(exactHalf / 100) * 100;
const saving = exactHalf * 2;

try {
  console.log("저장 시도 중...");
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
  console.log("저장 성공!");
} catch (error) {
  console.error("저장 실패 상세:", error);
  setAlertData("저장에 실패했습니다: " + error.message);
}
};
// 4. 초기화 기능
const handleReset = () => {
setConfirmData({
message: "모든 기록을 삭제할까요?",
onConfirm: async () => {
try {
for (const record of history) {
await deleteDoc(doc(db, 'sihwan_wallet_records', record.id));
}
} catch (e) { setAlertData("삭제 실패"); }
setConfirmData(null);
}
});
};
// --- 이하 렌더링 부분은 이전과 동일 (생략 없이 복사해서 쓰시면 됩니다) ---
// (길이 조절을 위해 핵심 로직 위주로 재구성했습니다. 기존 디자인 코드를 유지해주세요.)
if (isInitializing) return <div className="min-h-screen bg-slate-50 flex items-center justify-center font-bold">로딩 중...</div>;
if (!user) return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><button onClick={() => signInWithPopup(auth, new GoogleAuthProvider())} className="bg-white border p-4 rounded-xl shadow font-bold">Google로 시작하기</button></div>;
return (
<div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans pb-20">
{/* 알림 모달 */}
{alertData && <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"><div className="bg-white p-6 rounded-2xl max-w-sm w-full text-center"><p className="mb-4 font-medium">{alertData}</p><button onClick={() => setAlertData(null)} className="bg-slate-800 text-white px-6 py-2 rounded-xl w-full">확인</button></div></div>}
code
Code
{/* 확인 모달 */}
  {confirmData && <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"><div className="bg-white p-6 rounded-2xl max-w-sm w-full text-center"><p className="mb-6 font-medium">{confirmData.message}</p><div className="flex gap-2"><button onClick={() => setConfirmData(null)} className="flex-1 bg-slate-100 p-3 rounded-xl">취소</button><button onClick={confirmData.onConfirm} className="flex-1 bg-red-500 text-white p-3 rounded-xl font-bold">삭제</button></div></div></div>}

  <div className="max-w-4xl mx-auto space-y-6">
    <header className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm">
      <div><h1 className="text-xl font-bold text-slate-800">👑 시환이 용돈 매니저</h1><p className="text-sm text-slate-500">{user.email} 로그인 중</p></div>
      <div className="flex gap-2">
        <button onClick={handleReset} className="p-2 text-slate-400 hover:text-red-500"><RotateCcw size={20}/></button>
        <button onClick={() => signOut(auth)} className="p-2 text-slate-400 hover:text-slate-800"><LogOut size={20}/></button>
      </div>
    </header>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="bg-emerald-500 p-6 rounded-2xl text-white shadow-lg">
        <p className="opacity-80">이번 주 총 예산</p>
        <h2 className="text-4xl font-black">{currentAvailableMoney.toLocaleString()}원</h2>
      </div>
      <div className="bg-amber-500 p-6 rounded-2xl text-white shadow-lg">
        <p className="opacity-80">1년 뒤 받을 저금통</p>
        <h2 className="text-4xl font-black">{totalSavings.toLocaleString()}원</h2>
      </div>
    </div>

    <div className="bg-white p-8 rounded-2xl shadow-sm text-center">
      <h3 className="text-lg font-bold mb-4">{currentWeek}주차 정산하기</h3>
      <div className="flex gap-2 max-w-xs mx-auto">
        <input type="number" value={spentInput} onChange={(e) => setSpentInput(e.target.value)} className="w-full text-center text-2xl font-bold bg-slate-50 border p-3 rounded-xl" placeholder="쓴 돈 입력" />
        <button onClick={handleSettlement} className="bg-slate-800 text-white px-6 rounded-xl font-bold whitespace-nowrap">저장</button>
      </div>
    </div>

    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <div className="p-4 bg-slate-50 border-b font-bold">마법 저축 기록장</div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="text-xs uppercase bg-slate-50 text-slate-500 border-b">
              <th className="p-4">주차</th>
              <th className="p-4 text-right">사용한 돈</th>
              <th className="p-4 text-right">이월금</th>
              <th className="p-4 text-right">저금통</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {history.map(record => (
              <tr key={record.id} className="hover:bg-slate-50">
                <td className="p-4 font-bold">{record.week}주차</td>
                <td className="p-4 text-right text-red-500">-{record.spent.toLocaleString()}원</td>
                <td className="p-4 text-right text-emerald-600 font-bold">{record.halfRemaining.toLocaleString()}원</td>
                <td className="p-4 text-right text-amber-500 font-bold">+{record.saving.toLocaleString()}원</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  </div>
</div>
);
}

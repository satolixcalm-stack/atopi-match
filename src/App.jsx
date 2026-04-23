import { useState, useEffect, useRef } from "react";
import { db, auth } from "./firebase.js";
import { ref, set, get, onValue, push, remove } from "firebase/database";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, sendEmailVerification } from "firebase/auth";
import ChatScreen from "./ChatScreen.jsx";
import TimelinePost from "./TimelinePost.jsx";

const SEVERITY = ["軽症", "中等症", "重症", "寛解中"];
const SKIN_CONDITIONS = ["乾燥肌", "じゅくじゅく型", "混合型", "慢性型", "季節性"];
const TRIGGERS = ["食物アレルギー", "ストレス", "花粉", "ダニ・ホコリ", "汗", "睡眠不足", "気温変化"];
const TREATMENTS = ["保湿剤中心", "ステロイド使用", "免疫抑制剤", "生物学的製剤", "自然療法", "食事療法"];
const GENDERS = ["女性", "男性", "その他", "未回答"];
const AVATARS = [
  "🌸","🌺","🌻","🌼","🌷","🌹","🌿","🍃","🍀","🌱","🌲","🎋",
  "🐱","🐶","🐰","🐼","🐨","🦊","🐸","🐧","🐺","🦁","🐮","🐻",
  "🦋","🐝","🐠","🐙","🦄","🐳","🦔","🐿️",
  "🍓","🍒","🍑","🍊","🍋","🍇","🍉","🥝","🍄",
  "⭐","🌈","☀️","🌊","🎵","🎨","💎","🔮","🌙","❄️"
];
const PAGE_SIZE = 3;

// 相性スコア計算
function calcScore(me, other) {
  let score = 0;
  const commons = [];
  if (me.severity && other.severity && me.severity === other.severity) score += 1;
  (me.triggers || []).forEach(t => {
    if ((other.triggers || []).includes(t)) { score += 2; commons.push(t); }
  });
  (me.treatments || []).forEach(t => {
    if ((other.treatments || []).includes(t)) { score += 2; commons.push(t); }
  });
  return { score, commons };
}

export default function App() {
  const [screen, setScreen] = useState("auth");
  const [authMode, setAuthMode] = useState("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const unverifiedRef = { current: false };

  const [currentUser, setCurrentUser] = useState(null);
  const [myProfile, setMyProfile] = useState(null);
  const [profileForm, setProfileForm] = useState({
    name:"",age:"",location:"",gender:"未回答",severity:"",skinType:"",
    triggers:[],treatments:[],yearsWithAtopy:"",bio:"",avatar:AVATARS[0]
  });

  const [allProfiles, setAllProfiles] = useState([]);
  const [matches, setMatches] = useState({});
  const [chatTarget, setChatTarget] = useState(null);
  const [myTimeline, setMyTimeline] = useState([]);
  const [timelineInput, setTimelineInput] = useState("");
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelinePage, setTimelinePage] = useState(0);
  const [expandedUid, setExpandedUid] = useState(null);
  const [myLikes, setMyLikes] = useState({});
  const [profileTimelines, setProfileTimelines] = useState({});
  const [profileTimelinePages, setProfileTimelinePages] = useState({});
  const [usersCache, setUsersCache] = useState({});
  const [viewProfile, setViewProfile] = useState(null);
  const [highlightedPostId, setHighlightedPostId] = useState(null);
  const [toast, setToast] = useState(null);
  const [showTutorial, setShowTutorial] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    return onAuthStateChanged(auth, async (user) => {
      if (user) {
        if (!user.emailVerified) {
          unverifiedRef.current = true;
          await signOut(auth);
          return;
        }
        setCurrentUser(user);
        const snap = await get(ref(db, "users/" + user.uid));
        if (snap.exists()) {
          setMyProfile(snap.val());
          loadAllProfiles(user.uid);
          loadMatches(user.uid);
          loadMyTimeline(user.uid);
          loadMyLikes(user.uid);
          loadNotifications(user.uid);
          if (!localStorage.getItem('tutorial_shown')) setShowTutorial(true);
          setScreen("browse");
        } else {
          setScreen("register");
        }
      } else {
        setCurrentUser(null);
        setMyProfile(null);
        if (unverifiedRef.current) {
          unverifiedRef.current = false;
          setAuthError("メールアドレスの確認が完了していません。届いたメールのリンクをクリックしてからログインしてください。");
        }
        setScreen("auth");
      }
    });
  }, []);

  const loadAllProfiles = async (myUid) => {
    const snap = await get(ref(db, "users"));
    if (!snap.exists()) return;
    const all = [];
    snap.forEach(c => { if (c.key !== myUid) all.push({ uid: c.key, ...c.val() }); });
    setAllProfiles(all);
  };

  const loadMatches = (myUid) => {
    onValue(ref(db, "matches/" + myUid), async (snap) => {
      if (!snap.exists()) { setMatches({}); return; }
      const raw = snap.val();
      const enriched = {};
      for (const uid of Object.keys(raw)) {
        const s = await get(ref(db, "users/" + uid));
        if (s.exists()) enriched[uid] = { uid, ...s.val(), ...raw[uid] };
      }
      setMatches(enriched);
    });
  };

  const loadMyTimeline = (uid) => {
    onValue(ref(db, "timeline/" + uid), (snap) => {
      if (!snap.exists()) { setMyTimeline([]); return; }
      const list = [];
      snap.forEach(c => { list.push({ id: c.key, ...c.val() }); });
      setMyTimeline(list.slice().reverse());
    });
  };

  const loadProfileTimeline = async (uid, forceReload = false) => {
    if (profileTimelines[uid] && !forceReload) return;
    const snap = await get(ref(db, "timeline/" + uid));
    const list = [];
    if (snap.exists()) snap.forEach(c => { list.push({ id: c.key, ...c.val() }); });
    setProfileTimelines(prev => ({ ...prev, [uid]: list.slice().reverse() }));
  };

  const getUserInfo = async (uid) => {
    if (usersCache[uid]) return usersCache[uid];
    const snap = await get(ref(db, "users/" + uid));
    if (snap.exists()) {
      const u = { name: snap.val().name, avatar: snap.val().avatar };
      setUsersCache(prev => ({ ...prev, [uid]: u }));
      return u;
    }
    return { name: "不明", avatar: "🌿" };
  };

  const toggleLike = async (ownerUid, postId, currentLikes) => {
    const likeRef = ref(db, "timeline/" + ownerUid + "/" + postId + "/likes/" + currentUser.uid);
    if (currentLikes && currentLikes[currentUser.uid]) {
      await remove(likeRef);
    } else {
      await set(likeRef, true);
    }
  };

  const getLikeUsers = async (likes) => {
    if (!likes) return [];
    const uids = Object.keys(likes);
    const users = await Promise.all(uids.map(uid => getUserInfo(uid)));
    return uids.map((uid, i) => ({ uid, ...users[i] }));
  };

  const handleAuth = async () => {
    setAuthError(""); setAuthLoading(true);
    try {
      if (authMode === "register") {
        const result = await createUserWithEmailAndPassword(auth, authEmail, authPassword);
        await sendEmailVerification(result.user);
        await signOut(auth);
        setVerificationSent(true);
      } else {
        const result = await signInWithEmailAndPassword(auth, authEmail, authPassword);
        if (!result.user.emailVerified) {
          await signOut(auth);
          setAuthError("メールアドレスの確認が完了していません。届いたメールのリンクをクリックしてください。");
          return;
        }
      }
    } catch (e) {
      const msgs = {
        "auth/email-already-in-use":"このメールアドレスは既に使われています",
        "auth/invalid-email":"メールアドレスの形式が正しくありません",
        "auth/weak-password":"パスワードは6文字以上にしてください",
        "auth/invalid-credential":"メールアドレスまたはパスワードが違います"
      };
      setAuthError(msgs[e.code] || "エラーが発生しました");
    } finally { setAuthLoading(false); }
  };

  const submitProfile = async () => {
    if (!profileForm.name || !profileForm.severity) return;
    if (profileForm.age && Number(profileForm.age) < 18) {
      alert("18歳以上の方のみご利用いただけます");
      return;
    }
    const profile = { ...profileForm, uid: currentUser.uid, createdAt: Date.now() };
    await set(ref(db, "users/" + currentUser.uid), profile);
    setMyProfile(profile);
    loadAllProfiles(currentUser.uid);
    loadMatches(currentUser.uid);
    loadMyTimeline(currentUser.uid);
    setScreen("browse");
  };

  const postTimeline = async () => {
    if (!timelineInput.trim() || timelineLoading) return;
    setTimelineLoading(true);
    try {
      await push(ref(db, "timeline/" + currentUser.uid), {
        text: timelineInput.trim(), createdAt: Date.now(),
      });
      setTimelineInput("");
    } finally { setTimelineLoading(false); }
  };

  const deleteTimeline = async (id) => {
    if (!window.confirm("この投稿を削除しますか？")) return;
    await remove(ref(db, "timeline/" + currentUser.uid + "/" + id));
  };

  const loadMyLikes = (uid) => {
    onValue(ref(db, "likes/" + uid), (snap) => {
      setMyLikes(snap.exists() ? snap.val() : {});
    });
  };

  const showToast = (msg, duration = 3000) => {
    setToast(msg);
    setTimeout(() => setToast(null), duration);
  };

  const loadNotifications = (uid) => {
    onValue(ref(db, "notifications/" + uid), (snap) => {
      if (!snap.exists()) { setNotifications([]); setUnreadCount(0); return; }
      const list = [];
      snap.forEach(c => list.push({ id: c.key, ...c.val() }));
      list.sort((a, b) => b.createdAt - a.createdAt);
      setNotifications(list);
      setUnreadCount(list.length);
    });
  };

  const sendLike = async (target) => {
    const theirLike = await get(ref(db, "likes/" + target.uid + "/" + currentUser.uid));
    await set(ref(db, "likes/" + currentUser.uid + "/" + target.uid), true);
    if (theirLike.exists()) {
      const matchData = { matchedAt: Date.now() };
      await set(ref(db, "matches/" + currentUser.uid + "/" + target.uid), matchData);
      await set(ref(db, "matches/" + target.uid + "/" + currentUser.uid), matchData);
      showToast("💚 " + target.name + "さんとマッチしました！");
    } else {
      showToast("❤️ " + target.name + "さんにいいねしました！共通：" + (calcScore(myProfile, target).commons.join("・") || "なし"));
      // 通知を相手に送る
      await push(ref(db, "notifications/" + target.uid), {
        type: "like", fromUserId: currentUser.uid,
        fromUserName: myProfile.name, fromUserAvatar: myProfile.avatar,
        createdAt: Date.now()
      });
    }
    loadAllProfiles(currentUser.uid);
  };

  const toggleExpand = (uid) => {
    if (expandedUid === uid) {
      setExpandedUid(null);
    } else {
      setExpandedUid(uid);
      loadProfileTimeline(uid);
    }
  };

  const handleClickUser = async (uid) => {
    if (uid === currentUser.uid) { setScreen("mypage"); return; }
    const snap = await get(ref(db, "users/" + uid));
    if (snap.exists()) {
      const profile = { uid, ...snap.val() };
      setViewProfile(profile);
      loadProfileTimeline(uid);
      setScreen("viewProfile");
    }
  };

  const handleNotificationClick = async (n) => {
    if (n.type === "like") {
      // いいね通知 → いいねした人のプロフィールへ
      const snap = await get(ref(db, "users/" + n.fromUserId));
      if (!snap.exists()) return;
      const profile = { uid: n.fromUserId, ...snap.val() };
      setViewProfile(profile);
      await loadProfileTimeline(n.fromUserId, true);
      setScreen("viewProfile");
    } else if (n.type === "comment") {
      // コメント通知 → 自分のマイページへ遷移してその投稿をハイライト
      setHighlightedPostId(null);
      setScreen("mypage");
      if (n.postId) {
        setTimeout(() => setHighlightedPostId(n.postId), 400);
      }
    }
  };

  const toggleArr = (key, val) => setProfileForm(f => ({
    ...f, [key]: f[key].includes(val) ? f[key].filter(x => x !== val) : [...f[key], val]
  }));

  // スコア順に並べた一覧
  const sortedProfiles = myProfile
    ? allProfiles
        .map(p => ({ ...p, ...calcScore(myProfile, p) }))
        .sort((a, b) => b.score - a.score)
    : allProfiles;

  if (screen === "viewProfile" && !viewProfile) { setScreen("browse"); return null; }
  if (screen === "viewProfile") {
    const tl = profileTimelines[viewProfile.uid] || [];
    const tlPage = profileTimelinePages[viewProfile.uid] || 0;
    return (
      <div style={S.app}>
        <div style={S.page}>
          <div style={S.bar}>
            <button style={S.ghost} onClick={() => { setViewProfile(null); setScreen("browse"); }}>← 戻る</button>
            <span style={S.barTitle}>{viewProfile.name}さん</span>
            <div style={{ width:60 }} />
          </div>
          <div style={{ flex:1,overflowY:"auto",padding:16,display:"flex",flexDirection:"column",gap:14 }}>
            <div style={S.card}>
              <div style={{ textAlign:"center",marginBottom:16 }}>
                <div style={{ fontSize:64 }}>{viewProfile.avatar}</div>
                <div style={{ fontSize:22,fontWeight:800,color:"#3d6b4f" }}>{viewProfile.name}</div>
                <div style={{ fontSize:13,color:"#6b8f71" }}>{viewProfile.age}歳 · {viewProfile.gender} · {viewProfile.location}</div>
              </div>
              <div style={{ display:"flex",justifyContent:"center",flexWrap:"wrap",gap:6,marginBottom:12 }}>
                {viewProfile.severity && <span style={S.badge}>{viewProfile.severity}</span>}
                {viewProfile.skinType && <span style={S.badge}>{viewProfile.skinType}</span>}
                {viewProfile.yearsWithAtopy && <span style={{ ...S.badge,background:"#e8f5e9" }}>歴{viewProfile.yearsWithAtopy}年</span>}
              </div>
              {viewProfile.triggers?.length > 0 && <><div style={S.secLabel}>悪化因子</div><div style={S.chips}>{viewProfile.triggers.map(t => <span key={t} style={S.infoChip}>{t}</span>)}</div></>}
              {viewProfile.treatments?.length > 0 && <><div style={S.secLabel}>治療法</div><div style={S.chips}>{viewProfile.treatments.map(t => <span key={t} style={S.infoChip}>{t}</span>)}</div></>}
              {viewProfile.bio && <p style={{ fontSize:13,color:"#4a6b54",lineHeight:1.7,marginTop:10,padding:12,background:"#f0f7f2",borderRadius:12 }}>{viewProfile.bio}</p>}
            </div>
            {tl.length > 0 && (
              <div style={S.card}>
                <div style={{ fontSize:15,fontWeight:800,color:"#3d6b4f",marginBottom:12 }}>📝 タイムライン</div>
                <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
                  {tl.slice(0,(tlPage+1)*PAGE_SIZE).map(t => (
                    <TimelinePost key={t.id} post={t} ownerUid={viewProfile.uid} currentUser={currentUser}
                      onClickUser={handleClickUser} canDelete={false}
                      highlightedPostId={highlightedPostId} clearHighlight={() => setHighlightedPostId(null)} />
                  ))}
                  {tl.length > (tlPage+1)*PAGE_SIZE && (
                    <button onClick={() => setProfileTimelinePages(prev => ({ ...prev,[viewProfile.uid]:(prev[viewProfile.uid]||0)+1 }))}
                      style={{ width:"100%",background:"#f0f7f2",color:"#52a875",border:"1.5px solid #c8e6c9",borderRadius:10,padding:"8px 0",fontSize:13,fontWeight:700,cursor:"pointer" }}>
                      もっと見る
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── チュートリアル ──
  const tutorialEl = showTutorial ? (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center" }}>
      <div style={{ background:"#fff",borderRadius:24,padding:"32px 28px",maxWidth:320,margin:"0 16px",textAlign:"center",boxShadow:"0 16px 48px rgba(0,0,0,0.2)" }}>
        <div style={{ fontSize:52,marginBottom:12 }}>🌿</div>
        <h2 style={{ fontSize:18,fontWeight:800,color:"#3d6b4f",marginBottom:12 }}>AtopiMatchへようこそ</h2>
        <p style={{ fontSize:14,color:"#6b8f71",lineHeight:1.8,marginBottom:20 }}>
          このアプリは、アトピーという同じ経験を持つ人と<strong>共感し、つながる</strong>場所です。<br/><br/>
          症状・悪化因子・治療法が似ている人と出会えます。
        </p>
        <button onClick={() => { setShowTutorial(false); localStorage.setItem('tutorial_shown','1'); }}
          style={{ width:"100%",background:"#52a875",color:"#fff",border:"none",borderRadius:14,padding:"14px 0",fontSize:15,fontWeight:700,cursor:"pointer" }}>
          はじめる 💚
        </button>
      </div>
    </div>
  ) : null;

  // ── トースト ──
  const toastEl = toast ? (
    <div style={{ position:"fixed",bottom:80,left:"50%",transform:"translateX(-50%)",background:"#2d4a35",color:"#fff",borderRadius:20,padding:"10px 20px",fontSize:13,fontWeight:700,zIndex:150,whiteSpace:"nowrap",boxShadow:"0 4px 16px rgba(0,0,0,0.2)" }}>
      {toast}
    </div>
  ) : null;

  if (screen === "chat" && (!chatTarget || !currentUser || !myProfile)) { setScreen("matches"); return null; }
  if (screen === "chat") return (
    <div style={S.app}>
      <ChatScreen currentUser={currentUser} myProfile={myProfile} chatTarget={chatTarget}
        commons={myProfile ? calcScore(myProfile, chatTarget).commons : []}
        onBack={() => { setChatTarget(null); setScreen("matches"); }} />
    </div>
  );

  if (verificationSent) return (
    <div style={S.app}>
      <div style={{ width:"100%",maxWidth:400,padding:"48px 20px" }}>
        <div style={{ textAlign:"center",marginBottom:28 }}>
          <div style={{ fontSize:52 }}>🌿</div>
          <h1 style={{ fontSize:30,fontWeight:800,color:"#3d6b4f",margin:"4px 0 0" }}>AtopiMatch</h1>
        </div>
        <div style={S.card}>
          <div style={{ textAlign:"center",marginBottom:20 }}>
            <div style={{ fontSize:48,marginBottom:12 }}>📧</div>
            <h2 style={{ fontSize:18,fontWeight:800,color:"#3d6b4f",margin:"0 0 8px" }}>確認メールを送りました</h2>
            <p style={{ color:"#6b8f71",fontSize:14,lineHeight:1.7 }}>
              <strong>{authEmail}</strong> に確認メールを送りました。<br/>
              メール内のリンクをクリックしてから、ログインしてください。
            </p>
          </div>
          <button style={S.btn} onClick={() => { setVerificationSent(false); setAuthMode("login"); }}>ログイン画面へ</button>
        </div>
      </div>
    </div>
  );

  if (screen === "auth") return (
    <div style={S.app}>
      <div style={{ width:"100%",maxWidth:400,padding:"48px 20px" }}>
        <div style={{ textAlign:"center",marginBottom:28 }}>
          <div style={{ fontSize:52 }}>🌿</div>
          <h1 style={{ fontSize:30,fontWeight:800,color:"#3d6b4f",margin:"4px 0 0" }}>AtopiMatch</h1>
          <p style={{ color:"#6b8f71",fontSize:13,marginTop:6 }}>アトピーだから、分かり合える。</p>
        </div>
        <div style={S.card}>
          <div style={S.tabRow}>
            <button style={authMode==="login"?S.tabActive:S.tab} onClick={() => { setAuthMode("login"); setAuthError(""); }}>ログイン</button>
            <button style={authMode==="register"?S.tabActive:S.tab} onClick={() => { setAuthMode("register"); setAuthError(""); }}>新規登録</button>
          </div>
          <label style={S.label}>メールアドレス</label>
          <input style={{ ...S.input,marginBottom:12 }} type="email" placeholder="hello@example.com" value={authEmail} onChange={e => setAuthEmail(e.target.value)} />
          <label style={S.label}>パスワード（6文字以上）</label>
          <input style={{ ...S.input,marginBottom:12 }} type="password" placeholder="••••••••" value={authPassword} onChange={e => setAuthPassword(e.target.value)} onKeyDown={e => e.key==="Enter" && handleAuth()} />
          {authError && <div style={S.errorMsg}>{authError}</div>}
          <button style={S.btn} onClick={handleAuth} disabled={authLoading}>{authLoading?"処理中...":authMode==="login"?"ログイン":"アカウントを作成"}</button>
        </div>
      </div>
    </div>
  );

  if (screen === "register") return (
    <div style={S.app}>
      <div style={S.page}>
        <div style={S.bar}><span style={S.barTitle}>🌿 プロフィール作成</span><button style={S.ghost} onClick={() => signOut(auth)}>ログアウト</button></div>
        <div style={{ padding:16,overflowY:"auto",flex:1 }}>
          <div style={S.card}>
            <label style={S.label}>アバター</label>
            <div style={{ ...S.chips,marginBottom:14 }}>
              {AVATARS.map(a => <button key={a} onClick={() => setProfileForm(f => ({ ...f,avatar:a }))} style={{ fontSize:24,background:profileForm.avatar===a?"#e8f5e9":"#f0f7f2",border:profileForm.avatar===a?"2px solid #52a875":"2px solid #c8e6c9",borderRadius:12,padding:"4px 8px",cursor:"pointer" }}>{a}</button>)}
            </div>
            <label style={S.label}>ニックネーム</label>
            <input style={{ ...S.input,marginBottom:12 }} placeholder="さくら" value={profileForm.name} onChange={e => setProfileForm(f => ({ ...f,name:e.target.value }))} />
            <div style={{ display:"flex",gap:12,marginBottom:12 }}>
              <div style={{ flex:1 }}>
                <label style={S.label}>年齢（18歳以上）</label>
                <input style={S.input} type="number" min="18" max="100" placeholder="25" value={profileForm.age}
                  onChange={e => { const v=e.target.value; if(v===""||Number(v)>=18) setProfileForm(f => ({ ...f,age:v })); }} />
              </div>
              <div style={{ flex:1 }}>
                <label style={S.label}>地域</label>
                <input style={S.input} placeholder="東京" value={profileForm.location} onChange={e => setProfileForm(f => ({ ...f,location:e.target.value }))} />
              </div>
            </div>
            <label style={S.label}>性別</label>
            <div style={{ ...S.chips,marginBottom:12 }}>
              {GENDERS.map(g => <button key={g} style={profileForm.gender===g?S.chipOn:S.chipOff} onClick={() => setProfileForm(f => ({ ...f,gender:g }))}>{g}</button>)}
            </div>
            <label style={S.label}>症状の重さ</label>
            <div style={{ ...S.chips,marginBottom:12 }}>{SEVERITY.map(s => <button key={s} style={profileForm.severity===s?S.chipOn:S.chipOff} onClick={() => setProfileForm(f => ({ ...f,severity:s }))}>{s}</button>)}</div>
            <label style={S.label}>肌タイプ</label>
            <div style={{ ...S.chips,marginBottom:12 }}>{SKIN_CONDITIONS.map(s => <button key={s} style={profileForm.skinType===s?S.chipOn:S.chipOff} onClick={() => setProfileForm(f => ({ ...f,skinType:s }))}>{s}</button>)}</div>
            <label style={S.label}>悪化因子（複数可）</label>
            <div style={{ ...S.chips,marginBottom:12 }}>{TRIGGERS.map(t => <button key={t} style={profileForm.triggers.includes(t)?S.chipOn:S.chipOff} onClick={() => toggleArr("triggers",t)}>{t}</button>)}</div>
            <label style={S.label}>治療法（複数可）</label>
            <div style={{ ...S.chips,marginBottom:12 }}>{TREATMENTS.map(t => <button key={t} style={profileForm.treatments.includes(t)?S.chipOn:S.chipOff} onClick={() => toggleArr("treatments",t)}>{t}</button>)}</div>
            <label style={S.label}>アトピー歴（年）</label>
            <input style={{ ...S.input,marginBottom:12 }} type="number" placeholder="10" value={profileForm.yearsWithAtopy} onChange={e => setProfileForm(f => ({ ...f,yearsWithAtopy:e.target.value }))} />
            <label style={S.label}>自己紹介</label>
            <textarea style={{ ...S.input,height:80,resize:"vertical",marginBottom:16 }} placeholder="アトピーと向き合いながら毎日楽しく過ごしています..." value={profileForm.bio} onChange={e => setProfileForm(f => ({ ...f,bio:e.target.value }))} />
            <button style={S.btn} onClick={submitProfile}>登録する</button>
          </div>
        </div>
      </div>
    </div>
  );

  // ── 探す（一覧）──
  if (screen === "browse") return (
    <div style={S.app}>
      <div style={S.page}>
        <div style={S.bar}><span style={S.barTitle}>🌿 自分と似ている人</span><button style={S.ghost} onClick={() => signOut(auth)}>退出</button></div>
        <div style={{ flex:1,overflowY:"auto",padding:"12px 14px",display:"flex",flexDirection:"column",gap:12 }}>
          {sortedProfiles.length === 0 ? (
            <div style={S.empty}>
              <div style={{ fontSize:52 }}>🌿</div>
              <h3 style={{ color:"#3d6b4f",marginTop:12 }}>まだユーザーがいません</h3>
              <p style={{ color:"#6b8f71",fontSize:13 }}>友達を招待してみましょう</p>
            </div>
          ) : sortedProfiles.map(p => {
            const isExpanded = expandedUid === p.uid;
            const liked = false;
            const tl = profileTimelines[p.uid] || [];
            const tlPage = profileTimelinePages[p.uid] || 0;
            return (
              <div key={p.uid} style={{ background:"#fff",borderRadius:18,boxShadow:"0 2px 14px rgba(61,107,79,0.08)",overflow:"hidden" }}>
                {/* ヘッダー行 */}
                <div style={{ display:"flex",alignItems:"center",gap:12,padding:"14px 16px" }} onClick={() => toggleExpand(p.uid)}>
                  <div style={{ fontSize:36,width:50,height:50,display:"flex",alignItems:"center",justifyContent:"center",background:"#f0f7f2",borderRadius:"50%",flexShrink:0 }}>{p.avatar}</div>
                  <div style={{ flex:1,minWidth:0 }}>
                    <div style={{ fontSize:15,fontWeight:700,color:"#3d6b4f" }}>{p.name} <span style={{ fontSize:13,fontWeight:400,color:"#6b8f71" }}>{p.age}歳</span></div>
                    <div style={{ fontSize:11,color:"#6b8f71" }}>{p.location}{p.gender?" · "+p.gender:""} · {p.severity}</div>
                    {p.commons?.length > 0 && (
                      <div style={{ fontSize:11,color:"#52a875",marginTop:3,fontWeight:700 }}>
                        🌿 共通点：{p.commons.slice(0,2).join("・")}{p.commons.length > 2 ? ` +${p.commons.length - 2}` : ""}
                      </div>
                    )}
                  </div>
                  <div style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:6 }}>
                    <button
                      onClick={e => { e.stopPropagation(); sendLike(p); }}
                      style={{
                        background: matches[p.uid] ? "#e8f5e9" : myLikes[p.uid] ? "#ffebee" : "#52a875",
                        color: matches[p.uid] ? "#52a875" : myLikes[p.uid] ? "#e57373" : "#fff",
                        border: myLikes[p.uid] && !matches[p.uid] ? "1.5px solid #e57373" : "none",
                        borderRadius:20,padding:"6px 14px",fontSize:12,fontWeight:700,cursor:"pointer"
                      }}>
                      {matches[p.uid] ? "マッチ済み💚" : myLikes[p.uid] ? "いいね済み❤️" : "いいね♥"}
                    </button>
                    <div style={{ fontSize:10,color:"#a8c5b0" }}>{isExpanded?"▲ 閉じる":"▼ 詳細"}</div>
                  </div>
                </div>

                {/* 詳細（展開時） */}
                {isExpanded && (
                  <div style={{ padding:"0 16px 14px",borderTop:"1px solid #f0f7f2" }}>
                    {p.triggers?.length > 0 && <><div style={S.secLabel}>悪化因子</div><div style={S.chips}>{p.triggers.map(t => <span key={t} style={S.infoChip}>{t}</span>)}</div></>}
                    {p.treatments?.length > 0 && <><div style={S.secLabel}>治療法</div><div style={S.chips}>{p.treatments.map(t => <span key={t} style={S.infoChip}>{t}</span>)}</div></>}
                    {p.bio && <p style={{ fontSize:13,color:"#4a6b54",lineHeight:1.7,marginTop:10,padding:10,background:"#f0f7f2",borderRadius:10 }}>{p.bio}</p>}
                    {tl.length > 0 && (
                      <>
                        <div style={S.secLabel}>📝 タイムライン</div>
                        <div style={{ display:"flex",flexDirection:"column",gap:6 }}>
                          {tl.slice(0,(tlPage+1)*PAGE_SIZE).map(t => (
                            <TimelinePost key={t.id} post={t} ownerUid={p.uid} currentUser={currentUser}
                              onClickUser={handleClickUser} canDelete={false}
                              highlightedPostId={highlightedPostId} clearHighlight={() => setHighlightedPostId(null)} />
                          ))}
                          {tl.length > (tlPage+1)*PAGE_SIZE && (
                            <button onClick={() => setProfileTimelinePages(prev => ({ ...prev,[p.uid]:(prev[p.uid]||0)+1 }))}
                              style={{ width:"100%",background:"#f0f7f2",color:"#52a875",border:"1.5px solid #c8e6c9",borderRadius:10,padding:"6px 0",fontSize:12,fontWeight:700,cursor:"pointer" }}>
                              もっと見る
                            </button>
                          )}
                        </div>
                      </>
                    )}
                    {matches[p.uid] && (
                      <button onClick={() => { setChatTarget(p); setScreen("chat"); }}
                        style={{ ...S.btn,marginTop:12,padding:"10px 0",fontSize:13 }}>
                        💬 チャットする
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div style={S.nav}>
          <button style={{ ...S.navBtn,color:"#52a875",borderTop:"2px solid #52a875" }}>🔍 探す</button>
          <button style={S.navBtn} onClick={() => setScreen("matches")}>💚 マッチ ({Object.keys(matches).length})</button>
          <button style={S.navBtn} onClick={() => setScreen("mypage")}>
            👤 マイページ{unreadCount > 0 ? <span style={{ marginLeft:4,background:"#e57373",color:"#fff",borderRadius:"50%",fontSize:10,padding:"1px 5px",fontWeight:700 }}>{unreadCount}</span> : ""}
          </button>
        </div>
        {tutorialEl}{toastEl}
      </div>
    </div>
  );

  if (screen === "matches") return (
    <div style={S.app}>
      <div style={S.page}>
        <div style={S.bar}><span style={S.barTitle}>💚 マッチ一覧</span></div>
        <div style={{ flex:1,overflowY:"auto",padding:16 }}>
          {Object.keys(matches).length === 0 ? (
            <div style={S.empty}>
              <div style={{ fontSize:48 }}>💚</div>
              <p style={{ color:"#3d6b4f",fontSize:15,fontWeight:800,marginTop:12 }}>まだマッチがありません</p>
              <p style={{ color:"#6b8f71",fontSize:13,marginTop:6 }}>気になる人にいいねしてみましょう</p>
              <button style={{ ...S.btn,width:"auto",padding:"12px 28px",marginTop:16 }} onClick={() => setScreen("browse")}>探しに行く 🌿</button>
            </div>
          ) : (
            <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
              {Object.values(matches).map(m => {
                const isExpanded = expandedUid === m.uid;
                const tl = profileTimelines[m.uid] || [];
                const tlPage = profileTimelinePages[m.uid] || 0;
                const { commons: mCommons } = myProfile ? calcScore(myProfile, m) : { commons: [] };
                return (
                  <div key={m.uid} style={{ background:"#fff",borderRadius:18,boxShadow:"0 2px 14px rgba(61,107,79,0.08)",overflow:"hidden" }}>
                    <div style={{ display:"flex",alignItems:"center",gap:12,padding:"14px 16px",cursor:"pointer" }}
                      onClick={() => toggleExpand(m.uid)}>
                      <div style={{ fontSize:36,width:50,height:50,display:"flex",alignItems:"center",justifyContent:"center",background:"#f0f7f2",borderRadius:"50%",flexShrink:0 }}>{m.avatar}</div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:15,fontWeight:700,color:"#3d6b4f" }}>{m.name} <span style={{ fontSize:13,fontWeight:400,color:"#6b8f71" }}>{m.age}歳</span></div>
                        <div style={{ fontSize:12,color:"#6b8f71" }}>{m.location} · {m.severity}</div>
                        {mCommons.length > 0 && (
                          <div style={{ fontSize:11,color:"#52a875",marginTop:2,fontWeight:700 }}>
                            🌿 共通点：{mCommons.slice(0,2).join("・")}{mCommons.length > 2 ? ` +${mCommons.length - 2}` : ""}
                          </div>
                        )}
                        <div style={{ fontSize:10,color:"#a8c5b0",marginTop:2 }}>{new Date(m.matchedAt).toLocaleDateString("ja-JP")} にマッチ · {isExpanded?"▲ 閉じる":"▼ 詳細"}</div>
                      </div>
                      <button onClick={e => { e.stopPropagation(); setChatTarget(m); setScreen("chat"); }}
                        style={{ background:"#52a875",border:"none",borderRadius:"50%",width:40,height:40,fontSize:18,cursor:"pointer",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
                        💬
                      </button>
                    </div>
                    {isExpanded && (
                      <div style={{ padding:"0 16px 14px",borderTop:"1px solid #f0f7f2" }}>
                        {m.triggers?.length > 0 && <><div style={S.secLabel}>悪化因子</div><div style={S.chips}>{m.triggers.map(t => <span key={t} style={S.infoChip}>{t}</span>)}</div></>}
                        {m.treatments?.length > 0 && <><div style={S.secLabel}>治療法</div><div style={S.chips}>{m.treatments.map(t => <span key={t} style={S.infoChip}>{t}</span>)}</div></>}
                        {m.bio && <p style={{ fontSize:13,color:"#4a6b54",lineHeight:1.7,marginTop:10,padding:10,background:"#f0f7f2",borderRadius:10 }}>{m.bio}</p>}
                        {tl.length > 0 && (
                          <>
                            <div style={S.secLabel}>📝 タイムライン</div>
                            <div style={{ display:"flex",flexDirection:"column",gap:6 }}>
                              {tl.slice(0,(tlPage+1)*PAGE_SIZE).map(t => (
                                <TimelinePost key={t.id} post={t} ownerUid={m.uid} currentUser={currentUser}
                                  onClickUser={handleClickUser} canDelete={false}
                                  highlightedPostId={highlightedPostId} clearHighlight={() => setHighlightedPostId(null)} />
                              ))}
                              {tl.length > (tlPage+1)*PAGE_SIZE && (
                                <button onClick={() => setProfileTimelinePages(prev => ({ ...prev,[m.uid]:(prev[m.uid]||0)+1 }))}
                                  style={{ width:"100%",background:"#f0f7f2",color:"#52a875",border:"1.5px solid #c8e6c9",borderRadius:10,padding:"6px 0",fontSize:12,fontWeight:700,cursor:"pointer" }}>
                                  もっと見る
                                </button>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div style={S.nav}>
          <button style={S.navBtn} onClick={() => setScreen("browse")}>🔍 探す</button>
          <button style={{ ...S.navBtn,color:"#52a875",borderTop:"2px solid #52a875" }}>💚 マッチ</button>
          <button style={S.navBtn} onClick={() => setScreen("mypage")}>👤 マイページ</button>
        </div>
      </div>
    </div>
  );

  if (screen === "mypage") return (
    <div style={S.app}>
      <div style={S.page}>
        <div style={S.bar}><span style={S.barTitle}>👤 マイページ</span><button style={S.ghost} onClick={() => signOut(auth)}>ログアウト</button></div>
        <div style={{ flex:1,overflowY:"auto",padding:16,display:"flex",flexDirection:"column",gap:14 }}>
          {notifications.length === 0 && (
            <div style={{ ...S.card,textAlign:"center",padding:"20px 24px" }}>
              <div style={{ fontSize:32,marginBottom:8 }}>🔔</div>
              <p style={{ color:"#6b8f71",fontSize:13,fontWeight:700 }}>まだ通知はありません</p>
              <p style={{ color:"#a8c5b0",fontSize:12,marginTop:4 }}>いいねやコメントが届くとここに表示されます</p>
            </div>
          )}
          {notifications.length > 0 && (
            <div style={S.card}>
              <div style={{ fontSize:15,fontWeight:800,color:"#3d6b4f",marginBottom:12 }}>🔔 通知</div>
              <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
                {notifications.slice(0,5).map(n => (
                  <button key={n.id} onClick={() => handleNotificationClick(n)}
                    style={{ display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:"#f0f7f2",borderRadius:12,border:"none",cursor:"pointer",width:"100%",textAlign:"left" }}>
                    <span style={{ fontSize:22,flexShrink:0 }}>{n.fromUserAvatar}</span>
                    <div style={{ fontSize:13,color:"#4a6b54",flex:1 }}>
                      <strong>{n.fromUserName}</strong>さんが
                {n.type === "like" ? "❤️ あなたの投稿にいいねしました → 確認する" : ("💬 " + (n.postText ? "「" + n.postText + "...」" : "あなたの投稿") + "にコメントしました → 見にいく")}
                      <div style={{ fontSize:10,color:"#a8c5b0",marginTop:2 }}>{new Date(n.createdAt).toLocaleDateString("ja-JP")}</div>
                    </div>
                    <span style={{ fontSize:12,color:"#a8c5b0",flexShrink:0 }}>›</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {myProfile && (
            <div style={S.card}>
              <div style={{ textAlign:"center",marginBottom:16 }}>
                <div style={{ fontSize:64 }}>{myProfile.avatar}</div>
                <div style={{ fontSize:22,fontWeight:800,color:"#3d6b4f" }}>{myProfile.name}</div>
                <div style={{ fontSize:13,color:"#6b8f71" }}>{myProfile.age}歳 · {myProfile.gender} · {myProfile.location}</div>
              </div>
              <div style={{ display:"flex",justifyContent:"center",flexWrap:"wrap",gap:6,marginBottom:12 }}>
                {myProfile.severity && <span style={S.badge}>{myProfile.severity}</span>}
                {myProfile.skinType && <span style={S.badge}>{myProfile.skinType}</span>}
                {myProfile.yearsWithAtopy && <span style={{ ...S.badge,background:"#e8f5e9" }}>歴{myProfile.yearsWithAtopy}年</span>}
              </div>
              {myProfile.triggers?.length > 0 && <><div style={S.secLabel}>悪化因子</div><div style={S.chips}>{myProfile.triggers.map(t => <span key={t} style={S.infoChip}>{t}</span>)}</div></>}
              {myProfile.treatments?.length > 0 && <><div style={S.secLabel}>治療法</div><div style={S.chips}>{myProfile.treatments.map(t => <span key={t} style={S.infoChip}>{t}</span>)}</div></>}
              {myProfile.bio && <p style={{ fontSize:13,color:"#4a6b54",lineHeight:1.7,marginTop:10,padding:12,background:"#f0f7f2",borderRadius:12 }}>{myProfile.bio}</p>}
              <button style={{ ...S.btn,marginTop:16 }} onClick={() => { setProfileForm(myProfile); setScreen("register"); }}>プロフィールを編集</button>
            </div>
          )}
          <div style={S.card}>
            <div style={{ fontSize:15,fontWeight:800,color:"#3d6b4f",marginBottom:12 }}>📝 タイムライン</div>
            <textarea style={{ ...S.input,height:70,resize:"vertical",marginBottom:8 }} placeholder="今日の体調や日常を投稿しましょう..." value={timelineInput} onChange={e => setTimelineInput(e.target.value)} />
            <button style={S.btn} onClick={postTimeline} disabled={timelineLoading}>{timelineLoading?"投稿中...":"投稿する"}</button>
            <div style={{ marginTop:16,display:"flex",flexDirection:"column",gap:10 }}>
              {myTimeline.length === 0 && (
                <div style={{ textAlign:"center",padding:"16px 0" }}>
                  <div style={{ fontSize:32,marginBottom:8 }}>📝</div>
                  <p style={{ color:"#6b8f71",fontSize:13,fontWeight:700 }}>まだ投稿がありません</p>
                  <p style={{ color:"#a8c5b0",fontSize:12,marginTop:4 }}>今日の体調を書いてみませんか？</p>
                </div>
              )}
              {myTimeline.slice(0,(timelinePage+1)*PAGE_SIZE).map(t => (
                <TimelinePost key={t.id} post={t} ownerUid={currentUser.uid} currentUser={currentUser}
                  onClickUser={handleClickUser} canDelete={true} onDelete={() => deleteTimeline(t.id)}
                  highlightedPostId={highlightedPostId} clearHighlight={() => setHighlightedPostId(null)} />
              ))}
              {myTimeline.length > (timelinePage+1)*PAGE_SIZE && (
                <button onClick={() => setTimelinePage(p => p+1)}
                  style={{ width:"100%",background:"#f0f7f2",color:"#52a875",border:"1.5px solid #c8e6c9",borderRadius:10,padding:"8px 0",fontSize:13,fontWeight:700,cursor:"pointer",marginTop:4 }}>
                  もっと見る
                </button>
              )}
            </div>
          </div>
        </div>
        <div style={S.nav}>
          <button style={S.navBtn} onClick={() => setScreen("browse")}>🔍 探す</button>
          <button style={S.navBtn} onClick={() => setScreen("matches")}>💚 マッチ</button>
          <button style={{ ...S.navBtn,color:"#52a875",borderTop:"2px solid #52a875" }}>👤 マイページ</button>
        </div>
        {toastEl}
      </div>
    </div>
  );
}

const S = {
  app:{ minHeight:"100vh",background:"#f0f7f2",fontFamily:"'Hiragino Sans','Yu Gothic',sans-serif",display:"flex",justifyContent:"center" },
  page:{ width:"100%",maxWidth:420,display:"flex",flexDirection:"column",minHeight:"100vh" },
  card:{ background:"#fff",borderRadius:20,padding:24,boxShadow:"0 4px 24px rgba(61,107,79,0.08)" },
  tabRow:{ display:"flex",marginBottom:16,borderRadius:12,overflow:"hidden",border:"1.5px solid #c8e6c9" },
  tab:{ flex:1,padding:"10px 0",background:"transparent",border:"none",color:"#6b8f71",fontSize:14,cursor:"pointer" },
  tabActive:{ flex:1,padding:"10px 0",background:"#52a875",border:"none",color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer" },
  label:{ display:"block",fontSize:12,fontWeight:700,color:"#3d6b4f",marginBottom:6 },
  input:{ width:"100%",border:"1.5px solid #c8e6c9",borderRadius:10,padding:"10px 14px",fontSize:14,color:"#2d4a35",background:"#f0f7f2",boxSizing:"border-box",outline:"none" },
  btn:{ width:"100%",background:"#52a875",color:"#fff",border:"none",borderRadius:14,padding:"14px 0",fontSize:15,fontWeight:700,cursor:"pointer" },
  errorMsg:{ background:"#ffebee",color:"#c62828",borderRadius:10,padding:"10px 14px",fontSize:13,marginBottom:12 },
  chips:{ display:"flex",flexWrap:"wrap",gap:7 },
  chipOn:{ background:"#52a875",border:"1.5px solid #52a875",color:"#fff",borderRadius:20,padding:"5px 13px",fontSize:12,cursor:"pointer",fontWeight:700 },
  chipOff:{ background:"#f0f7f2",border:"1.5px solid #c8e6c9",color:"#6b8f71",borderRadius:20,padding:"5px 13px",fontSize:12,cursor:"pointer" },
  bar:{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 20px",background:"#fff",boxShadow:"0 1px 8px rgba(61,107,79,0.07)",flexShrink:0 },
  barTitle:{ fontSize:17,fontWeight:800,color:"#3d6b4f" },
  ghost:{ background:"none",border:"1px solid #c8e6c9",borderRadius:10,padding:"5px 12px",fontSize:12,color:"#6b8f71",cursor:"pointer" },
  badge:{ background:"#f0f7f2",color:"#3d6b4f",borderRadius:20,padding:"4px 11px",fontSize:11,fontWeight:700 },
  secLabel:{ fontSize:11,fontWeight:700,color:"#6b8f71",marginBottom:5,marginTop:10 },
  infoChip:{ background:"#f0f7f2",color:"#6b8f71",borderRadius:20,padding:"3px 11px",fontSize:11,border:"1px solid #c8e6c9" },
  empty:{ flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:40,textAlign:"center" },
  matchRow:{ background:"#fff",borderRadius:16,padding:"14px 16px",display:"flex",alignItems:"center",gap:14,boxShadow:"0 2px 12px rgba(61,107,79,0.06)",cursor:"pointer" },
  nav:{ display:"flex",borderTop:"1px solid #e8f5e9",background:"#fff",flexShrink:0 },
  navBtn:{ flex:1,padding:"12px 0",background:"none",border:"none",borderTop:"2px solid transparent",color:"#6b8f71",fontSize:12,cursor:"pointer" },
};

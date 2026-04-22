import { useState, useEffect } from "react";
import { db, auth } from "./firebase.js";
import { ref, set, get, onValue, push, serverTimestamp } from "firebase/database";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";
import ChatScreen from "./ChatScreen.jsx";

const SEVERITY = ["軽症", "中等症", "重症", "寛解中"];
const SKIN_CONDITIONS = ["乾燥肌", "じゅくじゅく型", "混合型", "慢性型", "季節性"];
const TRIGGERS = ["食物アレルギー", "ストレス", "花粉", "ダニ・ホコリ", "汗", "睡眠不足", "気温変化"];
const TREATMENTS = ["保湿剤中心", "ステロイド使用", "免疫抑制剤", "生物学的製剤", "自然療法", "食事療法"];
const AVATARS = ["🌸", "🍃", "🌷", "🌿", "🌻", "🦋", "🌱", "🍀"];

export default function App() {
  const [screen, setScreen] = useState("auth");
  const [authMode, setAuthMode] = useState("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [myProfile, setMyProfile] = useState(null);
  const [profileForm, setProfileForm] = useState({ name: "", age: "", location: "", severity: "", skinType: "", triggers: [], treatments: [], yearsWithAtopy: "", bio: "", avatar: AVATARS[0] });
  const [allProfiles, setAllProfiles] = useState([]);
  const [browseIndex, setBrowseIndex] = useState(0);
  const [matches, setMatches] = useState({});
  const [swipeDir, setSwipeDir] = useState(null);
  const [showMatch, setShowMatch] = useState(null);
  const [likeLoading, setLikeLoading] = useState(false);
  const [chatTarget, setChatTarget] = useState(null);

  useEffect(() => {
    return onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        const snap = await get(ref(db, `users/${user.uid}`));
        if (snap.exists()) {
          setMyProfile(snap.val());
          loadAllProfiles(user.uid);
          loadMatches(user.uid);
          setScreen("browse");
        } else {
          setScreen("register");
        }
      } else {
        setCurrentUser(null);
        setMyProfile(null);
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
    onValue(ref(db, `matches/${myUid}`), async (snap) => {
      if (!snap.exists()) { setMatches({}); return; }
      const raw = snap.val();
      const enriched = {};
      for (const uid of Object.keys(raw)) {
        const s = await get(ref(db, `users/${uid}`));
        if (s.exists()) enriched[uid] = { uid, ...s.val(), ...raw[uid] };
      }
      setMatches(enriched);
    });
  };

  const handleAuth = async () => {
    setAuthError(""); setAuthLoading(true);
    try {
      if (authMode === "register") await createUserWithEmailAndPassword(auth, authEmail, authPassword);
      else await signInWithEmailAndPassword(auth, authEmail, authPassword);
    } catch (e) {
      const msgs = { "auth/email-already-in-use": "このメールアドレスは既に使われています", "auth/invalid-email": "メールアドレスの形式が正しくありません", "auth/weak-password": "パスワードは6文字以上にしてください", "auth/invalid-credential": "メールアドレスまたはパスワードが違います" };
      setAuthError(msgs[e.code] || "エラーが発生しました");
    } finally { setAuthLoading(false); }
  };

  const submitProfile = async () => {
    if (!profileForm.name || !profileForm.severity) return;
    const profile = { ...profileForm, uid: currentUser.uid, createdAt: Date.now() };
    await set(ref(db, `users/${currentUser.uid}`), profile);
    setMyProfile(profile);
    loadAllProfiles(currentUser.uid);
    loadMatches(currentUser.uid);
    setScreen("browse");
  };

  const browsable = allProfiles.filter(p => !matches[p.uid]);
  const currentProfile = browsable[browseIndex];

  const handleSwipe = async (direction) => {
    if (!currentProfile || likeLoading) return;
    setSwipeDir(direction); setLikeLoading(true);
    await new Promise(r => setTimeout(r, 380));
    setSwipeDir(null);
    if (direction === "right") {
      const theirLike = await get(ref(db, `likes/${currentProfile.uid}/${currentUser.uid}`));
      await set(ref(db, `likes/${currentUser.uid}/${currentProfile.uid}`), true);
      if (theirLike.exists()) {
        const matchData = { matchedAt: Date.now() };
        await set(ref(db, `matches/${currentUser.uid}/${currentProfile.uid}`), matchData);
        await set(ref(db, `matches/${currentProfile.uid}/${currentUser.uid}`), matchData);
        setShowMatch(currentProfile);
        setTimeout(() => setShowMatch(null), 2200);
      }
    }
    setBrowseIndex(i => i + 1);
    setLikeLoading(false);
  };

  const toggleArr = (key, val) => setProfileForm(f => ({ ...f, [key]: f[key].includes(val) ? f[key].filter(x => x !== val) : [...f[key], val] }));

  // ── チャット画面は専用コンポーネント ──
  if (screen === "chat" && chatTarget && currentUser && myProfile) {
    return (
      <div style={S.app}>
        <ChatScreen
          currentUser={currentUser}
          myProfile={myProfile}
          chatTarget={chatTarget}
          onBack={() => { setChatTarget(null); setScreen("matches"); }}
        />
      </div>
    );
  }

  // ── AUTH ──
  if (screen === "auth") return (
    <div style={S.app}>
      <div style={{ width: "100%", maxWidth: 400, padding: "48px 20px" }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 52 }}>🌿</div>
          <h1 style={{ fontSize: 30, fontWeight: 800, color: "#3d6b4f", margin: "4px 0 0" }}>AtopiMatch</h1>
          <p style={{ color: "#6b8f71", fontSize: 13, marginTop: 6 }}>アトピーだから、分かり合える。</p>
        </div>
        <div style={S.card}>
          <div style={S.tabRow}>
            <button style={authMode === "login" ? S.tabActive : S.tab} onClick={() => { setAuthMode("login"); setAuthError(""); }}>ログイン</button>
            <button style={authMode === "register" ? S.tabActive : S.tab} onClick={() => { setAuthMode("register"); setAuthError(""); }}>新規登録</button>
          </div>
          <label style={S.label}>メールアドレス</label>
          <input style={{ ...S.input, marginBottom: 12 }} type="email" placeholder="hello@example.com" value={authEmail} onChange={e => setAuthEmail(e.target.value)} />
          <label style={S.label}>パスワード（6文字以上）</label>
          <input style={{ ...S.input, marginBottom: 12 }} type="password" placeholder="••••••••" value={authPassword} onChange={e => setAuthPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAuth()} />
          {authError && <div style={S.errorMsg}>{authError}</div>}
          <button style={S.btn} onClick={handleAuth} disabled={authLoading}>{authLoading ? "処理中..." : authMode === "login" ? "ログイン" : "アカウントを作成"}</button>
        </div>
      </div>
    </div>
  );

  // ── REGISTER ──
  if (screen === "register") return (
    <div style={S.app}>
      <div style={S.page}>
        <div style={S.bar}><span style={S.barTitle}>🌿 プロフィール作成</span><button style={S.ghost} onClick={() => signOut(auth)}>ログアウト</button></div>
        <div style={{ padding: 16, overflowY: "auto", flex: 1 }}>
          <div style={S.card}>
            <label style={S.label}>アバター</label>
            <div style={{ ...S.chips, marginBottom: 14 }}>{AVATARS.map(a => <button key={a} onClick={() => setProfileForm(f => ({ ...f, avatar: a }))} style={{ fontSize: 24, background: profileForm.avatar === a ? "#e8f5e9" : "#f0f7f2", border: profileForm.avatar === a ? "2px solid #52a875" : "2px solid #c8e6c9", borderRadius: 12, padding: "4px 8px", cursor: "pointer" }}>{a}</button>)}</div>
            <label style={S.label}>ニックネーム</label>
            <input style={{ ...S.input, marginBottom: 12 }} placeholder="さくら" value={profileForm.name} onChange={e => setProfileForm(f => ({ ...f, name: e.target.value }))} />
            <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
              <div style={{ flex: 1 }}><label style={S.label}>年齢</label><input style={S.input} type="number" placeholder="25" value={profileForm.age} onChange={e => setProfileForm(f => ({ ...f, age: e.target.value }))} /></div>
              <div style={{ flex: 1 }}><label style={S.label}>地域</label><input style={S.input} placeholder="東京" value={profileForm.location} onChange={e => setProfileForm(f => ({ ...f, location: e.target.value }))} /></div>
            </div>
            <label style={S.label}>症状の重さ</label>
            <div style={{ ...S.chips, marginBottom: 12 }}>{SEVERITY.map(s => <button key={s} style={profileForm.severity === s ? S.chipOn : S.chipOff} onClick={() => setProfileForm(f => ({ ...f, severity: s }))}>{s}</button>)}</div>
            <label style={S.label}>肌タイプ</label>
            <div style={{ ...S.chips, marginBottom: 12 }}>{SKIN_CONDITIONS.map(s => <button key={s} style={profileForm.skinType === s ? S.chipOn : S.chipOff} onClick={() => setProfileForm(f => ({ ...f, skinType: s }))}>{s}</button>)}</div>
            <label style={S.label}>悪化因子（複数可）</label>
            <div style={{ ...S.chips, marginBottom: 12 }}>{TRIGGERS.map(t => <button key={t} style={profileForm.triggers.includes(t) ? S.chipOn : S.chipOff} onClick={() => toggleArr("triggers", t)}>{t}</button>)}</div>
            <label style={S.label}>治療法（複数可）</label>
            <div style={{ ...S.chips, marginBottom: 12 }}>{TREATMENTS.map(t => <button key={t} style={profileForm.treatments.includes(t) ? S.chipOn : S.chipOff} onClick={() => toggleArr("treatments", t)}>{t}</button>)}</div>
            <label style={S.label}>アトピー歴（年）</label>
            <input style={{ ...S.input, marginBottom: 12 }} type="number" placeholder="10" value={profileForm.yearsWithAtopy} onChange={e => setProfileForm(f => ({ ...f, yearsWithAtopy: e.target.value }))} />
            <label style={S.label}>自己紹介</label>
            <textarea style={{ ...S.input, height: 80, resize: "vertical", marginBottom: 16 }} placeholder="アトピーと向き合いながら毎日楽しく過ごしています..." value={profileForm.bio} onChange={e => setProfileForm(f => ({ ...f, bio: e.target.value }))} />
            <button style={S.btn} onClick={submitProfile}>登録する</button>
          </div>
        </div>
      </div>
    </div>
  );

  // ── BROWSE ──
  if (screen === "browse") return (
    <div style={S.app}>
      <div style={S.page}>
        <div style={S.bar}><span style={S.barTitle}>🌿 AtopiMatch</span><button style={S.ghost} onClick={() => signOut(auth)}>退出</button></div>
        {showMatch && (
          <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", background: "#fff", borderRadius: 24, padding: "32px 40px", textAlign: "center", boxShadow: "0 16px 48px rgba(61,107,79,0.2)", zIndex: 100 }}>
            <div style={{ fontSize: 48 }}>{showMatch.avatar}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#52a875", marginTop: 8 }}>マッチしました！💚</div>
            <div style={{ fontSize: 14, color: "#6b8f71", marginTop: 4 }}>{showMatch.name}さんと</div>
          </div>
        )}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "14px 16px 0", overflowY: "auto" }}>
          {!currentProfile || browseIndex >= browsable.length ? (
            <div style={S.empty}>
              <div style={{ fontSize: 52 }}>🌿</div>
              <h3 style={{ color: "#3d6b4f", marginTop: 12 }}>今日はここまで</h3>
              <p style={{ color: "#6b8f71", fontSize: 13 }}>新しい出会いをお待ちください</p>
              <button style={{ ...S.btn, width: "auto", padding: "12px 28px", marginTop: 20 }} onClick={() => setScreen("matches")}>マッチ一覧へ</button>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 13, color: "#6b8f71", marginBottom: 10 }}>残り {browsable.length - browseIndex} 人</div>
              <div style={{ ...S.profileCard, transform: swipeDir === "left" ? "translateX(-130%) rotate(-18deg)" : swipeDir === "right" ? "translateX(130%) rotate(18deg)" : "none", transition: swipeDir ? "transform 0.38s cubic-bezier(.4,0,.2,1)" : "none" }}>
                {swipeDir === "right" && <div style={S.stamp}>LIKE 💚</div>}
                {swipeDir === "left" && <div style={{ ...S.stamp, background: "#ffebee", color: "#e57373", border: "3px solid #e57373" }}>SKIP ✕</div>}
                <div style={{ fontSize: 56, textAlign: "center", marginBottom: 6 }}>{currentProfile.avatar}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#3d6b4f", textAlign: "center" }}>{currentProfile.name} <span style={{ fontSize: 15, fontWeight: 400, color: "#6b8f71" }}>{currentProfile.age}歳</span></div>
                <div style={{ fontSize: 12, color: "#6b8f71", textAlign: "center", marginBottom: 12 }}>📍 {currentProfile.location}</div>
                <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                  {currentProfile.severity && <span style={S.badge}>{currentProfile.severity}</span>}
                  {currentProfile.skinType && <span style={S.badge}>{currentProfile.skinType}</span>}
                  {currentProfile.yearsWithAtopy && <span style={{ ...S.badge, background: "#e8f5e9" }}>歴{currentProfile.yearsWithAtopy}年</span>}
                </div>
                {currentProfile.triggers?.length > 0 && <><div style={S.secLabel}>悪化因子</div><div style={S.chips}>{currentProfile.triggers.map(t => <span key={t} style={S.infoChip}>{t}</span>)}</div></>}
                {currentProfile.treatments?.length > 0 && <><div style={S.secLabel}>治療法</div><div style={S.chips}>{currentProfile.treatments.map(t => <span key={t} style={S.infoChip}>{t}</span>)}</div></>}
                {currentProfile.bio && <p style={{ fontSize: 13, color: "#4a6b54", lineHeight: 1.7, marginTop: 12, padding: 12, background: "#f0f7f2", borderRadius: 12 }}>{currentProfile.bio}</p>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 28, padding: "14px 0" }}>
                <button style={S.nopeBtn} onClick={() => handleSwipe("left")} disabled={likeLoading}>✕</button>
                <div style={{ fontSize: 11, color: "#a8c5b0" }}>タップして選ぼう</div>
                <button style={S.likeBtn} onClick={() => handleSwipe("right")} disabled={likeLoading}>💚</button>
              </div>
            </>
          )}
        </div>
        <div style={S.nav}>
          <button style={{ ...S.navBtn, color: "#52a875", borderTop: "2px solid #52a875" }}>🔍 探す</button>
          <button style={S.navBtn} onClick={() => setScreen("matches")}>💚 マッチ ({Object.keys(matches).length})</button>
          <button style={S.navBtn} onClick={() => setScreen("mypage")}>👤 マイページ</button>
        </div>
      </div>
    </div>
  );

  // ── MATCHES ──
  if (screen === "matches") return (
    <div style={S.app}>
      <div style={S.page}>
        <div style={S.bar}><span style={S.barTitle}>💚 マッチ一覧</span></div>
        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          {Object.keys(matches).length === 0 ? (
            <div style={S.empty}>
              <div style={{ fontSize: 48 }}>💚</div>
              <p style={{ color: "#6b8f71", fontSize: 14, marginTop: 12 }}>まだマッチがありません</p>
              <button style={{ ...S.btn, width: "auto", padding: "12px 28px", marginTop: 16 }} onClick={() => setScreen("browse")}>探しに行く</button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {Object.values(matches).map(m => (
                <div key={m.uid} style={S.matchRow} onClick={() => { setChatTarget(m); setScreen("chat"); }}>
                  <div style={{ fontSize: 36, width: 50, height: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "#f0f7f2", borderRadius: "50%", flexShrink: 0 }}>{m.avatar}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#3d6b4f" }}>{m.name} <span style={{ fontSize: 13, fontWeight: 400, color: "#6b8f71" }}>{m.age}歳</span></div>
                    <div style={{ fontSize: 12, color: "#6b8f71" }}>{m.location} · {m.severity}</div>
                    <div style={{ fontSize: 11, color: "#a8c5b0", marginTop: 2 }}>{new Date(m.matchedAt).toLocaleDateString("ja-JP")} にマッチ</div>
                  </div>
                  <span style={{ fontSize: 20 }}>💬</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={S.nav}>
          <button style={S.navBtn} onClick={() => setScreen("browse")}>🔍 探す</button>
          <button style={{ ...S.navBtn, color: "#52a875", borderTop: "2px solid #52a875" }}>💚 マッチ</button>
          <button style={S.navBtn} onClick={() => setScreen("mypage")}>👤 マイページ</button>
        </div>
      </div>
    </div>
  );

  // ── MYPAGE ──
  if (screen === "mypage") return (
    <div style={S.app}>
      <div style={S.page}>
        <div style={S.bar}><span style={S.barTitle}>👤 マイページ</span><button style={S.ghost} onClick={() => signOut(auth)}>ログアウト</button></div>
        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          {myProfile && (
            <div style={S.card}>
              <div style={{ textAlign: "center", marginBottom: 16 }}>
                <div style={{ fontSize: 64 }}>{myProfile.avatar}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#3d6b4f" }}>{myProfile.name}</div>
                <div style={{ fontSize: 13, color: "#6b8f71" }}>{myProfile.age}歳 · {myProfile.location}</div>
              </div>
              <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                {myProfile.severity && <span style={S.badge}>{myProfile.severity}</span>}
                {myProfile.skinType && <span style={S.badge}>{myProfile.skinType}</span>}
                {myProfile.yearsWithAtopy && <span style={{ ...S.badge, background: "#e8f5e9" }}>歴{myProfile.yearsWithAtopy}年</span>}
              </div>
              {myProfile.triggers?.length > 0 && <><div style={S.secLabel}>悪化因子</div><div style={S.chips}>{myProfile.triggers.map(t => <span key={t} style={S.infoChip}>{t}</span>)}</div></>}
              {myProfile.treatments?.length > 0 && <><div style={S.secLabel}>治療法</div><div style={S.chips}>{myProfile.treatments.map(t => <span key={t} style={S.infoChip}>{t}</span>)}</div></>}
              {myProfile.bio && <p style={{ fontSize: 13, color: "#4a6b54", lineHeight: 1.7, marginTop: 10, padding: 12, background: "#f0f7f2", borderRadius: 12 }}>{myProfile.bio}</p>}
              <button style={{ ...S.btn, marginTop: 16 }} onClick={() => { setProfileForm(myProfile); setScreen("register"); }}>プロフィールを編集</button>
            </div>
          )}
        </div>
        <div style={S.nav}>
          <button style={S.navBtn} onClick={() => setScreen("browse")}>🔍 探す</button>
          <button style={S.navBtn} onClick={() => setScreen("matches")}>💚 マッチ</button>
          <button style={{ ...S.navBtn, color: "#52a875", borderTop: "2px solid #52a875" }}>👤 マイページ</button>
        </div>
      </div>
    </div>
  );
}

const S = {
  app: { minHeight: "100vh", background: "#f0f7f2", fontFamily: "'Hiragino Sans','Yu Gothic',sans-serif", display: "flex", justifyContent: "center" },
  page: { width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", minHeight: "100vh" },
  card: { background: "#fff", borderRadius: 20, padding: 24, boxShadow: "0 4px 24px rgba(61,107,79,0.08)" },
  tabRow: { display: "flex", marginBottom: 16, borderRadius: 12, overflow: "hidden", border: "1.5px solid #c8e6c9" },
  tab: { flex: 1, padding: "10px 0", background: "transparent", border: "none", color: "#6b8f71", fontSize: 14, cursor: "pointer" },
  tabActive: { flex: 1, padding: "10px 0", background: "#52a875", border: "none", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" },
  label: { display: "block", fontSize: 12, fontWeight: 700, color: "#3d6b4f", marginBottom: 6 },
  input: { width: "100%", border: "1.5px solid #c8e6c9", borderRadius: 10, padding: "10px 14px", fontSize: 14, color: "#2d4a35", background: "#f0f7f2", boxSizing: "border-box", outline: "none" },
  btn: { width: "100%", background: "#52a875", color: "#fff", border: "none", borderRadius: 14, padding: "14px 0", fontSize: 15, fontWeight: 700, cursor: "pointer" },
  errorMsg: { background: "#ffebee", color: "#c62828", borderRadius: 10, padding: "10px 14px", fontSize: 13, marginBottom: 12 },
  chips: { display: "flex", flexWrap: "wrap", gap: 7 },
  chipOn: { background: "#52a875", border: "1.5px solid #52a875", color: "#fff", borderRadius: 20, padding: "5px 13px", fontSize: 12, cursor: "pointer", fontWeight: 700 },
  chipOff: { background: "#f0f7f2", border: "1.5px solid #c8e6c9", color: "#6b8f71", borderRadius: 20, padding: "5px 13px", fontSize: 12, cursor: "pointer" },
  bar: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", background: "#fff", boxShadow: "0 1px 8px rgba(61,107,79,0.07)", flexShrink: 0 },
  barTitle: { fontSize: 17, fontWeight: 800, color: "#3d6b4f" },
  ghost: { background: "none", border: "1px solid #c8e6c9", borderRadius: 10, padding: "5px 12px", fontSize: 12, color: "#6b8f71", cursor: "pointer" },
  profileCard: { background: "#fff", borderRadius: 24, padding: 22, width: "100%", maxWidth: 370, boxShadow: "0 8px 32px rgba(61,107,79,0.12)", marginBottom: 6, position: "relative", overflow: "hidden" },
  stamp: { position: "absolute", top: 20, right: 20, background: "#e8f5e9", color: "#52a875", border: "3px solid #52a875", borderRadius: 10, padding: "4px 12px", fontWeight: 800, fontSize: 14, transform: "rotate(10deg)" },
  badge: { background: "#f0f7f2", color: "#3d6b4f", borderRadius: 20, padding: "4px 11px", fontSize: 11, fontWeight: 700 },
  secLabel: { fontSize: 11, fontWeight: 700, color: "#6b8f71", marginBottom: 5, marginTop: 10 },
  infoChip: { background: "#f0f7f2", color: "#6b8f71", borderRadius: 20, padding: "3px 11px", fontSize: 11, border: "1px solid #c8e6c9" },
  nopeBtn: { width: 58, height: 58, borderRadius: "50%", background: "#fff", border: "2px solid #ffccbc", color: "#e57373", fontSize: 22, cursor: "pointer", boxShadow: "0 4px 12px rgba(0,0,0,0.07)" },
  likeBtn: { width: 58, height: 58, borderRadius: "50%", background: "#52a875", border: "none", color: "#fff", fontSize: 22, cursor: "pointer", boxShadow: "0 4px 14px rgba(82,168,117,0.35)" },
  empty: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 40, textAlign: "center" },
  matchRow: { background: "#fff", borderRadius: 16, padding: "14px 16px", display: "flex", alignItems: "center", gap: 14, boxShadow: "0 2px 12px rgba(61,107,79,0.06)", cursor: "pointer" },
  nav: { display: "flex", borderTop: "1px solid #e8f5e9", background: "#fff", flexShrink: 0 },
  navBtn: { flex: 1, padding: "12px 0", background: "none", border: "none", borderTop: "2px solid transparent", color: "#6b8f71", fontSize: 12, cursor: "pointer" },
};

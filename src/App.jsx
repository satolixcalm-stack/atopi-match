import { useState, useEffect, useRef } from "react";
import { db, auth, storage } from "./firebase.js";
import { ref, set, get, onValue,off, push, remove, update } from "firebase/database";
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, sendEmailVerification } from "firebase/auth";
import ChatScreen from "./ChatScreen.jsx";
import TimelinePost from "./TimelinePost.jsx";
import NavBar from "./NavBar.jsx";

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

// ──────────────────────────────────────────────────────────
// AvatarImg コンポーネント（画像・絵文字 両対応）
//
// 表示の優先順位：
//   1. avatarUrl（画像URL）が有効な文字列 → 丸い写真
//   2. emoji（絵文字）がある              → 丸い枠に絵文字
//   3. どちらもない                       → デフォルト絵文字 🌿
//
// 使い方：
//   <AvatarImg avatarUrl={p.avatarUrl} emoji={p.avatar} size={50} />
// ──────────────────────────────────────────────────────────
function AvatarImg({ avatarUrl, emoji, size = 48 }) {
  // avatarUrl が空文字・null・undefined でなければ画像を表示
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt="avatar"
        onError={e => {
          // 画像の読み込みに失敗したら非表示にして絵文字を見せる
          e.target.style.display = "none";
        }}
        style={{
          width: size, height: size, borderRadius: "50%",
          objectFit: "cover", border: "2px solid #c8e6c9",
          background: "#f0f7f2", flexShrink: 0,
        }}
      />
    );
  }
  // 画像がない場合は絵文字を丸枠で表示
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: "#f0f7f2", border: "2px solid #c8e6c9",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.48, flexShrink: 0, userSelect: "none",
    }}>
      {emoji || "🌿"}
    </div>
  );
}

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
function PostDetailLoader({
  postId,
  ownerUid,
  currentUser,
  onClickUser,
  onBack,
  highlightedPostId,
  clearHighlight
}) {
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!postId || !ownerUid) {
      setLoading(false);
      return;
    }
    // FirebaseからownerUidの投稿を取得
    get(ref(db, "timeline/" + ownerUid + "/" + postId))
      .then(snap => {
        if (snap.exists()) {
          setPost({ id: postId, ...snap.val() });
        }
        setLoading(false);
      });
  }, [postId, ownerUid]);

  if (loading) return (
    <div style={{ textAlign:"center", color:"#6b8f71", marginTop:40 }}>
      <div style={{ fontSize:32 }}>🌿</div>
      <p>読み込み中...</p>
    </div>
  );

  if (!post) return (
    <div style={{ textAlign:"center", color:"#6b8f71", marginTop:40 }}>
      <div style={{ fontSize:40 }}>🌿</div>
      <p>投稿が見つかりませんでした</p>
      <button style={{ marginTop:12, padding:"10px 24px", background:"#52a875",
        color:"#fff", border:"none", borderRadius:14, cursor:"pointer", fontWeight:700 }}
        onClick={onBack}>マイページへ戻る</button>
    </div>
  );

  return (
    <div style={{ background:"#fff", borderRadius:20, padding:16,
      boxShadow:"0 4px 24px rgba(61,107,79,0.08)" }}>
      <TimelinePost
  post={post}
  ownerUid={ownerUid}
  currentUser={currentUser}
  onClickUser={onClickUser}
  canDelete={false}
  highlightedPostId={highlightedPostId} // ← ★追加
  clearHighlight={clearHighlight} // ← ★追加
/>
    </div>
  );
}

 // リスナーを管理するためのMap（関数の外に定義）
const chatListeners = {};

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
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelinePage, setTimelinePage] = useState(0);
  const [expandedUid, setExpandedUid] = useState(null);
  const [myLikes, setMyLikes] = useState({});
  const [profileTimelines, setProfileTimelines] = useState({});
  const [profileTimelinePages, setProfileTimelinePages] = useState({});
  const [usersCache, setUsersCache] = useState({});
  const [viewProfile, setViewProfile] = useState(null);
useEffect(() => {
  if (!viewProfile?.uid) return;

  loadProfileTimeline(viewProfile.uid);
}, [viewProfile?.uid]);
  const [highlightedPostId, setHighlightedPostId] = useState(null);
  const [toast, setToast] = useState(null);
  const [showTutorial, setShowTutorial] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [visibleCount, setVisibleCount] = useState(5);
  const [filterMode, setFilterMode] = useState("all");
  const [unreadChats, setUnreadChats] = useState({});
  const chatListenersRef = useRef({});
  const [selectedPostId, setSelectedPostId] = useState(null);
  const [hoveredUid, setHoveredUid] = useState(null);

  // ── アバター用 state
  const [avatarFile, setAvatarFile] = useState(null);       // 選択中の画像ファイル
  const [avatarPreview, setAvatarPreview] = useState(null); // プレビュー用 ObjectURL
  const [avatarSaving, setAvatarSaving] = useState(false);  // 保存中フラグ

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
      
          if (!localStorage.getItem('seenTutorial')) setShowTutorial(true);
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
useEffect(() => {
  if (!currentUser?.uid) return;

  console.log("🔔 リスナー登録:", currentUser.uid); // 何回呼ばれるか確認

  const notifRef = ref(db, "notifications/" + currentUser.uid);
  const unsubscribe = onValue(notifRef, (snap) => {
    console.log("🔔 onValue発火, exists:", snap.exists(), "件数:", snap.size); // sizeで確認
    if (!snap.exists()) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }
    const rawList = [];
snap.forEach(c => {
  rawList.push({ ...c.val(), id: c.key });
});

// 🔥 グルーピング
const grouped = {};
rawList.forEach(n => {
  const key = `${n.type}_${n.fromUserId}_${n.postId || "noPost"}`;

 if (!grouped[key]) {
  grouped[key] = {
    ...n,
    count: 1,
    latestCreatedAt: n.createdAt,
    groupKey: key,
    read: n.read  // ← 最初の通知のreadをそのまま使う
  };
} else {
  grouped[key].count += 1;

  // 1つでも未読があればグループ全体を未読にする
  grouped[key].read = grouped[key].read && n.read;

  if (n.createdAt > grouped[key].latestCreatedAt) {
    grouped[key] = {
      ...grouped[key],
      ...n,
      count: grouped[key].count,
      latestCreatedAt: n.createdAt,
      groupKey: key,
      read: grouped[key].read  // ← readは上で計算した値を保持
    };
  }
}
});

// 配列化
const list = Object.values(grouped)
  .sort((a, b) => b.latestCreatedAt - a.latestCreatedAt);

setNotifications(list);
console.log("grouped未読数:", Object.values(grouped).filter(n => !n.read).length);
console.log("grouped一覧:", Object.values(grouped).map(n => ({ type: n.type, read: n.read })));
setUnreadCount(Object.values(grouped).filter(n => !n.read).length);
  });

  return () => unsubscribe();
}, [currentUser?.uid]);
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
    if (!snap.exists()) {
      setMyTimeline([]);
      return;
    }

    const list = [];

    snap.forEach(c => {
      const val = c.val();

      if (val && (val.text || val.imageUrl)) {
        list.push({
          ...val,
          id: c.key // 🔥 必ず最後に入れる
        });
      }
    });

    setMyTimeline(list.slice().reverse());
  });
};

  const loadProfileTimeline = async (uid, forceReload = false) => {
    if (profileTimelines[uid] && !forceReload) return;
    const snap = await get(ref(db, "timeline/" + uid));
    const list = [];
    if (snap.exists()) snap.forEach(c => {
      const val = c.val();
      if (val && (val.text || val.imageUrl)) list.push({ id: c.key, ...val });
    });
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

  // ── Storage にアバター画像をアップロードして URL を返す
  const uploadAvatar = async (uid, file) => {
    if (file.size > 1024 * 1024) throw new Error("画像は1MB以下にしてください");
    const fileRef = storageRef(storage, `avatars/${uid}/avatar.jpg`);
    await uploadBytes(fileRef, file);
    return await getDownloadURL(fileRef);
  };

  // ──────────────────────────────────────────────────────────
  // プロフィール登録・更新
  //
  // ルール：
  //   ・画像ファイルを選択した → avatarUrl に URL を保存、avatar（絵文字）も保持
  //   ・絵文字を選択した       → avatarUrl を "" にして絵文字だけで表示
  // ──────────────────────────────────────────────────────────
  const submitProfile = async () => {
  // ── 必須チェック
  if (!profileForm.name || !profileForm.severity) {
    alert("ニックネームと症状の重さは必須です");
    return;
  }

  // ── 年齢チェック（任意入力）
  const ageStr = profileForm.age; // ← 必ず文字列で管理
  const ageNum = Number(ageStr);

  if (ageStr) {
    // 数字チェック
    if (!/^\d+$/.test(ageStr)) {
      alert("年齢は数字で入力してください");
      return;
    }

    // 範囲チェック
    if (ageNum < 18 || ageNum > 100) {
      alert("年齢は18〜100歳で入力してください");
      return;
    }
  }

  // ── アバター画像処理
  let avatarUrl = profileForm.avatarUrl || "";

  if (avatarFile) {
    try {
      avatarUrl = await uploadAvatar(currentUser.uid, avatarFile);
    } catch (e) {
      alert(e.message);
      return;
    }
  }

  // ── プロフィールデータ作成
  const profile = {
    ...profileForm,
    age: ageStr, // ← 文字列のまま保存でOK
    uid: currentUser.uid,
    createdAt: Date.now(),
    avatarUrl
  };

  try {
    // ── DB保存
    await set(ref(db, "users/" + currentUser.uid), profile);

    // ── state更新
    setMyProfile(profile);
    setAvatarFile(null);
    setAvatarPreview(null);

    // ── データ再取得
    loadAllProfiles(currentUser.uid);
    loadMatches(currentUser.uid);
    loadMyTimeline(currentUser.uid);

    // ── 画面遷移
// 🔥 初回ユーザーは必ずチュートリアル出す
localStorage.removeItem('seenTutorial');

setScreen("browse");

setTimeout(() => {
  setShowTutorial(true);
}, 0);
    
    setScreen("browse");

  } catch (e) {
    alert("プロフィール登録に失敗しました");
    console.error(e);
  }
};
const formatTime = (ts) => {
  const diff = Date.now() - ts;

  if (diff < 60000) return "たった今";
  if (diff < 3600000) return Math.floor(diff / 60000) + "分前";
  if (diff < 86400000) return Math.floor(diff / 3600000) + "時間前";

  return new Date(ts).toLocaleDateString();
};
  // ──────────────────────────────────────────────────────────
  // 「絵文字に戻す」：DB の avatarUrl を "" にするだけ
  // ──────────────────────────────────────────────────────────
  const resetToEmoji = async () => {
    if (!window.confirm("画像を削除して絵文字アバターに戻しますか？")) return;
    try {
      await set(ref(db, `users/${currentUser.uid}/avatarUrl`), "");
      setMyProfile(prev => ({ ...prev, avatarUrl: "" }));
      setAvatarPreview(null);
      showToast(`${myProfile.avatar || "🌿"} 絵文字に戻しました`);
    } catch (e) {
      alert("エラー: " + e.message);
    }
  };

  const postTimeline = async () => {
  if (!timelineInput.trim() && !imageFile) return;
  if (timelineLoading) return;

  setTimelineLoading(true);

  try {
    let imageUrl = null;
    let imagePath = null;

    // 🔥 pushでID生成（これが正）
    const newRef = push(ref(db, "timeline/" + currentUser.uid));
    const postId = newRef.key;

    if (imageFile) {
      if (imageFile.size > 3 * 1024 * 1024) {
        alert("画像は3MB以下にしてください");
        setTimelineLoading(false);
        return;
      }

      const fileName = Date.now() + "_" + imageFile.name;

      // 🔥 DBのIDと完全一致させる
      imagePath = `timelineImages/${currentUser.uid}/${postId}/${fileName}`;

      const fileRef = storageRef(storage, imagePath);
      await uploadBytes(fileRef, imageFile);
      imageUrl = await getDownloadURL(fileRef);
    }

    const postData = {
      text: timelineInput.trim(),
      createdAt: Date.now(),
      imageUrl: imageUrl || null,
      imagePath: imagePath || null
    };

    // 🔥 pushじゃなくset
    await set(newRef, postData);

    setTimelineInput("");
    setImageFile(null);
    setImagePreview(null);

  } catch (e) {
    console.error(e);
    alert("投稿に失敗しました: " + e.message);
  } finally {
    setTimelineLoading(false);
  }
};
 const deleteTimeline = async (ownerUid, id, imagePath) => {
  if (!window.confirm("この投稿を削除しますか？")) return;

  try {
    console.log("削除UID:", ownerUid);
    console.log("削除ID:", id);

    // Storage削除
    if (imagePath) {
      try {
        await deleteObject(storageRef(storage, imagePath));
        console.log("画像削除OK");
      } catch (e) {
        console.warn("Storage削除失敗:", e.message);
      }
    }

    // 🔥 UIDを明示して削除（これが重要）
    await remove(ref(db, `timeline/${ownerUid}/${id}`));

    console.log("削除成功");

  } catch (e) {
    console.error("削除エラー:", e);
    alert("削除に失敗しました");
  }
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





const loadUnreadChats = (matchesData) => {
  if (!currentUser?.uid) return;

  // 🔥 初期化（これが重要）
  setUnreadChats({});

  // 🔥 既存リスナー全削除
  Object.entries(chatListenersRef.current).forEach(([chatId, callback]) => {
  off(ref(db, "chats/" + chatId + "/messages"), "value", callback);
});
chatListenersRef.current = {};
  Object.values(matchesData).forEach(m => {
    if (!m.uid) return;

    const chatId = [currentUser.uid, m.uid].sort().join("_");
    const chatRef = ref(db, "chats/" + chatId + "/messages");

    const callback = (snap) => {
      if (!snap.exists()) {
  setUnreadChats(prev => {
    if (prev[m.uid] === false) return prev;
    return { ...prev, [m.uid]: false };
  });
  return;
}
      const msgs = Object.values(snap.val() || {}).filter(Boolean);

      const isViewing = chatTarget?.uid === m.uid;

const unread = !isViewing && msgs.some(
  msg => msg.senderUid !== currentUser.uid && msg.read !== true
);

      setUnreadChats(prev => {
  if (prev[m.uid] === unread) return prev;

  return {
    ...prev,
    [m.uid]: unread
  };
});
    };

    onValue(chatRef, callback);

    // 🔥 リスナー保存
    chatListenersRef.current[chatId] = callback;
  });
};
  const sendLike = async (target) => {
    if (matches[target.uid]) return { type: "none" };
    if (myLikes[target.uid]) {
      await remove(ref(db, "likes/" + currentUser.uid + "/" + target.uid));
      setMyLikes(prev => ({ ...prev, [target.uid]: false }));
      return { type: "removed" };
    }
    const theirLike = await get(ref(db, "likes/" + target.uid + "/" + currentUser.uid));
    await set(ref(db, "likes/" + currentUser.uid + "/" + target.uid), true);
    setMyLikes(prev => ({ ...prev, [target.uid]: true }));
    if (theirLike.exists()) {
      const matchData = { matchedAt: Date.now() };
      await set(ref(db, "matches/" + currentUser.uid + "/" + target.uid), matchData);
      await set(ref(db, "matches/" + target.uid + "/" + currentUser.uid), matchData);
      const myNotifsSnap = await get(ref(db, "notifications/" + currentUser.uid));
      if (myNotifsSnap.exists()) {
        for (const [id, n] of Object.entries(myNotifsSnap.val())) {
          if ((n.type === "like" || n.type === "profile_like") && n.fromUserId === target.uid)
            await remove(ref(db, "notifications/" + currentUser.uid + "/" + id));
        }
      }
      const theirNotifsSnap = await get(ref(db, "notifications/" + target.uid));
      if (theirNotifsSnap.exists()) {
        for (const [id, n] of Object.entries(theirNotifsSnap.val())) {
          if ((n.type === "like" || n.type === "profile_like") && n.fromUserId === currentUser.uid)
            await remove(ref(db, "notifications/" + target.uid + "/" + id));
        }
      }
      loadAllProfiles(currentUser.uid);
      return { type: "match" };
    } else {
      const existingSnap = await get(ref(db, "notifications/" + target.uid));
      let alreadySent = false;
      if (existingSnap.exists()) {
        existingSnap.forEach(c => {
          const n = c.val();
          if (n.type === "profile_like" && n.fromUserId === currentUser.uid) alreadySent = true;
        });
      }
      if (!alreadySent) {
        await push(ref(db, "notifications/" + target.uid), {
          type: "profile_like", fromUserId: currentUser.uid,
          fromUserName: myProfile.name, fromUserAvatar: myProfile.avatar,
          read: false, createdAt: Date.now()
        });
      }
      loadAllProfiles(currentUser.uid);
      return { type: "like" };
    }
  };

 useEffect(() => {
  if (!currentUser?.uid) return;

  // 🔥 既存リスナー全部削除
  Object.entries(chatListenersRef.current).forEach(([chatId, callback]) => {
    off(ref(db, "chats/" + chatId + "/messages"), "value", callback);
  });
  chatListenersRef.current = {};

  Object.values(matches).forEach(m => {
    if (!m.uid) return;

    const chatId = [currentUser.uid, m.uid].sort().join("_");
    const chatRef = ref(db, "chats/" + chatId + "/messages");

    const callback = (snap) => {
      if (!snap.exists()) {
        setUnreadChats(prev => ({ ...prev, [m.uid]: false }));
        return;
      }

      const msgs = Object.values(snap.val() || {}).filter(Boolean);

      const isViewing = chatTarget?.uid === m.uid;

      const unread = !isViewing && msgs.some(
        msg => msg.senderUid !== currentUser.uid && msg.read !== true
      );

      setUnreadChats(prev => ({
        ...prev,
        [m.uid]: unread
      }));
    };

    onValue(chatRef, callback);

    // 🔥 リスナー保存
    chatListenersRef.current[chatId] = callback;
  });

  return () => {
    Object.entries(chatListenersRef.current).forEach(([chatId, callback]) => {
      off(ref(db, "chats/" + chatId + "/messages"), "value", callback);
    });
    chatListenersRef.current = {};
  };

}, [currentUser?.uid, matches, chatTarget]);

  const toggleExpand = (uid) => {
    if (expandedUid === uid) { setExpandedUid(null); }
    else { setExpandedUid(uid); loadProfileTimeline(uid); }
  };

  const handleClickUser = async (uid) => {
    if (uid === currentUser.uid) { setScreen("mypage"); return; }
    const snap = await get(ref(db, "users/" + uid));
    if (snap.exists()) {
      setViewProfile({ uid, ...snap.val() });
      loadProfileTimeline(uid);
      setScreen("viewProfile");
    }
  };

  const markAsRead = async (n) => {
  if (n.read) return;

  const snap = await get(ref(db, "notifications/" + currentUser.uid));
  if (!snap.exists()) return;

  const updates = {};
  snap.forEach(c => {
    const val = c.val();
    const key = `${val.type}_${val.fromUserId}_${val.postId || "noPost"}`;
    if (key === n.groupKey && !val.read) {
      updates[`notifications/${currentUser.uid}/${c.key}/read`] = true;
    }
  });

  if (Object.keys(updates).length > 0) {
    await update(ref(db, "/"), updates);
  }
};

  

  // ↓ この関数をまるごと差し替える
const handleNotificationClick = async (n) => {
  await markAsRead(n);

  if (n.type === "profile_like" || n.type === "like") {
    const snap = await get(ref(db, "users/" + n.fromUserId));
    if (!snap.exists()) return;
    setViewProfile({ uid: n.fromUserId, ...snap.val() });
    await loadProfileTimeline(n.fromUserId, true);
    setScreen("viewProfile");

  } else if (n.type === "comment") {

    // 🔥 DOMで「見えてるか」判定
    const el = document.getElementById(`post-${n.postId}`);
    const isVisible = !!el;

    if (n.targetType === "comment") {
      // 返信 → 常に詳細
      if (n.postId) {
        setSelectedPostId(n.postId);
        setHighlightedPostId(n.postId);
        setScreen("postDetail");
      }

    } else {
      // 投稿コメント

      if (isVisible) {
        // 見えてる → スクロール
        setHighlightedPostId(null);
        setScreen("mypage");

        setTimeout(() => {
          setHighlightedPostId(n.postId);
        }, 0);

      } else {
        // 🔥 見えてない → 詳細
        setSelectedPostId(n.postId);
        setHighlightedPostId(n.postId);
        setScreen("postDetail");
      }
    }

  } else if (n.type === "post_like") {
    setHighlightedPostId(null);
    setScreen("mypage");

    if (n.postId) {
      setTimeout(() => setHighlightedPostId(n.postId), 0);
    }
  }
};

  const toggleArr = (key, val) => setProfileForm(f => ({
    ...f, [key]: f[key].includes(val) ? f[key].filter(x => x !== val) : [...f[key], val]
  }));

  const sortedProfiles = myProfile
    ? allProfiles.map(p => ({ ...p, ...calcScore(myProfile, p) })).sort((a, b) => b.score - a.score)
    : allProfiles;

  const filteredProfiles = sortedProfiles
    .filter(p => {
      if (matches[p.uid]) return false;
      if (filterMode === "liked") return !!myLikes[p.uid];
      return true;
    })
    .sort((a, b) => (myLikes[b.uid] ? 1 : 0) - (myLikes[a.uid] ? 1 : 0));

  const tutorialEl = showTutorial ? (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center" }}>
      <div style={{ background:"#fff",borderRadius:24,padding:"32px 28px",maxWidth:320,margin:"0 16px",textAlign:"center",boxShadow:"0 16px 48px rgba(0,0,0,0.2)" }}>
        <div style={{ fontSize:52,marginBottom:12 }}>🌿</div>
        <h2 style={{ fontSize:18,fontWeight:800,color:"#3d6b4f",marginBottom:12 }}>AtopiMatchへようこそ</h2>
        <p style={{ fontSize:14,color:"#6b8f71",lineHeight:1.8,marginBottom:20 }}>
          このアプリは、<br/><strong>「共感 → マッチ → チャット」</strong>でつながります。<br/><br/>
          <span style={{ fontSize:13 }}>① 気になる人に「共感」する<br/>② お互いに共感すると「マッチ」<br/>③ マッチすると「チャット」ができます</span><br/><br/>
          まずは気になる人に共感してみましょう🌿
        </p>
        <button onClick={() => { setShowTutorial(false); localStorage.setItem('seenTutorial','1'); }}
          style={{ width:"100%",background:"#52a875",color:"#fff",border:"none",borderRadius:14,padding:"14px 0",fontSize:15,fontWeight:700,cursor:"pointer" }}>
          はじめる 💚
        </button>
      </div>
    </div>
  ) : null;

  const showNav = ["browse","matches","mypage","viewProfile","postDetail"].includes(screen);

  const totalUnreadChats = Object.values(unreadChats).filter(Boolean).length;
                                                 
  const toastEl = toast ? (
    <div style={{ position:"fixed",bottom:80,left:"50%",transform:"translateX(-50%)",background:"#2d4a35",color:"#fff",borderRadius:20,padding:"10px 20px",fontSize:13,fontWeight:700,zIndex:150,whiteSpace:"nowrap",boxShadow:"0 4px 16px rgba(0,0,0,0.2)" }}>
      {toast}
    </div>
  ) : null;

  // ── viewProfile ──────────────────────────────────────────
 // ↓ ここから追加（viewProfile の if 文の直前）

if (screen === "postDetail") {

  return (
    <div style={S.app}><div style={S.page}>
      <div style={S.bar}>
        <button style={S.ghost} onClick={() => {
          setSelectedPostId(null);
          setScreen("mypage");
        }}>← 戻る</button>
        <span style={S.barTitle}>📝 投稿の詳細</span>
        <div style={{ width: 60 }} />
      </div>
      <div style={{ flex:1, overflowY:"auto", padding:16 }}>
      <PostDetailLoader
  postId={selectedPostId}
  ownerUid={notifications.find(n => n.postId === selectedPostId)?.ownerUid}
  currentUser={currentUser}
  onClickUser={handleClickUser}
  onBack={() => { setSelectedPostId(null); setScreen("mypage"); }}
  highlightedPostId={highlightedPostId} // ← ★追加
  clearHighlight={() => setHighlightedPostId(null)} // ← ★追加
/>
      </div>
    {showNav && <NavBar screen={screen} setScreen={setScreen} matches={matches} unreadCount={unreadCount} totalUnreadChats={totalUnreadChats} />}
    </div></div>
  );
}

// ↑ ここまで追加
  if (screen === "viewProfile" && !viewProfile) {
    return <div style={{ padding:20,textAlign:"center",color:"#6b8f71" }}>読み込み中...</div>;
  }
  if (screen === "viewProfile") {
    const tl = profileTimelines[viewProfile.uid] || [];
    const tlPage = profileTimelinePages[viewProfile.uid] || 0;
    return (
      <div style={S.app}><div style={S.page}>
        <div style={S.bar}>
          <button style={S.ghost} onClick={() => { setViewProfile(null); setScreen("browse"); }}>← 戻る</button>
          <span style={S.barTitle}>{viewProfile.name}さん</span>
          <div style={{ width:60 }} />
        </div>
        <div style={{ flex:1,overflowY:"auto",padding:16,display:"flex",flexDirection:"column",gap:14 }}>
          <div
  onMouseEnter={() => setHoveredUid("profile-main")}
  onMouseLeave={() => setHoveredUid(null)}
  style={hoverStyle("profile-main")}
>
            <div style={{ textAlign:"center",marginBottom:16 }}>
              <div style={{ display:"flex",justifyContent:"center",marginBottom:8 }}>
                <AvatarImg avatarUrl={viewProfile.avatarUrl} emoji={viewProfile.avatar} size={96} />
              </div>
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
            {viewProfile.uid !== currentUser.uid && !matches[viewProfile.uid] && (
              <button onClick={async () => { const r = await sendLike(viewProfile); if (r.type==="match") showToast("🎉 マッチしました！"); else if (r.type==="like") showToast("🌿 共感しました"); }}
                style={{ width:"100%",marginTop:16,padding:"12px 0",borderRadius:14,fontSize:14,fontWeight:700,cursor:"pointer",
                  background: myLikes[viewProfile.uid] ? "#d4edda" : "#f0f0f0",
                  color: myLikes[viewProfile.uid] ? "#2e7d32" : "#666",
                  border: myLikes[viewProfile.uid] ? "1px solid #4caf50" : "1px solid #ccc" }}>
                {myLikes[viewProfile.uid] ? "🌿 共感済" : "🌿 共感する"}
              </button>
            )}
            {matches[viewProfile.uid] && (
              <>
                <div style={{ width:"100%",marginTop:16,padding:"12px 0",borderRadius:14,fontSize:14,fontWeight:700,textAlign:"center",background:"#ffebee",color:"#e57373",border:"1px solid #f48fb1" }}>❤️ マッチ済</div>
                <button onClick={() => { setChatTarget(matches[viewProfile.uid]); setScreen("chat"); }} style={{ ...S.btn,marginTop:8,padding:"12px 0",fontSize:14 }}>💬 チャット</button>
              </>
            )}
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
        {toastEl}
         {showNav && <NavBar screen={screen} setScreen={setScreen} matches={matches} unreadCount={unreadCount} totalUnreadChats={totalUnreadChats} />}
      </div></div>
    );
  }

  if (screen === "chat" && (!chatTarget || !currentUser || !myProfile)) { setScreen("matches"); return null; }
  if (screen === "chat") return (
    <div style={S.app}>
     <ChatScreen currentUser={currentUser} myProfile={myProfile} chatTarget={chatTarget}
  commons={myProfile ? calcScore(myProfile, chatTarget).commons : []}
  setScreen={setScreen}
  setViewProfile={setViewProfile}
  onBack={() => {
    setChatTarget(null);
    setScreen("matches");
    if (Object.keys(matches).length > 0) loadUnreadChats(matches);
  }} />
    </div>
  );

  if (verificationSent) return (
    <div style={S.app}><div style={{ width:"100%",maxWidth:400,padding:"48px 20px" }}>
      <div style={{ textAlign:"center",marginBottom:28 }}>
        <div style={{ fontSize:52 }}>🌿</div>
        <h1 style={{ fontSize:30,fontWeight:800,color:"#3d6b4f",margin:"4px 0 0" }}>AtopiMatch</h1>
      </div>
      <div style={S.card}>
        <div style={{ textAlign:"center",marginBottom:20 }}>
          <div style={{ fontSize:48,marginBottom:12 }}>📧</div>
          <h2 style={{ fontSize:18,fontWeight:800,color:"#3d6b4f",margin:"0 0 8px" }}>確認メールを送りました</h2>
          <p style={{ color:"#6b8f71",fontSize:14,lineHeight:1.7 }}><strong>{authEmail}</strong> に確認メールを送りました。<br/>メール内のリンクをクリックしてから、ログインしてください。</p>
        </div>
        <button style={S.btn} onClick={() => { setVerificationSent(false); setAuthMode("login"); }}>ログイン画面へ</button>
      </div>
    </div></div>
  );

  // ── auth ─────────────────────────────────────────────────
  if (screen === "auth") return (
    <div style={S.app}>
      {tutorialEl}
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
          <button onClick={() => setShowTutorial(true)} style={{ width:"100%",marginTop:10,background:"transparent",border:"none",color:"#52a875",fontSize:13,cursor:"pointer" }}>使い方を見る 🌿</button>
        </div>
      </div>
    </div>
  );

  // ── register ─────────────────────────────────────────────
  if (screen === "register") return (
    <div style={S.app}><div style={S.page}>
      <div style={S.bar}><span style={S.barTitle}>🌿 プロフィール作成</span><button style={S.ghost} onClick={() => signOut(auth)}>ログアウト</button></div>
      <div style={{ padding:16,overflowY:"auto",flex:1 }}>
        <div style={S.card}>

          {/* ────────────────────────────────────────
              アバター選択エリア
          ──────────────────────────────────────── */}
          <label style={S.label}>アバター</label>

          {/* プレビュー + 現在の状態表示 */}
          <div style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:10,marginBottom:16,padding:"16px 0",background:"#f0f7f2",borderRadius:12 }}>
            {/* 選択中の状態をリアルタイムでプレビュー */}
            {avatarPreview
              ? <img src={avatarPreview} alt="プレビュー" style={{ width:88,height:88,borderRadius:"50%",objectFit:"cover",border:"2px solid #52a875" }} />
              : <AvatarImg avatarUrl={profileForm.avatarUrl} emoji={profileForm.avatar} size={88} />
            }
            {/* どちらが有効か表示 */}
            <div style={{ fontSize:11,color:"#6b8f71",fontWeight:700 }}>
              {avatarPreview ? "📷 画像を選択中（未保存）"
                : profileForm.avatarUrl ? "📷 画像アバター"
                : `${profileForm.avatar} 絵文字アバター`}
            </div>
            {/* 画像選択 */}
            <label style={{ cursor:"pointer",background:"#fff",border:"1.5px solid #c8e6c9",borderRadius:10,padding:"6px 16px",fontSize:12,fontWeight:700,color:"#52a875" }}>
              📷 画像を選択（1MB以下）
              <input type="file" accept="image/*" style={{ display:"none" }}
                onChange={e => {
                  const file = e.target.files[0];
                  if (!file) return;
                  if (file.size > 1024 * 1024) { alert("画像は1MB以下にしてください"); return; }
                  setAvatarFile(file);
                  setAvatarPreview(URL.createObjectURL(file));
                  e.target.value = "";
                }} />
            </label>
            {/* 画像選択中はキャンセルボタン */}
            {(avatarFile || avatarPreview) && (
              <button onClick={() => { setAvatarFile(null); setAvatarPreview(null); setProfileForm(f => ({ ...f, avatarUrl: "" })); }}
                style={{ background:"none",border:"none",color:"#e57373",fontSize:12,cursor:"pointer",fontWeight:700 }}>
                ✕ 画像を取り消す
              </button>
            )}
          </div>

          {/* 絵文字グリッド */}
          <label style={S.label}>または絵文字を選択</label>
          <div style={{ ...S.chips,marginBottom:14 }}>
            {AVATARS.map(a => (
              <button key={a}
                onClick={() => {
                  // 絵文字を選ぶと画像選択をリセット
                  setAvatarFile(null);
                  setAvatarPreview(null);
                  setProfileForm(f => ({ ...f, avatar: a, avatarUrl: "" }));
                }}
                style={{
                  fontSize:24,
                  background: !avatarFile && !avatarPreview && profileForm.avatar === a ? "#e8f5e9" : "#f0f7f2",
                  border: !avatarFile && !avatarPreview && profileForm.avatar === a ? "2px solid #52a875" : "2px solid #c8e6c9",
                  borderRadius:12, padding:"4px 8px", cursor:"pointer"
                }}>
                {a}
              </button>
            ))}
          </div>

          <label style={S.label}>ニックネーム</label>
          <input style={{ ...S.input,marginBottom:12 }} placeholder="さくら" value={profileForm.name} onChange={e => setProfileForm(f => ({ ...f,name:e.target.value }))} />
          <div style={{ display:"flex",gap:12,marginBottom:12 }}>
            <div style={{ flex:1 }}>
              <label style={S.label}>年齢（18歳以上）</label>
           <input
  type="text"
  inputMode="numeric"
  placeholder="25"
  value={profileForm.age}
  onFocus={(e) => e.target.select()}
  onChange={(e) => {
    const val = e.target.value;

    // ゆるく数字だけ許可
    if (/^\d*$/.test(val)) {
      setProfileForm(f => ({ ...f, age: val }));
    }
  }}
  style={S.input}
/>
            </div>
            <div style={{ flex:1 }}>
              <label style={S.label}>地域</label>
              <input style={S.input} placeholder="東京" value={profileForm.location} onChange={e => setProfileForm(f => ({ ...f,location:e.target.value }))} />
            </div>
          </div>
          <label style={S.label}>性別</label>
          <div style={{ ...S.chips,marginBottom:12 }}>{GENDERS.map(g => <button key={g} style={profileForm.gender===g?S.chipOn:S.chipOff} onClick={() => setProfileForm(f => ({ ...f,gender:g }))}>{g}</button>)}</div>
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
    </div></div>
  );

  // ── browse ───────────────────────────────────────────────
  if (screen === "browse") return (
    <div style={S.app}><div style={S.page}>
      <div style={S.bar}><span style={S.barTitle}>🌿 自分と似ている人</span><button style={S.ghost} onClick={() => signOut(auth)}>ログアウト</button></div>
      <div style={{ flex:1,overflowY:"auto",padding:"12px 14px",display:"flex",flexDirection:"column",gap:12 }}>
        <div style={{ display:"flex",gap:8,marginBottom:4 }}>
          <button onClick={() => setFilterMode("all")} style={{ background:filterMode==="all"?"#52a875":"#f0f0f0",color:filterMode==="all"?"#fff":"#666",border:filterMode==="all"?"none":"1px solid #ccc",borderRadius:20,padding:"5px 14px",fontSize:12,fontWeight:700,cursor:"pointer" }}>すべて</button>
          <button onClick={() => setFilterMode("liked")} style={{ background:filterMode==="liked"?"#52a875":"#f0f0f0",color:filterMode==="liked"?"#fff":"#666",border:filterMode==="liked"?"2px solid #2e7d32":"1px solid #ccc",borderRadius:20,padding:"5px 14px",fontSize:12,fontWeight:800,cursor:"pointer" }}>共感済み</button>
        </div>
        {filteredProfiles.length === 0 ? (
          <div style={S.empty}>
            <div style={{ fontSize:52 }}>🌿</div>
            {filterMode === "liked"
              ? <><h3 style={{ color:"#3d6b4f",marginTop:12 }}>共感したユーザーはいません</h3><p style={{ color:"#6b8f71",fontSize:13 }}>気になる人に共感してみましょう</p></>
              : <><h3 style={{ color:"#3d6b4f",marginTop:12 }}>表示できるユーザーがいません</h3><p style={{ color:"#6b8f71",fontSize:13 }}>すでに全員とマッチ済かもしれません</p></>}
          </div>
        ) : filteredProfiles.map(p => {
          const isExpanded = expandedUid === p.uid;
          const tl = profileTimelines[p.uid] || [];
          const tlPage = profileTimelinePages[p.uid] || 0;
          return (
          <div
  key={p.uid}
  onMouseEnter={() => setHoveredUid(p.uid)}
  onMouseLeave={() => setHoveredUid(null)}
  style={{
  background: "#fff",
  borderRadius: 18,
  boxShadow: hoveredUid === p.uid
    ? "0 6px 20px rgba(61,107,79,0.15)"
    : "0 2px 14px rgba(61,107,79,0.08)",
  transform: hoveredUid === p.uid ? "translateY(-2px)" : "none",
  transition: "all 0.2s ease",
  cursor: "pointer"
}}
>
              <div style={{ display:"flex",alignItems:"center",gap:12,padding:"14px 16px" }} onClick={() => toggleExpand(p.uid)}>
                {/* 画像→絵文字の順で自動判定して表示 */}
                <AvatarImg avatarUrl={p.avatarUrl} emoji={p.avatar} size={50} />
                <div style={{ flex:1,minWidth:0 }}>
                  <div style={{ fontSize:15,fontWeight:700,color:"#3d6b4f" }}>{p.name} <span style={{ fontSize:13,fontWeight:400,color:"#6b8f71" }}>{p.age}歳</span></div>
                  <div style={{ fontSize:11,color:"#6b8f71" }}>{p.location}{p.gender?" · "+p.gender:""} · {p.severity}</div>
                  {p.commons?.length > 0 && <div style={{ fontSize:11,color:"#52a875",marginTop:3,fontWeight:700 }}>🌿 共通点：{p.commons.slice(0,2).join("・")}{p.commons.length > 2 ? ` +${p.commons.length - 2}` : ""}</div>}
                </div>
                <div style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:6 }}>
                  <button onClick={async e => { e.stopPropagation(); const r = await sendLike(p); if (r.type==="match") showToast("🎉 マッチしました！チャットできます"); else if (r.type==="like") showToast("🌿 共感しました｜お互いに共感でチャットできます"); }}
                    style={{ background: matches[p.uid] ? "#ffebee" : myLikes[p.uid] ? "#d4edda" : "#f0f0f0", color: matches[p.uid] ? "#e57373" : myLikes[p.uid] ? "#2e7d32" : "#666", border: matches[p.uid] ? "1px solid #f48fb1" : myLikes[p.uid] ? "1px solid #4caf50" : "1px solid #ccc", borderRadius:20,padding:"6px 14px",fontSize:12,fontWeight:700,cursor:matches[p.uid]?"default":"pointer", pointerEvents: matches[p.uid] ? "none" : "auto" }}>
                    {matches[p.uid] ? "❤️ マッチ済" : myLikes[p.uid] ? "🌿 共感済" : "🌿 共感する"}
                  </button>
                  {matches[p.uid] && <button onClick={e => { e.stopPropagation(); setChatTarget(matches[p.uid]); setScreen("chat"); }} style={{ background:"#52a875",color:"#fff",border:"none",borderRadius:20,padding:"6px 14px",fontSize:12,fontWeight:700,cursor:"pointer" }}>💬 チャット</button>}
                 
                 <div style={{
  fontSize: 22,
  color: "#52a875",
  // 回転とホバー拡大を1つのtransformにまとめる
  transform: `rotate(${isExpanded ? 90 : 0}deg) scale(${hoveredUid === p.uid ? 1.1 : 1})`,
  transition: "transform 0.25s ease",
  lineHeight: 1,
  userSelect: "none",
}}>›</div>
</div>
              </div>
              {isExpanded && (
                <div style={{ padding:"0 16px 14px",borderTop:"1px solid #f0f7f2" }}>
                  {p.triggers?.length > 0 && <><div style={S.secLabel}>悪化因子</div><div style={S.chips}>{p.triggers.map(t => <span key={t} style={S.infoChip}>{t}</span>)}</div></>}
                  {p.treatments?.length > 0 && <><div style={S.secLabel}>治療法</div><div style={S.chips}>{p.treatments.map(t => <span key={t} style={S.infoChip}>{t}</span>)}</div></>}
                  {p.bio && <p style={{ fontSize:13,color:"#4a6b54",lineHeight:1.7,marginTop:10,padding:10,background:"#f0f7f2",borderRadius:10 }}>{p.bio}</p>}
                  {tl.length > 0 && (<>
                    <div style={S.secLabel}>📝 タイムライン</div>
                    <div style={{ display:"flex",flexDirection:"column",gap:6 }}>
                      {tl.slice(0,(tlPage+1)*PAGE_SIZE).map(t => <TimelinePost key={t.id} post={t} ownerUid={p.uid} currentUser={currentUser} onClickUser={handleClickUser} canDelete={false} highlightedPostId={highlightedPostId} clearHighlight={() => setHighlightedPostId(null)} />)}
                      {tl.length > (tlPage+1)*PAGE_SIZE && <button onClick={() => setProfileTimelinePages(prev => ({ ...prev,[p.uid]:(prev[p.uid]||0)+1 }))} style={{ width:"100%",background:"#f0f7f2",color:"#52a875",border:"1.5px solid #c8e6c9",borderRadius:10,padding:"6px 0",fontSize:12,fontWeight:700,cursor:"pointer" }}>もっと見る</button>}
                    </div>
                  </>)}
                </div>
              )}
            </div>
          );
        })}
      </div>
      
      {tutorialEl}{toastEl}
{showNav && <NavBar screen={screen} setScreen={setScreen} matches={matches} unreadCount={unreadCount} totalUnreadChats={totalUnreadChats} />}
    </div></div>
  );

  // ── matches ──────────────────────────────────────────────
  if (screen === "matches") return (
    <div style={S.app}><div style={S.page}>
      <div style={S.bar}><span style={S.barTitle}>💚 マッチ一覧</span><button style={S.ghost} onClick={() => signOut(auth)}>ログアウト</button></div>
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
              
 <div
  key={m.uid}
  onMouseEnter={() => setHoveredUid(m.uid)}
  onMouseLeave={() => setHoveredUid(null)}
  style={{
    background: "#fff",
    borderRadius: 18,
    overflow: "hidden",
    boxShadow: hoveredUid === m.uid
      ? "0 6px 20px rgba(61,107,79,0.15)"
      : "0 2px 14px rgba(61,107,79,0.08)",
    transform: hoveredUid === m.uid ? "translateY(-2px)" : "none",
    transition: "all 0.2s ease",
    cursor: "pointer",
  }}
>
                  <div style={{ display:"flex",alignItems:"center",gap:12,padding:"14px 16px",cursor:"pointer" }} onClick={() => toggleExpand(m.uid)}>
                    <AvatarImg avatarUrl={m.avatarUrl} emoji={m.avatar} size={50} />
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:15,fontWeight:700,color:"#3d6b4f" }}>{m.name} <span style={{ fontSize:13,fontWeight:400,color:"#6b8f71" }}>{m.age}歳</span></div>
                      <div style={{ fontSize:12,color:"#6b8f71" }}>{m.location}{m.gender?" · "+m.gender:""} · {m.severity}</div>
                      {mCommons.length > 0 && <div style={{ fontSize:11,color:"#52a875",marginTop:2,fontWeight:700 }}>🌿 共通点：{mCommons.slice(0,2).join("・")}{mCommons.length > 2 ? ` +${mCommons.length - 2}` : ""}</div>}
                      <div style={{ fontSize:10,color:"#a8c5b0",marginTop:2 }}>{new Date(m.matchedAt).toLocaleDateString("ja-JP")} にマッチ</div>
                    </div>
                    <div style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:2 }}>
                      <button onClick={e => { e.stopPropagation(); setChatTarget(m); setScreen("chat"); }} style={{ background:"#52a875",border:"none",borderRadius:20,padding:"6px 12px",fontSize:12,fontWeight:700,cursor:"pointer",color:"#fff" }}>💬 チャット</button>
                      {unreadChats[m.uid] && <span style={{ fontSize:10,color:"#e57373",fontWeight:700 }}>🔴 新着あり</span>}
                   <div style={{
  fontSize: 22,
  color: "#52a875",
  transform: `rotate(${isExpanded ? 90 : 0}deg) scale(${hoveredUid === m.uid ? 1.1 : 1})`,
  transition: "transform 0.25s ease",
  lineHeight: 1,
  userSelect: "none",
}}>›</div>
</div>
                    </div> 
                  {isExpanded && (
                    <div style={{ padding:"0 16px 14px",borderTop:"1px solid #f0f7f2" }}>
                      {m.triggers?.length > 0 && <><div style={S.secLabel}>悪化因子</div><div style={S.chips}>{m.triggers.map(t => <span key={t} style={S.infoChip}>{t}</span>)}</div></>}
                      {m.treatments?.length > 0 && <><div style={S.secLabel}>治療法</div><div style={S.chips}>{m.treatments.map(t => <span key={t} style={S.infoChip}>{t}</span>)}</div></>}
                      {m.bio && <p style={{ fontSize:13,color:"#4a6b54",lineHeight:1.7,marginTop:10,padding:10,background:"#f0f7f2",borderRadius:10 }}>{m.bio}</p>}
                      {tl.length > 0 && (<>
                        <div style={S.secLabel}>📝 タイムライン</div>
                        <div style={{ display:"flex",flexDirection:"column",gap:6 }}>
                          {tl.slice(0,(tlPage+1)*PAGE_SIZE).map(t => <TimelinePost key={t.id} post={t} ownerUid={m.uid} currentUser={currentUser} onClickUser={handleClickUser} canDelete={false} highlightedPostId={highlightedPostId} clearHighlight={() => setHighlightedPostId(null)} />)}
                          {tl.length > (tlPage+1)*PAGE_SIZE && <button onClick={() => setProfileTimelinePages(prev => ({ ...prev,[m.uid]:(prev[m.uid]||0)+1 }))} style={{ width:"100%",background:"#f0f7f2",color:"#52a875",border:"1.5px solid #c8e6c9",borderRadius:10,padding:"6px 0",fontSize:12,fontWeight:700,cursor:"pointer" }}>もっと見る</button>}
                        </div>
                      </>)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {showNav && <NavBar screen={screen} setScreen={setScreen} matches={matches} unreadCount={unreadCount} totalUnreadChats={totalUnreadChats} />}
    </div></div>
  );

  // ── mypage ───────────────────────────────────────────────
  if (screen === "mypage")  return (
    <div style={S.app}><div style={S.page}>
      <div style={S.bar}><span style={S.barTitle}>👤 マイページ</span><button style={S.ghost} onClick={() => signOut(auth)}>ログアウト</button></div>
      <div style={{ flex:1,overflowY:"auto",padding:16,display:"flex",flexDirection:"column",gap:14 }}>

        {/* 通知 */}
        {notifications.length === 0 && (
          <div style={{ ...S.card,textAlign:"center",padding:"20px 24px" }}>
            <div style={{ fontSize:32,marginBottom:8 }}>🔔</div>
            <p style={{ color:"#6b8f71",fontSize:13,fontWeight:700 }}>まだ通知はありません</p>
            <p style={{ color:"#a8c5b0",fontSize:12,marginTop:4 }}>共感やコメントが届くとここに表示されます</p>
          </div>
        )}
        {notifications.length > 0 && (
         <div
  onMouseEnter={() => setHoveredUid("mypage-notification")}
  onMouseLeave={() => setHoveredUid(null)}
  style={{
    ...S.card,
    transform: hoveredUid === "mypage-notification" ? "translateY(-1px)" : "none",
    boxShadow: hoveredUid === "mypage-notification"
      ? "0 4px 12px rgba(61,107,79,0.10)"
      : "0 2px 8px rgba(61,107,79,0.06)",
    transition: "all 0.2s ease"
  }}
>
            <div style={{ fontSize:15,fontWeight:800,color:"#3d6b4f",marginBottom:12 }}>🔔 通知</div>
         <div style={{ display:"flex",flexDirection:"column",gap:8 }}>

  {notifications.slice(0, visibleCount).map(n => (
    <button
      key={n.id}
      onClick={() => handleNotificationClick(n)}
      onMouseEnter={e => e.currentTarget.style.opacity = "0.8"}
      onMouseLeave={e => e.currentTarget.style.opacity = "1"}
      style={{
        display:"flex",
        alignItems:"center",
        gap:10,
        padding:"8px 12px",
        background:n.read?"#f0f7f2":"#e8f5e9",
        borderRadius:12,
        border:n.read?"none":"1.5px solid #c8e6c9",
        cursor:"pointer",
        width:"100%",
        textAlign:"left"
      }}
    >
      <span style={{ fontSize:22,flexShrink:0,position:"relative" }}>
        {n.fromUserAvatar}
        {!n.read && (
          <span style={{
            position:"absolute",
            top:-2,
            right:-2,
            width:8,
            height:8,
            background:"#e57373",
            borderRadius:"50%"
          }} />
        )}
      </span>

      <div style={{ fontSize:13,color:"#4a6b54",flex:1 }}>
        <strong>{n.fromUserName}</strong>さんが

        {n.type === "profile_like" || n.type === "like"
          ? "🌿 あなたに共感しています"
          : (
            "💬 " +
            (n.postText ? "「" + n.postText + "...」" : "あなたの投稿") +
            (n.count && n.count > 1
              ? `に${n.count}件コメントしました`
              : "にコメントしました"
            )
          )
        }

        <div style={{ fontSize:10,color:"#a8c5b0",marginTop:2 }}>
          {formatTime(n.createdAt)}
        </div>
      </div>

      <span style={{ fontSize:12,color:"#a8c5b0",flexShrink:0 }}>›</span>
    </button>
  ))}

  {/* ✅ mapの外に置く！！！ */}
  {notifications.length > visibleCount && (
    <button
      onClick={() => setVisibleCount(v => v + 5)}
      style={{
        width:"100%",
        background:"#f0f7f2",
        color:"#52a875",
        border:"1.5px solid #c8e6c9",
        borderRadius:10,
        padding:"8px 0",
        fontSize:13,
        fontWeight:700,
        cursor:"pointer"
      }}
    >
      もっと見る
    </button>
  )}

</div>
            
</div>
)}


        {/* プロフィールカード */}
        {myProfile && (
         <div
  onMouseEnter={() => setHoveredUid("mypage-profile")}
  onMouseLeave={() => setHoveredUid(null)}
  style={{
    ...S.card,
    transform: hoveredUid === "mypage-profile" ? "translateY(-1px)" : "none",
    boxShadow: hoveredUid === "mypage-profile"
      ? "0 4px 12px rgba(61,107,79,0.10)"
      : "0 2px 8px rgba(61,107,79,0.06)",
    transition: "all 0.2s ease"
  }}
>
            <div style={{ textAlign:"center",marginBottom:16 }}>

              {/* ────────────────────────────────────────
                  マイページ：アバター表示 + 変更UI
              ──────────────────────────────────────── */}
              <div style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:8,marginBottom:12 }}>

                {/* アバタープレビュー（保存中は仮表示） */}
                {avatarPreview
                  ? <img src={avatarPreview} alt="プレビュー" style={{ width:96,height:96,borderRadius:"50%",objectFit:"cover",border:"2px solid #52a875" }} />
                  : <AvatarImg avatarUrl={myProfile.avatarUrl} emoji={myProfile.avatar} size={96} />
                }

                {avatarSaving
                  ? <div style={{ fontSize:12,color:"#52a875",fontWeight:700 }}>保存中...</div>
                  : (
                    <div style={{ display:"flex",gap:8,flexWrap:"wrap",justifyContent:"center" }}>
                      {/* 画像変更 */}
                      <label style={{ cursor:"pointer",background:"#f0f7f2",border:"1.5px solid #c8e6c9",borderRadius:10,padding:"5px 14px",fontSize:12,fontWeight:700,color:"#52a875" }}>
                        📷 画像を変更
                        <input type="file" accept="image/*" style={{ display:"none" }}
                          onChange={async e => {
                            const file = e.target.files[0];
                            if (!file) return;
                            if (file.size > 1024 * 1024) { alert("画像は1MB以下にしてください"); return; }
                            setAvatarPreview(URL.createObjectURL(file));
                            e.target.value = "";
                            setAvatarSaving(true);
                            try {
                              const url = await uploadAvatar(currentUser.uid, file);
                              await set(ref(db, `users/${currentUser.uid}/avatarUrl`), url);
                              setMyProfile(prev => ({ ...prev, avatarUrl: url }));
                              setAvatarPreview(null);
                              showToast("アバター画像を更新しました 🌿");
                            } catch (err) {
                              alert(err.message);
                              setAvatarPreview(null);
                            } finally { setAvatarSaving(false); }
                          }} />
                      </label>

                      {/* 画像が設定されている場合のみ「絵文字に戻す」を表示 */}
                      {myProfile.avatarUrl && (
                        <button onClick={resetToEmoji}
                          style={{ background:"#fff",border:"1.5px solid #e0ede5",borderRadius:10,padding:"5px 14px",fontSize:12,fontWeight:700,color:"#6b8f71",cursor:"pointer" }}>
                          {myProfile.avatar || "🌿"} 絵文字に戻す
                        </button>
                      )}
                    </div>
                  )
                }
              </div>

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
            <button style={{ ...S.btn,marginTop:16 }} onClick={() => { setProfileForm(myProfile); setAvatarPreview(null); setAvatarFile(null); setScreen("register"); }}>プロフィールを編集</button>
          </div>
        )}

        {/* タイムライン投稿 */}
       <div
  onMouseEnter={() => setHoveredUid("mypage-timeline")}
  onMouseLeave={() => setHoveredUid(null)}
  style={{
    ...S.card,
    transform: hoveredUid === "mypage-timeline" ? "translateY(-1px)" : "none",
    boxShadow: hoveredUid === "mypage-timeline"
      ? "0 4px 12px rgba(61,107,79,0.10)"
      : "0 2px 8px rgba(61,107,79,0.06)",
    transition: "all 0.2s ease"
  }}
>
          <div style={{ fontSize:15,fontWeight:800,color:"#3d6b4f",marginBottom:12 }}>📝 タイムライン</div>
          <textarea style={{ ...S.input,height:70,resize:"vertical",marginBottom:8 }} placeholder="今日の体調や日常を投稿しましょう..." value={timelineInput} onChange={e => setTimelineInput(e.target.value)} />
          {imagePreview && (
            <div style={{ position:"relative",marginBottom:8 }}>
              <img src={imagePreview} alt="preview" style={{ width:"100%",maxHeight:200,objectFit:"cover",borderRadius:10 }} />
              <button onClick={() => { setImageFile(null); setImagePreview(null); }} style={{ position:"absolute",top:6,right:6,background:"rgba(0,0,0,0.5)",color:"#fff",border:"none",borderRadius:"50%",width:24,height:24,cursor:"pointer",fontSize:14,lineHeight:"24px",textAlign:"center" }}>✕</button>
            </div>
          )}
          <label style={{ display:"block",marginBottom:8,cursor:"pointer" }}>
            <input type="file" accept="image/*" style={{ display:"none" }}
              onChange={e => { const file = e.target.files[0]; if (!file) return; setImageFile(file); setImagePreview(URL.createObjectURL(file)); e.target.value = ""; }} />
            <span style={{ display:"inline-block",background:"#f0f7f2",border:"1.5px solid #c8e6c9",color:"#52a875",borderRadius:10,padding:"6px 14px",fontSize:12,fontWeight:700 }}>📷 画像を追加</span>
          </label>
          <button style={S.btn} onClick={postTimeline} disabled={timelineLoading}>{timelineLoading?"投稿中...":"投稿する"}</button>
          <div style={{ marginTop:16,display:"flex",flexDirection:"column",gap:10 }}>
            {myTimeline.length === 0 && <p style={{ color:"#a8c5b0",fontSize:13,textAlign:"center" }}>まだ投稿がありません</p>}
            {myTimeline.slice(0,(timelinePage+1)*PAGE_SIZE).map(t => (
              <TimelinePost key={t.id} post={t} ownerUid={currentUser.uid} currentUser={currentUser}
                onClickUser={handleClickUser} canDelete={true} onDelete={() => deleteTimeline(currentUser.uid, t.id, t.imagePath)}
                highlightedPostId={highlightedPostId} clearHighlight={() => setHighlightedPostId(null)} />
            ))}
            {myTimeline.length > (timelinePage+1)*PAGE_SIZE && (
              <button onClick={() => setTimelinePage(p => p+1)} style={{ width:"100%",background:"#f0f7f2",color:"#52a875",border:"1.5px solid #c8e6c9",borderRadius:10,padding:"8px 0",fontSize:13,fontWeight:700,cursor:"pointer",marginTop:4 }}>もっと見る</button>
            )}
          </div>
        </div>
      </div>
     
     {toastEl}
{showNav && <NavBar screen={screen} setScreen={setScreen} matches={matches} unreadCount={unreadCount} totalUnreadChats={totalUnreadChats} />}
    </div></div>
  );
}

const S = {
  app:{ minHeight:"100vh",background:"#f0f7f2",fontFamily:"'Hiragino Sans','Yu Gothic',sans-serif",display:"flex",justifyContent:"center" },
  page:{ width:"100%", maxWidth:420, display:"flex", flexDirection:"column", minHeight:"100vh", paddingBottom:80 },
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
  nav:{ display:"flex", borderTop:"1px solid #e8f5e9", background:"#fff", position:"fixed", bottom:0, left:0, width:"100%", zIndex:100,boxShadow:"0 -2px 10px rgba(0,0,0,0.05)" },
  navBtn:{ flex:1,padding:"12px 0",background:"none",border:"none",borderTop:"2px solid transparent",color:"#6b8f71",fontSize:12,cursor:"pointer" },
};

import { useState, useRef, useEffect } from "react";

const DEMO_PROFILES = [
  {
    uid: "1", name: "さくら", age: 26, location: "東京", avatar: "🌸",
    severity: "中等症", skinType: "乾燥肌", yearsWithAtopy: 15,
    triggers: ["花粉", "ストレス"], treatments: ["保湿剤中心", "ステロイド使用"],
    bio: "アトピーと付き合いながら、毎日を楽しく過ごしています。同じ悩みを分かち合える方と出会えたら嬉しいです。料理と読書が趣味です🌸",
  },
  {
    uid: "2", name: "ゆうき", age: 29, location: "大阪", avatar: "🍃",
    severity: "寛解中", skinType: "混合型", yearsWithAtopy: 10,
    triggers: ["汗", "睡眠不足"], treatments: ["保湿剤中心", "食事療法"],
    bio: "10年かけてようやく上手く付き合えるようになりました。アウトドアも工夫しながら楽しんでいます♨️",
  },
  {
    uid: "3", name: "みお", age: 24, location: "福岡", avatar: "🌷",
    severity: "軽症", skinType: "季節性", yearsWithAtopy: 5,
    triggers: ["花粉", "気温変化"], treatments: ["免疫抑制剤"],
    bio: "春と秋が少し辛いけど、それ以外は元気！カフェ巡りや映画鑑賞が好きです😊",
  },
  {
    uid: "4", name: "けんた", age: 31, location: "名古屋", avatar: "🌿",
    severity: "中等症", skinType: "乾燥肌", yearsWithAtopy: 20,
    triggers: ["ダニ・ホコリ", "ストレス"], treatments: ["生物学的製剤"],
    bio: "生物学的製剤を始めてから生活が変わりました。ゲームと料理が得意です🎮",
  },
  {
    uid: "5", name: "あおい", age: 27, location: "札幌", avatar: "🦋",
    severity: "軽症", skinType: "乾燥肌", yearsWithAtopy: 8,
    triggers: ["寒さ", "乾燥"], treatments: ["保湿剤中心", "自然療法"],
    bio: "北海道の寒さには慣れましたが、冬の乾燥が大敵です。スキーと温泉が大好き⛷️",
  },
];

const DEMO_MESSAGES = {
  "1": [
    { id: "m1", senderUid: "1", text: "はじめまして！花粉の季節、つらいですよね😢", time: "14:02" },
    { id: "m2", senderUid: "me", text: "ほんとに…！最近特にひどくて", time: "14:03" },
    { id: "m3", senderUid: "1", text: "わかります。私は保湿をこまめにするようにしたら少し楽になりました！", time: "14:04" },
  ],
  "2": [
    { id: "m4", senderUid: "2", text: "マッチしましたね！よろしくお願いします🌿", time: "昨日" },
    { id: "m5", senderUid: "me", text: "こちらこそ！アウトドア派なんですね", time: "昨日" },
  ],
};

export default function AtopiMatchMockup() {
  const [screen, setScreen] = useState("home");
  const [browseIndex, setBrowseIndex] = useState(0);
  const [matches, setMatches] = useState([DEMO_PROFILES[0], DEMO_PROFILES[1]]);
  const [swipeDir, setSwipeDir] = useState(null);
  const [showMatch, setShowMatch] = useState(null);
  const [chatTarget, setChatTarget] = useState(null);
  const [chatMsgs, setChatMsgs] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMsgs]);

  const remaining = DEMO_PROFILES.filter(p => !matches.find(m => m.uid === p.uid));
  const current = remaining[browseIndex % Math.max(remaining.length, 1)];

  const handleSwipe = (dir) => {
    setSwipeDir(dir);
    setTimeout(() => {
      setSwipeDir(null);
      if (dir === "right" && current) {
        setMatches(prev => [...prev, current]);
        setShowMatch(current);
        setTimeout(() => setShowMatch(null), 2200);
      }
      setBrowseIndex(i => i + 1);
    }, 400);
  };

  const openChat = (target) => {
    setChatTarget(target);
    setChatMsgs(DEMO_MESSAGES[target.uid] ? [...DEMO_MESSAGES[target.uid]] : [
      { id: "intro", senderUid: target.uid, text: `${target.name}です！よろしくお願いします💚`, time: "今日" }
    ]);
    setScreen("chat");
  };

  const sendMsg = () => {
    if (!chatInput.trim()) return;
    setChatMsgs(prev => [...prev, { id: Date.now(), senderUid: "me", text: chatInput.trim(), time: "今" }]);
    setChatInput("");
    setTimeout(() => {
      const replies = ["そうなんですね！わかります😊","私もそれ試してみました！","アトピーあるあるですよね〜","一緒に頑張りましょう💚","詳しく教えてもらえますか？"];
      setChatMsgs(prev => [...prev, { id: Date.now() + 1, senderUid: chatTarget.uid, text: replies[Math.floor(Math.random() * replies.length)], time: "今" }]);
    }, 900);
  };

  const S = {
    app: { minHeight: "100vh", background: "#f0f7f2", fontFamily: "'Hiragino Sans','Yu Gothic',sans-serif", display: "flex", justifyContent: "center" },
    center: { width: "100%", maxWidth: 400, padding: "40px 20px" },
    page: { width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", minHeight: "100vh" },
    card: { background: "#fff", borderRadius: 20, padding: 24, boxShadow: "0 4px 24px rgba(61,107,79,0.08)" },
    btn: { width: "100%", background: "#52a875", color: "#fff", border: "none", borderRadius: 14, padding: "14px 0", fontSize: 15, fontWeight: 700, cursor: "pointer" },
    bar: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", background: "#fff", boxShadow: "0 1px 8px rgba(61,107,79,0.07)", flexShrink: 0 },
    barTitle: { fontSize: 17, fontWeight: 800, color: "#3d6b4f" },
    ghost: { background: "none", border: "1px solid #c8e6c9", borderRadius: 10, padding: "5px 12px", fontSize: 12, color: "#6b8f71", cursor: "pointer" },
    profileCard: { background: "#fff", borderRadius: 24, padding: 22, width: "100%", maxWidth: 370, boxShadow: "0 8px 32px rgba(61,107,79,0.12)", marginBottom: 6, position: "relative", overflow: "hidden" },
    stamp: { position: "absolute", top: 20, right: 20, background: "#e8f5e9", color: "#52a875", border: "3px solid #52a875", borderRadius: 10, padding: "4px 12px", fontWeight: 800, fontSize: 14, transform: "rotate(10deg)" },
    badge: { background: "#f0f7f2", color: "#3d6b4f", borderRadius: 20, padding: "4px 11px", fontSize: 11, fontWeight: 700 },
    infoChip: { background: "#f0f7f2", color: "#6b8f71", borderRadius: 20, padding: "3px 11px", fontSize: 11, border: "1px solid #c8e6c9" },
    nopeBtn: { width: 58, height: 58, borderRadius: "50%", background: "#fff", border: "2px solid #ffccbc", color: "#e57373", fontSize: 22, cursor: "pointer", boxShadow: "0 4px 12px rgba(0,0,0,0.07)" },
    likeBtn: { width: 58, height: 58, borderRadius: "50%", background: "#52a875", border: "none", color: "#fff", fontSize: 22, cursor: "pointer", boxShadow: "0 4px 14px rgba(82,168,117,0.35)" },
    matchRow: { background: "#fff", borderRadius: 16, padding: "14px 16px", display: "flex", alignItems: "center", gap: 14, boxShadow: "0 2px 12px rgba(61,107,79,0.06)", cursor: "pointer" },
    nav: { display: "flex", borderTop: "1px solid #e8f5e9", background: "#fff", flexShrink: 0 },
    navBtn: { flex: 1, padding: "12px 0", background: "none", border: "none", borderTop: "2px solid transparent", color: "#6b8f71", fontSize: 12, cursor: "pointer" },
    bubMe: { background: "#52a875", color: "#fff", borderRadius: "18px 18px 4px 18px", padding: "10px 14px", fontSize: 14, maxWidth: 260, lineHeight: 1.6, wordBreak: "break-word" },
    bubThem: { background: "#fff", color: "#2d4a35", borderRadius: "18px 18px 18px 4px", padding: "10px 14px", fontSize: 14, maxWidth: 260, lineHeight: 1.6, boxShadow: "0 2px 8px rgba(61,107,79,0.08)", wordBreak: "break-word" },
    sendBtn: { background: "#52a875", color: "#fff", border: "none", borderRadius: 22, padding: "10px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer" },
    empty: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 40, textAlign: "center" },
  };

  if (screen === "home") return (
    <div style={S.app}>
      <div style={S.center}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 52 }}>🌿</div>
          <h1 style={{ fontSize: 30, fontWeight: 800, color: "#3d6b4f", margin: "4px 0 0", letterSpacing: "-1px" }}>AtopiMatch</h1>
          <p style={{ color: "#6b8f71", fontSize: 13, margin: "6px 0 10px" }}>アトピーだから、分かり合える。</p>
          <div style={{ display: "inline-block", background: "#e8f5e9", color: "#52a875", borderRadius: 20, padding: "4px 14px", fontSize: 12, fontWeight: 700 }}>📱 デモ版</div>
        </div>
        <div style={S.card}>
          <p style={{ color: "#4a6b54", fontSize: 14, lineHeight: 1.8, textAlign: "center", marginBottom: 20 }}>アトピー性皮膚炎と向き合うすべての人へ。<br/>同じ経験を持つ方との出会いをサポートします。</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 22 }}>
            {[["💚","マッチング","いいねが重なったらマッチ成立"],["💬","チャット","マッチした方と直接メッセージ"],["🔒","安心設計","アトピー患者限定コミュニティ"]].map(([ic,t,d])=>(
              <div key={t} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 14px", background: "#f0f7f2", borderRadius: 12 }}>
                <span style={{ fontSize: 22 }}>{ic}</span>
                <div><div style={{ fontWeight: 700, color: "#3d6b4f", fontSize: 13 }}>{t}</div><div style={{ color: "#6b8f71", fontSize: 12, marginTop: 2 }}>{d}</div></div>
              </div>
            ))}
          </div>
          <button style={S.btn} onClick={() => setScreen("browse")}>デモを試す</button>
        </div>
      </div>
    </div>
  );

  if (screen === "browse") return (
    <div style={S.app}>
      <div style={S.page}>
        <div style={S.bar}>
          <span style={S.barTitle}>🌿 AtopiMatch</span>
          <button style={S.ghost} onClick={() => setScreen("home")}>ホーム</button>
        </div>
        {showMatch && (
          <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", background: "#fff", borderRadius: 24, padding: "32px 40px", textAlign: "center", boxShadow: "0 16px 48px rgba(61,107,79,0.2)", zIndex: 100 }}>
            <div style={{ fontSize: 48 }}>{showMatch.avatar}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#52a875", marginTop: 8 }}>マッチしました！💚</div>
            <div style={{ fontSize: 14, color: "#6b8f71", marginTop: 4 }}>{showMatch.name}さんと</div>
          </div>
        )}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "14px 16px 0", overflowY: "auto" }}>
          {!current || browseIndex >= remaining.length ? (
            <div style={S.empty}>
              <div style={{ fontSize: 52 }}>🌿</div>
              <h3 style={{ color: "#3d6b4f", marginTop: 12 }}>今日はここまで</h3>
              <p style={{ color: "#6b8f71", fontSize: 13 }}>新しい出会いをお待ちください</p>
              <button style={{ ...S.btn, width: "auto", padding: "12px 28px", marginTop: 20 }} onClick={() => setScreen("matches")}>マッチ一覧へ</button>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 13, color: "#6b8f71", marginBottom: 10 }}>残り {remaining.length - browseIndex} 人</div>
              <div style={{ ...S.profileCard, transform: swipeDir === "left" ? "translateX(-130%) rotate(-18deg)" : swipeDir === "right" ? "translateX(130%) rotate(18deg)" : "none", transition: swipeDir ? "transform 0.38s cubic-bezier(.4,0,.2,1)" : "none" }}>
                {swipeDir === "right" && <div style={S.stamp}>LIKE 💚</div>}
                {swipeDir === "left" && <div style={{ ...S.stamp, background: "#ffebee", color: "#e57373", border: "3px solid #e57373" }}>SKIP ✕</div>}
                <div style={{ fontSize: 56, textAlign: "center", marginBottom: 6 }}>{current.avatar}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#3d6b4f", textAlign: "center" }}>{current.name} <span style={{ fontSize: 15, fontWeight: 400, color: "#6b8f71" }}>{current.age}歳</span></div>
                <div style={{ fontSize: 12, color: "#6b8f71", textAlign: "center", marginBottom: 12 }}>📍 {current.location}</div>
                <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                  <span style={S.badge}>{current.severity}</span>
                  <span style={S.badge}>{current.skinType}</span>
                  <span style={{ ...S.badge, background: "#e8f5e9" }}>歴{current.yearsWithAtopy}年</span>
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#6b8f71", marginBottom: 5, marginTop: 10 }}>悪化因子</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{current.triggers.map(t => <span key={t} style={S.infoChip}>{t}</span>)}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#6b8f71", marginBottom: 5, marginTop: 10 }}>治療法</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{current.treatments.map(t => <span key={t} style={S.infoChip}>{t}</span>)}</div>
                <p style={{ fontSize: 13, color: "#4a6b54", lineHeight: 1.7, marginTop: 12, padding: 12, background: "#f0f7f2", borderRadius: 12 }}>{current.bio}</p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 28, padding: "14px 0" }}>
                <button style={S.nopeBtn} onClick={() => handleSwipe("left")}>✕</button>
                <div style={{ fontSize: 11, color: "#a8c5b0" }}>タップして選ぼう</div>
                <button style={S.likeBtn} onClick={() => handleSwipe("right")}>💚</button>
              </div>
            </>
          )}
        </div>
        <div style={S.nav}>
          <button style={{ ...S.navBtn, color: "#52a875", borderTop: "2px solid #52a875" }}>🔍 探す</button>
          <button style={S.navBtn} onClick={() => setScreen("matches")}>💚 マッチ ({matches.length})</button>
        </div>
      </div>
    </div>
  );

  if (screen === "matches") return (
    <div style={S.app}>
      <div style={S.page}>
        <div style={S.bar}><span style={S.barTitle}>💚 マッチ一覧</span><button style={S.ghost} onClick={() => setScreen("browse")}>探す</button></div>
        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          {matches.length === 0 ? (
            <div style={S.empty}><div style={{ fontSize: 48 }}>💚</div><p style={{ color: "#6b8f71", fontSize: 14, marginTop: 12 }}>まだマッチがありません</p></div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {matches.map(m => (
                <div key={m.uid} style={S.matchRow} onClick={() => openChat(m)}>
                  <div style={{ fontSize: 36, width: 50, height: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "#f0f7f2", borderRadius: "50%", flexShrink: 0 }}>{m.avatar}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#3d6b4f" }}>{m.name} <span style={{ fontSize: 13, fontWeight: 400, color: "#6b8f71" }}>{m.age}歳</span></div>
                    <div style={{ fontSize: 12, color: "#6b8f71" }}>{m.location} · {m.severity}</div>
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
        </div>
      </div>
    </div>
  );

  if (screen === "chat") return (
    <div style={S.app}>
      <div style={{ ...S.page, height: "100vh" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: "#fff", boxShadow: "0 1px 8px rgba(61,107,79,0.07)", flexShrink: 0 }}>
          <button style={{ background: "none", border: "none", fontSize: 20, color: "#6b8f71", cursor: "pointer" }} onClick={() => setScreen("matches")}>←</button>
          <div style={{ fontSize: 30, width: 42, height: 42, display: "flex", alignItems: "center", justifyContent: "center", background: "#f0f7f2", borderRadius: "50%" }}>{chatTarget?.avatar}</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#3d6b4f" }}>{chatTarget?.name}</div>
            <div style={{ fontSize: 11, color: "#52a875" }}>● オンライン</div>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
          {chatMsgs.map((m, i) => {
            const isMe = m.senderUid === "me";
            return (
              <div key={m.id || i} style={{ display: "flex", justifyContent: isMe ? "flex-end" : "flex-start", alignItems: "flex-end", gap: 6 }}>
                {!isMe && <div style={{ fontSize: 22, width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", background: "#f0f7f2", borderRadius: "50%", flexShrink: 0 }}>{chatTarget?.avatar}</div>}
                <div>
                  <div style={isMe ? S.bubMe : S.bubThem}>{m.text}</div>
                  <div style={{ fontSize: 10, color: "#b0bec5", textAlign: isMe ? "right" : "left", marginTop: 2 }}>{m.time}</div>
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>
        <div style={{ display: "flex", gap: 8, padding: "10px 14px", background: "#fff", borderTop: "1px solid #e8f5e9", flexShrink: 0 }}>
          <input style={{ flex: 1, border: "1.5px solid #c8e6c9", borderRadius: 22, padding: "10px 16px", fontSize: 14, background: "#f0f7f2", outline: "none" }}
            placeholder="メッセージを入力..." value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && sendMsg()} />
          <button style={S.sendBtn} onClick={sendMsg}>送信</button>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect, useRef } from "react";
import { db } from "./firebase.js";
import { ref, push, onValue, off, serverTimestamp, onDisconnect, set } from "firebase/database";

function getChatId(uid1, uid2) {
  return [uid1, uid2].sort().join("_");
}

export default function ChatScreen({ currentUser, myProfile, chatTarget, onBack }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isOnline, setIsOnline] = useState(false);
  const bottomRef = useRef(null);
  const chatId = getChatId(currentUser.uid, chatTarget.uid);

  useEffect(() => {
    const presenceRef = ref(db, `presence/${chatTarget.uid}`);
    const unsub = onValue(presenceRef, (snap) => {
      setIsOnline(snap.exists() && snap.val() === true);
    });
    return () => off(presenceRef);
  }, [chatTarget.uid]);

  useEffect(() => {
    const myPresenceRef = ref(db, `presence/${currentUser.uid}`);
    set(myPresenceRef, true);
    onDisconnect(myPresenceRef).set(false);
    return () => set(myPresenceRef, false);
  }, [currentUser.uid]);

  useEffect(() => {
    const msgRef = ref(db, "chats/" + chatId + "/messages");
    const unsubscribe = onValue(msgRef, (snap) => {
      const list = [];
      snap.forEach((child) => {
        list.push({ id: child.key, ...child.val() });
      });
      setMessages(list);
    });
    return () => off(msgRef);
  }, [chatId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const send = async () => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    try {
      await push(ref(db, "chats/" + chatId + "/messages"), {
        text,
        senderUid: currentUser.uid,
        senderName: myProfile.name,
        timestamp: serverTimestamp(),
      });
    } catch (e) {
      setInput(text);
    }
  };

  return (
    <div style={{
      width: "100%",
      maxWidth: 420,
      display: "flex",
      flexDirection: "column",
      height: "100dvh", // dynamic viewport height でキーボード対応
      position: "fixed",
      top: 0,
      left: "50%",
      transform: "translateX(-50%)",
    }}>
      {/* ヘッダー */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", background: "#fff", boxShadow: "0 1px 8px rgba(61,107,79,0.07)", flexShrink: 0 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", fontSize: 20, color: "#6b8f71", cursor: "pointer" }}>←</button>
        <div style={{ fontSize: 26, width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center", background: "#f0f7f2", borderRadius: "50%" }}>{chatTarget.avatar}</div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#3d6b4f" }}>{chatTarget.name}</div>
          <div style={{ fontSize: 10, color: isOnline ? "#52a875" : "#aaa" }}>
            {isOnline ? "● オンライン" : "○ オフライン"}
          </div>
        </div>
      </div>

      {/* メッセージ一覧 */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px", display: "flex", flexDirection: "column", gap: 8, background: "#f0f7f2" }}>
        {messages.length === 0 && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 32 }}>
            <div style={{ fontSize: 40 }}>{chatTarget.avatar}</div>
            <p style={{ color: "#6b8f71", fontSize: 13, marginTop: 8 }}>{chatTarget.name}さんとマッチ！<br />最初のメッセージを送りましょう 💚</p>
          </div>
        )}
        {messages.map((m) => {
          const isMe = m.senderUid === currentUser.uid;
          return (
            <div key={m.id} style={{ display: "flex", justifyContent: isMe ? "flex-end" : "flex-start", alignItems: "flex-end", gap: 6 }}>
              {!isMe && <div style={{ fontSize: 18, width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", background: "#fff", borderRadius: "50%", flexShrink: 0 }}>{chatTarget.avatar}</div>}
              <div style={{ padding: "8px 12px", fontSize: 14, maxWidth: 260, lineHeight: 1.6, wordBreak: "break-word", ...(isMe ? { background: "#52a875", color: "#fff", borderRadius: "18px 18px 4px 18px" } : { background: "#fff", color: "#2d4a35", borderRadius: "18px 18px 18px 4px", boxShadow: "0 2px 8px rgba(61,107,79,0.08)" }) }}>
                {m.text}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* 入力欄 */}
      <div style={{ display: "flex", gap: 8, padding: "8px 12px", background: "#fff", borderTop: "1px solid #e8f5e9", flexShrink: 0 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && send()}
          onFocus={() => setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 300)}
          placeholder="メッセージを入力..."
          style={{ flex: 1, border: "1.5px solid #c8e6c9", borderRadius: 22, padding: "10px 16px", fontSize: 14, background: "#f0f7f2", outline: "none" }}
        />
        <button onClick={send} style={{ background: "#52a875", color: "#fff", border: "none", borderRadius: 22, padding: "10px 16px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>送信</button>
      </div>
    </div>
  );
}

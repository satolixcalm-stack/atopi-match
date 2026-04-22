import { useState, useEffect, useRef } from "react";
import { db } from "./firebase.js";
import { ref, push, onValue, serverTimestamp } from "firebase/database";

function getChatId(uid1, uid2) {
  return [uid1, uid2].sort().join("_");
}

export default function ChatScreen({ currentUser, myProfile, chatTarget, onBack }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [debugLog, setDebugLog] = useState("起動中...");
  const bottomRef = useRef(null);
  const chatId = getChatId(currentUser.uid, chatTarget.uid);

  useEffect(() => {
    setDebugLog("リスナー登録: " + chatId);
    const msgRef = ref(db, "chats/" + chatId + "/messages");

    const unsubscribe = onValue(msgRef, (snap) => {
      const list = [];
      snap.forEach((child) => {
        list.push({ id: child.key, ...child.val() });
      });
      setDebugLog("更新検知: " + list.length + "件 / " + new Date().toLocaleTimeString());
      setMessages(list);
    }, (error) => {
      setDebugLog("エラー: " + error.message);
    });

    return () => unsubscribe();
  }, [chatId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const send = async () => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    const msgRef = ref(db, "chats/" + chatId + "/messages");
    try {
      await push(msgRef, {
        text: text,
        senderUid: currentUser.uid,
        senderName: myProfile.name,
        timestamp: serverTimestamp(),
      });
      setDebugLog("送信成功: " + text);
    } catch (e) {
      setInput(text);
      setDebugLog("送信エラー: " + e.message);
    }
  };

  return (
    <div style={{ width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", height: "100vh" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: "#fff", boxShadow: "0 1px 8px rgba(61,107,79,0.07)", flexShrink: 0 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", fontSize: 20, color: "#6b8f71", cursor: "pointer" }}>←</button>
        <div style={{ fontSize: 28, width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", background: "#f0f7f2", borderRadius: "50%" }}>{chatTarget.avatar}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#3d6b4f" }}>{chatTarget.name}</div>
          <div style={{ fontSize: 10, color: "#999" }}>{debugLog}</div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "14px", display: "flex", flexDirection: "column", gap: 8, background: "#f0f7f2" }}>
        {messages.length === 0 && (
          <div style={{ textAlign: "center", padding: 32, color: "#6b8f71", fontSize: 13 }}>
            <div style={{ fontSize: 40 }}>{chatTarget.avatar}</div>
            <p style={{ marginTop: 8 }}>最初のメッセージを送りましょう 💚</p>
          </div>
        )}
        {messages.map((m) => {
          const isMe = m.senderUid === currentUser.uid;
          return (
            <div key={m.id} style={{ display: "flex", justifyContent: isMe ? "flex-end" : "flex-start", alignItems: "flex-end", gap: 6 }}>
              {!isMe && <div style={{ fontSize: 20, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", background: "#fff", borderRadius: "50%", flexShrink: 0 }}>{chatTarget.avatar}</div>}
              <div style={{ padding: "10px 14px", fontSize: 14, maxWidth: 260, lineHeight: 1.6, wordBreak: "break-word", ...(isMe ? { background: "#52a875", color: "#fff", borderRadius: "18px 18px 4px 18px" } : { background: "#fff", color: "#2d4a35", borderRadius: "18px 18px 18px 4px", boxShadow: "0 2px 8px rgba(61,107,79,0.08)" }) }}>
                {m.text}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div style={{ display: "flex", gap: 8, padding: "10px 14px", background: "#fff", borderTop: "1px solid #e8f5e9", flexShrink: 0 }}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} placeholder="メッセージを入力..." style={{ flex: 1, border: "1.5px solid #c8e6c9", borderRadius: 22, padding: "10px 16px", fontSize: 14, background: "#f0f7f2", outline: "none" }} />
        <button onClick={send} style={{ background: "#52a875", color: "#fff", border: "none", borderRadius: 22, padding: "10px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>送信</button>
      </div>
    </div>
  );
}

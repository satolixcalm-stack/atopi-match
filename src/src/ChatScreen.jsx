import { useState, useEffect, useRef } from "react";
import { getDatabase, ref, push, onValue, off, serverTimestamp } from "firebase/database";

function getChatId(uid1, uid2) {
  return [uid1, uid2].sort().join("_");
}

export default function ChatScreen({ currentUser, myProfile, chatTarget, onBack }) {
  const db = getDatabase();
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (!currentUser || !chatTarget) return;
    const chatId = getChatId(currentUser.uid, chatTarget.uid);
    const chatRef = ref(db, `chats/${chatId}/messages`);

    const unsub = onValue(chatRef, (snap) => {
      const msgs = [];
      if (snap.exists()) {
        snap.forEach((child) => {
          msgs.push({ id: child.key, ...child.val() });
        });
      }
      setMessages(msgs);
    });

    return () => off(chatRef);
  }, [currentUser?.uid, chatTarget?.uid]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!chatInput.trim() || !currentUser || !chatTarget) return;
    const text = chatInput.trim();
    setChatInput("");
    const chatId = getChatId(currentUser.uid, chatTarget.uid);
    try {
      await push(ref(db, `chats/${chatId}/messages`), {
        text,
        senderUid: currentUser.uid,
        senderName: myProfile?.name || "",
        timestamp: serverTimestamp(),
      });
    } catch (e) {
      setChatInput(text);
    }
  };

  return (
    <div style={{ width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", height: "100vh", fontFamily: "'Hiragino Sans','Yu Gothic',sans-serif" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: "#fff", boxShadow: "0 1px 8px rgba(61,107,79,0.07)", flexShrink: 0 }}>
        <button style={{ background: "none", border: "none", fontSize: 20, color: "#6b8f71", cursor: "pointer" }} onClick={onBack}>←</button>
        <div style={{ fontSize: 30, width: 42, height: 42, display: "flex", alignItems: "center", justifyContent: "center", background: "#f0f7f2", borderRadius: "50%" }}>{chatTarget?.avatar}</div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#3d6b4f" }}>{chatTarget?.name}</div>
          <div style={{ fontSize: 11, color: "#52a875" }}>● オンライン</div>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 14px", display: "flex", flexDirection: "column", gap: 8, background: "#f0f7f2" }}>
        {messages.length === 0 && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 32 }}>
            <div style={{ fontSize: 40 }}>{chatTarget?.avatar}</div>
            <p style={{ color: "#6b8f71", fontSize: 13, marginTop: 8 }}>
              {chatTarget?.name}さんとマッチしました！<br />最初のメッセージを送ってみましょう 💚
            </p>
          </div>
        )}
        {messages.map((m, i) => {
          const isMe = m.senderUid === currentUser?.uid;
          return (
            <div key={m.id || i} style={{ display: "flex", justifyContent: isMe ? "flex-end" : "flex-start", alignItems: "flex-end", gap: 6 }}>
              {!isMe && (
                <div style={{ fontSize: 22, width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", background: "#fff", borderRadius: "50%", flexShrink: 0 }}>
                  {chatTarget?.avatar}
                </div>
              )}
              <div style={isMe ? {
                background: "#52a875", color: "#fff", borderRadius: "18px 18px 4px 18px",
                padding: "10px 14px", fontSize: 14, maxWidth: 260, lineHeight: 1.6, wordBreak: "break-word"
              } : {
                background: "#fff", color: "#2d4a35", borderRadius: "18px 18px 18px 4px",
                padding: "10px 14px", fontSize: 14, maxWidth: 260, lineHeight: 1.6,
                boxShadow: "0 2px 8px rgba(61,107,79,0.08)", wordBreak: "break-word"
              }}>
                {m.text}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{ display: "flex", gap: 8, padding: "10px 14px", background: "#fff", borderTop: "1px solid #e8f5e9", flexShrink: 0 }}>
        <input
          style={{ flex: 1, border: "1.5px solid #c8e6c9", borderRadius: 22, padding: "10px 16px", fontSize: 14, background: "#f0f7f2", outline: "none" }}
          placeholder="メッセージを入力..."
          value={chatInput}
          onChange={e => setChatInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && sendMessage()}
        />
        <button
          style={{ background: "#52a875", color: "#fff", border: "none", borderRadius: 22, padding: "10px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
          onClick={sendMessage}
        >
          送信
        </button>
      </div>
    </div>
  );
}

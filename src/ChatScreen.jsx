import { useState, useEffect, useRef } from "react";
import { db, storage } from "./firebase.js";
import { ref, push, onValue, off, serverTimestamp, onDisconnect, set, get, update } from "firebase/database";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";

// チャットIDを2人のUIDから生成（順番に依存しないようにソート）
function getChatId(uid1, uid2) {
  return [uid1, uid2].sort().join("_");
}

// ────────────────────────────────────────────
// 画像タップで拡大表示するモーダル
// ────────────────────────────────────────────
function ImageModal({ url, onClose }) {
  if (!url) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)",
        zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
    >
      <img
        src={url}
        alt="拡大画像"
        style={{ maxWidth: "100%", maxHeight: "90vh", borderRadius: 12, objectFit: "contain" }}
      />
      <button
        onClick={onClose}
        style={{
          position: "absolute", top: 16, right: 16,
          background: "rgba(255,255,255,0.15)", border: "none", color: "#fff",
          borderRadius: "50%", width: 36, height: 36, fontSize: 18, cursor: "pointer",
        }}
      >✕</button>
    </div>
  );
}

export default function ChatScreen({ currentUser, myProfile, chatTarget, onBack, commons = [] }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isOnline, setIsOnline] = useState(false);

  // ── 画像送信用 state
  const [imageFile, setImageFile] = useState(null);       // 選択中のFileオブジェクト
  const [imagePreview, setImagePreview] = useState(null); // プレビュー用ObjectURL
  const [sending, setSending] = useState(false);          // 送信中フラグ
  const [modalUrl, setModalUrl] = useState(null);         // 拡大表示する画像URL

  const bottomRef = useRef(null);
  const msgAreaRef = useRef(null);
  const fileInputRef = useRef(null); // 画像inputの参照
  const chatId = getChatId(currentUser.uid, chatTarget.uid);

  // ── オンライン状態の監視

useEffect(() => {
  if (!currentUser || !chatTarget) return;

  const messagesRef = ref(db, "chats/" + chatId + "/messages");

  get(messagesRef).then((snap) => {
    if (!snap.exists()) return;

    const updates = {};

    snap.forEach(child => {
      const msg = child.val();

      if (msg.senderUid !== currentUser.uid && msg.read !== true) {
        updates[child.key + "/read"] = true;
      }
    });

    if (Object.keys(updates).length > 0) {
      update(messagesRef, updates);
    }
  });

}, [chatId]);
  
  useEffect(() => {
    const presenceRef = ref(db, `presence/${chatTarget.uid}`);
    const unsub = onValue(presenceRef, (snap) => {
      setIsOnline(snap.exists() && snap.val() === true);
    });
    return () => off(presenceRef);
  }, [chatTarget.uid]);

  // ── 自分のオンライン状態を管理
  useEffect(() => {
    const myPresenceRef = ref(db, `presence/${currentUser.uid}`);
    set(myPresenceRef, true);
    onDisconnect(myPresenceRef).set(false);
    return () => set(myPresenceRef, false);
  }, [currentUser.uid]);

  // ── メッセージ一覧をリアルタイム取得
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

  // ── 最新メッセージへ自動スクロール
  const scrollToBottom = () => {
    if (msgAreaRef.current) {
      msgAreaRef.current.scrollTop = msgAreaRef.current.scrollHeight;
    }
  };
  useEffect(() => {
    scrollToBottom();
  }, [messages.length]);

  // ── スマホのキーボード展開時もスクロール
  useEffect(() => {
    const handleResize = () => setTimeout(scrollToBottom, 150);
    window.visualViewport?.addEventListener("resize", handleResize);
    return () => window.visualViewport?.removeEventListener("resize", handleResize);
  }, []);

  // ────────────────────────────────────────────
  // 画像ファイル選択時のハンドラ
  // ────────────────────────────────────────────
  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // バリデーション：jpeg / png のみ
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      alert("JPEGまたはPNG画像のみ送信できます");
      return;
    }
    // バリデーション：3MB以下
    if (file.size > 3 * 1024 * 1024) {
      alert("画像は3MB以下にしてください");
      return;
    }

    setImageFile(file);
    setImagePreview(URL.createObjectURL(file)); // プレビュー用URL生成
    e.target.value = ""; // 同じファイルを再選択できるようリセット
  };

  // 選択した画像をキャンセル
  const cancelImage = () => {
    setImageFile(null);
    setImagePreview(null);
  };

  // ────────────────────────────────────────────
  // テキスト送信
  // ────────────────────────────────────────────
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
  read: false,  // ← 追加
});
    } catch (e) {
      setInput(text); // 失敗時は入力欄に戻す
    }
  };

  // ────────────────────────────────────────────
  // 画像送信（Storage → Database）
  // ────────────────────────────────────────────
  const sendImage = async () => {
    if (!imageFile || sending) return;
    setSending(true);
    try {
      // Storage保存パス: chats/{chatId}/{timestamp}_{filename}
      const fileName = `${Date.now()}_${imageFile.name}`;
      const path = `chats/${chatId}/${fileName}`;
      const fileRef = storageRef(storage, path);

      // Storageにアップロード
      await uploadBytes(fileRef, imageFile);

      // ダウンロードURLを取得
      const imageUrl = await getDownloadURL(fileRef);

      // Realtime Databaseにメッセージとして保存
      // ※ textの代わりにimageUrlを持つ構造
      await push(ref(db, "chats/" + chatId + "/messages"), {
  imageUrl,
  senderUid: currentUser.uid,
  senderName: myProfile.name,
  timestamp: serverTimestamp(),
  read: false,  // ← 追加
});

      // 送信成功後にプレビューをクリア
      cancelImage();
    } catch (e) {
      alert("画像の送信に失敗しました: " + e.message);
    } finally {
      setSending(false);
    }
  };

  // ────────────────────────────────────────────
  // メッセージ1件分のバブルを描画
  // テキスト / 画像 を分岐して表示
  // ────────────────────────────────────────────
  const renderMessage = (m) => {
    const isMe = m.senderUid === currentUser.uid;

    // 共通のバブルスタイル
    const bubbleBase = {
      maxWidth: 240,
      lineHeight: 1.6,
      wordBreak: "break-word",
    };
    const myBubble = {
      ...bubbleBase,
      background: "#52a875", color: "#fff",
      borderRadius: "18px 18px 4px 18px",
      padding: "8px 12px", fontSize: 14,
    };
    const theirBubble = {
      ...bubbleBase,
      background: "#fff", color: "#2d4a35",
      borderRadius: "18px 18px 18px 4px",
      boxShadow: "0 2px 8px rgba(61,107,79,0.08)",
      padding: "8px 12px", fontSize: 14,
    };

    return (
      <div
        key={m.id}
        style={{
          display: "flex",
          justifyContent: isMe ? "flex-end" : "flex-start",
          alignItems: "flex-end",
          gap: 6,
        }}
      >
        
       {/* 相手のアバター（左側に表示） */}
{!isMe && (
  chatTarget.avatarUrl ? (
    <img src={chatTarget.avatarUrl} alt="avatar"
      style={{ width:30, height:30, borderRadius:"50%", objectFit:"cover", flexShrink:0, border:"1px solid #c8e6c9" }} />
  ) : (
    <div style={{
      fontSize: 18, width: 30, height: 30,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "#fff", borderRadius: "50%", flexShrink: 0,
    }}>
      {chatTarget.avatar}
    </div>
  )

        )}

        {/* ── 画像メッセージ */}
        {m.imageUrl ? (
          <img
            src={m.imageUrl}
            alt="送信画像"
            onClick={() => setModalUrl(m.imageUrl)} // タップで拡大
            style={{
              maxWidth: 200, maxHeight: 200,
              borderRadius: 12, objectFit: "cover",
              cursor: "pointer",
              border: isMe ? "none" : "1px solid #e0ede5",
            }}
          />
        ) : (
          /* ── テキストメッセージ */
          <div style={isMe ? myBubble : theirBubble}>
            {m.text}
          </div>
        )}
      </div>
    );
  };

  // ────────────────────────────────────────────
  // UI
  // ────────────────────────────────────────────
  return (
    <div style={{
      width: "100%", maxWidth: 420,
      display: "flex", flexDirection: "column",
      height: "100dvh", position: "fixed",
      top: 0, left: "50%", transform: "translateX(-50%)",
    }}>

      {/* 拡大モーダル */}
      <ImageModal url={modalUrl} onClose={() => setModalUrl(null)} />

      {/* ヘッダー */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 16px", background: "#fff",
        boxShadow: "0 1px 8px rgba(61,107,79,0.07)", flexShrink: 0,
      }}>
        <button onClick={onBack} style={{ background: "none", border: "none", fontSize: 20, color: "#6b8f71", cursor: "pointer" }}>←</button>
       {chatTarget.avatarUrl ? (
  <img src={chatTarget.avatarUrl} alt="avatar"
    style={{ width:38, height:38, borderRadius:"50%", objectFit:"cover", border:"2px solid #c8e6c9" }} />
) : (
  <div style={{
    fontSize: 26, width: 38, height: 38,
    display: "flex", alignItems: "center", justifyContent: "center",
    background: "#f0f7f2", borderRadius: "50%",
  }}>
    {chatTarget.avatar}
  </div>
)}
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#3d6b4f" }}>{chatTarget.name}</div>
          <div style={{ fontSize: 10, color: isOnline ? "#52a875" : "#aaa" }}>
            {isOnline ? "● オンライン" : "○ オフライン"}
          </div>
        </div>
      </div>

      {/* メッセージ一覧エリア */}
      <div
        ref={msgAreaRef}
        style={{
          flex: 1, overflowY: "auto", padding: "12px",
          display: "flex", flexDirection: "column", justifyContent: "flex-end",
          gap: 8, background: "#f0f7f2",
        }}
      >
        {/* メッセージがない時の表示 */}
        {messages.length === 0 && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 32 }}>
           {chatTarget.avatarUrl ? (
  <img src={chatTarget.avatarUrl} alt="avatar"
    style={{ width:60, height:60, borderRadius:"50%", objectFit:"cover", border:"2px solid #c8e6c9" }} />
) : (
  <div style={{ fontSize: 40 }}>{chatTarget.avatar}</div>
)}
            <p style={{ color: "#6b8f71", fontSize: 13, marginTop: 8 }}>
              {chatTarget.name}さんとマッチ！<br />最初のメッセージを送りましょう 💚
            </p>
          </div>
        )}

        {/* メッセージ一覧 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {messages.map(renderMessage)}
        </div>
        <div ref={bottomRef} />
      </div>

      {/* 最初の一言候補（メッセージがない時のみ） */}
      {messages.length === 0 && commons.length > 0 && (
        <div style={{
          padding: "8px 12px", background: "#f0f7f2",
          borderTop: "1px solid #e8f5e9",
          display: "flex", flexDirection: "column", gap: 6,
        }}>
          <div style={{ fontSize: 11, color: "#6b8f71", fontWeight: 700 }}>🌿 共通点から話しかけてみましょう</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {[
              commons[0] ? commons[0] + "の話、よく分かります…！" : null,
              "最近どんな感じですか？",
              "はじめまして！よろしくお願いします 💚"
            ].filter(Boolean).map((s, i) => (
              <button key={i} onClick={() => setInput(s)}
                style={{ background: "#fff", border: "1.5px solid #c8e6c9", borderRadius: 20, padding: "5px 12px", fontSize: 12, color: "#3d6b4f", cursor: "pointer" }}>
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 画像プレビューエリア（画像選択時のみ表示） */}
      {imagePreview && (
        <div style={{
          padding: "8px 12px", background: "#fff",
          borderTop: "1px solid #e8f5e9",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          {/* プレビュー画像 */}
          <img
            src={imagePreview}
            alt="送信プレビュー"
            style={{ width: 64, height: 64, borderRadius: 10, objectFit: "cover", border: "1.5px solid #c8e6c9" }}
          />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: "#6b8f71", marginBottom: 4 }}>
              {imageFile?.name}
            </div>
            <div style={{ fontSize: 11, color: "#a8c5b0" }}>
              {(imageFile?.size / 1024).toFixed(0)}KB
            </div>
          </div>
          {/* キャンセルボタン */}
          <button
            onClick={cancelImage}
            style={{ background: "none", border: "none", color: "#e57373", fontSize: 20, cursor: "pointer", padding: 4 }}
          >✕</button>
          {/* 画像送信ボタン */}
          <button
            onClick={sendImage}
            disabled={sending}
            style={{
              background: sending ? "#a8c5b0" : "#52a875",
              color: "#fff", border: "none", borderRadius: 20,
              padding: "8px 16px", fontSize: 13, fontWeight: 700,
              cursor: sending ? "not-allowed" : "pointer",
            }}
          >
            {sending ? "送信中..." : "送信"}
          </button>
        </div>
      )}

      {/* テキスト入力欄 + 画像選択ボタン */}
      <div style={{
        display: "flex", gap: 8, padding: "8px 12px",
        background: "#fff", borderTop: "1px solid #e8f5e9", flexShrink: 0,
        alignItems: "center",
      }}>
        {/* 画像選択ボタン（カメラアイコン） */}
        <label style={{ flexShrink: 0, cursor: "pointer" }}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png"
            style={{ display: "none" }}
            onChange={handleImageSelect}
          />
          <div style={{
            width: 38, height: 38, borderRadius: "50%",
            background: "#f0f7f2", border: "1.5px solid #c8e6c9",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18,
          }}>
            📷
          </div>
        </label>

        {/* テキスト入力 */}
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && send()}
          onFocus={() => setTimeout(scrollToBottom, 400)}
          placeholder="メッセージを入力..."
          style={{
            flex: 1, border: "1.5px solid #c8e6c9", borderRadius: 22,
            padding: "10px 16px", fontSize: 14, background: "#f0f7f2", outline: "none",
          }}
        />

        {/* テキスト送信ボタン */}
        <button
          onClick={send}
          style={{
            background: "#52a875", color: "#fff", border: "none",
            borderRadius: 22, padding: "10px 16px",
            fontSize: 14, fontWeight: 700, cursor: "pointer", flexShrink: 0,
          }}
        >
          送信
        </button>
      </div>
    </div>
  );
}

import { useState, useEffect, useRef } from "react";
import { db } from "./firebase.js";
import { ref, get, set, remove, onValue, off, push } from "firebase/database";

// 👇 アバター表示コンポーネント
function Avatar({ avatarUrl, avatar, size = 24 }) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          objectFit: "cover"
        }}
      />
    );
  }
  return <span style={{ fontSize: size }}>{avatar || "🌿"}</span>;
}

function TimelinePostInner({
  post,
  ownerUid,
  currentUser,
  onClickUser,
  canDelete,
  onDelete,
  highlightedPostId,
  clearHighlight
}) {
  const [replyTarget, setReplyTarget] = useState(null);
  const [likes, setLikes] = useState(post.likes || {});
  const [likeUsers, setLikeUsers] = useState([]);
  const [comments, setComments] = useState([]);
  const [commentInput, setCommentInput] = useState("");
  const [commentPage, setCommentPage] = useState(1);
  const [ownerUser, setOwnerUser] = useState(null);

  const COMMENT_PAGE_SIZE = 3;
  const postRef = useRef(null);
  const inputRef = useRef(null);
  const isHighlighted = post.id === highlightedPostId;
  const isOwner = currentUser.uid === ownerUid;

  // ── 投稿者情報取得（🔥追加）
 useEffect(() => {
  if (!isHighlighted) return;

  // requestAnimationFrame でDOM確定後に実行（即時・遅延なし）
  const raf = requestAnimationFrame(() => {
    if (postRef.current) {
      postRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });

  const clearTimer = setTimeout(() => {
    if (clearHighlight) clearHighlight();
  }, 1000);

  return () => {
    cancelAnimationFrame(raf);
    clearTimeout(clearTimer);
  };
}, [isHighlighted]);
  useEffect(() => {
    const loadUser = async () => {
      const snap = await get(ref(db, "users/" + ownerUid));
      if (snap.exists()) {
        setOwnerUser(snap.val());
      }
    };
    loadUser();
  }, [ownerUid]);

  // ── いいね
  useEffect(() => {
    const likeRef = ref(db, "timeline/" + ownerUid + "/" + post.id + "/likes");

    const unsub = onValue(likeRef, async (snap) => {
      const likesData = snap.exists() ? snap.val() : {};
      setLikes(likesData);

      const uids = Object.keys(likesData);

      const users = await Promise.all(
        uids.map(async (uid) => {
          const s = await get(ref(db, "users/" + uid));
          return s.exists()
            ? {
                uid,
                name: s.val().name,
                avatar: s.val().avatar,
                avatarUrl: s.val().avatarUrl
              }
            : {
                uid,
                name: "不明",
                avatar: "🌿",
                avatarUrl: ""
              };
        })
      );

      setLikeUsers(users);
    });

    return () => off(likeRef);
  }, [ownerUid, post.id]);

  // ── コメント
  useEffect(() => {
    const commentRef = ref(
      db,
      "timeline/" + ownerUid + "/" + post.id + "/comments"
    );

    const unsub = onValue(commentRef, (snap) => {
      if (!snap.exists()) {
        setComments([]);
        return;
      }

      const val = snap.val();

      const list = Object.entries(val)
        .filter(([, v]) => v && v.text && v.createdAt)
        .map(([key, v]) => ({
  id: key,
  ...v,
  likes: v.likes || {}
}))
        .sort((a, b) => b.createdAt - a.createdAt);

      setComments(list);
    });

    return () => off(commentRef);
  }, [ownerUid, post.id]);

  const toggleLike = async () => {
    if (isOwner) return;

    const likeRef = ref(
      db,
      "timeline/" + ownerUid + "/" + post.id + "/likes/" + currentUser.uid
    );

    if (likes[currentUser.uid]) {
      await remove(likeRef);
    } else {
      await set(likeRef, true);
    }
  };

  const postComment = async () => {
  const text = commentInput.trim();
  if (!text) return;
  setCommentInput("");

  const snap = await get(ref(db, "users/" + currentUser.uid));
  const user = snap.val();

  await push(
    ref(db, "timeline/" + ownerUid + "/" + post.id + "/comments"),
    {
      text,
      userId: currentUser.uid,
      userName: user.name,
      userAvatar: user.avatar,
      userAvatarUrl: user.avatarUrl || "",
      createdAt: Date.now(),
      replyTo: replyTarget
        ? { userId: replyTarget.userId, userName: replyTarget.userName, commentId: replyTarget.id }
        : null
    }
  );
    
 // ① 投稿者への通知（自分の投稿へのコメントは除く）
if (ownerUid !== currentUser.uid) {
  await set(push(ref(db, "notifications/" + ownerUid)), {
    type: "comment",
    targetType: "post",        // ← 追加
    fromUserId: currentUser.uid,
    fromUserName: user.name,
    fromUserAvatar: user.avatar || "",
    postId: post.id,
    ownerUid: ownerUid,
    createdAt: Date.now(),
    read: false
  });
}

// ② 返信先への通知（重複なし・1回だけ）
if (replyTarget && replyTarget.userId !== currentUser.uid && replyTarget.userId !== ownerUid) {
  await set(push(ref(db, "notifications/" + replyTarget.userId)), {
    type: "comment",           // ← "reply" から "comment" に変更
    targetType: "comment",     // ← 追加
    fromUserId: currentUser.uid,
    fromUserName: user.name,
    fromUserAvatar: user.avatar || "",
    postId: post.id,
    ownerUid: ownerUid,
    createdAt: Date.now(),
    read: false
  });
}
  setReplyTarget(null);
};
  const toggleCommentLike = async (commentId, currentLikes, commentUserId) => {
  if (commentUserId === currentUser.uid) return; // ←追加

  const likeRef = ref(
    db,
    `timeline/${ownerUid}/${post.id}/comments/${commentId}/likes/${currentUser.uid}`
  );

  if (currentLikes && currentLikes[currentUser.uid]) {
    await remove(likeRef);
  } else {
    await set(likeRef, true);
  }
};
  const deleteComment = async (commentId) => {
  if (!window.confirm("コメントを削除しますか？")) return;

  try {
    await remove(
      ref(
        db,
        `timeline/${ownerUid}/${post.id}/comments/${commentId}`
      )
    );
  } catch (e) {
    console.error("コメント削除失敗:", e);
    alert("削除に失敗しました");
  }
};
  // 返信ボタンを押したときの処理
const handleReply = (target) => {
  setReplyTarget(target);

  // replyTargetのstateが反映されてからスクロール・フォーカスする必要があるため
  // requestAnimationFrameで1フレーム待つ
  requestAnimationFrame(() => {
    if (inputRef.current) {
      inputRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      inputRef.current.focus();
    }
  });
};
  const isLiked = !!likes[currentUser.uid];
  const likeCount = Object.keys(likes).length;
  const displayUsers = likeUsers.slice(0, 3);
  // 🔥 日付フォーマット
const formatDate = (ts) => {
  const diff = Date.now() - ts;

  if (diff < 60000) return "たった今";
  if (diff < 3600000) return Math.floor(diff / 60000) + "分前";
  if (diff < 86400000) return Math.floor(diff / 3600000) + "時間前";

  return new Date(ts).toLocaleDateString();
};
  // 🔥 コメントを親子に分ける
const parentComments = comments.filter(c => !c.replyTo);

const repliesMap = {};
comments.forEach(c => {
  if (c.replyTo) {
    const parentId = c.replyTo.commentId;
    if (!repliesMap[parentId]) {
      repliesMap[parentId] = [];
    }
    repliesMap[parentId].push(c);
  }
});
  return (
  <div
  id={`post-${post.id}`}   
  ref={postRef}
  style={{
    padding: "12px",
    background: isHighlighted ? "#fff3cd" : "#f0f7f2",
　　transition: "0.3s",
    borderRadius: 12,
    position: "relative" // ←ここ追加
  }}
>
    {canDelete && (
  <button
    onClick={onDelete}
    style={{
      position: "absolute",
      top: 6,
      right: 6,
      background: "transparent",
      border: "none",
      color: "#e53935",
      fontSize: 18,
      cursor: "pointer"
    }}
  >
    ×
  </button>
)}
      {/* 🔥 投稿者表示 */}
  {ownerUser && (
  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
      <Avatar avatarUrl={ownerUser.avatarUrl} avatar={ownerUser.avatar} />
      <span style={{ fontWeight: 700 }}>{ownerUser.name}</span>
    </div>

    {/* 投稿への返信ボタン */}
    {!isOwner && (
      <button
        onClick={() => handleReply({
          userId: ownerUid,
          userName: ownerUser.name,
          id: post.id
        })}
        style={{
          background: "transparent",
          border: "none",
          fontSize: 12,
          cursor: "pointer",
          color: "#666"
        }}
      >
        返信
      </button>
    )}
  </div>
)}

      {/* 投稿内容 */}
      <div style={{ fontSize: 14 }}>{post.text}</div>
<div
  style={{
    fontSize: 11,
    color: "#888",
    marginTop: 4,
    display: "flex",
    alignItems: "center",
    gap: 6 
  }}
>
  {/* 左：日時 */}
  <span>{formatDate(post.createdAt)}</span>

  {/* 右：いいね＋ユーザー */}
  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
    
    <button
      onClick={toggleLike}
      disabled={isOwner}
      style={{
        background: "transparent",
        border: "none",
        cursor: isOwner ? "default" : "pointer",
        fontSize: 14,
        color: isLiked ? "#e53935" : "#999",
        opacity: isOwner ? 0.4 : 1
      }}
    >
      ❤️ {likeCount}
    </button>

    {displayUsers.map((u) => (
      <div key={u.uid} onClick={() => onClickUser(u.uid)}>
        <Avatar avatarUrl={u.avatarUrl} avatar={u.avatar} size={16} />
      </div>
    ))}
    
</div>
  </div>
      {post.imageUrl && (
        <img
          src={post.imageUrl}
          style={{
            width: "100%",
            borderRadius: 8,
            marginTop: 6
          }}
        />
      )}


      {/* コメント */}
    {/* コメント */}
<div style={{ marginTop: 10 }}>
  {parentComments.map((parent) => (
    <div key={parent.id} style={{ marginBottom: 10 }}>
      
      {/* 親コメント */}
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 6 }}>
          
          <div
            style={{ cursor: "pointer" }}
            onClick={() => onClickUser(parent.userId)}
          >
            <Avatar
              avatarUrl={parent.userAvatarUrl}
              avatar={parent.userAvatar}
              size={18}
            />
          </div>

          <div>
            <div>
              <b>{parent.userName}</b>：{parent.text}
            </div>

         <div
  style={{
    fontSize: 10,
    color: "#888",
    display: "flex",
    alignItems: "center",
    gap: 6   // ←これが重要
  }}
>
  <span>{parent.createdAt && formatDate(parent.createdAt)}</span>

  <button
    onClick={() => toggleCommentLike(parent.id, parent.likes, parent.userId)}
    disabled={parent.userId === currentUser.uid}
    style={{
      background: "transparent",
      border: "none",
      cursor: parent.userId === currentUser.uid ? "default" : "pointer",
      fontSize: 11,
      color: parent.likes?.[currentUser.uid] ? "#e53935" : "#999",
      opacity: parent.userId === currentUser.uid ? 0.4 : 1
    }}
  >
    ❤️ {parent.likes ? Object.keys(parent.likes).length : 0}
  </button>
</div>
       </div>
         
        </div>

        <div style={{ display: "flex", gap: 6 }}>
          <button
  onClick={() => handleReply(parent)}
  style={{
    background: "transparent",
    border: "none",
    fontSize: 12,
    cursor: "pointer",
    color: "#666"
  }}
>
  返信
</button>

          {(parent.userId === currentUser.uid || ownerUid === currentUser.uid) && (
            <button
              onClick={() => deleteComment(parent.id)}
              style={{
                background: "transparent",
                border: "none",
                color: "#e53935",
                fontSize: 14,
                cursor: "pointer"
              }}
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* 🔥 返信一覧 */}
      {repliesMap[parent.id] && (
        <div style={{ marginLeft: 24, marginTop: 4 }}>
          {repliesMap[parent.id].map((reply) => (
            <div
              key={reply.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 4
              }}
            >
              <div style={{ display: "flex", gap: 6 }}>
                
                <div
                  style={{ cursor: "pointer" }}
                  onClick={() => onClickUser(reply.userId)}
                >
                  <Avatar
                    avatarUrl={reply.userAvatarUrl}
                    avatar={reply.userAvatar}
                    size={16}
                  />
                </div>

                <div>
                  <div>
                    <b>{reply.userName}</b>：{reply.text}
                  </div>
<div
  style={{
    fontSize: 10,
    color: "#888",
    display: "flex",
    alignItems: "center",
    gap: 6
  }}
>
  <span>{reply.createdAt && formatDate(reply.createdAt)}</span>

  <button
    onClick={() => toggleCommentLike(reply.id, reply.likes, reply.userId)}
    disabled={reply.userId === currentUser.uid}
    style={{
      background: "transparent",
      border: "none",
      cursor: reply.userId === currentUser.uid ? "default" : "pointer",
      fontSize: 11,
      color: reply.likes?.[currentUser.uid] ? "#e53935" : "#999",
      opacity: reply.userId === currentUser.uid ? 0.4 : 1
    }}
  >
    ❤️ {reply.likes ? Object.keys(reply.likes).length : 0}
  </button>
</div>

                </div>
              </div>

              <div style={{ display: "flex", gap: 6 }}>
                

                {(reply.userId === currentUser.uid || ownerUid === currentUser.uid) && (
                  <button
                    onClick={() => deleteComment(reply.id)}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#e53935",
                      fontSize: 14,
                      cursor: "pointer"
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  ))}
</div>

      {/* 入力 */}
      {replyTarget && (
  <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>
    {replyTarget.userName} に返信中
    <span
      onClick={() => setReplyTarget(null)}
      style={{ marginLeft: 8, cursor: "pointer" }}
    >
      ✕
    </span>
  </div>
)}
      <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
        <input
  ref={inputRef}  // ← 追加
  value={commentInput}
  onChange={(e) => setCommentInput(e.target.value)}
  placeholder="コメント..."
  style={{ flex: 1 }}
/>
        <button onClick={postComment}>送信</button>
      </div>
    </div>
  );
}

export default function TimelinePost(props) {
  if (!props.post || !props.currentUser) return null;
  return <TimelinePostInner {...props} />;
}

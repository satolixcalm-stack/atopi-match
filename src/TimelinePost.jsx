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
  const isHighlighted = post.id === highlightedPostId;
  const isOwner = currentUser.uid === ownerUid;

  // ── 投稿者情報取得（🔥追加）
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
        .map(([key, v]) => ({ id: key, ...v }))
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
      userAvatarUrl: user.avatarUrl,
      createdAt: Date.now(),

      // 🔥 ここ追加
      replyTo: replyTarget
        ? {
            userId: replyTarget.userId,
            userName: replyTarget.userName,
            commentId: replyTarget.id
          }
        : null
    }
  );

  // 🔥 返信状態リセット
  setReplyTarget(null);
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
      ref={postRef}
      style={{
        padding: "12px",
        background: "#f0f7f2",
        borderRadius: 12
      }}
    >
      {/* 🔥 投稿者表示 */}
      {ownerUser && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 8
          }}
        >
          <Avatar
            avatarUrl={ownerUser.avatarUrl}
            avatar={ownerUser.avatar}
          />
          <span style={{ fontWeight: 700 }}>{ownerUser.name}</span>
        </div>
      )}

      {/* 投稿内容 */}
      <div style={{ fontSize: 14 }}>{post.text}</div>
<div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
  {formatDate(post.createdAt)}
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
<div style={{ position: "relative" }}>
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

  {/* ここに投稿内容 */}
</div>
      {/* いいね */}
     <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
  
  {/* いいねボタン */}
  <button
    onClick={toggleLike}
    style={{
      background: "transparent",
      border: "none",
      cursor: "pointer",
      fontSize: 16,
      padding: 4,
      color: isLiked ? "#e53935" : "#999",
      transition: "transform 0.1s"
    }}
    onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.9)")}
    onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
  >
    ❤️ {likeCount}
  </button>

  {/* いいねしたユーザー（アバターだけ） */}
  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
    {displayUsers.map((u) => (
      <div
        key={u.uid}
        style={{ cursor: "pointer" }}
        onClick={() => onClickUser(u.uid)}
      >
        <Avatar avatarUrl={u.avatarUrl} avatar={u.avatar} size={20} />
      </div>
    ))}
  </div>

</div>

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

            <div style={{ fontSize: 10, color: "#888" }}>
              {parent.createdAt && formatDate(parent.createdAt)}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={() => setReplyTarget(parent)}
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

                  <div style={{ fontSize: 10, color: "#888" }}>
                    {reply.createdAt && formatDate(reply.createdAt)}
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={() => setReplyTarget(parent)}
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

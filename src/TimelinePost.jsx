import { useState, useEffect, useRef } from "react";
import { db } from "./firebase.js";
import { ref, get, set, remove, onValue, off, push } from "firebase/database";

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
  const [ownerUser, setOwnerUser] = useState(null);

  const postRef = useRef(null);
  const isHighlighted = post.id === highlightedPostId;
  const isOwner = currentUser.uid === ownerUid;

  // 🔥 ハイライト＋スクロール
  useEffect(() => {
    if (!isHighlighted) return;

    requestAnimationFrame(() => {
      postRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });

    const timer = setTimeout(() => {
      clearHighlight && clearHighlight();
    }, 1500);

    return () => clearTimeout(timer);
  }, [isHighlighted]);

  // 投稿者取得
  useEffect(() => {
    const load = async () => {
      const snap = await get(ref(db, "users/" + ownerUid));
      if (snap.exists()) setOwnerUser(snap.val());
    };
    load();
  }, [ownerUid]);

  // いいね取得
  useEffect(() => {
    const likeRef = ref(db, `timeline/${ownerUid}/${post.id}/likes`);

    const unsub = onValue(likeRef, async (snap) => {
      const data = snap.exists() ? snap.val() : {};
      setLikes(data);

      const users = await Promise.all(
        Object.keys(data).map(async (uid) => {
          const s = await get(ref(db, "users/" + uid));
          return s.exists()
            ? { uid, ...s.val() }
            : { uid, name: "不明", avatar: "🌿" };
        })
      );

      setLikeUsers(users);
    });

    return () => off(likeRef);
  }, [ownerUid, post.id]);

  // コメント取得
  useEffect(() => {
    const refPath = ref(db, `timeline/${ownerUid}/${post.id}/comments`);

    const unsub = onValue(refPath, (snap) => {
      if (!snap.exists()) {
        setComments([]);
        return;
      }

      const list = Object.entries(snap.val()).map(([id, v]) => ({
        id,
        ...v,
        likes: v.likes || {}
      }));

      list.sort((a, b) => b.createdAt - a.createdAt);
      setComments(list);
    });

    return () => off(refPath);
  }, [ownerUid, post.id]);

  // 🔥 投稿いいね
  const toggleLike = async () => {
    if (isOwner) return;

    const likeRef = ref(
      db,
      `timeline/${ownerUid}/${post.id}/likes/${currentUser.uid}`
    );

    if (likes[currentUser.uid]) {
      await remove(likeRef);
    } else {
      await set(likeRef, true);
    }
  };

  // 🔥 コメント投稿（通知修正版）
  const postComment = async () => {
    const text = commentInput.trim();
    if (!text) return;

    setCommentInput("");

    const snap = await get(ref(db, "users/" + currentUser.uid));
    const user = snap.val();

    // コメント保存
    await push(
      ref(db, `timeline/${ownerUid}/${post.id}/comments`),
      {
        text,
        userId: currentUser.uid,
        userName: user.name,
        userAvatar: user.avatar,
        userAvatarUrl: user.avatarUrl,
        createdAt: Date.now(),
        replyTo: replyTarget
          ? {
              userId: replyTarget.userId,
              userName: replyTarget.userName,
              commentId: replyTarget.id
            }
          : null
      }
    );

    // 🔥 投稿者通知
    if (ownerUid !== currentUser.uid) {
      await set(
        push(ref(db, `notifications/${ownerUid}`)),
        {
          type: "comment",
          fromUserId: currentUser.uid,
          fromUserName: user.name,
          fromUserAvatar: user.avatar,
          fromUserAvatarUrl: user.avatarUrl,
          postId: post.id,
          ownerUid,
          createdAt: Date.now(),
          read: false
        }
      );
    }

    // 🔥 返信通知
    if (replyTarget && replyTarget.userId !== currentUser.uid) {
      await set(
        push(ref(db, `notifications/${replyTarget.userId}`)),
        {
          type: "reply",
          fromUserId: currentUser.uid,
          fromUserName: user.name,
          fromUserAvatar: user.avatar,
          fromUserAvatarUrl: user.avatarUrl,
          postId: post.id,
          ownerUid,
          createdAt: Date.now(),
          read: false
        }
      );
    }

    setReplyTarget(null);
  };

  const formatDate = (ts) => {
    const diff = Date.now() - ts;
    if (diff < 60000) return "たった今";
    if (diff < 3600000) return Math.floor(diff / 60000) + "分前";
    if (diff < 86400000) return Math.floor(diff / 3600000) + "時間前";
    return new Date(ts).toLocaleDateString();
  };

  const isLiked = !!likes[currentUser.uid];
  const likeCount = Object.keys(likes).length;
  const displayUsers = likeUsers.slice(0, 3);

  const parentComments = comments.filter(c => !c.replyTo);
  const repliesMap = {};
  comments.forEach(c => {
    if (c.replyTo) {
      const pid = c.replyTo.commentId;
      if (!repliesMap[pid]) repliesMap[pid] = [];
      repliesMap[pid].push(c);
    }
  });

  return (
    <div
      ref={postRef}
      style={{
        padding: 12,
        background: isHighlighted ? "#fff3cd" : "#f0f7f2",
        borderRadius: 12,
        position: "relative"
      }}
    >
      {canDelete && (
        <button onClick={onDelete} style={{ position: "absolute", right: 6 }}>
          ×
        </button>
      )}

      {ownerUser && (
        <div style={{ display: "flex", gap: 8 }}>
          <Avatar {...ownerUser} />
          <b>{ownerUser.name}</b>
        </div>
      )}

      <div>{post.text}</div>

      <div style={{ display: "flex", gap: 6, fontSize: 12 }}>
        <span>{formatDate(post.createdAt)}</span>

        <button onClick={toggleLike} disabled={isOwner}>
          ❤️ {likeCount}
        </button>

        {displayUsers.map((u) => (
          <Avatar key={u.uid} {...u} size={16} />
        ))}
      </div>

      {/* コメント */}
      {parentComments.map(parent => (
        <div key={parent.id}>
          <b>{parent.userName}</b>：{parent.text}
          <button onClick={() => setReplyTarget(parent)}>返信</button>

          {repliesMap[parent.id]?.map(r => (
            <div key={r.id} style={{ marginLeft: 20 }}>
              <b>{r.userName}</b>：{r.text}
              <button onClick={() => setReplyTarget(r)}>返信</button>
            </div>
          ))}
        </div>
      ))}

      {replyTarget && <div>{replyTarget.userName}に返信中</div>}

      <input
        value={commentInput}
        onChange={(e) => setCommentInput(e.target.value)}
      />
      <button onClick={postComment}>送信</button>
    </div>
  );
}

export default function TimelinePost(props) {
  if (!props.post || !props.currentUser) return null;
  return <TimelinePostInner {...props} />;
}

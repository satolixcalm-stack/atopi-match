
import { useState, useEffect, useRef } from "react";
import { db } from "./firebase.js";
import { ref, get, set, remove, onValue, off, push } from "firebase/database";

function TimelinePostInner({ post, ownerUid, currentUser, onClickUser, canDelete, onDelete, highlightedPostId, clearHighlight }) {
  const [likes, setLikes] = useState(post.likes || {});
  const [likeUsers, setLikeUsers] = useState([]);
  const [comments, setComments] = useState([]);
  const [commentInput, setCommentInput] = useState("");
  const [commentPage, setCommentPage] = useState(1);
  const COMMENT_PAGE_SIZE = 3;
  const postRef = useRef(null);
  const isHighlighted = post.id === highlightedPostId;
  const isOwner = currentUser.uid === ownerUid;

  // いいねリアルタイム監視
  useEffect(() => {
    const likeRef = ref(db, "timeline/" + ownerUid + "/" + post.id + "/likes");
    const unsub = onValue(likeRef, async (snap) => {
      const likesData = snap.exists() ? snap.val() : {};
      setLikes(likesData);
      const uids = Object.keys(likesData);
      const users = await Promise.all(uids.map(async uid => {
        const s = await get(ref(db, "users/" + uid));
        return s.exists() ? { uid, name: s.val().name, avatar: s.val().avatar } : { uid, name: "不明", avatar: "🌿" };
      }));
      setLikeUsers(users);
    });
    return () => off(likeRef);
  }, [ownerUid, post.id]);

  // コメントリアルタイム監視
  useEffect(() => {
    const path = "timeline/" + ownerUid + "/" + post.id + "/comments";
    console.log("コメント監視パス:", path);
    const commentRef = ref(db, path);
    const unsub = onValue(commentRef, (snap) => {
      if (!snap.exists()) { setComments([]); return; }
      const list = [];
      snap.forEach(c => list.push({ id: c.key, ...c.val() }));
      console.log("コメント数:", list.length, "ownerUid:", ownerUid, "postId:", post.id);
      setComments(list.slice().reverse());
    });
    return () => off(commentRef);
  }, [ownerUid, post.id]);

  // ハイライト＆スクロール処理
  useEffect(() => {
    if (isHighlighted && postRef.current) {
      setTimeout(() => {
        postRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 200);
      const timer = setTimeout(() => {
        if (clearHighlight) clearHighlight();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isHighlighted]);

  const toggleLike = async () => {
    if (isOwner) return;
    const likeRef = ref(db, "timeline/" + ownerUid + "/" + post.id + "/likes/" + currentUser.uid);
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
    const userName = snap.exists() ? snap.val().name : "不明";
    const userAvatar = snap.exists() ? snap.val().avatar : "🌿";
    console.log("コメント送信パス:", "timeline/" + ownerUid + "/" + post.id + "/comments");
    await push(ref(db, "timeline/" + ownerUid + "/" + post.id + "/comments"), {
      text,
      userId: currentUser.uid,
      userName,
      userAvatar,
      createdAt: Date.now(),
    });
    // コメント通知を投稿者に送る（自分の投稿以外）
    if (ownerUid !== currentUser.uid) {
      await push(ref(db, "notifications/" + ownerUid), {
        type: "comment", fromUserId: currentUser.uid,
        fromUserName: userName, fromUserAvatar: userAvatar,
        postId: post.id, postOwnerId: ownerUid, postText: post.text ? post.text.slice(0, 20) : "",
        read: false, createdAt: Date.now()
      });
    }
  };

  const isLiked = !!likes[currentUser.uid];
  const likeCount = Object.keys(likes).length;
  const displayUsers = likeUsers.slice(0, 3);
  const extraCount = likeUsers.length - 3;
  const displayedComments = comments.slice(0, commentPage * COMMENT_PAGE_SIZE);
  const hasMoreComments = comments.length > commentPage * COMMENT_PAGE_SIZE;

  return (
    <div ref={postRef} style={{ padding:"10px 14px",background:isHighlighted?"#fff9c4":"#f0f7f2",borderRadius:12,position:"relative",transition:"background 0.3s" }}>
      {canDelete && (
        <button onClick={onDelete} style={{ position:"absolute",top:8,right:8,background:"none",border:"none",color:"#e57373",fontSize:14,cursor:"pointer" }}>✕</button>
      )}
      <div style={{ fontSize:13,color:"#4a6b54",lineHeight:1.7,paddingRight:canDelete?20:0 }}>{post.text}</div>
      <div style={{ fontSize:10,color:"#a8c5b0",marginTop:4 }}>{new Date(post.createdAt).toLocaleDateString("ja-JP")}</div>

      {/* いいねエリア */}
      <div style={{ display:"flex",alignItems:"center",gap:10,marginTop:8,flexWrap:"wrap" }}>
        {!isOwner && (
          <button onClick={toggleLike} style={{
            display:"flex",alignItems:"center",gap:4,
            background:isLiked?"#ffe4e8":"#fff",
            border:isLiked?"1.5px solid #f48fb1":"1.5px solid #e0e0e0",
            borderRadius:20,padding:"3px 12px",cursor:"pointer",
            color:isLiked?"#e57373":"#aaa",fontSize:13,fontWeight:700
          }}>
            ❤️ {likeCount > 0 ? likeCount : ""}
          </button>
        )}
        {likeCount > 0 && (
          <div style={{ display:"flex",alignItems:"center",gap:4,flexWrap:"wrap" }}>
            {displayUsers.map((u, i) => (
              <button key={u.uid} onClick={() => onClickUser && onClickUser(u.uid)}
                style={{ background:"none",border:"none",cursor:"pointer",color:"#52a875",fontSize:12,fontWeight:700,padding:0 }}>
                {u.avatar} {u.name}{i < displayUsers.length - 1 || extraCount > 0 ? "・" : ""}
              </button>
            ))}
            {extraCount > 0 && <span style={{ fontSize:11,color:"#a8c5b0" }}>他{extraCount}人</span>}
          </div>
        )}
        {isOwner && likeCount > 0 && (
          <span style={{ fontSize:12,color:"#e57373",fontWeight:700 }}>❤️ {likeCount}件</span>
        )}
      </div>

      {/* コメントエリア */}
      <div style={{ marginTop:10,borderTop:"1px solid #e0ede5",paddingTop:8 }}>
        {displayedComments.length > 0 && (
          <div style={{ display:"flex",flexDirection:"column",gap:6,marginBottom:8 }}>
            {displayedComments.map(c => (
              <div key={c.id} style={{ display:"flex",alignItems:"flex-start",gap:6 }}>
                <button onClick={() => onClickUser && onClickUser(c.userId)}
                  style={{ background:"none",border:"none",cursor:"pointer",fontSize:16,padding:0,flexShrink:0 }}>
                  {c.userAvatar}
                </button>
                <div style={{ flex:1 }}>
                  <button onClick={() => onClickUser && onClickUser(c.userId)}
                    style={{ background:"none",border:"none",cursor:"pointer",color:"#52a875",fontSize:12,fontWeight:700,padding:0 }}>
                    {c.userName}
                  </button>
                  <span style={{ fontSize:12,color:"#4a6b54",marginLeft:4 }}>：{c.text}</span>
                  <div style={{ fontSize:10,color:"#a8c5b0",marginTop:1 }}>{new Date(c.createdAt).toLocaleDateString("ja-JP")}</div>
                </div>
              </div>
            ))}
            {hasMoreComments && (
              <button onClick={() => setCommentPage(p => p + 1)}
                style={{ background:"none",border:"none",color:"#52a875",fontSize:12,fontWeight:700,cursor:"pointer",textAlign:"left",padding:0 }}>
                もっと見る（あと{comments.length - commentPage * COMMENT_PAGE_SIZE}件）
              </button>
            )}
          </div>
        )}
        <div style={{ display:"flex",gap:6,alignItems:"center" }}>
          <input
            value={commentInput}
            onChange={e => setCommentInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && postComment()}
            placeholder="コメントを入力..."
            style={{ flex:1,border:"1.5px solid #c8e6c9",borderRadius:20,padding:"6px 12px",fontSize:12,background:"#fff",outline:"none" }}
          />
          <button onClick={postComment}
            style={{ background:"#52a875",color:"#fff",border:"none",borderRadius:20,padding:"6px 12px",fontSize:12,fontWeight:700,cursor:"pointer",flexShrink:0 }}>
            送信
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TimelinePost(props) {
  if (!props.post || !props.currentUser) return null;
  return <TimelinePostInner {...props} />;
}

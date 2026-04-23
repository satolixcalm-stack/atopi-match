import { useState, useEffect } from "react";
import { db } from "./firebase.js";
import { ref, get, set, remove, onValue, off } from "firebase/database";

export default function TimelinePost({ post, ownerUid, currentUser, onClickUser, canDelete, onDelete }) {
  const [likes, setLikes] = useState(post.likes || {});
  const [likeUsers, setLikeUsers] = useState([]);

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

  const toggleLike = async () => {
    const likeRef = ref(db, "timeline/" + ownerUid + "/" + post.id + "/likes/" + currentUser.uid);
    if (likes[currentUser.uid]) {
      await remove(likeRef);
    } else {
      await set(likeRef, true);
    }
  };

  const isLiked = !!likes[currentUser.uid];
  const likeCount = Object.keys(likes).length;
  const displayUsers = likeUsers.slice(0, 3);
  const extraCount = likeUsers.length - 3;

  return (
    <div style={{ padding:"10px 14px",background:"#f0f7f2",borderRadius:12,position:"relative" }}>
      {canDelete && (
        <button onClick={onDelete} style={{ position:"absolute",top:8,right:8,background:"none",border:"none",color:"#e57373",fontSize:14,cursor:"pointer" }}>✕</button>
      )}
      <div style={{ fontSize:13,color:"#4a6b54",lineHeight:1.7,paddingRight:canDelete?20:0 }}>{post.text}</div>
      <div style={{ fontSize:10,color:"#a8c5b0",marginTop:4 }}>{new Date(post.createdAt).toLocaleDateString("ja-JP")}</div>

      {/* いいねエリア */}
      <div style={{ display:"flex",alignItems:"center",gap:10,marginTop:8,flexWrap:"wrap" }}>
        <button onClick={toggleLike} style={{
          display:"flex",alignItems:"center",gap:4,
          background:isLiked?"#ffe4e8":"#fff",
          border:isLiked?"1.5px solid #f48fb1":"1.5px solid #e0e0e0",
          borderRadius:20,padding:"3px 12px",cursor:"pointer",
          color:isLiked?"#e57373":"#aaa",fontSize:13,fontWeight:700
        }}>
          ❤️ {likeCount > 0 ? likeCount : ""}
        </button>
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
      </div>
    </div>
  );
}

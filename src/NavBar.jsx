export default function NavBar({ screen, setScreen, matches, unreadCount, totalUnreadChats }) {
  const navBtn = {
    flex: 1, padding: "12px 0", background: "none", border: "none",
    borderTop: "2px solid transparent", color: "#6b8f71", fontSize: 12, cursor: "pointer"
  };
  const activeBtn = { ...navBtn, color: "#52a875", borderTop: "2px solid #52a875" };

  return (
    <div style={{
      display: "flex", borderTop: "1px solid #e8f5e9", background: "#fff",
      position: "fixed", bottom: 0, left: 0, width: "100%", zIndex: 100
    }}>
      <button style={screen==="browse"?activeBtn:navBtn} onClick={()=>setScreen("browse")}>
        🔍 探す
      </button>
      <button style={screen==="matches"?activeBtn:navBtn} onClick={()=>setScreen("matches")}>
  💚 マッチ ({Object.keys(matches).length})
  {totalUnreadChats > 0 && (
    <span style={{
      marginLeft: 4,
      background: "#e57373",
      color: "#fff",
      borderRadius: "50%",
      fontSize: 10,
      padding: "1px 6px",
      fontWeight: 700
    }}>
      {totalUnreadChats}
    </span>
  )}
</button>
      <button style={screen==="mypage"?activeBtn:navBtn} onClick={()=>setScreen("mypage")}>
        👤 マイページ
        {unreadCount>0 && (
          <span style={{ marginLeft:4, background:"#e57373", color:"#fff", borderRadius:"50%", fontSize:10, padding:"1px 5px" }}>
            {unreadCount}
          </span>
        )}
      </button>
    </div>
  );
}

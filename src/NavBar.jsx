export default function NavBar({ screen, setScreen, matches, unreadCount, totalUnreadChats }) {
  const badgeStyle = {
  marginLeft: 4,
  background: "#e57373",
  color: "#fff",
  borderRadius: "999px",
  minWidth: 15,
  height: 15,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 8.5,
  padding: "0 4px",
  fontWeight: 700,
  boxSizing: "border-box",
  lineHeight: 1
};
 const navBtn = {
  flex: 1,
  padding: "10px 0",
  background: "none",
  border: "none",
  borderTop: "2px solid transparent",
  color: "#6b8f71",
  fontSize: 13,   // ← 12 → 13
  cursor: "pointer"
};

const activeBtn = {
  ...navBtn,
  color: "#52a875",
  borderTop: "2px solid #52a875"
};

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
    <span style={badgeStyle}>
      {totalUnreadChats > 99 ? "99+" : totalUnreadChats}
    </span>
  )}
</button>
      <button style={screen==="mypage"?activeBtn:navBtn} onClick={()=>setScreen("mypage")}>
  👤 マイページ
  {unreadCount > 0 && (
    <span style={badgeStyle}>
      {unreadCount > 99 ? "99+" : unreadCount}
    </span>
  )}
</button>
    </div>
  );
}

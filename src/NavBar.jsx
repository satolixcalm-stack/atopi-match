export default function NavBar({ screen, setScreen, matches, unreadCount, totalUnreadChats }) {

  const navBtn = {
    flex: 1,
    padding: "10px 0",
    background: "none",
    border: "none",
    borderTop: "2px solid transparent",
    color: "#6b8f71",
    fontSize: 13,
    cursor: "pointer"
  };

  const activeBtn = {
    ...navBtn,
    color: "#52a875",
    borderTop: "2px solid #52a875"
  };

  const badgeStyle = {
    position: "absolute",
    top: -4,
    right: -6,
    background: "#e57373",
    color: "#fff",
    borderRadius: "999px",
    minWidth: 14,
    height: 14,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 8,
    padding: "0 4px",
    fontWeight: 700,
    boxSizing: "border-box",
    lineHeight: 1
  };

  return (
    <div style={{
      display: "flex",
      borderTop: "1px solid #e8f5e9",
      background: "#fff",
      position: "fixed",
      bottom: 0,
      left: 0,
      width: "100%",
      zIndex: 100
    }}>

      {/* 探すボタン */}
      <button style={screen === "browse" ? activeBtn : navBtn} onClick={() => setScreen("browse")}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          <span style={{ fontSize: 16 }}>🔍</span>
          <span>探す</span>
        </div>
      </button>

      {/* マッチボタン */}
      <button style={screen === "matches" ? activeBtn : navBtn} onClick={() => setScreen("matches")}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          <div style={{ position: "relative" }}>
            <span style={{ fontSize: 16 }}>💚</span>
            {totalUnreadChats > 0 && (
              <span style={badgeStyle}>
                {totalUnreadChats > 99 ? "99+" : totalUnreadChats}
              </span>
            )}
          </div>
          <span>マッチ ({Object.keys(matches).length})</span>
        </div>
      </button>

      {/* マイページボタン */}
      <button style={screen === "mypage" ? activeBtn : navBtn} onClick={() => setScreen("mypage")}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          <div style={{ position: "relative" }}>
            <span style={{ fontSize: 16 }}>👤</span>
            {unreadCount > 0 && (
              <span style={badgeStyle}>
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </div>
          <span>マイページ</span>
        </div>
      </button>

    </div>
  );
}

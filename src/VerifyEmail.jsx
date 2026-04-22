import { useEffect, useState } from "react";
import { getAuth, applyActionCode } from "firebase/auth";

export default function VerifyEmail() {
  const [status, setStatus] = useState("verifying"); // verifying | success | error

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oobCode = params.get("oobCode");

    if (!oobCode) {
      setStatus("error");
      return;
    }

    const auth = getAuth();
    applyActionCode(auth, oobCode)
      .then(() => setStatus("success"))
      .catch(() => setStatus("error"));
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#f0f7f2", display: "flex", justifyContent: "center", alignItems: "center", fontFamily: "'Hiragino Sans','Yu Gothic',sans-serif" }}>
      <div style={{ background: "#fff", borderRadius: 20, padding: 40, maxWidth: 360, width: "90%", textAlign: "center", boxShadow: "0 4px 24px rgba(61,107,79,0.08)" }}>
        {status === "verifying" && (
          <>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🌿</div>
            <h2 style={{ color: "#3d6b4f", fontSize: 20, fontWeight: 800 }}>認証中...</h2>
          </>
        )}
        {status === "success" && (
          <>
            <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
            <h2 style={{ color: "#3d6b4f", fontSize: 20, fontWeight: 800, marginBottom: 8 }}>認証完了！</h2>
            <p style={{ color: "#6b8f71", fontSize: 14, marginBottom: 24 }}>メールアドレスの確認が完了しました。<br />ログインしてください🌿</p>
            <a href="/" style={{ display: "block", background: "#52a875", color: "#fff", borderRadius: 14, padding: "14px 0", fontSize: 15, fontWeight: 700, textDecoration: "none" }}>
              ログイン画面へ
            </a>
          </>
        )}
        {status === "error" && (
          <>
            <div style={{ fontSize: 48, marginBottom: 16 }}>❌</div>
            <h2 style={{ color: "#e57373", fontSize: 20, fontWeight: 800, marginBottom: 8 }}>認証に失敗しました</h2>
            <p style={{ color: "#6b8f71", fontSize: 14, marginBottom: 24 }}>リンクが無効か期限切れです。<br />もう一度登録してください。</p>
            <a href="/" style={{ display: "block", background: "#52a875", color: "#fff", borderRadius: 14, padding: "14px 0", fontSize: 15, fontWeight: 700, textDecoration: "none" }}>
              トップへ戻る
            </a>
          </>
        )}
      </div>
    </div>
  );
}

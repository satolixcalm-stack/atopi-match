// Import the functions you need
import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";
// analyticsは一旦消してOK（なくてもいい）

const firebaseConfig = {
  apiKey: "AIzaSyDbXGJxuJyLa91eLVlSLTBXn7zT9daWMzA",
  authDomain: "atopi-match.firebaseapp.com",
  databaseURL: "https://atopi-match-default-rtdb.firebaseio.com",
  projectId: "atopi-match",
  storageBucket: "atopi-match.firebasestorage.app",
  messagingSenderId: "516441075837",
  appId: "1:516441075837:web:65300fe48405acdfafc114"
};

const app = initializeApp(firebaseConfig);

// 👇 ここが重要
export const db = getDatabase(app);
export const auth = getAuth(app);
export const storage = getStorage(app);

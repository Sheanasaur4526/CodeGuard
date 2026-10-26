import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAIWqXAxK3IN14YjEzk5lFA38LzezbCajw",
  authDomain: "codeguard-ee488.firebaseapp.com",
  projectId: "codeguard-ee488",
  storageBucket: "codeguard-ee488.firebasestorage.app",
  messagingSenderId: "867463781778",
  appId: "1:867463781778:web:326d10b85f84b7b1a6f54b",
  measurementId: "G-8214ZXD7SQ"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
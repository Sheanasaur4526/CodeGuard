import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-analytics.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";



const firebaseConfig = {
  apiKey: "AIzaSyB9_PHYI-qLa16-J2lUkeDzxw77nLX5QuE",
  authDomain: "codeguard-e4c3f.firebaseapp.com",
  projectId: "codeguard-e4c3f",
  storageBucket: "codeguard-e4c3f.firebasestorage.app",
  messagingSenderId: "718130075597",
  appId: "1:718130075597:web:1ce6976c70e56e43105684",
  measurementId: "G-682PTK8HPP"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);

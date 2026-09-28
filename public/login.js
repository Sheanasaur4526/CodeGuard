import { auth, db } from "./firebase.js";

import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
    collection,
    query,
    where,
    getDocs,
    addDoc,
    serverTimestamp,
    doc,
    setDoc,
    getDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

console.log("CODEGUARD auth loaded");


// =======================
// TEACHER LOGIN / REGISTER
// =======================
window.loginTeacher = async function () {

    const email = document.getElementById("teacherEmail")?.value.trim();
    const password = document.getElementById("teacherPassword")?.value.trim();
    const name = document.getElementById("teacherName")?.value.trim();

    if (!email || !password) {
        alert("Please enter email and password.");
        return;
    }

    try {

        let userCredential;

        // =========================
        // TRY LOGIN FIRST
        // =========================
        try {
            userCredential = await signInWithEmailAndPassword(auth, email, password);
            console.log("Teacher logged in");
        } catch (err) {

            // If user not found → register instead
            if (err.code === "auth/user-not-found") {
                userCredential = await createUserWithEmailAndPassword(auth, email, password);
                console.log("Teacher registered");
            } else {
                throw err;
            }
        }

        const uid = userCredential.user.uid;

        // =========================
        // CHECK / CREATE PROFILE
        // =========================
        const teacherRef = doc(db, "teachers", uid);
        const teacherSnap = await getDoc(teacherRef);

        if (!teacherSnap.exists()) {
            await setDoc(teacherRef, {
                uid,
                email,
                name: name || "",
                role: "teacher",
                createdAt: serverTimestamp()
            });
        }

        localStorage.setItem("teacherId", uid);

        alert("Success!");
        window.location.href = "Teacher.html";

    } catch (error) {
        console.error("Teacher auth error:", error);
        alert(error.message);
    }
};


// =======================
// STUDENT JOIN ROOM
// =======================
document.addEventListener("DOMContentLoaded", () => {

    const joinBtn = document.getElementById("joinBtn");
    if (!joinBtn) return;

    joinBtn.addEventListener("click", async () => {

        const username = document.getElementById("username")?.value.trim();
        const roomCode = document.getElementById("roomCode")?.value.trim();

        if (!username || !roomCode) {
            alert("Please enter username and room code");
            return;
        }

        try {

            // =========================
            // FIND ROOM
            // =========================
            const q = query(
                collection(db, "rooms"),
                where("roomCode", "==", roomCode)
            );

            const snapshot = await getDocs(q);

            if (snapshot.empty) {
                alert("Room does not exist!");
                return;
            }

            const roomDoc = snapshot.docs[0];
            const roomId = roomDoc.id;

            // =========================
            // ADD STUDENT
            // =========================
            await addDoc(
                collection(db, "rooms", roomId, "students"),
                {
                    name: username,
                    roomCode,
                    joinedAt: serverTimestamp()
                }
            );

            // =========================
            // SESSION
            // =========================
            localStorage.setItem("username", username);
            localStorage.setItem("roomCode", roomCode);
            localStorage.setItem("roomDocId", roomId);

            window.location.href = "Student.html";

        } catch (error) {
            console.error("Student join error:", error);
            alert("Error joining room.");
        }
    });
});
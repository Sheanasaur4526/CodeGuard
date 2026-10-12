console.log("student.js loaded");

import { db } from "./firebase.js";
import {
    collection,
    query,
    where,
    getDocs,
    addDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// =======================
// GLOBAL STATE
// =======================
const roomCode = localStorage.getItem("roomCode");
const username = localStorage.getItem("username");

let tabSwitchCount = 0;
let focusLossCount = 0;
let fullscreenExitCount = 0;

// =======================
// FULLSCREEN FUNCTION
// =======================
async function enterFullscreen() {
    try {
        if (!document.fullscreenElement) {
            await document.documentElement.requestFullscreen();
            console.log("Entered fullscreen mode");
        }
    } catch (err) {
        console.log("Fullscreen blocked:", err);
    }
}

// =======================
// INIT UI (ONLY ONCE)
// =======================
document.addEventListener("DOMContentLoaded", () => {

    const title = document.getElementById("roomTitle");
    const openBtn = document.getElementById("openFileBtn");
    const userEl = document.getElementById("studentName");

    // Room title
    if (title) {
        title.textContent = roomCode
            ? "Room: " + roomCode
            : "Room: (no room)";
    }

    // Username display
    if (userEl) {
        userEl.textContent = username
            ? "Student: " + username
            : "Student: Guest";
    }

    // Button event
    if (!openBtn) {
        console.error("Open File button not found");
        return;
    }

    openBtn.addEventListener("click", async () => {
        await enterFullscreen();
        loadRoomFile();
    });
});

// =======================
// LOAD ROOM FILE
// =======================
async function loadRoomFile() {

    console.log("Open File clicked");

    if (!roomCode) {
        alert("No room selected");
        return;
    }

    try {
        const q = query(
            collection(db, "rooms"),
            where("roomCode", "==", roomCode)
        );

        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            alert("Room not found in Firebase");
            return;
        }

        const room = querySnapshot.docs[0].data();

        const activityEl = document.getElementById("activityText");
        if (activityEl) {
            activityEl.textContent = room.activity ?? "No activity available";
        }

        const rubricEl = document.getElementById("rubricText");
        if (rubricEl) {
            rubricEl.innerHTML = room.rubric
                ? `
                    <p><b>Code Quality:</b> ${room.rubric.codeQuality ?? "-"}</p>
                    <p><b>Correctness:</b> ${room.rubric.correctness ?? "-"}</p>
                    <p><b>Efficiency:</b> ${room.rubric.efficiency ?? "-"}</p>
                    <p><b>Style:</b> ${room.rubric.style ?? "-"}</p>
                `
                : "No rubric available";
        }

        const panel = document.getElementById("filePanel");
        if (panel) panel.style.display = "block";

    } catch (error) {
        console.error("Error loading room:", error);
        alert("Failed to load file from Firebase");
    }
}

// =======================
// LOG VIOLATION
// =======================
async function logViolation(type) {

    try {
        await addDoc(collection(db, "violations"), {
            username,
            roomCode,
            violationType: type,
            timestamp: serverTimestamp()
        });

        console.log("Violation logged:", type);

    } catch (error) {
        console.error("Error logging violation:", error);
    }
}

// =======================
// UPDATE UI STATUS
// =======================
function updateStatus() {

    const tabEl = document.getElementById("tabCount");
    const focusEl = document.getElementById("focusCount");
    const fsEl = document.getElementById("fullscreenCount");

    if (tabEl) tabEl.textContent = tabSwitchCount;
    if (focusEl) focusEl.textContent = focusLossCount;
    if (fsEl) fsEl.textContent = fullscreenExitCount;
}

// =======================
// VIOLATION LISTENERS
// =======================

// TAB SWITCH
document.addEventListener("visibilitychange", async () => {
    if (document.hidden) {
        tabSwitchCount++;
        updateStatus();
        await logViolation("TAB_SWITCH");
    }
});

// WINDOW BLUR
window.addEventListener("blur", async () => {
    focusLossCount++;
    updateStatus();
    await logViolation("WINDOW_FOCUS_LOSS");
});

// FULLSCREEN EXIT
document.addEventListener("fullscreenchange", async () => {
    if (!document.fullscreenElement) {
        fullscreenExitCount++;
        updateStatus();
        await logViolation("FULLSCREEN_EXIT");
    }
});
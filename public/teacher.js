console.log("Teacher JS Loaded");

/* =========================
   FIREBASE IMPORTS
========================= */
import { db, auth } from "./firebase.js";

import {
    collection,
    addDoc,
    serverTimestamp,
    getDocs,
    query,
    where,
    doc,
    getDoc,
    deleteDoc,
    orderBy,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

let violationListener = null;

let currentRoom = null;

/* =========================
   PAGE NAVIGATION
========================= */

window.showDashboard = function () {

    document.getElementById("pageTitle").innerText = "Teacher Dashboard";

    document.getElementById("dashboardPage").style.display = "block";
    document.getElementById("roomsPage").style.display = "none";
    document.getElementById("roomDashboard").style.display = "none";

};

window.showCreateRoom = function () {

    document.getElementById("pageTitle").innerText = "Create Room";

    document.getElementById("dashboardPage").style.display = "block";
    document.getElementById("roomsPage").style.display = "none";
    document.getElementById("roomDashboard").style.display = "none";

};

window.showRooms = async function () {

    document.getElementById("pageTitle").innerText = "My Rooms";

    document.getElementById("dashboardPage").style.display = "none";
    document.getElementById("roomDashboard").style.display = "none";
    document.getElementById("roomsPage").style.display = "block";

    await loadRooms();

};

/* =========================
   GET CURRENT TEACHER
========================= */

function getTeacher() {

    const user = auth.currentUser;

    if (!user) {
        alert("No teacher logged in!");
        return null;
    }

    return user;
}

/* =========================
   GENERATE ROOM CODE
========================= */

window.generateRoomCode = function () {

    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";

    for (let i = 0; i < 6; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }

    document.getElementById("roomCode").value = code;
};

/* =========================
   SAVE ROOM
========================= */

window.saveRoom = async function () {

    const teacher = getTeacher();
    if (!teacher) return;

    const roomCode = document.getElementById("roomCode").value;
    const roomTitle = document.getElementById("roomTitle").value;
    const activity = document.getElementById("activityInput").value;
    const sampleCode = document.getElementById("sampleCodeInput").value;

    const rubric = {
        correctness: document.getElementById("rubric1").value,
        codeQuality: document.getElementById("rubric2").value,
        efficiency: document.getElementById("rubric3").value,
        style: document.getElementById("rubric4").value
    };

    if (!roomCode) {
        alert("Generate a room code first!");
        return;
    }

    if (!roomTitle) {
        alert("Enter room title!");
        return;
    }

    try {

        await addDoc(collection(db, "rooms"), {

            teacherId: teacher.uid,
            teacherEmail: teacher.email,

            roomCode,
            roomTitle,

            activity,
            sampleCode,

            rubric,

            createdAt: serverTimestamp()

        });

        alert("Room created successfully!");

        document.getElementById("roomCode").value = "";
        document.getElementById("roomTitle").value = "";
        document.getElementById("activityInput").value = "";
        document.getElementById("sampleCodeInput").value = "";
        document.getElementById("rubric1").value = "";
        document.getElementById("rubric2").value = "";
        document.getElementById("rubric3").value = "";
        document.getElementById("rubric4").value = "";

        loadRooms();

    } catch (err) {

        console.error(err);
        alert("Failed to save room.");

    }

};

/* =========================
   LOAD TEACHER ROOMS
========================= */

async function loadRooms() {

    const teacher = getTeacher();
    if (!teacher) return;

    const roomList = document.getElementById("roomList");

    roomList.innerHTML = "Loading rooms...";

    try {

        const q = query(
            collection(db, "rooms"),
            where("teacherId", "==", teacher.uid)
        );

        const snapshot = await getDocs(q);

        roomList.innerHTML = "";

        if (snapshot.empty) {

            roomList.innerHTML = `
                <div class="card">
                    <h3>No rooms yet.</h3>
                </div>
            `;

            return;
        }
snapshot.forEach(docSnap => {

    const room = docSnap.data();

    roomList.innerHTML += `
        <div class="room-item">

            <div class="room-info"
                 onclick="openRoom('${docSnap.id}')">

                <h3>${room.roomTitle}</h3>
                <p><strong>Room Code:</strong> ${room.roomCode}</p>

            </div>

            <div class="room-actions">

                <button class="open-btn"
                    onclick="event.stopPropagation(); openRoom('${docSnap.id}')">
                    Open
                </button>

                <button class="delete-btn"
                    onclick="event.stopPropagation(); deleteRoom('${docSnap.id}')">
                    Delete
                </button>

            </div>

        </div>
    `;

});
    } catch (err) {

        console.error(err);
        roomList.innerHTML = "Failed to load rooms.";

    }

}

/* =========================
   OPEN ROOM
========================= */

window.openRoom = async function (roomId) {

    try {

        const roomRef = doc(db, "rooms", roomId);
        const roomSnap = await getDoc(roomRef);

        if (!roomSnap.exists()) {
            alert("Room not found.");
            return;
        }

        currentRoom = {
            id: roomSnap.id,
            ...roomSnap.data()
        };

        document.getElementById("dashboardPage").style.display = "none";
        document.getElementById("roomsPage").style.display = "none";
        document.getElementById("roomDashboard").style.display = "block";

        document.getElementById("pageTitle").textContent =
            currentRoom.roomTitle;

        document.getElementById("selectedRoomTitle").textContent =
            currentRoom.roomTitle;

        document.getElementById("activityDetails").innerHTML =
            currentRoom.activity || "No activity available.";

        document.getElementById("sampleCodeDetails").textContent =
            currentRoom.sampleCode || "No sample code.";

        document.getElementById("rubricDetails").innerHTML = `
            <p><strong>Correctness:</strong> ${currentRoom.rubric?.correctness || "-"}</p>
            <p><strong>Code Quality:</strong> ${currentRoom.rubric?.codeQuality || "-"}</p>
            <p><strong>Efficiency:</strong> ${currentRoom.rubric?.efficiency || "-"}</p>
            <p><strong>Style:</strong> ${currentRoom.rubric?.style || "-"}</p>
        `;

        await loadViolations(currentRoom.roomCode);

    } catch (error) {

        console.error(error);
        alert("Failed to open room.");

    }


};

/* =========================
   LOAD VIOLATIONS
========================= */

async function loadViolations(roomCode) {

    const violationList = document.getElementById("violationList");

    if (!violationList) return;

    // Remove previous listener if one exists
    if (violationListener) {
        violationListener();
    }

    const q = query(
        collection(db, "violations"),
        where("roomCode", "==", roomCode),
        orderBy("timestamp", "desc")
    );

    violationListener = onSnapshot(q, (snapshot) => {

        if (snapshot.empty) {
            violationList.innerHTML = "<p>No violations found.</p>";
            return;
        }

        let html = "";

        snapshot.forEach(docSnap => {

            const v = docSnap.data();

            html += `
    <div class="card" style="margin-bottom:12px">
        <h3>${v.username}</h3>

        <p>
            <strong>Violation:</strong>
            ${v.violationType}
        </p>

        <p>
            <strong>Time:</strong>
            ${v.timestamp
                ? v.timestamp.toDate().toLocaleString()
                : ""}
        </p>
    </div>
`;

        });

        violationList.innerHTML = html;

    }, (error) => {

        console.error(error);
        violationList.innerHTML = "Failed to load violations.";

    });


}

window.backToRooms = function () {

    document.getElementById("roomDashboard").style.display = "none";
    document.getElementById("roomsPage").style.display = "block";

    document.getElementById("pageTitle").textContent = "My Rooms";

    if (violationListener) {
    violationListener();
    violationListener = null;
}

};

/* =========================
   DELETE ROOM
========================= */

window.deleteRoom = async function (roomId) {

    const confirmed = confirm(
        "Are you sure you want to delete this room?"
    );

    if (!confirmed) return;

    try {

        await deleteDoc(doc(db, "rooms", roomId));

        alert("Room deleted successfully.");

        loadRooms();

    } catch (error) {

        console.error(error);
        alert("Failed to delete room.");

    }

};
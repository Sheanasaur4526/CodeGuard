
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

/* =========================
   GLOBAL VARIABLES
========================= */

let violationListener = null;
let studentListener = null;

let currentRoom = null;

/* =========================
   PAGE NAVIGATION
========================= */

window.showDashboard = function () {
    stopRoomListeners();

    document.getElementById("pageTitle").textContent =
        "Teacher Dashboard";

    document.getElementById("dashboardPage").style.display = "block";
    document.getElementById("roomsPage").style.display = "none";
    document.getElementById("roomDashboard").style.display = "none";
};

window.showCreateRoom = function () {
    stopRoomListeners();

    document.getElementById("pageTitle").textContent = "Create Room";

    document.getElementById("dashboardPage").style.display = "block";
    document.getElementById("roomsPage").style.display = "none";
    document.getElementById("roomDashboard").style.display = "none";
};

window.showRooms = async function () {
    stopRoomListeners();

    document.getElementById("pageTitle").textContent = "My Rooms";

    document.getElementById("dashboardPage").style.display = "none";
    document.getElementById("roomDashboard").style.display = "none";
    document.getElementById("roomsPage").style.display = "block";

    await loadRooms();
};

/* =========================
   STOP ROOM LISTENERS
========================= */

function stopRoomListeners() {
    if (violationListener) {
        violationListener();
        violationListener = null;
    }

    if (studentListener) {
        studentListener();
        studentListener = null;
    }
}

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

    const roomCode = document.getElementById("roomCode")
        .value.trim().toUpperCase();

    const roomTitle = document.getElementById("roomTitle")
        .value.trim();

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
            teacherEmail: teacher.email || "",
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

        await loadRooms();

    } catch (error) {
        console.error("Failed to save room:", error);
        alert("Failed to save room. Check the console.");
    }
};

/* =========================
   LOAD TEACHER ROOMS
========================= */

async function loadRooms() {
    const teacher = getTeacher();
    if (!teacher) return;

    const roomList = document.getElementById("roomList");
    roomList.textContent = "Loading rooms...";

    try {
        const q = query(
            collection(db, "rooms"),
            where("teacherId", "==", teacher.uid)
        );

        const snapshot = await getDocs(q);
        roomList.replaceChildren();

        if (snapshot.empty) {
            const message = document.createElement("p");
            message.textContent = "No rooms yet.";
            roomList.appendChild(message);
            return;
        }

        snapshot.forEach((roomDoc) => {
            const room = roomDoc.data();

            const item = document.createElement("div");
            item.className = "room-item";

            const info = document.createElement("div");
            info.className = "room-info";

            const title = document.createElement("h3");
            title.textContent = room.roomTitle || "Untitled Room";

            const code = document.createElement("p");
            code.textContent = "Room Code: " + (room.roomCode || "");

            info.append(title, code);
            info.addEventListener("click", () => {
                window.openRoom(roomDoc.id);
            });

            const actions = document.createElement("div");
            actions.className = "room-actions";

            const openButton = document.createElement("button");
            openButton.className = "open-btn";
            openButton.textContent = "Open";
            openButton.addEventListener("click", () => {
                window.openRoom(roomDoc.id);
            });

            const deleteButton = document.createElement("button");
            deleteButton.className = "delete-btn";
            deleteButton.textContent = "Delete";
            deleteButton.addEventListener("click", () => {
                window.deleteRoom(roomDoc.id);
            });

            actions.append(openButton, deleteButton);
            item.append(info, actions);
            roomList.appendChild(item);
        });

    } catch (error) {
        console.error("Failed to load rooms:", error);
        roomList.textContent = "Failed to load rooms.";
    }
}

/* =========================
   OPEN ROOM
========================= */

window.openRoom = async function (roomId) {
    try {
        stopRoomListeners();

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
            currentRoom.roomTitle || "Room Dashboard";

        document.getElementById("selectedRoomTitle").textContent =
            currentRoom.roomTitle || "Untitled Room";

        document.getElementById("activityDetails").textContent =
            currentRoom.activity || "No activity available.";

        document.getElementById("sampleCodeDetails").textContent =
            currentRoom.sampleCode || "No sample code.";

        const rubricDetails = document.getElementById("rubricDetails");
        rubricDetails.replaceChildren();

        const rubric = currentRoom.rubric || {};

        [
            ["Correctness", rubric.correctness],
            ["Code Quality", rubric.codeQuality],
            ["Efficiency", rubric.efficiency],
            ["Style", rubric.style]
        ].forEach(([label, value]) => {
            const p = document.createElement("p");
            const strong = document.createElement("strong");

            strong.textContent = label + ": ";
            p.append(strong, document.createTextNode(value || "-"));
            rubricDetails.appendChild(p);
        });

        loadStudents(currentRoom.roomCode);
        loadViolations(currentRoom.roomCode);

    } catch (error) {
        console.error("Failed to open room:", error);
        alert("Failed to open room. Check the console.");
    }
};

/* =========================
   LOAD STUDENTS IN ROOM
   Expected collection: roomStudents
   Expected fields: roomCode, username/name
========================= */

function loadStudents(roomCode) {
    const studentList = document.getElementById("studentList");

    if (!studentList) return;

    if (studentListener) {
        studentListener();
        studentListener = null;
    }

    if (!roomCode) {
        studentList.textContent = "This room has no room code.";
        return;
    }

    studentList.textContent = "Loading students...";

    const q = query(
        collection(db, "roomStudents"),
        where("roomCode", "==", roomCode)
    );

    studentListener = onSnapshot(
        q,
        (snapshot) => {
            studentList.replaceChildren();

            if (snapshot.empty) {
                studentList.textContent =
                    "No students have joined this room.";
                return;
            }

            snapshot.forEach((studentDoc) => {
                const student = studentDoc.data();

                const item = document.createElement("div");
                item.className = "student-item";

                const name = document.createElement("strong");
                name.textContent =
                    student.username ||
                    student.name ||
                    "Unnamed Student";

                item.appendChild(name);

                // Optional: show when the student joined
                if (student.joinedAt?.toDate) {
                    const joined = document.createElement("small");
                    joined.textContent =
                        "Joined: " +
                        student.joinedAt.toDate().toLocaleString();

                    joined.style.display = "block";
                    joined.style.color = "#999";
                    item.appendChild(joined);
                }

                studentList.appendChild(item);
            });
        },
        (error) => {
            console.error("Failed to load students:", error);
            studentList.textContent =
                "Unable to load students. Check Firestore permissions and collection fields.";
        }
    );
}

/* =========================
   LOAD VIOLATIONS
========================= */

function loadViolations(roomCode) {
    const violationList = document.getElementById("violationList");

    if (!violationList) return;

    if (violationListener) {
        violationListener();
        violationListener = null;
    }

    const q = query(
        collection(db, "violations"),
        where("roomCode", "==", roomCode),
        orderBy("timestamp", "desc")
    );

    violationListener = onSnapshot(
        q,
        (snapshot) => {
            violationList.replaceChildren();

            if (snapshot.empty) {
                violationList.textContent = "No violations found.";
                return;
            }

            snapshot.forEach((violationDoc) => {
                const v = violationDoc.data();

                const card = document.createElement("div");
                card.className = "card";
                card.style.marginBottom = "12px";

                const heading = document.createElement("h3");
                heading.textContent = v.username || "Unknown Student";

                const type = document.createElement("p");
                type.textContent =
                    "Violation: " + (v.violationType || "Unspecified");

                const time = document.createElement("p");
                time.textContent =
                    "Time: " +
                    (v.timestamp?.toDate
                        ? v.timestamp.toDate().toLocaleString()
                        : "Unknown");

                card.append(heading, type, time);
                violationList.appendChild(card);
            });
        },
        (error) => {
            console.error("Failed to load violations:", error);
            violationList.textContent = "Failed to load violations.";
        }
    );
}

/* =========================
   BACK TO ROOMS
========================= */

window.backToRooms = function () {
    stopRoomListeners();

    document.getElementById("roomDashboard").style.display = "none";
    document.getElementById("roomsPage").style.display = "block";

    document.getElementById("pageTitle").textContent = "My Rooms";

    currentRoom = null;
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

        if (currentRoom?.id === roomId) {
            stopRoomListeners();
            currentRoom = null;

            document.getElementById("roomDashboard").style.display = "none";
            document.getElementById("roomsPage").style.display = "block";
            document.getElementById("pageTitle").textContent = "My Rooms";
        }

        alert("Room deleted successfully.");
        await loadRooms();

    } catch (error) {
        console.error("Failed to delete room:", error);
        alert("Failed to delete room.");
    }
};

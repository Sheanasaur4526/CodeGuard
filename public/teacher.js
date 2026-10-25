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

    const activity = document.getElementById("activityInput")?.value || "";

    // Get test cases entered in the Test Cases section.
    let testCases = window.codeGuardTestCases || [];

    if (
        testCasesContainer &&
        testCasesContainer.querySelectorAll(".test-case-item").length > 0
    ) {
        try {
            testCases = collectTestCases();
            window.codeGuardTestCases = testCases;
        } catch (error) {
            alert(error.message);
            return;
        }
    }

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
            testCases,
            rubric,
            createdAt: serverTimestamp()
        });

        alert("Room created successfully!");

        document.getElementById("roomCode").value = "";
        document.getElementById("roomTitle").value = "";
        document.getElementById("activityInput").value = "";

        document.getElementById("rubric1").value = "";
        document.getElementById("rubric2").value = "";
        document.getElementById("rubric3").value = "";
        document.getElementById("rubric4").value = "";

        // Clear test cases after creating the room.
        if (testCasesContainer) {
            testCasesContainer.replaceChildren();
            renumberTestCases();
        }

        window.codeGuardTestCases = [];

        if (testCaseMessage) {
            testCaseMessage.textContent = "";
        }

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
   DISPLAY TEST CASES
   IN ROOM DASHBOARD
========================= */

function displayRoomTestCases(testCases) {
    const container = document.getElementById("roomTestCases");

    if (!container) {
        console.error("Missing #roomTestCases in teacher.html.");
        return;
    }

    container.replaceChildren();

    if (!Array.isArray(testCases) || testCases.length === 0) {
        container.textContent = "No test cases saved for this room.";
        return;
    }

    testCases.forEach((testCase, index) => {
        const card = document.createElement("div");
        card.className = "room-test-case-item";

        const heading = document.createElement("h3");
        heading.textContent = `Test Case ${index + 1}`;

        const inputLabel = document.createElement("p");
        inputLabel.textContent = "Program Input (stdin)";

        const input = document.createElement("pre");
        input.textContent = String(testCase.input ?? "");

        const outputLabel = document.createElement("p");
        outputLabel.textContent = "Expected Output (stdout)";

        const output = document.createElement("pre");
        output.textContent = String(testCase.expectedOutput ?? "");

        card.append(
            heading,
            inputLabel,
            input,
            outputLabel,
            output
        );

        container.appendChild(card);
    });
}

/* =========================
   OPEN ROOM
========================= */

window.openRoom = async function (roomId) {
    try {
        stopRoomListeners();

        console.log("Opening room ID:", roomId);

        const roomRef = doc(db, "rooms", roomId);
        const roomSnap = await getDoc(roomRef);

        if (!roomSnap.exists()) {
            alert("Room not found in Firestore.");
            return;
        }

        currentRoom = {
            id: roomSnap.id,
            ...roomSnap.data()
        };

        console.log("Room loaded:", currentRoom);

        const dashboardPage = document.getElementById("dashboardPage");
        const roomsPage = document.getElementById("roomsPage");
        const roomDashboard = document.getElementById("roomDashboard");

        if (!dashboardPage || !roomsPage || !roomDashboard) {
            console.error("Missing dashboard HTML elements:", {
                dashboardPage: !!dashboardPage,
                roomsPage: !!roomsPage,
                roomDashboard: !!roomDashboard
            });

            alert("Room dashboard HTML elements are missing. Check teacher.html.");
            return;
        }

        dashboardPage.style.display = "none";
        roomsPage.style.display = "none";
        roomDashboard.style.display = "block";

        const pageTitle = document.getElementById("pageTitle");
        const selectedRoomTitle =
            document.getElementById("selectedRoomTitle");
        const activityDetails =
            document.getElementById("activityDetails");
        const rubricDetails =
            document.getElementById("rubricDetails");

        if (pageTitle) {
            pageTitle.textContent =
                currentRoom.roomTitle || "Room Dashboard";
        }

        if (selectedRoomTitle) {
            selectedRoomTitle.textContent =
                currentRoom.roomTitle || "Untitled Room";
        }

        if (activityDetails) {
            activityDetails.textContent =
                currentRoom.activity || "No activity available.";
        }

        // Display saved test cases from the Firestore room document.
        const savedTestCases =
            currentRoom.testCases ??
            currentRoom.testcases ??
            currentRoom.test_cases ??
            [];

        displayRoomTestCases(savedTestCases);

        if (rubricDetails) {
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

                p.append(
                    strong,
                    document.createTextNode(String(value ?? "-"))
                );

                rubricDetails.appendChild(p);
            });
        }

        if (currentRoom.roomCode) {
            loadStudents(currentRoom.roomCode);
            loadViolations(currentRoom.roomCode);
        } else {
            console.warn("This room has no roomCode:", currentRoom);
        }

    } catch (error) {
        console.error("Failed to open room:", error);
        alert("Failed to open room: " + error.message);
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

                // Optional: show when the student joined.
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

/* =====================================
   LOAD TEST CASES FOR SELECTED ROOM
===================================== */

window.loadRoomTestCases = async function (roomId) {
    const container = document.getElementById("roomTestCases");

    if (!container) {
        console.error("Missing #roomTestCases in teacher.html.");
        return;
    }

    container.textContent = "Loading test cases...";

    try {
        const roomSnap = await getDoc(doc(db, "rooms", roomId));

        if (!roomSnap.exists()) {
            container.textContent = "Room not found.";
            return;
        }

        const roomData = roomSnap.data();

        const testCases =
            roomData.testCases ??
            roomData.testcases ??
            roomData.test_cases ??
            [];

        displayRoomTestCases(testCases);

    } catch (error) {
        console.error("Error loading room test cases:", error);

        container.textContent =
            "Unable to load test cases. Please try again.";
    }
};

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

/* =========================
   TEST CASES
========================= */

const testCasesContainer =
    document.getElementById("testCasesContainer");

const addTestCaseBtn =
    document.getElementById("addTestCaseBtn");

const saveTestCasesBtn =
    document.getElementById("saveTestCasesBtn");

const testCaseCount =
    document.getElementById("testCaseCount");

const testCaseMessage =
    document.getElementById("testCaseMessage");

// Add a test case.
function addTestCase(input = "", expectedOutput = "") {
    if (!testCasesContainer) return;

    const caseCard = document.createElement("div");
    caseCard.className = "test-case-item";

    caseCard.innerHTML = `
        <div class="test-case-item-header">
            <h3></h3>
            <button type="button" class="remove-test-case">
                Remove
            </button>
        </div>

        <label>Program Input (stdin)</label>
        <textarea
            class="test-input"
            placeholder="Enter program input..."
        ></textarea>

        <label>Expected Output (stdout)</label>
        <textarea
            class="test-output"
            placeholder="Enter expected output..."
        ></textarea>
    `;

    caseCard.querySelector(".test-input").value = input;
    caseCard.querySelector(".test-output").value = expectedOutput;

    caseCard
        .querySelector(".remove-test-case")
        .addEventListener("click", () => {
            caseCard.remove();
            renumberTestCases();

            if (testCaseMessage) {
                testCaseMessage.textContent = "";
            }
        });

    testCasesContainer.appendChild(caseCard);

    renumberTestCases();
}

// Update test case numbering and count.
function renumberTestCases() {
    if (!testCasesContainer) return;

    const items =
        testCasesContainer.querySelectorAll(".test-case-item");

    items.forEach((item, index) => {
        item.querySelector("h3").textContent =
            `Test Case ${index + 1}`;
    });

    updateTestCaseCount();
}

// Update the displayed number of test cases.
function updateTestCaseCount() {
    if (!testCasesContainer || !testCaseCount) return;

    const count =
        testCasesContainer.querySelectorAll(".test-case-item").length;

    testCaseCount.textContent =
        `${count} test case${count === 1 ? "" : "s"}`;
}

// Collect and validate test cases.
function collectTestCases() {
    if (!testCasesContainer) {
        throw new Error("Test cases section was not found.");
    }

    const items =
        testCasesContainer.querySelectorAll(".test-case-item");

    const cases = [];

    items.forEach((item, index) => {
        const input =
            item.querySelector(".test-input").value;

        const expectedOutput =
            item.querySelector(".test-output").value;

        if (!expectedOutput.trim()) {
            throw new Error(
                `Enter the expected output for Test Case ${index + 1}.`
            );
        }

        cases.push({
            input: input,
            expectedOutput: expectedOutput
        });
    });

    if (cases.length === 0) {
        throw new Error("Add at least one test case.");
    }

    return cases;
}

// Add Test Case button.
if (addTestCaseBtn && testCasesContainer) {
    addTestCaseBtn.addEventListener("click", () => {
        addTestCase();

        if (testCaseMessage) {
            testCaseMessage.textContent = "";
        }
    });
}

// Save Test Cases button.
// This validates the cases and keeps them ready for room creation.
// The cases are persisted to Firestore when Create Room is clicked.
if (saveTestCasesBtn && testCasesContainer) {
    saveTestCasesBtn.addEventListener("click", () => {
        try {
            const testCases = collectTestCases();

            window.codeGuardTestCases = testCases;

            if (testCaseMessage) {
                testCaseMessage.textContent =
                    `${testCases.length} test cases validated successfully.`;
            }

            console.log("Validated test cases:", testCases);

        } catch (error) {
            if (testCaseMessage) {
                testCaseMessage.textContent = error.message;
            }
        }
    });
}
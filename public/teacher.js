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
    updateDoc,
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

//submmision

const submissionList = document.getElementById("submissionList");

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}

if (submissionList) {
    onSnapshot(
        collection(db, "submissions"),
        (snapshot) => {
            if (snapshot.empty) {
                submissionList.innerHTML = "No submissions yet.";
                return;
            }

            const submissions = snapshot.docs
                .map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }))
                .sort((a, b) => {
                    const timeA = a.submittedAt?.toMillis?.() ?? 0;
                    const timeB = b.submittedAt?.toMillis?.() ?? 0;
                    return timeB - timeA;
                });

            submissionList.innerHTML = submissions.map(sub => {
                const date = sub.submittedAt?.toDate
                    ? sub.submittedAt.toDate().toLocaleString()
                    : "Saving timestamp...";

                return `
                    <div class="submission-item">
                        <h3>${escapeHTML(sub.username || "Unknown student")}</h3>
                        <p><strong>Room:</strong>
                            ${escapeHTML(sub.roomCode || "N/A")}
                        </p>
                        <p><strong>File:</strong>
                            ${escapeHTML(sub.fileName || "main.c")}
                        </p>
                        <p><strong>Submitted:</strong>
                            ${escapeHTML(date)}
                        </p>
                        <p><strong>Status:</strong>
                            ${escapeHTML(sub.status || "SUBMITTED")}
                        </p>

                        <details>
                            <summary>View submitted code</summary>
                            <pre class="submitted-code">${escapeHTML(
                                sub.sourceCode || ""
                            )}</pre>
                        </details>
                    </div>
                `;
            }).join("");
        },
        (error) => {
            console.error("Failed to load submissions:", error);
            submissionList.textContent =
                "Unable to load submissions. Check Firestore permissions.";
        }
    );
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
    // Test cases are always editable: show the editor with the saved cases.
    renderRoomTestCaseEditor(Array.isArray(testCases) ? testCases : []);
}

/* =========================
   EDIT TEST CASES
   FOR AN EXISTING ROOM
========================= */

function getCurrentRoomTestCases() {
    const cases =
        currentRoom?.testCases ??
        currentRoom?.testcases ??
        currentRoom?.test_cases ??
        [];

    return Array.isArray(cases) ? cases : [];
}

function setRoomTestCaseMessage(text, isError = false) {
    const el = document.getElementById("roomTestCaseMessage");
    if (!el) return;

    el.textContent = text;
    el.style.color = isError ? "#ff8585" : "#8affb0";
}

function createRoomTestCaseEditor(list, input = "", expectedOutput = "") {
    const card = document.createElement("div");
    card.className = "test-case-item";

    card.innerHTML = `
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

    card.querySelector(".test-input").value = input;
    card.querySelector(".test-output").value = expectedOutput;

    card.querySelector(".remove-test-case")
        .addEventListener("click", () => {
            card.remove();
            renumberRoomTestCaseEditors(list);
            setRoomTestCaseMessage("");
        });

    list.appendChild(card);
    renumberRoomTestCaseEditors(list);
}

function renumberRoomTestCaseEditors(list) {
    list.querySelectorAll(".test-case-item").forEach((item, index) => {
        item.querySelector("h3").textContent = `Test Case ${index + 1}`;
    });
}

function collectRoomTestCaseEditors(list) {
    const cases = [];

    list.querySelectorAll(".test-case-item").forEach((item, index) => {
        const input = item.querySelector(".test-input").value;
        const expectedOutput = item.querySelector(".test-output").value;

        if (!expectedOutput.trim()) {
            throw new Error(
                `Enter the expected output for Test Case ${index + 1}.`
            );
        }

        cases.push({ input, expectedOutput });
    });

    if (cases.length === 0) {
        throw new Error("Add at least one test case.");
    }

    return cases;
}

function renderRoomTestCaseEditor(existing) {
    const container = document.getElementById("roomTestCases");

    if (!container) {
        console.error("Missing #roomTestCases in teacher.html.");
        return;
    }

    container.replaceChildren();

    const list = document.createElement("div");
    list.className = "room-test-case-editor";
    container.appendChild(list);

    if (existing.length === 0) {
        createRoomTestCaseEditor(list);
    } else {
        existing.forEach((testCase) => {
            createRoomTestCaseEditor(
                list,
                String(testCase.input ?? ""),
                String(testCase.expectedOutput ?? "")
            );
        });
    }

    const actions = document.createElement("div");
    actions.className = "test-case-actions";

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.textContent = "+ Add Test Case";
    addBtn.addEventListener("click", () => {
        createRoomTestCaseEditor(list);
        setRoomTestCaseMessage("");
    });

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.textContent = "Save Changes";
    saveBtn.addEventListener("click", async () => {
        if (!currentRoom) return;

        let cases;

        try {
            cases = collectRoomTestCaseEditors(list);
        } catch (error) {
            setRoomTestCaseMessage(error.message, true);
            return;
        }

        saveBtn.disabled = true;
        saveBtn.textContent = "Saving...";

        try {
            await updateDoc(doc(db, "rooms", currentRoom.id), {
                testCases: cases
            });

            currentRoom.testCases = cases;
            renderRoomTestCaseEditor(cases);

            setRoomTestCaseMessage(
                `Saved ${cases.length} test case${cases.length === 1 ? "" : "s"}.`
            );
        } catch (error) {
            console.error("Error saving test cases:", error);
            setRoomTestCaseMessage(
                "Could not save test cases. Please try again.",
                true
            );
            saveBtn.disabled = false;
            saveBtn.textContent = "Save Changes";
        }
    });

    actions.append(addBtn, saveBtn);
    container.appendChild(actions);
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
        setRoomTestCaseMessage("");

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


window.showSubmissionsPage = async function () {
    // Hide other dashboard pages.
    [
        "dashboardPage",
        "roomsPage",
        "roomDashboard",
        "activitiesPage",
        "submissionsPage"
    ].forEach((id) => {
        const element = document.getElementById(id);
        if (element) element.style.display = "none";
    });

    const page = document.getElementById("submissionsPage");

    if (!page) {
        alert("Submissions page is missing from teacher.html.");
        return;
    }

    page.style.display = "block";

    const title = document.getElementById("pageTitle");
    if (title) title.textContent = "Student Submissions";

    await window.loadTeacherSubmissions();
};


window.loadTeacherSubmissions = async function () {
    const list = document.getElementById("teacherSubmissionList");
    const message = document.getElementById("submissionsMessage");

    if (!list) return;

    const teacher = auth.currentUser;

    if (!teacher) {
        list.textContent = "Please log in as a teacher.";
        return;
    }

    list.textContent = "Loading submitted programs...";
    if (message) message.textContent = "";

    try {
        // Find rooms belonging to the logged-in teacher.
        const roomsQuery = query(
            collection(db, "rooms"),
            where("teacherId", "==", teacher.uid)
        );

        const roomsSnapshot = await getDocs(roomsQuery);

        
const roomCodes = new Set();
const roomOptions = [];

roomsSnapshot.forEach((roomDoc) => {
    const room = roomDoc.data();

    if (room.roomCode) {
        const code = String(room.roomCode).trim().toUpperCase();

        roomCodes.add(code);

        roomOptions.push({
            code,
            name: room.roomName || room.title || room.activityTitle || code
        });
    }
});

// Populate the room filter.
const roomFilter = document.getElementById("submissionRoomFilter");

if (roomFilter) {
    const previousSelection = roomFilter.value;

    roomFilter.replaceChildren();

    const allOption = document.createElement("option");
    allOption.value = "";
    allOption.textContent = "All Rooms";
    roomFilter.appendChild(allOption);

    roomOptions.forEach((room) => {
        const option = document.createElement("option");
        option.value = room.code;
        option.textContent = `${room.name} (${room.code})`;
        roomFilter.appendChild(option);
    });

    // Preserve the selected room when refreshing.
    roomFilter.value = roomCodes.has(previousSelection)
        ? previousSelection
        : "";

    // Register the change handler only once.
    if (roomFilter.dataset.listenerAdded !== "true") {
        roomFilter.addEventListener("change", () => {
            window.loadTeacherSubmissions();
        });

        roomFilter.dataset.listenerAdded = "true";
    }
}


        if (roomCodes.size === 0) {
            list.textContent = "You have not created any rooms yet.";
            return;
        }

        // Read submitted work and filter to this teacher's rooms.
        const snapshot = await getDocs(
            collection(db, "submissions")
        );

        const selectedRoomCode = (
    document.getElementById("submissionRoomFilter")?.value || ""
).trim().toUpperCase();

        const submissions = [];

        snapshot.forEach((submissionDoc) => {
            const data = submissionDoc.data();

            const roomCode = String(data.roomCode || "").toUpperCase();

            // Only show actual submitted records for the teacher's rooms.
            
if (
    roomCodes.has(roomCode) &&
    (!selectedRoomCode || roomCode === selectedRoomCode) &&
    (
        data.status === "SUBMITTED" ||
        data.submittedAt ||
        data.sourceCode ||
        data.code
    )
) {
    submissions.push({
        id: submissionDoc.id,
        ...data
    });
}

        });

        // Sort newest first.
        submissions.sort((a, b) => {
            const aTime = a.submittedAt?.toMillis?.() || 0;
            const bTime = b.submittedAt?.toMillis?.() || 0;
            return bTime - aTime;
        });

        list.replaceChildren();

        if (submissions.length === 0) {
            list.textContent =
                "No students have submitted their work yet.";
            return;
        }

        submissions.forEach((submission) => {
            const card = document.createElement("div");

            card.style.cssText = `
                border: 1px solid #ccc;
                border-radius: 8px;
                padding: 14px;
                margin: 12px 0;
            `;

            const name = document.createElement("h3");
            name.textContent =
                submission.username ||
                submission.studentName ||
                submission.studentEmail ||
                "Unknown student";

            const room = document.createElement("p");
            room.textContent =
                "Room: " + (submission.roomCode || "N/A");

            const submitted = document.createElement("p");
            submitted.textContent = "Status: Submitted";

            const grade = document.createElement("p");
            grade.textContent =
                submission.finalGrade != null
                    ? `Final grade: ${submission.finalGrade}%`
                    : "Final grade: Pending teacher review";

            const showButton = document.createElement("button");
            showButton.type = "button";
            showButton.textContent = "Show";

            showButton.addEventListener("click", () => {
                window.showSubmissionDetails(submission);
            });

            card.append(name, room, submitted, grade, showButton);
            list.appendChild(card);
        });

        if (message) {
            message.textContent =
                `${submissions.length} submission(s) found.`;
        }
    } catch (error) {
        console.error("Could not load teacher submissions:", error);

        list.textContent =
            "Unable to load submissions. Check the browser console and Firestore permissions.";

        if (message) message.textContent = error.message;
    }
};



window.showSubmissionDetails = async function (submission) {
    const details = document.getElementById("submissionDetails");
    if (!details) return;

    details.replaceChildren();

    const addText = (tag, value) => {
        const element = document.createElement(tag);
        element.textContent = value;
        details.appendChild(element);
        return element;
    };

    const addScoreInput = (id, label, value) => {
        const wrapper = document.createElement("div");
        wrapper.style.cssText = "margin: 12px 0;";

        const labelElement = document.createElement("label");
        labelElement.htmlFor = id;
        labelElement.textContent = label;
        labelElement.style.display = "block";

        const input = document.createElement("input");
        input.id = id;
        input.type = "number";
        input.min = "0";
        input.max = "100";
        input.step = "1";
        input.value = value ?? 80;
        input.style.cssText =
            "width: 100%; max-width: 240px; padding: 8px;";

        wrapper.append(labelElement, input);
        details.appendChild(wrapper);

        return input;
    };

    addText(
        "h3",
        submission.username ||
        submission.studentName ||
        "Student submission"
    );

    addText("p", `Room: ${submission.roomCode || "N/A"}`);

    addText(
        "p",
        `Tests passed: ${submission.passedTests ?? 0} / ${submission.totalTests ?? 0}`
    );

    // Retrieve the rubric belonging to this submission's room.
    let roomData = null;

    try {
        const roomsQuery = query(
            collection(db, "rooms"),
            where("roomCode", "==", String(submission.roomCode || "").toUpperCase())
        );

        const roomSnapshot = await getDocs(roomsQuery);

        if (!roomSnapshot.empty) {
            roomData = roomSnapshot.docs[0].data();
        }
    } catch (error) {
        console.error("Could not load room rubric:", error);
    }

    addText("h4", "Room Rubric");

    const rubric = roomData?.rubric ?? roomData?.rubrics;

    if (typeof rubric === "string") {
        addText("p", rubric);
    } else if (rubric && typeof rubric === "object") {
        Object.entries(rubric).forEach(([key, value]) => {
            const description =
                typeof value === "object" && value !== null
                    ? JSON.stringify(value)
                    : String(value);

            addText(
                "p",
                `${key}: ${description}`
            );
        });
    } else {
        addText(
            "p",
            "No rubric details were found for this room. Using the default grading criteria below."
        );
    }

    // Correctness is calculated from the automated tests.
    const correctnessPercent =
        Number(submission.correctnessScore) ||
        (
            submission.totalTests > 0
                ? (submission.passedTests / submission.totalTests) * 100
                : 0
        );

    const weights = {
        correctness: 50,
        codeQuality: 25,
        efficiency: 15,
        style: 10
    };

    const correctnessPoints =
        (correctnessPercent / 100) * weights.correctness;

    addText("h4", "Automated Correctness");

    addText(
        "p",
        `Test pass rate: ${correctnessPercent.toFixed(2)}%`
    );

    addText(
        "p",
        `Correctness contribution: ${correctnessPoints.toFixed(2)} / ${weights.correctness} points`
    );

    // Display submitted C source code.
    addText("h4", "Source Code");

    const pre = document.createElement("pre");
    pre.style.cssText = `
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        overflow-x: auto;
        padding: 14px;
        background: #111827;
        color: white;
        border-radius: 8px;
    `;

    const code = document.createElement("code");
    code.textContent =
        submission.sourceCode ??
        submission.code ??
        submission.submittedCode ??
        "Source code was not saved in this submission.";

    pre.appendChild(code);
    details.appendChild(pre);

    // Show detailed automated test results.
    addText("h4", "Detailed Test Results");

    if (
        Array.isArray(submission.testResults) &&
        submission.testResults.length > 0
    ) {
        submission.testResults.forEach((result, index) => {
            addText(
                "p",
                `Test ${index + 1}: ${
                    result.status ||
                    (result.passed ? "PASSED" : "FAILED")
                }`
            );

            addText(
                "p",
                `Input: ${result.input ?? result.programInput ?? ""}`
            );

            addText(
                "p",
                `Expected: ${
                    result.expectedOutput ?? result.expected ?? ""
                }`
            );

            addText(
                "p",
                `Actual: ${
                    result.actualOutput ?? result.actual ?? ""
                }`
            );
        });
    } else {
        addText("p", "No detailed test results were saved.");
    }

    // Teacher assigns scores from 0 to 100 for each criterion.
    addText("h4", "Teacher Grading");

    addText(
        "p",
        "Enter a score from 0 to 100 for each criterion. Each score is weighted automatically."
    );

    const qualityInput = addScoreInput(
        "gradeCodeQuality",
        "Code Quality (25% weight)",
        submission.codeQualityScore
    );

    const efficiencyInput = addScoreInput(
        "gradeEfficiency",
        "Efficiency (15% weight)",
        submission.efficiencyScore
    );

    const styleInput = addScoreInput(
        "gradeStyle",
        "Style (10% weight)",
        submission.styleScore
    );

    const gradePreview = addText("h3", "Final Grade: —");

    const calculateGrade = () => {
        const quality = Number(qualityInput.value);
        const efficiency = Number(efficiencyInput.value);
        const style = Number(styleInput.value);

        const values = [quality, efficiency, style];

        if (
            values.some(
                (value) => !Number.isFinite(value) || value < 0 || value > 100
            )
        ) {
            gradePreview.textContent =
                "Final Grade: Enter valid scores from 0 to 100.";
            return null;
        }

        const qualityPoints = quality * weights.codeQuality / 100;
        const efficiencyPoints = efficiency * weights.efficiency / 100;
        const stylePoints = style * weights.style / 100;

        const finalGrade =
            correctnessPoints +
            qualityPoints +
            efficiencyPoints +
            stylePoints;

        gradePreview.textContent =
            `Final Grade: ${finalGrade.toFixed(2)} / 100`;

        return {
            quality,
            efficiency,
            style,
            finalGrade: Number(finalGrade.toFixed(2))
        };
    };

    [qualityInput, efficiencyInput, styleInput].forEach((input) => {
        input.addEventListener("input", calculateGrade);
    });

    calculateGrade();

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.textContent = "Save Grade";
    saveButton.style.cssText =
        "padding: 10px 18px; margin-top: 12px; cursor: pointer;";

    saveButton.addEventListener("click", async () => {
        if (!submission.id) {
            alert("Cannot save: submission document ID is missing.");
            return;
        }

        const scores = calculateGrade();

        if (!scores) {
            alert("Enter valid scores between 0 and 100.");
            return;
        }

        const classification =
            scores.finalGrade >= 90 && correctnessPercent >= 85
                ? "Excellent"
                : scores.finalGrade >= 80 && correctnessPercent >= 70
                    ? "Good"
                    : scores.finalGrade >= 60
                        ? "Satisfactory"
                        : "Needs Improvement";

        try {
            saveButton.disabled = true;
            saveButton.textContent = "Saving...";

            await updateDoc(
                doc(db, "submissions", submission.id),
                {
                    correctnessScore: Number(correctnessPercent.toFixed(2)),
                    correctnessPoints: Number(correctnessPoints.toFixed(2)),
                    codeQualityScore: scores.quality,
                    efficiencyScore: scores.efficiency,
                    styleScore: scores.style,
                    finalGrade: scores.finalGrade,
                    classification,
                    gradingStatus: "GRADED",
                    gradedAt: serverTimestamp(),
                    gradedBy: auth.currentUser?.uid ?? null
                }
            );

            Object.assign(submission, {
                correctnessScore: Number(correctnessPercent.toFixed(2)),
                codeQualityScore: scores.quality,
                efficiencyScore: scores.efficiency,
                styleScore: scores.style,
                finalGrade: scores.finalGrade,
                classification,
                gradingStatus: "GRADED"
            });

            addText("p", `Saved successfully. Classification: ${classification}`);
            saveButton.textContent = "✓ Grade Saved";

        } catch (error) {
            console.error("Could not save grade:", error);
            alert("Unable to save grade. Check Firestore permissions.");
            saveButton.disabled = false;
            saveButton.textContent = "Save Grade";
        }
    });

    details.appendChild(saveButton);
};

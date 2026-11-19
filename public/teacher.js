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

import {
    CORRECTNESS_TITLE,
    getRubricItems,
    validateRubricItems,
    formatPercent,
    isCorrectness,
    savedScoreFor,
    legacyScoreField
} from "./rubric.js";

/* =========================
   GLOBAL VARIABLES
========================= */

let violationListener = null;
let studentListener = null;

let currentRoom = null;

// Pages that sit outside the room/dashboard flow. Every navigation
// function calls this so they never stay visible on the wrong tab.
function hideExtraPages() {
    ["submissionsPage", "activitiesPage", "gradesPage"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.style.display = "none";
    });
}

/* =========================
   PAGE NAVIGATION
========================= */

window.showDashboard = function () {
    stopRoomListeners();
    hideExtraPages();

    document.getElementById("pageTitle").textContent =
        "Teacher Dashboard";

    document.getElementById("dashboardPage").style.display = "block";
    document.getElementById("roomsPage").style.display = "none";
    document.getElementById("roomDashboard").style.display = "none";
};

window.showCreateRoom = function () {
    stopRoomListeners();
    hideExtraPages();

    document.getElementById("pageTitle").textContent = "Create Room";

    document.getElementById("dashboardPage").style.display = "block";
    document.getElementById("roomsPage").style.display = "none";
    document.getElementById("roomDashboard").style.display = "none";
};

window.showRooms = async function () {
    stopRoomListeners();
    hideExtraPages();

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
   RUBRIC EDITOR
========================= */

function updateRubricTotal(container, totalEl) {
    if (!container || !totalEl) return;

    const total = collectRubricItems(container).reduce(
        (sum, item) => sum + (Number(item.percent) || 0),
        0
    );

    const ok = Math.abs(total - 100) < 0.001;

    totalEl.textContent = ok
        ? `Total: ${formatPercent(total)}%`
        : `Total: ${formatPercent(total)}% (must be 100%)`;

    totalEl.style.color = ok ? "#8affb0" : "#ff8585";
}

function createRubricRow(title, percent, isFixed, onChange) {
    const row = document.createElement("div");
    row.className = "rubric-row";

    const titleInput = document.createElement("input");
    titleInput.className = "rubric-title";
    titleInput.placeholder = "Rubric title (e.g. Code Quality)";
    titleInput.value = title;
    titleInput.maxLength = 40;

    if (isFixed) {
        titleInput.readOnly = true;
        titleInput.title = "Correctness is graded from the test cases.";
    }

    const percentInput = document.createElement("input");
    percentInput.className = "rubric-percent";
    percentInput.type = "number";
    percentInput.min = "1";
    percentInput.max = "100";
    percentInput.step = "1";
    percentInput.placeholder = "%";
    percentInput.value = percent;
    percentInput.setAttribute("aria-label", "Percent");

    percentInput.addEventListener("input", onChange);

    row.append(titleInput, percentInput);

    if (isFixed) {
        row.dataset.fixed = "true";
    } else {
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "rubric-remove";
        removeBtn.textContent = "Remove";
        removeBtn.addEventListener("click", () => {
            row.remove();
            onChange();
        });
        row.appendChild(removeBtn);
    }

    return row;
}

function collectRubricItems(container) {
    if (!container) return [];

    return Array.from(container.querySelectorAll(".rubric-row")).map(row => ({
        title: row.querySelector(".rubric-title").value.trim(),
        percent: row.querySelector(".rubric-percent").value === ""
            ? NaN
            : Number(row.querySelector(".rubric-percent").value)
    }));
}

// Fills a container with one row per rubric (Correctness first).
function renderRubricRows(container, totalEl, items, onChange) {
    if (!container) return;

    const rows = items.map(item =>
        createRubricRow(
            item.title,
            item.percent,
            isCorrectness(item.title),
            onChange
        )
    );

    rows.sort(
        (a, b) => (b.dataset.fixed === "true") - (a.dataset.fixed === "true")
    );

    container.replaceChildren(...rows);
    updateRubricTotal(container, totalEl);
}

function addBlankRubricRow(container, totalEl, onChange) {
    if (!container) return;

    const row = createRubricRow("", "", false, onChange);
    container.appendChild(row);
    row.querySelector(".rubric-title").focus();
    updateRubricTotal(container, totalEl);
}

// ---- Room dashboard: activity instructions ----

function setRoomActivityMessage(text, isError = false) {
    const el = document.getElementById("roomActivityMessage");
    if (!el) return;

    el.textContent = text;
    el.style.color = isError ? "#ff8585" : "#8affb0";
}

document.getElementById("roomActivityInput")?.addEventListener("input", () => {
    setRoomActivityMessage("");
});

document.getElementById("roomSaveActivityBtn")?.addEventListener("click", async () => {
    if (!currentRoom?.id) {
        setRoomActivityMessage("Open a room first.", true);
        return;
    }

    const activity = document.getElementById("roomActivityInput").value.trim();
    const saveBtn = document.getElementById("roomSaveActivityBtn");

    try {
        saveBtn.disabled = true;

        await updateDoc(doc(db, "rooms", currentRoom.id), { activity });

        currentRoom.activity = activity;
        setRoomActivityMessage("Activity saved. Students see the change right away.");
    } catch (error) {
        console.error("Could not save activity:", error);
        setRoomActivityMessage(
            "Could not save the activity. Check your connection and Firestore permissions.",
            true
        );
    } finally {
        saveBtn.disabled = false;
    }
});

// ---- Room dashboard (editable after the room is created) ----

const roomRubricEditor = document.getElementById("roomRubricEditor");
const roomRubricTotalEl = document.getElementById("roomRubricTotal");

function setRoomRubricMessage(text, isError = false) {
    const el = document.getElementById("roomRubricMessage");
    if (!el) return;

    el.textContent = text;
    el.style.color = isError ? "#ff8585" : "#8affb0";
}

const onRoomRubricChange = () => {
    updateRubricTotal(roomRubricEditor, roomRubricTotalEl);
    setRoomRubricMessage("");
};

function showRoomRubric(room) {
    renderRubricRows(
        roomRubricEditor,
        roomRubricTotalEl,
        getRubricItems(room),
        onRoomRubricChange
    );
    setRoomRubricMessage("");
}

document.getElementById("roomAddRubricBtn")?.addEventListener("click", () => {
    addBlankRubricRow(roomRubricEditor, roomRubricTotalEl, onRoomRubricChange);
});

document.getElementById("roomSaveRubricBtn")?.addEventListener("click", async () => {
    if (!currentRoom?.id) {
        setRoomRubricMessage("Open a room first.", true);
        return;
    }

    const rubricItems = collectRubricItems(roomRubricEditor);
    const error = validateRubricItems(rubricItems);

    if (error) {
        setRoomRubricMessage(error, true);
        return;
    }

    const saveBtn = document.getElementById("roomSaveRubricBtn");

    try {
        saveBtn.disabled = true;

        await updateDoc(doc(db, "rooms", currentRoom.id), { rubricItems });

        currentRoom.rubricItems = rubricItems;
        setRoomRubricMessage("Rubric saved. Students see the change right away.");
    } catch (saveError) {
        console.error("Could not save rubric:", saveError);
        setRoomRubricMessage(
            "Could not save the rubric. Check your connection and Firestore permissions.",
            true
        );
    } finally {
        saveBtn.disabled = false;
    }
});

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

    // The activity, test cases and rubrics are added inside the room
    // after it is created, so a new room starts with these defaults.
    const activity = "";
    const testCases = [];
    const rubricItems = [{ title: CORRECTNESS_TITLE, percent: 100 }];

    if (!roomCode) {
        alert("Generate a room code first!");
        return;
    }

    if (!roomTitle) {
        alert("Enter room title!");
        return;
    }

    try {
        const newRoom = await addDoc(collection(db, "rooms"), {
            teacherId: teacher.uid,
            teacherEmail: teacher.email || "",
            roomCode,
            roomTitle,
            activity,
            testCases,
            rubricItems,
            createdAt: serverTimestamp()
        });

        alert(
            "Room created successfully! Add the activity, test cases " +
            "and rubrics inside the room."
        );

        document.getElementById("roomCode").value = "";
        document.getElementById("roomTitle").value = "";

        await loadRooms();

        // Open the new room so the teacher can set it up right away.
        if (newRoom?.id) {
            await window.openRoom(newRoom.id);
        }

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

        hideExtraPages();
        dashboardPage.style.display = "none";
        roomsPage.style.display = "none";
        roomDashboard.style.display = "block";

        const pageTitle = document.getElementById("pageTitle");
        const selectedRoomTitle =
            document.getElementById("selectedRoomTitle");
        const activityInput =
            document.getElementById("roomActivityInput");

        if (activityInput) {
            activityInput.value = currentRoom.activity || "";
        }

        setRoomActivityMessage("");

        // Display saved test cases from the Firestore room document.
        const savedTestCases =
            currentRoom.testCases ??
            currentRoom.testcases ??
            currentRoom.test_cases ??
            [];

        displayRoomTestCases(savedTestCases);
        setRoomTestCaseMessage("");

        showRoomRubric(currentRoom);

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

window.showSubmissionsPage = async function () {
    stopRoomListeners();

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


// The Grades link opens the submissions list, where each student's
// final grade is entered and saved.
window.showGradesPage = function () {
    return window.showSubmissionsPage();
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

    const addText = (tag, value, className) => {
        const element = document.createElement(tag);
        element.textContent = value;
        if (className) element.className = className;
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

    const rubricItems = getRubricItems(roomData);

    rubricItems.forEach((item) => {
        addText("p", `${item.title}: ${formatPercent(item.percent)}%`);
    });

    // Correctness is calculated from the automated tests.
    const correctnessPercent =
        Number(submission.correctnessScore) ||
        (
            submission.totalTests > 0
                ? (submission.passedTests / submission.totalTests) * 100
                : 0
        );

    const correctnessItem =
        rubricItems.find((item) => isCorrectness(item.title)) ||
        { title: "Correctness", percent: 0 };

    const gradedItems = rubricItems.filter(
        (item) => !isCorrectness(item.title)
    );

    const weights = { correctness: Number(correctnessItem.percent) || 0 };

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
                }`,
                "sd-test-title"
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

    const scoreInputs = gradedItems.map((item, index) => ({
        item,
        input: addScoreInput(
            `gradeRubric${index}`,
            `${item.title} (${formatPercent(item.percent)}% weight)`,
            savedScoreFor(submission, item.title)
        )
    }));

    if (gradedItems.length === 0) {
        addText(
            "p",
            "This room only has the Correctness rubric, so the grade comes from the test results."
        );
    }

    const gradePreview = addText("h3", "Final Grade: —");

    const calculateGrade = () => {
        const scores = scoreInputs.map(({ item, input }) => ({
            item,
            score: Number(input.value),
            empty: input.value === ""
        }));

        if (
            scores.some(
                ({ score, empty }) =>
                    empty || !Number.isFinite(score) || score < 0 || score > 100
            )
        ) {
            gradePreview.textContent =
                "Final Grade: Enter valid scores from 0 to 100.";
            return null;
        }

        const rubricScores = scores.map(({ item, score }) => ({
            title: item.title,
            percent: Number(item.percent),
            score,
            points: Number((score * item.percent / 100).toFixed(2))
        }));

        const finalGrade =
            correctnessPoints +
            rubricScores.reduce((sum, entry) => sum + entry.points, 0);

        gradePreview.textContent =
            `Final Grade: ${finalGrade.toFixed(2)} / 100`;

        return {
            rubricScores,
            finalGrade: Number(finalGrade.toFixed(2))
        };
    };

    scoreInputs.forEach(({ input }) => {
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

        // Older submissions kept fixed fields for these three criteria.
        const scoreFields = {};

        scores.rubricScores.forEach((entry) => {
            const field = legacyScoreField(entry.title);
            if (field) scoreFields[field] = entry.score;
        });

        try {
            saveButton.disabled = true;
            saveButton.textContent = "Saving...";

            await updateDoc(
                doc(db, "submissions", submission.id),
                {
                    ...scoreFields,
                    correctnessScore: Number(correctnessPercent.toFixed(2)),
                    correctnessPoints: Number(correctnessPoints.toFixed(2)),
                    rubricScores: scores.rubricScores,
                    finalGrade: scores.finalGrade,
                    classification,
                    gradingStatus: "GRADED",
                    gradedAt: serverTimestamp(),
                    gradedBy: auth.currentUser?.uid ?? null
                }
            );

            Object.assign(submission, scoreFields, {
                correctnessScore: Number(correctnessPercent.toFixed(2)),
                rubricScores: scores.rubricScores,
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
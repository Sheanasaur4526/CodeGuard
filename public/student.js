console.log("CodeGuard student.js loaded");

import { db } from "./firebase.js";
import { runLiveProgram } from "./live-terminal.js";

import {
    collection,
    query,
    where,
    getDocs,
    onSnapshot,
    addDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// ==================================================
// CONFIGURATION
// ==================================================

// C compiler service (see compiler-service/). Change to your server's HTTPS URL when deployed.
const COMPILER_API = "https://codeguard-wsx7.onrender.com/execute";

// Free hosts (e.g. Render) put the service to sleep when idle. Ping it as
// soon as the page opens so it is awake by the time the student clicks Run.
if (COMPILER_API) {
    fetch(COMPILER_API.replace(/\/execute$/, "/health")).catch(() => {});
}

// ==================================================
// GLOBAL STATE
// ==================================================

const roomCode = (
    localStorage.getItem("roomCode") || ""
).trim().toUpperCase();

const username = (
    localStorage.getItem("username") || ""
).trim();

let tabSwitchCount = 0;
let focusLossCount = 0;
let fullscreenExitCount = 0;
let isRunning = false;
let currentFileName = "main.c";
// Latest automated test report for the current source code.
let latestTestReport = null;

// ==================================================
// ELEMENT HELPERS
// ==================================================

const $ = id => document.getElementById(id);

const editor = $("codeEditor");
const lineNumbers = $("lineNumbers");
const terminal = $("terminalOutput");

// ==================================================
// TERMINAL
// ==================================================

function clearTerminal() {
    if (terminal) {
        terminal.replaceChildren();
    }
}

function writeTerminal(message, type = "normal") {
    if (!terminal) return;

    const line = document.createElement("div");
    line.textContent = String(message);

    if (type === "error") {
        line.style.color = "#ff8585";
    } else if (type === "success") {
        line.style.color = "#8affb0";
    }

    terminal.appendChild(line);
    terminal.scrollTop = terminal.scrollHeight;
}

// ==================================================
// LIVE LINE NUMBERS
// ==================================================

function updateLineNumbers() {
    if (!editor || !lineNumbers) return;

    const lineCount = Math.max(
        1,
        editor.value.split("\n").length
    );

    lineNumbers.textContent = Array.from(
        { length: lineCount },
        (_, index) => index + 1
    ).join("\n");

    lineNumbers.scrollTop = editor.scrollTop;
}

if (editor && lineNumbers) {
    editor.addEventListener("input", updateLineNumbers);

    editor.addEventListener("scroll", () => {
        lineNumbers.scrollTop = editor.scrollTop;
    });

    editor.addEventListener("keydown", event => {
        if (event.key === "Tab") {
            event.preventDefault();

            editor.setRangeText(
                "    ",
                editor.selectionStart,
                editor.selectionEnd,
                "end"
            );

            updateLineNumbers();
        }
    });

    editor.addEventListener("change", updateLineNumbers);

    updateLineNumbers();
}

// ==================================================
// FULLSCREEN
// ==================================================

async function enterFullscreen() {
    try {
        if (!document.fullscreenElement) {
            await document.documentElement.requestFullscreen();
        }
    } catch (error) {
        console.warn("Fullscreen unavailable:", error);
    }
}

// ==================================================
// REGISTER STUDENT IN ROOM
// ==================================================

async function registerStudentInRoom() {
    if (!roomCode || !username) {
        console.warn(
            "Student registration skipped: roomCode or username is missing.",
            { roomCode, username }
        );

        writeTerminal(
            "Join a room with a valid room code and username first.",
            "error"
        );

        return;
    }

    try {
        writeTerminal("Checking room membership...");

        // Confirm that the room exists.
        const roomQuery = query(
            collection(db, "rooms"),
            where("roomCode", "==", roomCode)
        );

        const roomSnapshot = await getDocs(roomQuery);

        if (roomSnapshot.empty) {
            writeTerminal(
                "Room not found. Please check your room code.",
                "error"
            );
            return;
        }

        // Prevent duplicate registrations for the same username
        // in the same room.
        const membershipQuery = query(
            collection(db, "roomStudents"),
            where("roomCode", "==", roomCode),
            where("username", "==", username)
        );

        const membershipSnapshot = await getDocs(membershipQuery);

        if (!membershipSnapshot.empty) {
            console.log("Student is already registered:", username);
            writeTerminal("Room membership verified.", "success");
            return;
        }

        // Add the student to the collection monitored by teacher.js.
        await addDoc(collection(db, "roomStudents"), {
            roomCode: roomCode,
            username: username,
            joinedAt: serverTimestamp()
        });

        console.log("Student registered successfully:", {
            roomCode,
            username
        });

        writeTerminal("Successfully joined room.", "success");

    } catch (error) {
        console.error("Student room registration failed:", error);

        writeTerminal(
            error.code === "permission-denied"
                ? "Registration blocked by Firebase security rules."
                : "Could not register student. Check your connection and Firebase configuration.",
            "error"
        );
    }
}

// ==================================================
// LOAD ROOM ACTIVITY (live)
// ==================================================

// Draws the activity instructions, the teacher's test cases and the
// rubric from a room document. Called on first load and again every
// time the teacher adds, edits or removes something.
function renderRoomActivity(room) {
    // Display activity instructions.
    const activityEl = $("activityText");

    if (activityEl) {
        activityEl.textContent =
            room.activity ?? "No activity available.";
    }

    // Display teacher's test cases.
    const testCasesEl = $("activityTestCases");

    if (testCasesEl) {
        testCasesEl.replaceChildren();

        const testCases = getRoomTestCases(room);

        if (testCases.length === 0) {
            const message = document.createElement("p");
            message.className = "terminal-muted";
            message.textContent =
                "No test cases found for this activity.";

            testCasesEl.appendChild(message);
        } else {
            testCases.forEach((testCase, index) => {
                const card = document.createElement("div");
                card.className = "activity-test-case";

                const heading = document.createElement("h5");
                heading.textContent = `Test Case ${index + 1}`;

                const inputLabel = document.createElement("span");
                inputLabel.className = "test-case-label";
                inputLabel.textContent = "Input";

                const inputValue = document.createElement("pre");
                inputValue.textContent =
                    testCase.input == null || testCase.input === ""
                        ? "(No input)"
                        : String(testCase.input);

                const outputLabel = document.createElement("span");
                outputLabel.className = "test-case-label";
                outputLabel.textContent = "Expected Output";

                const outputValue = document.createElement("pre");
                outputValue.textContent =
                    testCase.expectedOutput == null
                        ? "(Not provided)"
                        : String(testCase.expectedOutput);

                card.append(
                    heading,
                    inputLabel,
                    inputValue,
                    outputLabel,
                    outputValue
                );

                testCasesEl.appendChild(card);
            });
        }
    } else {
        console.error('Missing HTML element: id="activityTestCases"');
    }

    // Display grading rubric.
    const rubricEl = $("rubricText");

    if (rubricEl) {
        const rubric = room.rubric;

        rubricEl.textContent = rubric
            ? [
                `Correctness: ${rubric.correctness ?? "-"}`,
                `Code Quality: ${rubric.codeQuality ?? "-"}`,
                `Efficiency: ${rubric.efficiency ?? "-"}`,
                `Style: ${rubric.style ?? "-"}`
            ].join("\n")
            : "No rubric available.";
    }
}

function getRoomTestCases(room) {
    const testCases =
        room.testCases ??
        room.testcases ??
        room.test_cases ??
        [];

    return Array.isArray(testCases) ? testCases : [];
}

// Keeps the student's dashboard in sync with the room document, so test
// cases the teacher adds or edits show up without reloading the page.
let roomUnsubscribe = null;
let lastTestCasesJson = null;

function startRoomLiveSync() {
    if (roomUnsubscribe || !roomCode) return;

    const roomQuery = query(
        collection(db, "rooms"),
        where("roomCode", "==", roomCode)
    );

    roomUnsubscribe = onSnapshot(
        roomQuery,
        snapshot => {
            if (snapshot.empty) return;

            const room = snapshot.docs[0].data();
            const json = JSON.stringify(getRoomTestCases(room));

            renderRoomActivity(room);

            if (lastTestCasesJson !== null && json !== lastTestCasesJson) {
                writeTerminal(
                    "Your teacher updated the test cases.",
                    "success"
                );
            }

            lastTestCasesJson = json;
        },
        error => {
            console.error("Live room sync failed:", error);
            roomUnsubscribe = null;
        }
    );
}

async function loadRoomFile() {
    if (!roomCode) {
        alert("No room selected. Please join a room first.");
        return;
    }

    try {
        writeTerminal("Loading room activity...");

        const roomQuery = query(
            collection(db, "rooms"),
            where("roomCode", "==", roomCode)
        );

        const snapshot = await getDocs(roomQuery);

        if (snapshot.empty) {
            writeTerminal("Room not found in Firebase.", "error");
            return;
        }

        const room = snapshot.docs[0].data();

        console.log("Loaded room data:", room);

        renderRoomActivity(room);
        lastTestCasesJson = JSON.stringify(getRoomTestCases(room));

        // Show the Activity File panel.
        const panel = $("filePanel");

        if (panel) {
            panel.style.display = "block";
        }

        // From now on, teacher changes appear here automatically.
        startRoomLiveSync();

        clearTerminal();
        writeTerminal("Room activity loaded successfully.", "success");

    } catch (error) {
        console.error("Error loading room activity:", error);
        writeTerminal(
            `Failed to load room activity: ${error.message}`,
            "error"
        );
    }
}


// ==================================================
// OPEN LOCAL C FILE
// ==================================================

const fileInput = $("fileInput");
const openFileBtn = $("openFileBtn");

if (fileInput) {
    fileInput.addEventListener("change", async event => {
        const file = event.target.files?.[0];

        if (!file) return;

        try {
            const content = await file.text();

            if (editor) {
                editor.value = content;
                currentFileName = file.name;

                if ($("fileName")) {
                    $("fileName").textContent = file.name;
                }

                updateLineNumbers();
                editor.focus();
            }

            writeTerminal(`Opened ${file.name}.`, "success");

        } catch (error) {
            writeTerminal(
                `Could not open file: ${error.message}`,
                "error"
            );
        } finally {
            fileInput.value = "";
        }
    });
}

// ==================================================
// NEW FILE
// ==================================================

const newFileBtn = $("newFileBtn");

if (newFileBtn) {
    newFileBtn.addEventListener("click", () => {
        if (
            editor?.value.trim() &&
            !confirm("Create a new file? Unsaved code may be lost.")
        ) {
            return;
        }

        if (editor) {
            editor.value = "";
            editor.focus();
        }

        currentFileName = "main.c";

        if ($("fileName")) {
            $("fileName").textContent = currentFileName;
        }

        updateLineNumbers();
        clearTerminal();
        writeTerminal("New C file created.", "success");
    });
}

// ==================================================
// SAVE SOURCE CODE
// ==================================================

const saveBtn = $("saveBtn");

if (saveBtn) {
    saveBtn.addEventListener("click", () => {
        if (!editor) return;

        const blob = new Blob([editor.value], {
            type: "text/plain;charset=utf-8"
        });

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = url;
        link.download = currentFileName.endsWith(".c")
            ? currentFileName
            : `${currentFileName}.c`;

        document.body.appendChild(link);
        link.click();
        link.remove();

        URL.revokeObjectURL(url);

        writeTerminal(`Downloaded ${currentFileName}.`, "success");
    });
}

// ==================================================
// RUN C PROGRAM
// ==================================================

const runBtn = $("runBtn");
let liveRun = null;

if (runBtn) {
    runBtn.addEventListener("click", () => {
        // While a program is running the button acts as a Stop button.
        if (isRunning && liveRun) {
            liveRun.stop();
            return;
        }

        if (!editor) return;

        const sourceCode = editor.value.trim();

        if (!sourceCode) {
            writeTerminal("Please write your C code first.", "error");
            return;
        }

        if (!COMPILER_API) {
            writeTerminal("C compiler is not configured yet.", "error");
            return;
        }

        isRunning = true;
        runBtn.textContent = "■ Stop";

        liveRun = runLiveProgram({
            api: COMPILER_API.replace(/\/execute$/, ""),
            filename: currentFileName.endsWith(".c") ? currentFileName : "main.c",
            source: sourceCode,
            terminal,
            onEnd: () => {
                isRunning = false;
                liveRun = null;
                runBtn.disabled = false;
                runBtn.textContent = "▶ Run";
            }
        });
    });
}


 // ==================================================
// AUTOMATED TEST CASE RUNNER
// ==================================================

const runTestsBtn = $("runTestsBtn");
const testResultsContainer = $("testResultsContainer");
const testResultsSummary = $("testResultsSummary");

let isTesting = false;

// Normalize line endings and whitespace.
function normalizeTestOutput(value) {
    return String(value ?? "")
        .replace(/\r\n/g, "\n")
        .trim()
        .replace(/[ \t]+/g, " ");
}

// Compare the expected output with the actual output.
// Accept either an exact match or a match with the
// final non-empty output line.

function checkTestOutput(actualOutput, expectedOutput) {
    const normalize = value =>
        String(value ?? "")
            .replace(/\r\n/g, "\n")
            .trim()
            .replace(/[ \t]+/g, " ");

    const actual = normalize(actualOutput);
    const expected = normalize(expectedOutput);

    // Exact output match.
    if (actual === expected) {
        return true;
    }

    // Check the last non-empty line.
    const lines = actual
        .split("\n")
        .map(line => line.trim())
        .filter(Boolean);

    const lastLine = lines[lines.length - 1] || "";

    if (lastLine === expected) {
        return true;
    }

    // Handle output where the prompt and answer share a line,
    // such as "The sum of -1 and 2 is: 1".
    // Match the expected value at the end of the final line.
    const escapedExpected = expected.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
    );

    const answerAtEnd = new RegExp(
        `(?:^|\\s|:)${escapedExpected}$`
    );

    // Multi-line answers: a prompt such as "enter n:" may share a line
    // with the first line of output. Accept when the whole output ends
    // with the expected text, starting at a word boundary.
    return answerAtEnd.test(actual);
}


// Safely display test results.
function createResultText(tag, text, className = "") {
    const element = document.createElement(tag);
    element.textContent = String(text ?? "");

    if (className) {
        element.className = className;
    }

    return element;
}

function renderTestResult(index, result) {
    if (!testResultsContainer) return;

    const item = document.createElement("div");
    item.className = "test-result-item";

    const details = document.createElement("div");

    details.appendChild(
        createResultText("h4", `Test Case ${index + 1}`)
    );

    details.appendChild(
        createResultText("p", `Input: ${result.input || "(no input)"}`)
    );

    details.appendChild(
        createResultText("p", "Expected output:")
    );

    details.appendChild(
        createResultText("pre", result.expectedOutput || "(empty)")
    );

    details.appendChild(
        createResultText("p", "Actual output:")
    );

    details.appendChild(
        createResultText("pre", result.actualOutput || "(empty)")
    );

    if (result.message) {
        details.appendChild(
            createResultText("pre", result.message)
        );
    }

    const status = createResultText(
        "span",
        result.status,
        `test-result-status ${result.status.toLowerCase()}`
    );

    item.append(details, status);
    testResultsContainer.appendChild(item);
}

async function runAutomatedTests() {
    if (isTesting) return;

    if (!roomCode) {
        alert("Please join a room before running tests.");
        return;
    }

    if (!editor || !editor.value.trim()) {
        alert("Please write your C code first.");
        return;
    }

    if (!COMPILER_API) {
        alert("The C compiler service is not configured.");
        return;
    }

    isTesting = true;

    if (runTestsBtn) {
        runTestsBtn.disabled = true;
        runTestsBtn.textContent = "Running Tests...";
    }

    if (testResultsContainer) {
        testResultsContainer.replaceChildren();
    }

    if (testResultsSummary) {
        testResultsSummary.textContent = "Loading test cases...";
    }

    try {
        const roomQuery = query(
            collection(db, "rooms"),
            where("roomCode", "==", roomCode)
        );

        const roomSnapshot = await getDocs(roomQuery);

        if (roomSnapshot.empty) {
            throw new Error("Room not found. Check your room code.");
        }

        const room = roomSnapshot.docs[0].data();

        const testCases =
            room.testCases ??
            room.testcases ??
            room.test_cases ??
            [];

        if (!Array.isArray(testCases) || testCases.length === 0) {
            throw new Error(
                "Your teacher has not added any test cases to this room."
            );
        }

        const sourceCode = editor.value;
        const filename = currentFileName.endsWith(".c")
            ? currentFileName
            : "main.c";

       let passed = 0;
let failed = 0;
let errors = 0;

const detailedResults = [];

        if (testResultsSummary) {
            testResultsSummary.textContent =
                `Running 0/${testCases.length} tests...`;
        }

        // Execute each test case separately.
        for (let i = 0; i < testCases.length; i++) {
            const testCase = testCases[i];

            const input = String(testCase.input ?? "");
            const expectedOutput = String(
                testCase.expectedOutput ?? ""
            );

            const result = {
                input,
                expectedOutput,
                actualOutput: "",
                status: "ERROR",
                message: ""
            };

            try {
                if (testCase.expectedOutput == null) {
                    throw new Error(
                        "This test case has no expected output configured."
                    );
                }

                const response = await fetch(COMPILER_API, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        files: [
                            {
                                name: filename,
                                content: sourceCode
                            }
                        ],
                        stdin: input,
                        compile_timeout: 10000,
                        run_timeout: 3000
                    })
                });

                let data;

                try {
                    data = await response.json();
                } catch {
                    throw new Error(
                        `Invalid compiler response (HTTP ${response.status}).`
                    );
                }

                if (!response.ok) {
                    throw new Error(
                        data.error ||
                        data.message ||
                        `Compiler request failed (HTTP ${response.status}).`
                    );
                }

                if (!data.compile || data.compile.code !== 0) {
                    const compileOutput = [
                        data.compile?.stderr,
                        data.compile?.stdout,
                        data.error,
                        data.message
                    ].filter(Boolean).join("\n");

                    result.status = "ERROR";
                    result.message =
                        "Compilation failed.\n" +
                        (compileOutput || "No compiler details returned.");

                } else if (!data.run) {
                    result.status = "ERROR";
                    result.message =
                        "Compiler response did not include execution results.";

                } else {
                    result.actualOutput = String(
                        data.run.stdout ?? ""
                    );

                    if (
                        data.run.code !== 0 ||
                        data.run.signal
                    ) {
                        result.status = "ERROR";

                        result.message = [
                            `Program exited with code: ${data.run.code ?? "unknown"}`,
                            data.run.signal
                                ? `Signal: ${data.run.signal}`
                                : "",
                            data.run.stderr || ""
                        ].filter(Boolean).join("\n");

                    } else {
                        // FIX: use the new comparison function.
                        result.status = checkTestOutput(
    result.actualOutput,
    expectedOutput
)
    ? "PASS"
    : "FAIL";

                        if (result.status === "FAIL") {
                            result.message =
                                "Output mismatch. Compare the actual output with the expected output.";
                        }
                    }
                }

            } catch (error) {
                result.status = "ERROR";
                result.message = error.message ||
                    "Unexpected error while running this test.";
            }

            if (result.status === "PASS") {
                passed++;
            } else if (result.status === "FAIL") {
                failed++;
            } else {
                errors++;
            }

            // Keep a copy for the submission and teacher grading.
detailedResults.push({
    input: result.input,
    expectedOutput: result.expectedOutput,
    actualOutput: result.actualOutput,
    status: result.status,
    message: result.message
});

renderTestResult(i, result);

            if (testResultsSummary) {
                testResultsSummary.textContent =
                    `Running ${i + 1}/${testCases.length} tests...`;
            }
        }

        const percentage = Math.round(
            (passed / testCases.length) * 100
        );
        // Save the report together with the exact code that was tested.
latestTestReport = {
    sourceCode,
    totalTests: testCases.length,
    passedTests: passed,
    failedTests: failed,
    errorTests: errors,
    correctnessScore: percentage,
    testResults: detailedResults,
    testedAt: new Date().toISOString()
};

        if (testResultsSummary) {
            testResultsSummary.textContent =
                `${passed}/${testCases.length} passed · ${percentage}%` +
                (failed ? ` · ${failed} failed` : "") +
                (errors ? ` · ${errors} error(s)` : "");
        }

        writeTerminal(
            `Automated tests completed: ${passed}/${testCases.length} passed (${percentage}%).`,
            passed === testCases.length ? "success" : "normal"
        );

    } catch (error) {
        console.error("Automated testing failed:", error);

        if (testResultsSummary) {
            testResultsSummary.textContent = "Tests could not run";
        }

        if (testResultsContainer) {
            testResultsContainer.replaceChildren(
                createResultText("p", error.message, "terminal-muted")
            );
        }

    } finally {
        isTesting = false;

        if (runTestsBtn) {
            runTestsBtn.disabled = false;
            runTestsBtn.textContent = "✓ Run Tests";
        }
    }
}

if (runTestsBtn) {
    runTestsBtn.addEventListener("click", runAutomatedTests);
}

// ==================================================
// CLEAR TERMINAL
// ==================================================

const clearBtn = $("clearTerminalBtn");

if (clearBtn) {
    clearBtn.addEventListener("click", clearTerminal);
}

// ==================================================
// EDITOR SETTINGS
// ==================================================

const settingsBtn = $("settingsBtn");

if (settingsBtn && editor) {
    settingsBtn.addEventListener("click", () => {
        const currentSize = parseInt(
            getComputedStyle(editor).fontSize,
            10
        );

        const answer = prompt(
            "Editor font size (12-24 px):",
            String(currentSize)
        );

        if (answer === null) return;

        const size = Number(answer);

        if (!Number.isInteger(size) || size < 12 || size > 24) {
            alert("Enter a whole number from 12 to 24.");
            return;
        }

        editor.style.fontSize = `${size}px`;
        editor.style.lineHeight = "20px";

        if (lineNumbers) {
            lineNumbers.style.fontSize = `${size}px`;
            lineNumbers.style.lineHeight = "20px";
        }
    });
}

// ==================================================
// CLOSE ACTIVITY PANEL
// ==================================================

const closeFileBtn = $("closeFileBtn");

if (closeFileBtn) {
    closeFileBtn.addEventListener("click", () => {
        const panel = $("filePanel");

        if (panel) {
            panel.style.display = "none";
        }
    });
}

// ==================================================
// FIREBASE VIOLATION MONITORING
// ==================================================

function updateStatus() {
    if ($("tabCount")) {
        $("tabCount").textContent = tabSwitchCount;
    }

    if ($("focusCount")) {
        $("focusCount").textContent = focusLossCount;
    }

    if ($("fullscreenCount")) {
        $("fullscreenCount").textContent = fullscreenExitCount;
    }
}

async function logViolation(type) {
    if (!roomCode) return;

    try {
        await addDoc(collection(db, "violations"), {
            username: username || "Guest",
            roomCode,
            violationType: type,
            timestamp: serverTimestamp()
        });

        console.log("Violation logged:", type);

    } catch (error) {
        console.error("Failed to log violation:", error);
    }
}

document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
        tabSwitchCount++;
        updateStatus();
        void logViolation("TAB_SWITCH");
    }
});

window.addEventListener("blur", () => {
    focusLossCount++;
    updateStatus();
    void logViolation("WINDOW_FOCUS_LOSS");
});

document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement) {
        fullscreenExitCount++;
        updateStatus();
        void logViolation("FULLSCREEN_EXIT");
    }
});

// ==================================================
// INITIALIZE UI
// ==================================================

function initializeStudentUI() {
    if ($("roomTitle")) {
        $("roomTitle").textContent = roomCode
            ? `Room: ${roomCode}`
            : "Room: (no room)";
    }

    if ($("studentName")) {
        $("studentName").textContent = username
            ? `Student: ${username}`
            : "Student: Guest";
    }

    // Register the student in Firestore after the IDE loads.
    void registerStudentInRoom();

    // Show the teacher's activity and test cases, and keep them up to date.
    startRoomLiveSync();

    if (openFileBtn) {
        openFileBtn.addEventListener("click", async () => {
            await enterFullscreen();
            await loadRoomFile();
        });
    }

    updateLineNumbers();
    updateStatus();
}

if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        initializeStudentUI
    );
} else {
    initializeStudentUI();
}


/* =========================================================
   SUBMIT STUDENT CODE AND AUTOMATED TEST RESULTS
========================================================= */

const submitBtn = document.getElementById("submitBtn");

if (submitBtn) {
    submitBtn.addEventListener("click", async () => {
        // Prevent repeated submissions while processing.
        if (submitBtn.disabled) return;

        const roomCode = (
            localStorage.getItem("roomCode") || ""
        ).trim().toUpperCase();

        const username = (
            localStorage.getItem("username") || ""
        ).trim();

        // Find the student's code editor.
        const editor =
            document.getElementById("codeEditor") ||
            document.getElementById("editor") ||
            document.querySelector("textarea");

        if (!roomCode || !username || !editor || !editor.value.trim()) {
            alert("Missing room, username, or source code.");
            return;
        }

        const sourceCode = editor.value;
        const originalText = submitBtn.textContent;

        // Require test results for the exact code being submitted.
        if (
            typeof latestTestReport === "undefined" ||
            !latestTestReport ||
            latestTestReport.sourceCode !== sourceCode
        ) {
            alert(
                "Please run Automated Tests on your latest code before submitting."
            );
            return;
        }

        try {
            submitBtn.disabled = true;
            submitBtn.textContent = "Submitting...";

            // Prepare the submission document.
            const submissionData = {
                roomCode,
                username,
                fileName: "main.c",
                sourceCode,

                // Automated test results
                totalTests: latestTestReport.totalTests ?? 0,
                passedTests: latestTestReport.passedTests ?? 0,
                failedTests: latestTestReport.failedTests ?? 0,
                errorTests: latestTestReport.errorTests ?? 0,
                correctnessScore:
                    latestTestReport.correctnessScore ?? 0,
                testResults: latestTestReport.testResults ?? [],
                testedAt: latestTestReport.testedAt ?? null,

                // Teacher grading fields
                codeQualityScore: null,
                efficiencyScore: null,
                styleScore: null,

                // Final grading fields
                finalGrade: null,
                classification: "Pending Teacher Review",
                gradingStatus: "PENDING_TEACHER_REVIEW",

                // Submission status and timestamp
                status: "SUBMITTED",
                submittedAt: serverTimestamp()
            };

            // Save the submission to Firestore.
            const submissionRef = await addDoc(
                collection(db, "submissions"),
                submissionData
            );

            console.log(
                "Submission saved successfully:",
                submissionRef.id
            );

            submitBtn.textContent = "✓ Submitted";

            alert(
                "Code and automated test results submitted successfully."
            );

        } catch (error) {
            console.error("Submission error:", error);

            submitBtn.textContent = originalText;

            alert(
                "Failed to submit. Please check your connection, " +
                "Firebase configuration, and Firestore permissions."
            );

        } finally {
            submitBtn.disabled = false;

            // Restore the button after the request completes.
            // Keep the success label until the next edit or submission.
            if (submitBtn.textContent === "Submitting...") {
                submitBtn.textContent = originalText;
            }
        }
    });
}

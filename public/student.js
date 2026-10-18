
console.log("CodeGuard student.js loaded");

import { db } from "./firebase.js";

import {
    collection,
    query,
    where,
    getDocs,
    addDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// ==================================================
// CONFIGURATION
// ==================================================

const COMPILER_API = ""; // Configure your secured C compiler backend.

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
// LOAD ROOM ACTIVITY
// ==================================================

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

        const activityEl = $("activityText");

        if (activityEl) {
            activityEl.textContent =
                room.activity ?? "No activity available.";
        }

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

        const panel = $("filePanel");

        if (panel) {
            panel.style.display = "block";
        }

        clearTerminal();
        writeTerminal("Room activity loaded successfully.", "success");

    } catch (error) {
        console.error("Error loading room activity:", error);
        writeTerminal("Failed to load room activity.", "error");
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

if (runBtn) {
    runBtn.addEventListener("click", async () => {
        if (isRunning || !editor) return;

        const sourceCode = editor.value.trim();

        if (!sourceCode) {
            writeTerminal("Please write your C code first.", "error");
            return;
        }

        if (!COMPILER_API) {
            writeTerminal("C compiler is not configured yet.", "error");
            writeTerminal(
                "Configure a secured compiler backend to enable Run."
            );
            return;
        }

        isRunning = true;
        runBtn.disabled = true;
        runBtn.textContent = "⏳ Running...";

        try {
            const stdin = prompt(
                "Enter program input for scanf. Leave blank if not needed:"
            ) ?? "";

            writeTerminal("Compiling and running C program...");

            const response = await fetch(COMPILER_API, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    language: "c",
                    version: "*",
                    files: [{
                        name: currentFileName.endsWith(".c")
                            ? currentFileName
                            : "main.c",
                        content: sourceCode
                    }],
                    stdin,
                    compile_timeout: 10000,
                    run_timeout: 3000
                })
            });

            if (!response.ok) {
                throw new Error(
                    `Compiler returned HTTP ${response.status}`
                );
            }

            const result = await response.json();

            clearTerminal();

            if (result.message) {
                writeTerminal(result.message, "error");
                return;
            }

            if (result.compile) {
                if (result.compile.stdout) {
                    writeTerminal(result.compile.stdout);
                }

                if (result.compile.stderr) {
                    writeTerminal(result.compile.stderr, "error");
                }

                if (result.compile.code !== 0) {
                    writeTerminal("Compilation failed.", "error");
                    return;
                }
            }

            if (!result.run) {
                writeTerminal(
                    "Compiler returned no execution result.",
                    "error"
                );
                return;
            }

            if (result.run.stdout) {
                writeTerminal(result.run.stdout);
            }

            if (result.run.stderr) {
                writeTerminal(result.run.stderr, "error");
            }

            if (result.run.code === 0) {
                writeTerminal(
                    "Program finished successfully.",
                    "success"
                );
            } else {
                writeTerminal(
                    `Program exited with code ${result.run.code ?? "unknown"}.`,
                    "error"
                );
            }

        } catch (error) {
            console.error("C execution failed:", error);
            writeTerminal(`Execution failed: ${error.message}`, "error");

        } finally {
            isRunning = false;
            runBtn.disabled = false;
            runBtn.textContent = "▶ Run";
        }
    });
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

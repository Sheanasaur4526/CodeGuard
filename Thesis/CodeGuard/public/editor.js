
/* =====================================
   CODEGUARD SMART IDE - EDITOR
   ===================================== */

const editor = document.getElementById("codeEditor");
const lineNumbers = document.getElementById("lineNumbers");
const terminal = document.getElementById("terminalOutput");

const runBtn = document.getElementById("runBtn");
const saveBtn = document.getElementById("saveBtn");
const settingsBtn = document.getElementById("settingsBtn");
const submitBtn = document.getElementById("submitBtn");

const fileInput = document.getElementById("fileInput");
const openFileBtn = document.getElementById("openFileBtn");
const newFileBtn = document.getElementById("newFileBtn");
const fileName = document.getElementById("fileName");

let currentFileName = "main.c";
let isRunning = false;

/*
 * IMPORTANT:
 * Set this to your own secured compiler backend.
 * It must accept a Piston-compatible /execute request.
 * Do not put private API keys in browser JavaScript.
 */
const COMPILER_API = "";

// TERMINAL OUTPUT

function writeTerminal(message, type = "normal") {
    const line = document.createElement("p");
    line.textContent = message;

    if (type === "error") {
        line.style.color = "#ff8585";
    } else if (type === "success") {
        line.style.color = "#8affb0";
    }

    terminal.appendChild(line);
    terminal.scrollTop = terminal.scrollHeight;
}

function clearTerminal() {
    terminal.replaceChildren();
}

function setRunning(running) {
    isRunning = running;
    runBtn.disabled = running;
    runBtn.textContent = running ? "⏳ Running..." : "▶ Run";
}

// LINE NUMBERS


/* =====================================
   LIVE LINE NUMBERS
   ===================================== */

function updateLineNumbers() {
    if (!editor || !lineNumbers) return;

    const lines = editor.value.split("\n");
    const total = Math.max(1, lines.length);

    lineNumbers.textContent = Array.from(
        { length: total },
        (_, index) => index + 1
    ).join("\n");

    // Keep line numbers aligned with the editor.
    lineNumbers.scrollTop = editor.scrollTop;
}

// Update whenever the editor content changes,
// including when Enter creates a new line.
editor.addEventListener("input", updateLineNumbers);

// Keep scrolling synchronized.
editor.addEventListener("scroll", () => {
    lineNumbers.scrollTop = editor.scrollTop;
});

// Handle Enter and Tab.
editor.addEventListener("keydown", event => {
    if (event.key === "Enter") {
        // Wait until the browser inserts the newline.
        requestAnimationFrame(updateLineNumbers);
    }

    if (event.key === "Tab") {
        event.preventDefault();

        const start = editor.selectionStart;
        const end = editor.selectionEnd;

        editor.setRangeText("    ", start, end, "end");

        updateLineNumbers();
    }
});

// Initialize when the page loads.
updateLineNumbers();

// OPEN C SOURCE FILE

openFileBtn.addEventListener("click", () => {
    fileInput.click();
});

fileInput.addEventListener("change", async event => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
        editor.value = await file.text();
        currentFileName = file.name;
        fileName.textContent = file.name;
        updateLineNumbers();

        clearTerminal();
        writeTerminal(`Opened ${file.name}`, "success");
    } catch (error) {
        writeTerminal(`Unable to open file: ${error.message}`, "error");
    }

    // Allow selecting the same file again.
    fileInput.value = "";
});

// NEW FILE

newFileBtn.addEventListener("click", () => {
    if (
        editor.value.trim() &&
        !confirm("Create a new file? Unsaved code may be lost.")
    ) {
        return;
    }

    editor.value = "";
    currentFileName = "main.c";
    fileName.textContent = currentFileName;

    updateLineNumbers();
    editor.focus();

    clearTerminal();
    writeTerminal("New C file created.", "success");
});

// SAVE C SOURCE FILE

saveBtn.addEventListener("click", () => {
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

    writeTerminal(`Saved ${link.download}`, "success");
});

// RUN C PROGRAM

runBtn.addEventListener("click", async () => {
    if (isRunning) return;

    const sourceCode = editor.value.trim();

    if (!sourceCode) {
        writeTerminal("Error: Write your C code first.", "error");
        return;
    }

    if (!COMPILER_API) {
        writeTerminal(
            "Compiler backend is not configured. Set COMPILER_API in editor.js.",
            "error"
        );
        writeTerminal(
            "Firebase Hosting cannot compile C by itself."
        );
        return;
    }

    setRunning(true);
    writeTerminal("Compiling and running C program...");

    try {
        /*
         * For interactive programs using scanf(),
         * enter standard input in the prompt.
         * Leave it blank for programs that need no input.
         */
        const stdin = prompt(
            "Program input (stdin). Enter values separated by spaces or new lines:"
        ) ?? "";

        const response = await fetch(COMPILER_API, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                language: "c",
                version: "*",
                files: [{
                    name: "main.c",
                    content: sourceCode
                }],
                stdin,
                compile_timeout: 10000,
                run_timeout: 3000
            })
        });

        if (!response.ok) {
            throw new Error(`Compiler server returned HTTP ${response.status}`);
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

        const run = result.run;

        if (!run) {
            writeTerminal("No execution result returned.", "error");
            return;
        }

        if (run.stdout) {
            writeTerminal(run.stdout);
        }

        if (run.stderr) {
            writeTerminal(run.stderr, "error");
        }

        if (run.code === 0) {
            writeTerminal("Program finished successfully.", "success");
        } else {
            writeTerminal(
                `Program exited with code ${run.code ?? "unknown"}.`,
                "error"
            );
        }

    } catch (error) {
        writeTerminal(`Execution failed: ${error.message}`, "error");
        writeTerminal(
            "Check the compiler endpoint, network connection, and server logs."
        );
    } finally {
        setRunning(false);
    }
});

// CLEAR TERMINAL

document.getElementById("clearTerminalBtn")
    .addEventListener("click", clearTerminal);

// EDITOR SETTINGS

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
    lineNumbers.style.fontSize = `${size}px`;
});

// INITIALIZE

updateLineNumbers();

// Interactive terminal for the C compiler service.
// The program runs on the server; output streams in, and each line the
// student types is sent to the program's stdin.

const COLORS = { err: "#ff8585", success: "#8affb0", warn: "#ffd479", note: "#8fa3b8" };

export function runLiveProgram({ api, filename, source, terminal, onEnd }) {
    terminal.replaceChildren();

    const box = document.createElement("div");
    box.style.cssText = "white-space:pre-wrap;word-break:break-word;";
    const input = document.createElement("input");
    input.type = "text";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.setAttribute("aria-label", "Program input");
    input.style.cssText =
        "background:transparent;border:0;outline:0;color:inherit;font:inherit;" +
        "padding:0;margin:0;width:60%;min-width:6ch;caret-color:#8affb0;";
    input.disabled = true;
    box.appendChild(input);
    terminal.appendChild(box);

    let sessionId = null;
    let stream = null;
    let finished = false;
    let stopped = false;

    function print(text, kind) {
        const span = document.createElement("span");
        span.textContent = text;
        if (kind && COLORS[kind]) span.style.color = COLORS[kind];
        box.insertBefore(span, input);
        terminal.scrollTop = terminal.scrollHeight;
    }

    function startOfLine() {
        // Make sure a status message begins on its own line.
        const prev = input.previousSibling;
        if (prev && !prev.textContent.endsWith("\n")) print("\n");
    }

    function finish() {
        if (finished) return;
        finished = true;
        if (stream) stream.close();
        input.remove();
        terminal.scrollTop = terminal.scrollHeight;
        onEnd && onEnd();
    }

    async function post(path, body) {
        return fetch(api + path, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body || {})
        });
    }

    terminal.onclick = () => { if (!finished && !input.disabled) input.focus(); };

    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            const text = input.value;
            input.value = "";
            print(text + "\n");
            post(`/session/${sessionId}/input`, { text: text + "\n" }).catch(() => {});
        } else if (e.key.toLowerCase() === "d" && e.ctrlKey) {
            e.preventDefault();
            post(`/session/${sessionId}/input`, { eof: true }).catch(() => {});
        } else if (e.key.toLowerCase() === "c" && e.ctrlKey && !window.getSelection().toString()) {
            e.preventDefault();
            stop();
        }
    });

    function exitMessage({ code, signal }) {
        if (stopped) return ["Program stopped.", "note"];
        if (signal === "SIGSEGV") return ["Segmentation fault (core dumped)", "err"];
        if (signal === "SIGFPE") return ["Floating point exception (core dumped)", "err"];
        if (signal === "SIGABRT") return ["Aborted (core dumped)", "err"];
        if (signal === "SIGKILL") return ["Program was stopped (time or memory limit).", "err"];
        if (signal) return [`Program terminated by signal ${signal}.`, "err"];
        if (code === 0) return ["Program finished successfully.", "success"];
        return [`Program exited with code ${code}.`, "err"];
    }

    let stopRequested = false;

    async function stop() {
        if (finished) return;
        stopped = true;
        if (!sessionId) {
            // Still compiling: stop as soon as the program starts.
            stopRequested = true;
            return;
        }
        post(`/session/${sessionId}/kill`).catch(() => {});
    }

    (async () => {
        const wake = setTimeout(() => {
            print("The compiler is starting up. This can take up to a minute the first time...\n", "note");
        }, 6000);
        print("Compiling...\n", "note");

        let result;
        try {
            const res = await post("/session", {
                files: [{ name: filename, content: source }]
            });
            clearTimeout(wake);
            if (res.status === 429) throw new Error("The compiler is busy. Please try again in a moment.");
            if (!res.ok && res.status !== 200) throw new Error(`Compiler returned HTTP ${res.status}`);
            result = await res.json();
        } catch (error) {
            clearTimeout(wake);
            terminal.replaceChildren(box);
            print(`Execution failed: ${error.message}\n`, "err");
            return finish();
        }

        if (result.message) {
            print(result.message + "\n", "err");
            return finish();
        }

        // Replace the "Compiling..." line with compiler messages.
        while (box.firstChild !== input) box.removeChild(box.firstChild);
        const c = result.compile || {};
        const compilerText = (c.stdout || "") + (c.stderr || "");
        if (c.code !== 0) {
            print(compilerText, "err");
            startOfLine();
            print("Compilation failed.\n", "err");
            return finish();
        }
        if (compilerText.trim()) print(compilerText.replace(/\n*$/, "\n") + "\n", "warn");

        sessionId = result.id;
        input.disabled = false;
        input.focus();
        if (stopRequested) post(`/session/${sessionId}/kill`).catch(() => {});

        stream = new EventSource(`${api}/session/${sessionId}/stream`);
        stream.addEventListener("out", (e) => print(JSON.parse(e.data)));
        stream.addEventListener("err", (e) => print(JSON.parse(e.data), "err"));
        stream.addEventListener("exit", (e) => {
            const [msg, kind] = exitMessage(JSON.parse(e.data));
            startOfLine();
            print(msg + "\n", kind);
            finish();
        });
        stream.onerror = () => {
            if (finished) return;
            startOfLine();
            print("Connection to the compiler was lost.\n", "err");
            finish();
        };
    })();

    return { stop, isFinished: () => finished };
}

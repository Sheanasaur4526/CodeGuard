// CodeGuard C compiler service: compiles and runs C with real gcc.
// POST /execute  { files:[{name,content}], stdin, compile_timeout, run_timeout }
// -> { compile:{stdout,stderr,code}, run:{stdout,stderr,code,signal} }
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const PORT = Number(process.env.PORT || 2000);
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*"; // set to your site URL in production
const MAX_BODY = 256 * 1024;
const MAX_OUTPUT = 64 * 1024;
const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT || 4);
let active = 0;

function runProc(cmd, args, { cwd, input = "", timeout, shellLimits = false }) {
  return new Promise((resolve) => {
    const finalCmd = shellLimits ? "bash" : cmd;
    const finalArgs = shellLimits
      ? ["-c", 'ulimit -v 262144; ulimit -u 64; ulimit -f 1024; ulimit -t 10; exec "$0" "$@"', cmd, ...args]
      : args;
    const p = spawn(finalCmd, finalArgs, { cwd, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "", stderr = "", timedOut = false, truncated = false;
    const timer = setTimeout(() => { timedOut = true; p.kill("SIGKILL"); }, timeout);
    const add = (cur, d) => {
      if (cur.length >= MAX_OUTPUT) { truncated = true; return cur; }
      return cur + d.toString("utf8");
    };
    p.stdout.on("data", (d) => { stdout = add(stdout, d); if (truncated) p.kill("SIGKILL"); });
    p.stderr.on("data", (d) => { stderr = add(stderr, d); if (truncated) p.kill("SIGKILL"); });
    p.stdin.on("error", () => {});
    p.stdin.end(input);
    p.on("close", (code, signal) => {
      clearTimeout(timer);
      if (timedOut) stderr += "\nTime limit exceeded.";
      if (truncated) stderr += "\nOutput limit exceeded.";
      resolve({ stdout, stderr, code: code ?? (signal ? 128 : 1), signal });
    });
    p.on("error", (e) => { clearTimeout(timer); resolve({ stdout, stderr: String(e), code: 127, signal: null }); });
  });
}

async function execute(body) {
  const file = (body.files || [])[0];
  if (!file || typeof file.content !== "string") return { message: "No source file provided." };
  const stdin = typeof body.stdin === "string" ? body.stdin : "";
  const ct = Math.min(Number(body.compile_timeout) || 10000, 15000);
  const rt = Math.min(Number(body.run_timeout) || 3000, 10000);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cg-"));
  try {
    fs.writeFileSync(path.join(dir, "main.c"), file.content);
    const compile = await runProc(
      "gcc", ["-std=gnu17", "-O1", "-Wall", "-Wno-unused-result", "main.c", "-o", "main", "-lm"],
      { cwd: dir, timeout: ct }
    );
    delete compile.signal;
    if (compile.code !== 0) return { compile };
    const run = await runProc(path.join(dir, "main"), [], { cwd: dir, input: stdin, timeout: rt, shellLimits: true });
    return { compile, run };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

http.createServer((req, res) => {
  const cors = {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
  const send = (code, obj) => { res.writeHead(code, { ...cors, "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };
  if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
  if (req.method === "GET" && req.url === "/health") return send(200, { ok: true });
  if (req.method !== "POST" || req.url !== "/execute") return send(404, { message: "Not found" });
  if (active >= MAX_CONCURRENT) return send(429, { message: "Compiler is busy, try again." });

  let size = 0; const chunks = [];
  req.on("data", (c) => { size += c.length; if (size > MAX_BODY) { req.destroy(); } else chunks.push(c); });
  req.on("end", async () => {
    let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch { return send(400, { message: "Invalid JSON" }); }
    active++;
    try { send(200, await execute(body)); }
    catch (e) { send(500, { message: "Internal error: " + e.message }); }
    finally { active--; }
  });
}).listen(PORT, () => console.log(`CodeGuard compiler service on :${PORT}`));

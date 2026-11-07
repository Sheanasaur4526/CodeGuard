// Indentation checker for C code.
// Rule: every level of nesting is indented by INDENT_SIZE spaces
// (or one tab per level). Returns a list of { line, message }.

export const INDENT_SIZE = 4;

// Blank out comments, strings and character literals so that braces or
// parentheses inside them are not counted. Line breaks are kept.
function stripNonCode(source) {
    let out = "";
    let i = 0;
    const n = source.length;

    while (i < n) {
        const c = source[i];
        const next = source[i + 1];

        if (c === "/" && next === "/") {
            while (i < n && source[i] !== "\n") i++;
        } else if (c === "/" && next === "*") {
            i += 2;
            while (i < n && !(source[i] === "*" && source[i + 1] === "/")) {
                if (source[i] === "\n") out += "\n";
                i++;
            }
            i += 2;
            out += " ";
        } else if (c === '"' || c === "'") {
            const quote = c;
            out += quote;
            i++;
            while (i < n && source[i] !== quote && source[i] !== "\n") {
                if (source[i] === "\\") i++;
                i++;
            }
            out += quote;
            i++;
        } else {
            out += c;
            i++;
        }
    }

    return out;
}

export function checkIndentation(source) {
    const text = String(source ?? "").replace(/\r\n/g, "\n");
    const rawLines = text.split("\n");
    const codeLines = stripNonCode(text).split("\n");
    const errors = [];

    // One entry per open "{": bump is the extra level used by
    // statements under a case label inside a switch.
    const stack = [];
    let parenDepth = 0;
    let hanging = 0;          // braceless if/for/while/else bodies
    let prevCode = "";        // previous non-blank code line
    let pendingSwitch = false;

    const bumps = () => stack.reduce((sum, s) => sum + s.bump, 0);

    for (let idx = 0; idx < rawLines.length; idx++) {
        const raw = rawLines[idx];
        const code = codeLines[idx] ?? "";
        const trimmed = code.trim();

        if (trimmed === "") continue;        // blank or comment-only

        const isPreprocessor = trimmed.startsWith("#");
        const indentText = raw.match(/^[ \t]*/)[0];

        // Lines that continue a statement are not checked.
        const continuesParen = parenDepth > 0;
        const continuesOperator = /[+\-*/%&|^=,<>?:]$/.test(prevCode) &&
            !/^(case\b|default\b)/.test(prevCode) &&
            !/(\bcase\b.*|\bdefault\s*):$/.test(prevCode) &&
            !/[;{}]$/.test(prevCode);
        const skip = isPreprocessor || continuesParen || continuesOperator;

        const isClosing = trimmed.startsWith("}");
        const labelMatch = trimmed.match(/^(case\b[^;{]*|default\s*):/);
        const isLabel = Boolean(labelMatch);
        const top = stack[stack.length - 1];

        if (!skip) {
            const hasTab = indentText.includes("\t");
            const hasSpace = indentText.includes(" ");
            let found = null;           // indent level the line actually has
            let problem = "";

            if (hasTab && hasSpace) {
                problem = "mixes tabs and spaces";
            } else if (hasTab) {
                found = indentText.length;
            } else if (indentText.length % INDENT_SIZE !== 0) {
                problem = `uses ${indentText.length} spaces; indent in steps of ${INDENT_SIZE} spaces`;
            } else {
                found = indentText.length / INDENT_SIZE;
            }

            let expected;
            let allowed;

            if (isLabel && top && top.isSwitch) {
                // case/default may sit at the switch level or one deeper.
                const base = stack.length - 1 + bumps() - top.bump;
                allowed = [base, base + 1];
                expected = base + 1;
            } else if (isClosing) {
                expected = stack.length - 1 + bumps() - (top ? top.bump : 0);
                allowed = [expected];
            } else {
                expected = stack.length + bumps() + hanging;
                allowed = [expected];
            }

            if (problem) {
                errors.push({
                    line: idx + 1,
                    message: `Indentation error: line ${idx + 1} ${problem}.`
                });
            } else if (!allowed.includes(found)) {
                const spaces = expected * INDENT_SIZE;
                errors.push({
                    line: idx + 1,
                    message:
                        `Indentation error: line ${idx + 1} is indented ${found} level${found === 1 ? "" : "s"} ` +
                        `(${found * INDENT_SIZE} spaces) but expected ${expected} level${expected === 1 ? "" : "s"} ` +
                        `(${spaces} spaces).`
                });
            } else if (isLabel && top && top.isSwitch) {
                top.bump = found + 1 - stack.length;
            }
        }

        // ---- update state from this line's code ----
        if (!isPreprocessor) {
            // A braceless body ends once its single statement is done.
            const startsHanging =
                /^(if|for|while)\b/.test(trimmed) ||
                /^else\b/.test(trimmed) ||
                /^\}\s*else\b/.test(trimmed);

            const wasHanging = hanging > 0 && !startsHanging && !isClosing;

            if (/^(switch)\b/.test(trimmed)) pendingSwitch = true;

            for (let k = 0; k < trimmed.length; k++) {
                const ch = trimmed[k];
                if (ch === "(") parenDepth++;
                else if (ch === ")") parenDepth = Math.max(0, parenDepth - 1);
                else if (ch === "{") {
                    stack.push({ isSwitch: pendingSwitch, bump: 0 });
                    pendingSwitch = false;
                    hanging = 0;
                } else if (ch === "}") {
                    stack.pop();
                }
            }

            const endsOpen = /[{]$/.test(trimmed);

            if (startsHanging && parenDepth === 0 && !/[;{]$/.test(trimmed)) {
                // e.g. "if (x)" or "else" with the body on the next line.
                hanging++;
            } else if (wasHanging && !endsOpen && parenDepth === 0 && /;$/.test(trimmed)) {
                hanging = 0;
            }
        }

        if (!isPreprocessor) prevCode = trimmed;
    }

    return errors;
}

// Text shown in the terminal / results area.
export function formatIndentationErrors(errors, max = 5) {
    const shown = errors.slice(0, max).map(e => e.message);
    if (errors.length > max) {
        shown.push(`...and ${errors.length - max} more indentation error(s).`);
    }
    return (
        shown.join("\n") +
        `\nFix the indentation (${INDENT_SIZE} spaces per level) and run again.`
    );
}

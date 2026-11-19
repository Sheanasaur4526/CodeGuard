// Rubric helpers shared by the teacher and student pages.
//
// A room stores its rubric as `rubricItems`: [{ title, percent }].
// The first item is always "Correctness" (graded from the automated
// tests). Rooms created before this feature have no `rubricItems`, so
// they keep their old fixed weights.

export const CORRECTNESS_TITLE = "Correctness";

const LEGACY_ITEMS = [
    { title: "Correctness", percent: 50 },
    { title: "Code Quality", percent: 25 },
    { title: "Efficiency", percent: 15 },
    { title: "Style", percent: 10 }
];

// Score fields that older submissions used for the fixed criteria.
const LEGACY_SCORE_FIELDS = {
    "code quality": "codeQualityScore",
    "efficiency": "efficiencyScore",
    "style": "styleScore"
};

export function isCorrectness(title) {
    return String(title ?? "").trim().toLowerCase() === "correctness";
}

export function getRubricItems(room) {
    const saved = room?.rubricItems;

    if (Array.isArray(saved) && saved.length > 0) {
        const items = saved
            .map(item => ({
                title: String(item?.title ?? "").trim(),
                percent: Number(item?.percent) || 0
            }))
            .filter(item => item.title);

        if (items.some(item => isCorrectness(item.title))) {
            return items;
        }

        return [{ title: CORRECTNESS_TITLE, percent: 0 }, ...items];
    }

    return LEGACY_ITEMS.map(item => ({ ...item }));
}

// Returns an error message, or "" when the rubric is valid.
export function validateRubricItems(items) {
    if (!Array.isArray(items) || items.length === 0) {
        return "Add at least the Correctness rubric.";
    }

    const seen = new Set();
    let total = 0;

    for (const item of items) {
        const title = String(item.title ?? "").trim();

        if (!title) {
            return "Every rubric needs a title.";
        }

        const key = title.toLowerCase();

        if (seen.has(key)) {
            return `The rubric "${title}" is listed twice.`;
        }

        seen.add(key);

        const percent = Number(item.percent);

        if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
            return `Enter a percent from 1 to 100 for "${title}".`;
        }

        total += percent;
    }

    if (!seen.has("correctness")) {
        return "The Correctness rubric cannot be removed.";
    }

    if (Math.abs(total - 100) > 0.001) {
        return `The rubric percents add up to ${formatPercent(total)}%. They must add up to 100%.`;
    }

    return "";
}

export function formatPercent(value) {
    const number = Number(value);
    return Number.isInteger(number)
        ? String(number)
        : String(Number(number.toFixed(2)));
}

// Score a teacher gave earlier for one rubric item, or undefined.
export function savedScoreFor(submission, title) {
    const scores = submission?.rubricScores;

    if (Array.isArray(scores)) {
        const found = scores.find(
            entry =>
                String(entry?.title ?? "").trim().toLowerCase() ===
                String(title).trim().toLowerCase()
        );

        if (found && found.score != null) return found.score;
    }

    const legacyField = LEGACY_SCORE_FIELDS[String(title).trim().toLowerCase()];

    return legacyField ? submission?.[legacyField] ?? undefined : undefined;
}

export function legacyScoreField(title) {
    return LEGACY_SCORE_FIELDS[String(title).trim().toLowerCase()] || null;
}

export const ADMIN_LOA_QUARTERS = [
    "Winter",
    "Spring",
    "Summer",
    "Fall",
];
const ADMIN_LOA_QUARTER_START_BY_QUARTER = {
    Winter: "01-02",
    Spring: "04-01",
    Summer: "07-01",
    Fall: "10-01",
};
export function normalizeAdminLoaQuarter(raw) {
    const quarter = String(raw ?? "").trim().toLowerCase();
    switch (quarter) {
        case "winter":
            return "Winter";
        case "spring":
            return "Spring";
        case "summer":
            return "Summer";
        case "fall":
            return "Fall";
        default:
            return null;
    }
}
export function normalizeAdminLoaYear(raw) {
    if (typeof raw === "number" && Number.isFinite(raw)) {
        const year = Math.trunc(raw);
        return year >= 1900 && year <= 2100 ? year : null;
    }
    const text = String(raw ?? "").trim();
    if (!/^\d{4}$/.test(text))
        return null;
    const year = Number.parseInt(text, 10);
    return year >= 1900 && year <= 2100 ? year : null;
}
export function deriveAdminLoaQuarterStartDate(quarter, year) {
    return `${year}-${ADMIN_LOA_QUARTER_START_BY_QUARTER[quarter]}`;
}
//# sourceMappingURL=adminStudentLoaDates.js.map
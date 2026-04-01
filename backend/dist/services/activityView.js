function formatShortDate(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime()))
        return iso;
    return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
    });
}
export function buildActivityRows(payload) {
    const effective = payload.termChargeEffectiveDate;
    const displayEffective = formatShortDate(effective);
    const rows = [];
    let balance = 0;
    for (const li of payload.lineItems) {
        balance += li.amount;
        rows.push({
            date: displayEffective,
            description: li.description,
            charges: li.amount,
            credits: 0,
            balance,
        });
    }
    const pays = [...payload.payments].sort((a, b) => String(a.paidAt).localeCompare(String(b.paidAt)));
    for (const p of pays) {
        balance -= p.amount;
        rows.push({
            date: formatShortDate(p.paidAt),
            description: p.description || "Payment",
            charges: 0,
            credits: p.amount,
            balance,
        });
    }
    return rows;
}
//# sourceMappingURL=activityView.js.map
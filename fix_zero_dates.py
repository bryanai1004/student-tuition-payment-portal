import csv
from pathlib import Path

CSV_DIR = Path("/Users/alt./Desktop/mysql_exports_all")

# ✅ 扩展后的字段（补齐所有漏掉的 zero-date 列）
targets = {
    "admin.csv": ["date_from2", "date_to2"],
    "course_withdraw_date.csv": ["date"],
    "daim_students_info.csv": ["daim_grad_date", "daim_signed_date"],
    "loa.csv": ["actual_return", "return_date"],
    "seniority.csv": ["date"],
    "students.csv": ["withdraw_date", "EnrollStartDate"],
    "term_order.csv": ["start_date"],
}

# ✅ 扩展非法日期
bad_values = {"0000-00-00", "0000-01-02", "0000-04-01"}

for filename, columns in targets.items():
    path = CSV_DIR / filename
    if not path.exists():
        print(f"Missing: {filename}")
        continue

    with path.open("r", encoding="utf-8-sig", newline="") as f:
        rows = list(csv.reader(f))

    if not rows:
        print(f"Empty: {filename}")
        continue

    header = rows[0]
    idxs = [header.index(col) for col in columns if col in header]

    changed = 0
    for row in rows[1:]:
        for idx in idxs:
            if idx < len(row) and row[idx] in bad_values:
                row[idx] = ""
                changed += 1

    with path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f)
        writer.writerows(rows)

    print(f"{filename}: fixed {changed} value(s)")
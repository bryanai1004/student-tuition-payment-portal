import { DEMO_STUDENT_ID } from "../config/constants.js";
import { pool } from "../lib/db.js";
import { loadAccountContext } from "../repositories/studentAccountRepository.js";
import { getCatalogDemoAccountPayload } from "./demoAccountService.js";
import { assembleStudentAccountPayload } from "./studentAccountAssembler.js";
export async function getStudentAccountPayload(studentId, term, year) {
    try {
        const ctx = await loadAccountContext(pool, studentId, term, year);
        if (ctx) {
            return assembleStudentAccountPayload(ctx);
        }
    }
    catch (err) {
        if (studentId !== DEMO_STUDENT_ID) {
            throw err;
        }
        console.warn("[billing] MySQL error for demo-student — using catalog fallback:", err.message);
    }
    if (studentId === DEMO_STUDENT_ID) {
        return getCatalogDemoAccountPayload(term, year);
    }
    return null;
}
//# sourceMappingURL=studentAccountService.js.map
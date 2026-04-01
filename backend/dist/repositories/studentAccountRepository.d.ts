import type { Pool } from "mysql2/promise";
import type { AccountContext } from "../types/studentAccount.js";
export declare function loadAccountContext(pool: Pool, studentId: string, term: string, year: number): Promise<AccountContext | null>;
//# sourceMappingURL=studentAccountRepository.d.ts.map
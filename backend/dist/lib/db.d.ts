import mysql from "mysql2/promise";
export declare const pool: mysql.Pool;
/**
 * Verifies the pool can reach MySQL (fail fast on startup).
 * Logs structured details on failure for RDS/network/credential issues.
 */
export declare function testDatabaseConnection(): Promise<void>;
export declare function closePool(): Promise<void>;
//# sourceMappingURL=db.d.ts.map
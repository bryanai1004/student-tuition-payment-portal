import { env } from "./config/env.js";
import { app } from "./app.js";
import { closePool } from "./lib/db.js";
console.log("DB CONFIG", {
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    database: env.db.database,
    hasPassword: Boolean(env.db.password),
});
const server = app.listen(env.port, () => {
    console.log(`API http://127.0.0.1:${env.port}`);
    console.log(`Verify demo JSON: http://127.0.0.1:${env.port}/api/demo/account?term=Fall&year=2026`);
});
async function shutdown(signal) {
    console.log(`[server] ${signal} received, closing…`);
    await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
    });
    await closePool();
}
for (const sig of ["SIGTERM", "SIGINT"]) {
    process.on(sig, () => {
        shutdown(sig).then(() => process.exit(0), (err) => {
            console.error(err);
            process.exit(1);
        });
    });
}
//# sourceMappingURL=server.js.map
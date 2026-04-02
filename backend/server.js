/**
 * Run without a build: `node server.js` (uses tsx; same as `npm run dev` without watch).
 * Watch: `npm run dev`. Production-style: `npm run build` then `npm start` (node dist/server.js).
 */
import "tsx/esm";
await import("./src/server.ts");

// CLI entry point so Playwright's webServer can start the existing
// dependency-free static server. See static-server.mjs for the server
// itself; this file only wires it to a port and keeps the process alive.

import { startStaticServer } from "./static-server.mjs";

const port = Number(process.env.PORT) || 8322;

const server = await startStaticServer({ port });
console.log(`static server listening on ${server.origin}`);

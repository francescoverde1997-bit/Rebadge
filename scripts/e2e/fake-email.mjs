// Finto servizio email (stessa API di Resend), SOLO per test e demo: non spedisce nulla, conserva i messaggi.
// POST /emails → { id }   ·   GET /__emails → messaggi ricevuti   ·   /__reset → svuota
import http from "node:http";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.FAKE_EMAIL_PORT ?? 54600);
const emails = [];
const json = (res, status, body) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };

http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const p = new URL(req.url, `http://localhost:${PORT}`).pathname;
    if (p === "/__reset") { emails.length = 0; return json(res, 200, {}); }
    if (p === "/__emails") return json(res, 200, emails);
    if (p === "/emails" && req.method === "POST") {
      if (!(req.headers.authorization ?? "").startsWith("Bearer re_")) return json(res, 401, { message: "API key non valida" });
      const msg = JSON.parse(Buffer.concat(chunks).toString());
      if (!msg.from || !msg.to?.length || !msg.subject) return json(res, 422, { message: "campi mancanti" });
      const id = randomUUID();
      emails.push({ id, ...msg, received_at: new Date().toISOString() });
      return json(res, 200, { id });
    }
    json(res, 404, { message: `fake email: ${req.method} ${p}` });
  });
}).listen(PORT, () => console.log(`fake email on ${PORT}`));

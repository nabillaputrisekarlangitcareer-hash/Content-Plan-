import { get, put } from "@vercel/blob";
import { readFileSync } from "node:fs";
import { timingSafeEqual } from "node:crypto";

const PATH = "content-plan/data.json";
const KEY_RE = /^(konten|inspo|pengaturan|blog)\/[A-Za-z0-9_.\-]{1,100}$/;

function seed() {
  for (const p of ["seed.json", "../seed.json"]) {
    try { return JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8")); } catch {}
  }
  try { return JSON.parse(readFileSync(process.cwd() + "/seed.json", "utf8")); } catch {}
  return { seq: 0, records: {} };
}

async function load() {
  const r = await get(PATH, { access: "private" });
  if (!r || r.statusCode !== 200) return seed();
  try { return JSON.parse(await new Response(r.stream).text()); } catch { return seed(); }
}

function same(a, b) {
  const x = Buffer.from(String(a || "")), y = Buffer.from(String(b || ""));
  return x.length === y.length && timingSafeEqual(x, y);
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  const pass = process.env.PASSCODE;
  if (!pass) return res.status(500).json({ error: "PASSCODE belum diatur di Vercel" });
  if (!same(req.headers["x-passcode"], pass)) return res.status(401).json({ error: "unauthorized" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  const since = Number(body.since) || 0;
  const changes = body.changes && typeof body.changes === "object" ? body.changes : {};

  try {
    const data = await load();
    data.records = data.records || {};
    data.seq = Number(data.seq) || 0;
    let changed = false;
    const rejected = {};
    for (const [k, c] of Object.entries(changes)) {
      if (!KEY_RE.test(k) || !c || typeof c.u !== "number") continue;
      const ex = data.records[k];
      if (!ex || c.u >= ex.u) {
        data.seq += 1;
        data.records[k] = { d: c.x ? {} : (c.d && typeof c.d === "object" ? c.d : {}), u: c.u, x: c.x ? 1 : 0, s: data.seq };
        changed = true;
      } else rejected[k] = ex;
    }
    if (changed || since === 0 && !(await get(PATH, { access: "private" }))) {
      await put(PATH, JSON.stringify(data), { access: "private", allowOverwrite: true, addRandomSuffix: false, contentType: "application/json" });
    }
    const records = {};
    for (const [k, v] of Object.entries(data.records)) if (v.s > since) records[k] = v;
    Object.assign(records, rejected);
    return res.status(200).json({ seq: data.seq, records });
  } catch (e) {
    return res.status(500).json({ error: "server_error", detail: String(e && e.message || e).slice(0, 200) });
  }
}

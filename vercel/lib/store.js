// Stockage du pilote : Vercel Blob privé (région Paris, cdg1).
// En local (tests), LOCAL_STORE=<dossier> remplace Blob par des fichiers.
const fs = require("fs");
const path = require("path");

const LOCAL = process.env.LOCAL_STORE;
let _sdk = null;
const sdk = async () => (_sdk = _sdk || (await import("@vercel/blob")));

const loc = (p) => path.join(LOCAL, p);

async function streamToBuffer(stream) {
  const chunks = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

async function getBuffer(p) {
  if (LOCAL) {
    try {
      const buf = fs.readFileSync(loc(p));
      let type = "application/octet-stream";
      try { type = fs.readFileSync(loc(p) + ".type", "utf8"); } catch (e) { /* none */ }
      return { buf, type };
    } catch (e) { return null; }
  }
  const { get } = await sdk();
  let r;
  try { r = await get(p, { access: "private", useCache: false }); } catch (e) {
    if (/not.?found/i.test(String(e && (e.name || e.message)))) return null;
    throw e;
  }
  if (!r || r.statusCode !== 200 || !r.stream) return null;
  return { buf: await streamToBuffer(r.stream), type: r.blob.contentType || "application/octet-stream" };
}

async function getJSON(p) {
  const r = await getBuffer(p);
  if (!r) return null;
  try { return JSON.parse(r.buf.toString("utf8")); } catch (e) { return null; }
}

async function putBuffer(p, buf, type) {
  if (LOCAL) {
    fs.mkdirSync(path.dirname(loc(p)), { recursive: true });
    fs.writeFileSync(loc(p), buf);
    fs.writeFileSync(loc(p) + ".type", type);
    return;
  }
  const { put } = await sdk();
  await put(p, buf, { access: "private", allowOverwrite: true, addRandomSuffix: false, contentType: type, cacheControlMaxAge: 60 });
}

const putJSON = (p, obj) => putBuffer(p, Buffer.from(JSON.stringify(obj)), "application/json");

async function list(prefix) {
  if (LOCAL) {
    const out = [];
    const walk = (d) => {
      let items = [];
      try { items = fs.readdirSync(loc(d), { withFileTypes: true }); } catch (e) { return; }
      for (const it of items) {
        const rel = path.posix.join(d, it.name);
        if (it.isDirectory()) walk(rel);
        else if (!it.name.endsWith(".type")) out.push(rel);
      }
    };
    walk(prefix.replace(/\/$/, ""));
    return out;
  }
  const { list: ls } = await sdk();
  const out = [];
  let cursor;
  do {
    const r = await ls({ prefix, cursor, limit: 1000 });
    for (const b of r.blobs) out.push(b.pathname);
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);
  return out;
}

async function remove(p) {
  if (LOCAL) {
    try { fs.unlinkSync(loc(p)); fs.unlinkSync(loc(p) + ".type"); } catch (e) { /* ignore */ }
    return;
  }
  const { del } = await sdk();
  try { await del(p); } catch (e) { /* ignore */ }
}

module.exports = { getJSON, putJSON, getBuffer, putBuffer, list, remove };

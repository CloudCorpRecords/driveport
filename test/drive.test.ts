import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createFolder,
  downloadFile,
  getFileMetadata,
  listFiles,
  readFile,
  searchFiles,
  tokenFromEnv,
  trashFile,
  uploadFile,
} from "../src/drive.js";
import type { FetchFn, HttpResponse } from "../src/types.js";

interface Recorded {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
  rawBody?: string;
}

function fakeFetch(steps: Array<{ payload: unknown; status?: number; rawText?: string }>) {
  const calls: Recorded[] = [];
  const queue = [...steps];
  const fn: FetchFn = async (url, init) => {
    let body: unknown;
    let rawBody: string | undefined;
    if (init?.body) {
      rawBody = init.body;
      try { body = JSON.parse(init.body); } catch { body = undefined; }
    }
    calls.push({ url, method: init?.method ?? "GET", headers: init?.headers ?? {}, body, rawBody });
    const step = queue.shift() ?? { payload: {} };
    const res: HttpResponse = {
      ok: (step.status ?? 200) < 300,
      status: step.status ?? 200,
      headers: { get: () => null },
      text: async () => step.rawText ?? JSON.stringify(step.payload),
    };
    return res;
  };
  return { fn, calls };
}

const BASE = "https://www.googleapis.com/drive/v3";
const TOKEN = "test-token";

describe("driveport core", () => {
  it("names the env var when the token is missing", () => {
    assert.throws(() => tokenFromEnv({}), /GOOGLE_ACCESS_TOKEN environment variable is required/);
    assert.throws(() => tokenFromEnv({ GOOGLE_ACCESS_TOKEN: "  " }), /GOOGLE_ACCESS_TOKEN/);
    assert.equal(tokenFromEnv({ GOOGLE_ACCESS_TOKEN: " x " }), "x");
  });

  it("search_files shapes q and fields with Bearer auth", async () => {
    const { fn, calls } = fakeFetch([{ payload: { files: [] } }]);
    await searchFiles(fn, TOKEN, BASE, { query: "name contains 'a'" });
    assert.equal(calls[0].method, "GET");
    assert.equal(calls[0].headers.Authorization, "Bearer test-token");
    assert.ok(calls[0].url.startsWith(`${BASE}/files?q=`));
    assert.ok(calls[0].url.includes("fields=files(id%2Cname%2CmimeType%2CmodifiedTime%2Csize%2CwebViewLink)"));
  });

  it("list_files shapes pageSize and optional q", async () => {
    const { fn, calls } = fakeFetch([{ payload: { files: [] } }, { payload: { files: [] } }]);
    await listFiles(fn, TOKEN, BASE, { page_size: 5, query: "trashed=false" });
    assert.ok(calls[0].url.includes("pageSize=5"));
    assert.ok(calls[0].url.includes("q=trashed%3Dfalse"));
    await listFiles(fn, TOKEN, BASE, {});
    assert.equal(calls[1].url, `${BASE}/files`);
  });

  it("get_file_metadata gets /files/{id}", async () => {
    const { fn, calls } = fakeFetch([{ payload: { id: "f1", name: "Doc" } }]);
    const out = (await getFileMetadata(fn, TOKEN, BASE, { file_id: "f1" })) as Record<string, unknown>;
    assert.equal(out.name, "Doc");
    assert.equal(calls[0].url, `${BASE}/files/f1`);
    assert.equal(calls[0].method, "GET");
  });

  it("read_file uses alt=media and returns text", async () => {
    const { fn, calls } = fakeFetch([{ payload: {}, rawText: "hello file" }]);
    const out = await readFile(fn, TOKEN, BASE, { file_id: "f2" });
    assert.equal(out, "hello file");
    assert.equal(calls[0].url, `${BASE}/files/f2?alt=media`);
  });

  it("create_folder posts the folder mimeType and parents", async () => {
    const { fn, calls } = fakeFetch([{ payload: { id: "fold1" } }, { payload: { id: "fold2" } }]);
    await createFolder(fn, TOKEN, BASE, { name: "New", parent_id: "p1" });
    assert.equal(calls[0].method, "POST");
    assert.deepEqual(calls[0].body, { name: "New", mimeType: "application/vnd.google-apps.folder", parents: ["p1"] });
    await createFolder(fn, TOKEN, BASE, { name: "Solo" });
    assert.deepEqual(calls[1].body, { name: "Solo", mimeType: "application/vnd.google-apps.folder" });
  });

  it("upload_file creates metadata then PATCHes raw content to the upload endpoint", async () => {
    const { fn, calls } = fakeFetch([{ payload: { id: "new1" } }, { payload: { id: "new1", name: "a.txt" } }]);
    const out = (await uploadFile(fn, TOKEN, BASE, { name: "a.txt", content: "data here", mime_type: "text/plain", parent_id: "p9" })) as Record<string, unknown>;
    assert.equal(out.id, "new1");
    assert.equal(calls.length, 2);
    assert.equal(calls[0].method, "POST");
    assert.deepEqual(calls[0].body, { name: "a.txt", mimeType: "text/plain", parents: ["p9"] });
    assert.equal(calls[1].method, "PATCH");
    assert.equal(calls[1].url, "https://www.googleapis.com/upload/drive/v3/files/new1?uploadType=media");
    assert.equal(calls[1].rawBody, "data here");
    assert.equal(calls[1].headers["Content-Type"], "text/plain");
    assert.equal(calls[1].headers.Authorization, "Bearer test-token");
  });

  it("upload_file defaults mime_type to text/plain", async () => {
    const { fn, calls } = fakeFetch([{ payload: { id: "n2" } }, { payload: { id: "n2" } }]);
    await uploadFile(fn, TOKEN, BASE, { name: "b", content: "x" });
    assert.deepEqual(calls[0].body, { name: "b", mimeType: "text/plain" });
    assert.equal(calls[1].headers["Content-Type"], "text/plain");
  });

  it("download_file exports when mime_type is given, else alt=media", async () => {
    const { fn, calls } = fakeFetch([{ payload: {}, rawText: "pdf-bytes" }, { payload: {}, rawText: "raw" }]);
    const a = await downloadFile(fn, TOKEN, BASE, { file_id: "f3", mime_type: "application/pdf" });
    assert.equal(a, "pdf-bytes");
    assert.equal(calls[0].url, `${BASE}/files/f3/export?mimeType=application%2Fpdf`);
    await downloadFile(fn, TOKEN, BASE, { file_id: "f3" });
    assert.equal(calls[1].url, `${BASE}/files/f3?alt=media`);
  });

  it("trash_file patches trashed:true", async () => {
    const { fn, calls } = fakeFetch([{ payload: { id: "f4", trashed: true } }]);
    await trashFile(fn, TOKEN, BASE, { file_id: "f4" });
    assert.equal(calls[0].method, "PATCH");
    assert.equal(calls[0].url, `${BASE}/files/f4`);
    assert.deepEqual(calls[0].body, { trashed: true });
  });

  it("surfaces upstream error status and message", async () => {
    const { fn } = fakeFetch([{ payload: { error: { message: "File not found" } }, status: 404 }]);
    await assert.rejects(
      () => getFileMetadata(fn, TOKEN, BASE, { file_id: "nope" }),
      /Google Drive API error 404: File not found/,
    );
  });

  it("upload_file errors when the create step returns no id", async () => {
    const { fn } = fakeFetch([{ payload: {} }]);
    await assert.rejects(
      () => uploadFile(fn, TOKEN, BASE, { name: "x", content: "y" }),
      /did not return an id/,
    );
  });
});

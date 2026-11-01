/**
 * driveport core: an 8-tool core subset of the Google Drive reference
 * MCP server surface, implemented clean-room against the public Google
 * Drive API documentation (base https://www.googleapis.com/drive/v3,
 * overridable via DRIVE_API_URL).
 *
 * Auth: GOOGLE_ACCESS_TOKEN, sent as `Authorization: Bearer`.
 * A missing token is an error naming the variable. All HTTP goes
 * through an injected FetchFn so the wire behaviour is testable
 * offline.
 */
import type {
  CreateFolderOptions,
  DownloadFileOptions,
  FetchFn,
  GetFileMetadataOptions,
  ListFilesOptions,
  ReadFileOptions,
  SearchFilesOptions,
  TrashFileOptions,
  UploadFileOptions,
} from "./types.js";

export const VERSION = "0.1.0";

export const DEFAULT_API_BASE = "https://www.googleapis.com/drive/v3";

export const UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3";

export function tokenFromEnv(
  env: Record<string, string | undefined> = process.env,
): string {
  const raw = env.GOOGLE_ACCESS_TOKEN;
  const token = typeof raw === "string" ? raw.trim() : "";
  if (!token) {
    throw new Error("GOOGLE_ACCESS_TOKEN environment variable is required");
  }
  return token;
}

export function baseFromEnv(
  env: Record<string, string | undefined> = process.env,
): string {
  const raw = env.DRIVE_API_URL;
  const base = typeof raw === "string" ? raw.trim() : "";
  return (base || DEFAULT_API_BASE).replace(/\/+$/, "");
}

// Backwards-compatible alias matching the reference naming pattern.
export const apiBaseFromEnv = baseFromEnv;

const enc = encodeURIComponent;

interface RequestSpec {
  method: string;
  url: string;
  body?: unknown;
  rawBody?: string;
  contentType?: string;
}

async function apiRequest(
  fetchFn: FetchFn,
  token: string,
  spec: RequestSpec,
): Promise<unknown> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  let body: string | undefined;
  if (spec.rawBody !== undefined) {
    body = spec.rawBody;
    headers["Content-Type"] = spec.contentType ?? "text/plain";
  } else if (spec.body !== undefined) {
    body = JSON.stringify(spec.body);
    headers["Content-Type"] = "application/json";
  }
  const res = await fetchFn(spec.url, { method: spec.method, headers, body });
  const text = await res.text();
  if (!res.ok) {
    let detail = text;
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      const errObj = parsed.error as Record<string, unknown> | undefined;
      if (errObj && typeof errObj.message === "string") detail = errObj.message;
      else if (typeof parsed.message === "string") detail = parsed.message;
    } catch {
      // Keep the raw body as the detail.
    }
    throw new Error(`Google Drive API error ${res.status}: ${detail}`);
  }
  if (!text) return { status: res.status };
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function query(params: Record<string, string | number | undefined>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      parts.push(`${enc(key)}=${enc(String(value))}`);
    }
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

export async function searchFiles(
  fetchFn: FetchFn, token: string, base: string, opts: SearchFilesOptions,
): Promise<unknown> {
  const fields = "files(id,name,mimeType,modifiedTime,size,webViewLink)";
  return apiRequest(fetchFn, token, {
    method: "GET",
    url: `${base}/files${query({ q: opts.query, fields })}`,
  });
}

export async function listFiles(
  fetchFn: FetchFn, token: string, base: string, opts: ListFilesOptions,
): Promise<unknown> {
  return apiRequest(fetchFn, token, {
    method: "GET",
    url: `${base}/files${query({ pageSize: opts.page_size, q: opts.query })}`,
  });
}

export async function getFileMetadata(
  fetchFn: FetchFn, token: string, base: string, opts: GetFileMetadataOptions,
): Promise<unknown> {
  return apiRequest(fetchFn, token, {
    method: "GET",
    url: `${base}/files/${enc(opts.file_id)}`,
  });
}

export async function readFile(
  fetchFn: FetchFn, token: string, base: string, opts: ReadFileOptions,
): Promise<unknown> {
  return apiRequest(fetchFn, token, {
    method: "GET",
    url: `${base}/files/${enc(opts.file_id)}?alt=media`,
  });
}

export async function createFolder(
  fetchFn: FetchFn, token: string, base: string, opts: CreateFolderOptions,
): Promise<unknown> {
  const body: Record<string, unknown> = {
    name: opts.name,
    mimeType: "application/vnd.google-apps.folder",
  };
  if (opts.parent_id) body.parents = [opts.parent_id];
  return apiRequest(fetchFn, token, {
    method: "POST",
    url: `${base}/files`,
    body,
  });
}

export async function uploadFile(
  fetchFn: FetchFn, token: string, base: string, opts: UploadFileOptions,
): Promise<unknown> {
  const mime = opts.mime_type ?? "text/plain";
  const metadata: Record<string, unknown> = { name: opts.name, mimeType: mime };
  if (opts.parent_id) metadata.parents = [opts.parent_id];
  const created = (await apiRequest(fetchFn, token, {
    method: "POST",
    url: `${base}/files`,
    body: metadata,
  })) as Record<string, unknown>;
  const id = typeof created.id === "string" ? created.id : "";
  if (!id) throw new Error("Google Drive API did not return an id for the new file");
  return apiRequest(fetchFn, token, {
    method: "PATCH",
    url: `${UPLOAD_BASE}/files/${enc(id)}?uploadType=media`,
    rawBody: opts.content,
    contentType: mime,
  });
}

export async function downloadFile(
  fetchFn: FetchFn, token: string, base: string, opts: DownloadFileOptions,
): Promise<unknown> {
  if (opts.mime_type) {
    return apiRequest(fetchFn, token, {
      method: "GET",
      url: `${base}/files/${enc(opts.file_id)}/export${query({ mimeType: opts.mime_type })}`,
    });
  }
  return apiRequest(fetchFn, token, {
    method: "GET",
    url: `${base}/files/${enc(opts.file_id)}?alt=media`,
  });
}

export async function trashFile(
  fetchFn: FetchFn, token: string, base: string, opts: TrashFileOptions,
): Promise<unknown> {
  return apiRequest(fetchFn, token, {
    method: "PATCH",
    url: `${base}/files/${enc(opts.file_id)}`,
    body: { trashed: true },
  });
}

/** Dispatch a tool call by name. Used by both the MCP server and the CLI. */
export async function callTool(
  fetchFn: FetchFn,
  token: string,
  base: string,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case "search_files":
      return searchFiles(fetchFn, token, base, args as unknown as SearchFilesOptions);
    case "list_files":
      return listFiles(fetchFn, token, base, args as unknown as ListFilesOptions);
    case "get_file_metadata":
      return getFileMetadata(fetchFn, token, base, args as unknown as GetFileMetadataOptions);
    case "read_file":
      return readFile(fetchFn, token, base, args as unknown as ReadFileOptions);
    case "create_folder":
      return createFolder(fetchFn, token, base, args as unknown as CreateFolderOptions);
    case "upload_file":
      return uploadFile(fetchFn, token, base, args as unknown as UploadFileOptions);
    case "download_file":
      return downloadFile(fetchFn, token, base, args as unknown as DownloadFileOptions);
    case "trash_file":
      return trashFile(fetchFn, token, base, args as unknown as TrashFileOptions);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

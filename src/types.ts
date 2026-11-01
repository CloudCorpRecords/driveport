/**
 * driveport types.
 *
 * A core subset of the Google Drive reference MCP server surface: file
 * search, listing, metadata, reading, folders, upload, download and
 * trash against the Google Drive API. HTTP access is described by a
 * minimal response surface so tests can inject a fake fetch.
 */

export interface HttpResponse {
  ok: boolean;
  status: number;
  statusText?: string;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}

export type FetchFn = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    redirect?: string;
  },
) => Promise<HttpResponse>;

export interface SearchFilesOptions {
  query: string;
}

export interface ListFilesOptions {
  page_size?: number;
  query?: string;
}

export interface GetFileMetadataOptions {
  file_id: string;
}

export interface ReadFileOptions {
  file_id: string;
}

export interface CreateFolderOptions {
  name: string;
  parent_id?: string;
}

export interface UploadFileOptions {
  name: string;
  content: string;
  mime_type?: string;
  parent_id?: string;
}

export interface DownloadFileOptions {
  file_id: string;
  mime_type?: string;
}

export interface TrashFileOptions {
  file_id: string;
}

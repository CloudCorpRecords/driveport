/**
 * driveport MCP server. Core subset: 8 tools.
 *
 * Low-level Server API with explicit inputSchema literals (the
 * McpServer+zod path injects $schema/additionalProperties and breaks
 * parity). Zod still validates call args. The literals match the
 * labelled core-subset fixture exactly.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { baseFromEnv, callTool, tokenFromEnv, VERSION } from "./drive.js";
import type { FetchFn } from "./types.js";

const ARG_SCHEMAS: Record<string, z.ZodTypeAny> = {
  search_files: z.object({ query: z.string() }),
  list_files: z.object({
    page_size: z.number().optional(), query: z.string().optional(),
  }),
  get_file_metadata: z.object({ file_id: z.string() }),
  read_file: z.object({ file_id: z.string() }),
  create_folder: z.object({
    name: z.string(), parent_id: z.string().optional(),
  }),
  upload_file: z.object({
    name: z.string(), content: z.string(),
    mime_type: z.string().optional(), parent_id: z.string().optional(),
  }),
  download_file: z.object({
    file_id: z.string(), mime_type: z.string().optional(),
  }),
  trash_file: z.object({ file_id: z.string() }),
};

export const TOOLS = [
  {
    name: "search_files",
    description: "Search for files in Google Drive using a Drive query string.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Drive query string used to filter the files to return, in Google Drive query syntax (sent as the q parameter).",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "list_files",
    description: "List files in Google Drive, optionally filtered by a query.",
    inputSchema: {
      type: "object" as const,
      properties: {
        page_size: {
          type: "number",
          description: "Maximum number of files to return in the list (the Drive pageSize parameter).",
        },
        query: {
          type: "string",
          description: "Optional Drive query string to filter the files listed (sent as the q parameter).",
        },
      },
      required: [],
    },
  },
  {
    name: "get_file_metadata",
    description: "Get metadata for a file in Google Drive by its ID.",
    inputSchema: {
      type: "object" as const,
      properties: {
        file_id: {
          type: "string",
          description: "ID of the Google Drive file to get metadata for.",
        },
      },
      required: ["file_id"],
    },
  },
  {
    name: "read_file",
    description: "Read the contents of a file in Google Drive as text.",
    inputSchema: {
      type: "object" as const,
      properties: {
        file_id: {
          type: "string",
          description: "ID of the Google Drive file to read the contents of.",
        },
      },
      required: ["file_id"],
    },
  },
  {
    name: "create_folder",
    description: "Create a new folder in Google Drive.",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: {
          type: "string",
          description: "Name for the new folder.",
        },
        parent_id: {
          type: "string",
          description: "Optional ID of the parent folder to create the new folder inside; the folder is created at the Drive root when omitted.",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "upload_file",
    description: "Upload a new file with text content to Google Drive.",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: {
          type: "string",
          description: "Name for the new file in Google Drive.",
        },
        content: {
          type: "string",
          description: "Text content to upload as the file's body.",
        },
        mime_type: {
          type: "string",
          description: "Optional MIME type for the new file; defaults to text/plain when omitted.",
        },
        parent_id: {
          type: "string",
          description: "Optional ID of the parent folder to place the new file in; the file is placed at the Drive root when omitted.",
        },
      },
      required: ["name", "content"],
    },
  },
  {
    name: "download_file",
    description: "Download a file from Google Drive, optionally exporting it to another MIME type.",
    inputSchema: {
      type: "object" as const,
      properties: {
        file_id: {
          type: "string",
          description: "ID of the Google Drive file to download.",
        },
        mime_type: {
          type: "string",
          description: "Optional MIME type to export the file as; when given, the file is exported in that format, otherwise it is downloaded as-is.",
        },
      },
      required: ["file_id"],
    },
  },
  {
    name: "trash_file",
    description: "Move a file in Google Drive to the trash.",
    inputSchema: {
      type: "object" as const,
      properties: {
        file_id: {
          type: "string",
          description: "ID of the Google Drive file to move to the trash.",
        },
      },
      required: ["file_id"],
    },
  },
];

function textResult(value: unknown) {
  return {
    content: [{
      type: "text" as const,
      text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
    }],
  };
}
function errorResult(err: unknown) {
  return {
    content: [{
      type: "text" as const,
      text: err instanceof Error ? err.message : String(err),
    }],
    isError: true,
  };
}

const server = new Server(
  { name: "driveport", version: VERSION },
  { capabilities: { tools: {} } },
);
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const schema = ARG_SCHEMAS[name];
  if (!schema) throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
  try {
    const token = tokenFromEnv();
    const parsed = schema.parse(args ?? {}) as Record<string, unknown>;
    const fetchFn = globalThis.fetch as unknown as FetchFn;
    return textResult(await callTool(fetchFn, token, baseFromEnv(), name, parsed));
  } catch (err) {
    return errorResult(err);
  }
});

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
}
void main();

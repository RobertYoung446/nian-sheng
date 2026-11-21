export const WORKSPACE_MAX_BYTES = 8_000_000;
export const WORKSPACE_MAX_MB = WORKSPACE_MAX_BYTES / 1_000_000;

// At most 3 UTF-8 bytes per UTF-16 code unit. Leave space for the row keys.
const PART_CODE_UNITS = 450_000;

export function splitWorkspacePayload(payload: string): string[] {
  const parts: string[] = [];
  for (let start = 0; start < payload.length;) {
    let end = Math.min(start + PART_CODE_UNITS, payload.length);
    const last = payload.charCodeAt(end - 1);
    if (end < payload.length && last >= 0xd800 && last <= 0xdbff) end--;
    parts.push(payload.slice(start, end));
    start = end;
  }
  return parts;
}

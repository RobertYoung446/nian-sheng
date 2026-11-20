export function objectValue(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
export async function readApi(response: Response) {
  try { return objectValue(await response.json()); }
  catch { throw new Error('服务暂时返回了无效响应，本机输入仍保留，请稍后重试'); }
}
export function apiMessage(value: Record<string, unknown>, fallback: string) { return typeof value.message === 'string' ? value.message : typeof value.error === 'string' ? value.error : fallback; }
export function syncFailureMessage(error: unknown) {
  if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) return '同步请求超时，本机记录和待同步操作仍保留，请稍后重试';
  if (error instanceof TypeError) return '暂时无法连接同步服务，本机记录和待同步操作仍保留；连接恢复后可重试';
  return error instanceof Error ? error.message : '同步失败，本机记录和待同步操作仍保留';
}

/**
 * Normalize Express req.params value to string (params can be string | string[]).
 */
export function getParam(value: string | string[] | undefined): string {
  if (value === undefined) return "";
  return Array.isArray(value) ? value[0] ?? "" : value;
}

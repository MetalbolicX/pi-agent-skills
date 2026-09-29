/** Escape once at a shell-string boundary; spawn argument arrays must not be escaped again. */
export function escapeShellArg(arg: string): string {
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

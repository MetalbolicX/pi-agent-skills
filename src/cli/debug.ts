export const DEBUG = /^(1|true|yes|on)$/i;
export const DEBUG_PREFIX = "[pi-skills]";

export function debug(emit: (line: string) => void, message: string): void {
  emit(`${DEBUG_PREFIX} ${message}`);
}

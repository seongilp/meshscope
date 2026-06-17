/** Format a Meshtastic node number as the canonical "!hhhhhhhh" hex id. */
export function nodeIdToHex(num: number): string {
  return "!" + (num >>> 0).toString(16).padStart(8, "0");
}

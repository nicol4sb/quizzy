import { randomInt } from "node:crypto";

const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function createJoinCode(): string {
  return Array.from(
    { length: 6 },
    () => alphabet[randomInt(alphabet.length)],
  ).join("");
}

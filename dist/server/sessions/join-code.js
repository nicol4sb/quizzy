import { randomInt } from "node:crypto";
const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export function createJoinCode() {
    return Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join("");
}
//# sourceMappingURL=join-code.js.map
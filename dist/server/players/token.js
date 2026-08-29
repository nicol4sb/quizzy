import { createHash, randomBytes } from "node:crypto";
export function createPlayerToken() {
    return randomBytes(32).toString("base64url");
}
export function hashPlayerToken(token) {
    return createHash("sha256").update(token).digest("hex");
}
//# sourceMappingURL=token.js.map
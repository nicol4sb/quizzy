import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
const parameters = {
    cost: 16_384,
    blockSize: 8,
    parallelization: 1,
    keyLength: 64,
};
function derive(password, salt) {
    return new Promise((resolve, reject) => {
        scrypt(password, salt, parameters.keyLength, {
            N: parameters.cost,
            r: parameters.blockSize,
            p: parameters.parallelization,
            maxmem: 64 * 1024 * 1024,
        }, (error, key) => (error ? reject(error) : resolve(key)));
    });
}
export async function hashPassword(password) {
    const salt = randomBytes(16);
    const hash = await derive(password, salt);
    return [
        "scrypt",
        parameters.cost,
        parameters.blockSize,
        parameters.parallelization,
        salt.toString("base64url"),
        hash.toString("base64url"),
    ].join("$");
}
export async function verifyPassword(password, encoded) {
    const [algorithm, cost, blockSize, parallelization, salt, expected] = encoded.split("$");
    if (algorithm !== "scrypt" ||
        Number(cost) !== parameters.cost ||
        Number(blockSize) !== parameters.blockSize ||
        Number(parallelization) !== parameters.parallelization ||
        !salt ||
        !expected)
        return false;
    const expectedBuffer = Buffer.from(expected, "base64url");
    const actualBuffer = await derive(password, Buffer.from(salt, "base64url"));
    return (expectedBuffer.length === actualBuffer.length &&
        timingSafeEqual(expectedBuffer, actualBuffer));
}
//# sourceMappingURL=password.js.map
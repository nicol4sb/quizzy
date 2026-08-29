import { networkInterfaces } from "node:os";

function isPrivateIpv4(address: string): boolean {
  return (
    address.startsWith("10.") ||
    address.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(address)
  );
}

export function localIpv4Addresses(): string[] {
  return Object.values(networkInterfaces())
    .flatMap((entries) => entries ?? [])
    .filter((entry) => entry.family === "IPv4" && !entry.internal)
    .map((entry) => entry.address);
}

export function resolveJoinOrigin(
  browserOrigin: string,
  addresses = localIpv4Addresses(),
): string {
  const origin = new URL(browserOrigin);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname))
    return origin.origin;
  const address = addresses.find(isPrivateIpv4) ?? addresses[0];
  if (!address) return origin.origin;
  origin.hostname = address;
  return origin.origin;
}

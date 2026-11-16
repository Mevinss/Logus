import { networkInterfaces } from "node:os";

// Both startup output and invitations should pick the same reachable adapter.
export function lanAddress(interfaces = networkInterfaces()) {
  const cards = Object.entries(interfaces).flatMap(([name, addresses]) =>
    (addresses || []).filter(a => a.family === "IPv4" && !a.internal &&
      !a.address.startsWith("169.254.")).map(a => ({ name, address: a.address }))
  );
  const physical = cards.filter(a => !/virtual|wsl|vpn|hyper|docker|vethernet|vmware|vbox|bluetooth|loopback|wi-fi direct/i.test(a.name));
  return (physical.find(a => /wi-?fi|wireless|беспровод/i.test(a.name)) || physical[0])?.address;
}

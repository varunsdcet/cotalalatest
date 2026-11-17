import type { PortalApiResponse } from "@/lib/api";

export type Notice = { kind: "success" | "error"; text: string } | null;

export function apiMessage(res: PortalApiResponse | undefined | null, fallback: string) {
  return (res && (res.msg || res.message)) || fallback;
}

export function errorText(err: unknown, fallback: string) {
  return err instanceof Error && err.message ? err.message : fallback;
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function asString(value: unknown, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

/** Parses a JSON string column (e.g. agent.settings_preferences); returns {} on failure. */
export function parseJsonObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "string" || !value.trim()) return asRecord(value);
  try {
    return asRecord(JSON.parse(value));
  } catch {
    return {};
  }
}

export type BillingAddress = {
  id: string;
  label: string;
  name: string;
  unit: string;
  street: string;
  city: string;
  province: string;
  postal: string;
  country: string;
  phone: string;
  notes: string;
  address: string;
  is_default: boolean;
};

/** Shipping-method placeholders returned by billing APIs — not real deletable address-book rows. */
const SHIPPING_METHOD_IDS = new Set(["home", "agency", "pickup", "pickup-outside", "listing", "other"]);

export function isManagedBillingAddress(address: Pick<BillingAddress, "id" | "street" | "city">) {
  const id = asString(address.id).trim();
  if (!id) return false;
  if (id.startsWith("address_")) return true;
  if (SHIPPING_METHOD_IDS.has(id)) return false;
  return Boolean(asString(address.street).trim() || asString(address.city).trim());
}

function addressFingerprint(address: BillingAddress) {
  return [address.street, address.city, address.postal, address.name]
    .map((part) => asString(part).trim().toLowerCase().replace(/\s+/g, " "))
    .join("|");
}

export function readAddresses(raw: unknown): BillingAddress[] {
  const parsed = asArray(raw)
    .map(asRecord)
    .filter((a) => asString(a.id))
    .map((a) => ({
      id: asString(a.id),
      label: asString(a.label),
      name: asString(a.name),
      unit: asString(a.unit),
      street: asString(a.street),
      city: asString(a.city),
      province: asString(a.province),
      postal: asString(a.postal),
      country: asString(a.country),
      phone: asString(a.phone),
      notes: asString(a.notes ?? a.shipnotes),
      address: asString(a.address),
      is_default: a.is_default === true || a.is_default === 1 || a.is_default === "1",
    }))
    .filter(isManagedBillingAddress);

  // Deduplicate by id, then by same street/city/postal/name content.
  const byId = new Map<string, BillingAddress>();
  for (const address of parsed) {
    const existing = byId.get(address.id);
    if (!existing || (!existing.is_default && address.is_default)) byId.set(address.id, address);
  }
  const unique: BillingAddress[] = [];
  const seenContent = new Set<string>();
  for (const address of byId.values()) {
    const key = addressFingerprint(address);
    if (key !== "|||" && seenContent.has(key)) continue;
    if (key !== "|||") seenContent.add(key);
    unique.push(address);
  }
  return unique;
}

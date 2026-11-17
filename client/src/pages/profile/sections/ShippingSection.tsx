import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import {
  deleteBillingAddress,
  getBillingScreen,
  saveBillingAddress,
  setDefaultBillingAddress,
  type BillingAddressInput,
} from "@/lib/api";
import { NoticeLine } from "./shared";
import {
  apiMessage,
  asArray,
  asRecord,
  asString,
  errorText,
  readAddresses,
  type BillingAddress,
  type Notice,
} from "./helpers";

type AddressForm = Omit<BillingAddress, "address" | "is_default" | "notes"> & {
  shipnotes: string;
  is_default: boolean;
};

const EMPTY_FORM: AddressForm = {
  id: "",
  label: "",
  name: "",
  unit: "",
  street: "",
  city: "",
  province: "",
  postal: "",
  country: "Canada",
  phone: "",
  shipnotes: "",
  is_default: false,
};

function cacheKey() {
  return `cotala_billing_addresses_${localStorage.getItem("cotala_user_id") || "anon"}`;
}

function writeCachedAddresses(list: BillingAddress[]) {
  try {
    localStorage.setItem(cacheKey(), JSON.stringify(list));
  } catch {
    /* ignore quota */
  }
}

function extractDefaultAddressId(payload: unknown): string {
  const data = asRecord(payload);
  const nested = asRecord(data.data);
  return asString(
    data.default_billing_address_id ||
      data.default_address_id ||
      nested.default_billing_address_id ||
      nested.default_address_id ||
      asRecord(nested.billing).default_billing_address_id ||
      asRecord(nested.shipping).default_billing_address_id,
  );
}

/** Pull address book from billing/screen (and similar) responses. */
function extractAddresses(payload: unknown): BillingAddress[] {
  const data = asRecord(payload);
  const nested = asRecord(data.data);
  const billing = asRecord(nested.billing || data.billing);
  const shipping = asRecord(nested.shipping || data.shipping);
  const candidates = [
    nested.addresses,
    nested.billing_addresses,
    billing.addresses,
    billing.billing_addresses,
    shipping.addresses,
    shipping.billing_addresses,
    data.addresses,
    data.billing_addresses,
    asArray(payload),
  ];
  for (const raw of candidates) {
    const list = readAddresses(raw);
    if (list.length) return list;
  }
  // Deep-ish fallback: first array of objects that look like addresses
  const queue: unknown[] = [nested, billing, shipping, data];
  while (queue.length) {
    const cur = asRecord(queue.shift());
    for (const value of Object.values(cur)) {
      if (Array.isArray(value) && value.some((item) => asString(asRecord(item).street) || asString(asRecord(item).id).startsWith("address_"))) {
        const list = readAddresses(value);
        if (list.length) return list;
      } else if (value && typeof value === "object" && !Array.isArray(value)) {
        queue.push(value);
      }
    }
  }
  return [];
}

export default function ShippingSection({
  initialAddresses,
  initialDefaultAddressId,
  defaultName,
  defaultPhone,
}: {
  initialAddresses: BillingAddress[];
  initialDefaultAddressId: string;
  defaultName: string;
  defaultPhone: string;
}) {
  const [addresses, setAddresses] = useState(() => readAddresses(initialAddresses));
  const [defaultAddressId, setDefaultAddressId] = useState(
    () => initialDefaultAddressId || initialAddresses.find((a) => a.is_default)?.id || "",
  );
  const [notice, setNotice] = useState<Notice>(null);
  const [busyId, setBusyId] = useState("");
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<AddressForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSaving, setFormSaving] = useState(false);

  const commitAddresses = (list: BillingAddress[], preferDefault?: string) => {
    const next = readAddresses(list);
    setAddresses(next);
    writeCachedAddresses(next);
    const flagged = next.find((address) => address.is_default)?.id;
    setDefaultAddressId((current) => flagged || preferDefault || (next.some((address) => address.id === current) ? current : ""));
  };

  const reloadFromBillingScreen = async (preferDefault?: string) => {
    const res = await getBillingScreen();
    if (!res.status) throw new Error(apiMessage(res, "Could not load addresses."));
    // Replace list from billing/screen only — never merge with stale local rows
    // (that was causing duplicate "home" + saved address cards).
    const fromApi = extractAddresses(res);
    const defaultId = extractDefaultAddressId(res) || preferDefault;
    commitAddresses(fromApi, defaultId);
    return fromApi;
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        await reloadFromBillingScreen(initialDefaultAddressId);
      } catch {
        if (!cancelled) commitAddresses(readAddresses(initialAddresses), initialDefaultAddressId);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const orderedAddresses = useMemo(
    () => [...addresses].sort((a, b) => Number(b.id === defaultAddressId) - Number(a.id === defaultAddressId)),
    [addresses, defaultAddressId],
  );

  const openAddressModal = (address?: BillingAddress, focusNotes = false) => {
    setFormError(null);
    setForm(
      address
        ? {
            id: address.id,
            label: address.label,
            name: address.name,
            unit: address.unit,
            street: address.street,
            city: address.city,
            province: address.province,
            postal: address.postal,
            country: address.country || "Canada",
            phone: address.phone,
            shipnotes: address.notes,
            is_default: address.id === defaultAddressId,
          }
        : { ...EMPTY_FORM, name: defaultName, phone: defaultPhone, is_default: addresses.length === 0 },
    );
    setModalOpen(true);
    if (focusNotes) window.setTimeout(() => document.getElementById("ma-shipping-notes")?.focus(), 80);
  };

  const handleSaveAddress = async () => {
    if (!form.name.trim() || !form.street.trim() || !form.city.trim()) {
      setFormError("Name, street and city are required.");
      return;
    }
    setFormSaving(true);
    setFormError(null);
    const payload: BillingAddressInput = {
      label: form.label.trim(),
      name: form.name.trim(),
      unit: form.unit.trim(),
      street: form.street.trim(),
      city: form.city.trim(),
      province: form.province.trim(),
      postal: form.postal.trim(),
      country: form.country.trim(),
      phone: form.phone.trim(),
      shipnotes: form.shipnotes.trim(),
      is_default: form.is_default,
      ...(form.id ? { address_id: form.id } : {}),
    };
    try {
      const res = await saveBillingAddress(payload);
      if (!res.status) {
        setFormError(apiMessage(res, "Could not save address."));
        return;
      }
      const savedId = asString(asRecord(asRecord(res.data).address).id) || form.id;
      try {
        await reloadFromBillingScreen(form.is_default ? savedId : undefined);
      } catch {
        // Fallback if screen reload fails: keep optimistic single-row update
        const saved = asRecord(asRecord(res.data).address);
        commitAddresses(
          [
            {
              id: savedId || `address-${Date.now()}`,
              label: asString(saved.label, payload.label || ""),
              name: asString(saved.name, payload.name || ""),
              unit: asString(saved.unit, payload.unit || ""),
              street: asString(saved.street, payload.street || ""),
              city: asString(saved.city, payload.city || ""),
              province: asString(saved.province, payload.province || ""),
              postal: asString(saved.postal, payload.postal || ""),
              country: asString(saved.country, payload.country || ""),
              phone: asString(saved.phone, payload.phone || ""),
              notes: asString(saved.notes, payload.shipnotes || ""),
              address: asString(saved.address),
              is_default: form.is_default,
            },
            ...addresses.filter((address) => address.id !== form.id && address.id !== savedId).map((address) =>
              form.is_default ? { ...address, is_default: false } : address,
            ),
          ],
          form.is_default ? savedId : undefined,
        );
      }
      setModalOpen(false);
      setNotice({ kind: "success", text: apiMessage(res, "Address saved") });
    } catch (err) {
      setFormError(errorText(err, "Could not save address."));
    } finally {
      setFormSaving(false);
    }
  };

  const handleSetDefault = async (address: BillingAddress) => {
    setBusyId(address.id);
    setNotice(null);
    try {
      const res = await setDefaultBillingAddress(address.id);
      if (!res.status) {
        setNotice({ kind: "error", text: apiMessage(res, "Could not set default address.") });
        return;
      }
      try {
        await reloadFromBillingScreen(address.id);
      } catch {
        commitAddresses(
          addresses.map((row) => ({ ...row, is_default: row.id === address.id })),
          address.id,
        );
      }
      setNotice({ kind: "success", text: apiMessage(res, "Default address updated") });
    } catch (err) {
      setNotice({ kind: "error", text: errorText(err, "Could not set default address.") });
    } finally {
      setBusyId("");
    }
  };

  const handleRemove = async (address: BillingAddress) => {
    if (!window.confirm(`Remove ${address.label || address.name || "this address"}?`)) return;
    setBusyId(address.id);
    setNotice(null);
    try {
      const res = await deleteBillingAddress(address.id);
      const msg = apiMessage(res, "Could not remove address.");
      if (!res.status) {
        if (/not found/i.test(msg)) {
          try {
            await reloadFromBillingScreen();
          } catch {
            commitAddresses(addresses.filter((item) => item.id !== address.id));
          }
          setNotice({ kind: "success", text: "Address removed" });
          return;
        }
        setNotice({ kind: "error", text: msg });
        return;
      }
      try {
        await reloadFromBillingScreen();
      } catch {
        commitAddresses(addresses.filter((item) => item.id !== address.id));
      }
      setNotice({ kind: "success", text: apiMessage(res, "Address removed") });
    } catch (err) {
      setNotice({ kind: "error", text: errorText(err, "Could not remove address.") });
    } finally {
      setBusyId("");
    }
  };

  return (
    <div className="shipping-address-book">
      <h2>Shipping</h2>
      <div className="address-title">Your Addresses</div>
      <hr className="ma-hr" />

      {loading ? (
        <div className="flex items-center gap-2 text-white/60 py-6">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading addresses…
        </div>
      ) : (
        <div className="shipping-address-cards">
          <button type="button" className="address-card add-address ma-add-address" onClick={() => openAddressModal()}>
            <Plus aria-hidden="true" />
            <span className="ma-add-address-label">Add Address</span>
          </button>

          {orderedAddresses.map((address) => {
            const isDefault = address.id === defaultAddressId;
            const cityLine = [address.city, [address.province, address.postal].filter(Boolean).join(" ")].filter(Boolean).join(", ");
            const busy = busyId === address.id;
            return (
              <article key={address.id} className={`address-card shipping-address-card ${isDefault ? "default-card" : ""}`}>
                {isDefault ? <div className="default-strip">DEFAULT</div> : null}
                <div className="name">{address.name || "—"}</div>
                <div className="shipping-address-copy">
                  {[address.unit, address.street].filter(Boolean).join(" ") || address.address || "—"}
                  {cityLine ? <><br />{cityLine}</> : null}
                  {address.country ? <><br />{address.country}</> : null}
                </div>
                <div className="shipping-address-contact">Phone: {address.phone || "N/A"}</div>
                {address.notes ? (
                  <div className="shipping-address-contact">Buzzer: {address.notes}</div>
                ) : isDefault ? (
                  <div className="shipping-address-contact">Buzzer: N/A</div>
                ) : (
                  <button type="button" className="shipping-instruction-link" onClick={() => openAddressModal(address, true)}>
                    Add delivery instruction
                  </button>
                )}
                <div className="address-actions">
                  {busy ? (
                    <Loader2 className="w-4 h-4 animate-spin text-[#B082F2]" />
                  ) : (
                    <>
                      <button type="button" onClick={() => openAddressModal(address)}>Edit</button>
                      <button type="button" onClick={() => void handleRemove(address)}>Remove</button>
                      {!isDefault ? <button type="button" onClick={() => void handleSetDefault(address)}>Set as Default</button> : null}
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
      <NoticeLine notice={notice} />

      {modalOpen ? (
        <div
          className="ma-brand-upload-overlay"
          role="presentation"
          onClick={() => {
            if (!formSaving) setModalOpen(false);
          }}
        >
          <div
            className="ma-brand-upload-dialog ma-address-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ma-address-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="ma-brand-upload-body">
              <div className="ma-brand-upload-heading">
                <h3 id="ma-address-title">{form.id ? "Edit Address" : "Add Address"}</h3>
                <p>Used for delivery on your orders.</p>
              </div>
              <form
                className="ma-address-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleSaveAddress();
                }}
              >
                {(
                  [
                    ["label", "Label (e.g. Home, Office)", "col-span-2"],
                    ["name", "Full name *", "col-span-2"],
                    ["unit", "Unit", ""],
                    ["street", "Street *", ""],
                    ["city", "City *", ""],
                    ["province", "Province", ""],
                    ["postal", "Postal code", ""],
                    ["country", "Country", ""],
                    ["phone", "Phone", "col-span-2"],
                    ["shipnotes", "Delivery notes / buzzer", "col-span-2"],
                  ] as Array<[keyof AddressForm, string, string]>
                ).map(([key, label, span]) => (
                  <label key={key} className={`ma-field ${span}`}>
                    <span className="form-label">{label}</span>
                    <input
                      id={key === "shipnotes" ? "ma-shipping-notes" : undefined}
                      className="form-control custom-input w-full"
                      value={String(form[key] ?? "")}
                      onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
                    />
                  </label>
                ))}
                <label className="ma-field-check col-span-2">
                  <input type="checkbox" checked={form.is_default} onChange={(event) => setForm((current) => ({ ...current, is_default: event.target.checked }))} />
                  <span>Set as default address</span>
                </label>
                {formError ? <p className="ma-notice ma-notice--error col-span-2">{formError}</p> : null}
              </form>
            </div>
            <div className="ma-brand-upload-footer">
              <button type="button" className="ma-brand-modal-cancel" disabled={formSaving} onClick={() => setModalOpen(false)}>
                Cancel
              </button>
              <button type="button" className="ma-brand-modal-continue" disabled={formSaving} onClick={() => void handleSaveAddress()}>
                {formSaving ? "Saving…" : "Save Address"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

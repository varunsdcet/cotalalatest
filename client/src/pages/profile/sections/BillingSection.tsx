import { useEffect, useMemo, useState } from "react";
import { CreditCard, Loader2, Plus } from "lucide-react";
import {
  createPaymentMethodCheckout,
  deleteBillingAddress,
  deleteStripePaymentMethod,
  getStripePaymentMethods,
  saveBillingAddress,
  savePortalProfile,
  setDefaultBillingAddress,
  setDefaultStripePaymentMethod,
  type BillingAddressInput,
} from "@/lib/api";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import masterCardLogo from "@/pages/images/master-card.png";
import { NoticeLine, SectionLoading } from "./shared";
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

type PaymentMethod = {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  holder: string;
};

type AddressForm = Omit<BillingAddress, "address" | "is_default" | "notes"> & { shipnotes: string; is_default: boolean };

// Address management now lives on the Shipping tab. Keep the implementation
// here so it can be restored without removing its functionality.
const SHOW_BILLING_ADDRESS_UI = false;
const SHOW_BILLING_CONTACT_UI = false;

function readMethods(raw: unknown): PaymentMethod[] {
  return asArray(raw)
    .map(asRecord)
    .filter((m) => asString(m.id))
    .map((m) => {
      const card = asRecord(m.card);
      return {
        id: asString(m.id),
        brand: asString(card.display_brand || card.brand, "card"),
        last4: asString(card.last4, "••••"),
        expMonth: Number(card.exp_month) || 0,
        expYear: Number(card.exp_year) || 0,
        holder: asString(asRecord(m.billing_details).name),
      };
    });
}

function formatExpiry(month: number, year: number) {
  if (!month || !year) return "—";
  return `${String(month).padStart(2, "0")}/${String(year).slice(-2)}`;
}

function VisaLogo() {
  return (
    <svg width="60" height="60" viewBox="0 0 47.834 47.834" aria-label="Visa">
      <g fill="#FFFFFF">
        <path d="m19.153 16.799-2.431 14.266h3.888l2.433-14.266zM13.462 16.815l-3.808 9.729-.406-1.469c-.751-1.77-2.883-4.312-5.386-5.914l3.482 11.897 4.114-.007 6.123-14.239-4.119.003z" />
        <path d="M7.772 17.836c-.226-.869-.881-1.128-1.694-1.159H.05l-.05.284c4.691 1.138 7.795 3.88 9.083 7.177l-1.311-6.302zM30.923 19.534a7.178 7.178 0 0 1 2.91.546l.351.165.526-3.092c-.77-.289-1.977-.599-3.483-.599-3.842 0-6.55 1.935-6.571 4.708-.025 2.049 1.929 3.193 3.405 3.876 1.515.7 2.023 1.145 2.016 1.77-.012.955-1.208 1.393-2.325 1.393-1.557 0-2.384-.215-3.661-.747l-.501-.228-.547 3.193c.91.399 2.589.742 4.332.76 4.087 0 6.743-1.912 6.771-4.875.017-1.621-1.02-2.858-3.267-3.873-1.36-.662-2.192-1.102-2.184-1.77 0-.593.706-1.227 2.228-1.227zM44.688 16.815h-3.004c-.933 0-1.627.254-2.037 1.184l-5.773 13.074h4.083s.666-1.758.817-2.143l4.979.006c.116.498.474 2.137.474 2.137h3.607l-3.146-14.258zm-4.795 9.195c.32-.819 1.549-3.987 1.549-3.987-.021.039.317-.825.518-1.362l.262 1.23.901 4.119h-3.23z" />
      </g>
    </svg>
  );
}

function CardLogo({ brand }: { brand: string }) {
  const b = brand.toLowerCase();
  if (b.includes("visa")) return <VisaLogo />;
  if (b.includes("master")) return <img src={masterCardLogo} width={60} alt="Mastercard" />;
  return <span className="uppercase">{brand || "Card"}</span>;
}

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

export default function BillingSection({
  initialAddresses,
  initialDefaultAddressId,
  initialBillingEmail,
  billingAddressText,
  defaultName,
  defaultPhone,
  legacyCard,
}: {
  initialAddresses: BillingAddress[];
  initialDefaultAddressId: string;
  initialBillingEmail: string;
  billingAddressText: string;
  defaultName: string;
  defaultPhone: string;
  legacyCard: { cardtype: string; last4: string; expiry_month: string; expiry_year: string } | null;
}) {
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [defaultMethodId, setDefaultMethodId] = useState("");
  const [activeMethodId, setActiveMethodId] = useState("");
  const [methodsLoading, setMethodsLoading] = useState(true);
  const [methodsError, setMethodsError] = useState<string | null>(null);
  const [cardBusy, setCardBusy] = useState<"" | "checkout" | "default" | "delete">("");
  const [cardNotice, setCardNotice] = useState<Notice>(null);

  const [addresses, setAddresses] = useState<BillingAddress[]>(initialAddresses);
  const [defaultAddressId, setDefaultAddressId] = useState(initialDefaultAddressId);
  const [addressNotice, setAddressNotice] = useState<Notice>(null);
  const [addressBusyId, setAddressBusyId] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<AddressForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSaving, setFormSaving] = useState(false);

  const [billingEmail, setBillingEmail] = useState(initialBillingEmail);
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailNotice, setEmailNotice] = useState<Notice>(null);

  const loadMethods = async () => {
    setMethodsLoading(true);
    setMethodsError(null);
    try {
      const res = await getStripePaymentMethods();
      if (!res.status) {
        setMethodsError(apiMessage(res, "Could not load saved cards."));
        return;
      }
      const data = asRecord(res.data);
      const list = readMethods(data.payment_methods);
      const def = asString(asRecord(data.customer).default_payment_method_id);
      setMethods(list);
      setDefaultMethodId(def);
      setActiveMethodId((prev) => (list.some((m) => m.id === prev) ? prev : def && list.some((m) => m.id === def) ? def : list[0]?.id || ""));
    } catch (err) {
      setMethodsError(errorText(err, "Could not load saved cards."));
    } finally {
      setMethodsLoading(false);
    }
  };

  useEffect(() => {
    void loadMethods();
  }, []);

  const orderedMethods = useMemo(() => {
    const active = methods.find((m) => m.id === activeMethodId);
    return active ? [active, ...methods.filter((m) => m.id !== activeMethodId)] : methods;
  }, [methods, activeMethodId]);

  const applyAddresses = (raw: unknown, preferDefault?: string, ensure?: unknown) => {
    const list = readAddresses(raw);
    const ensured = ensure ? readAddresses([ensure])[0] : null;
    const next =
      ensured && !list.some((a) => a.id === ensured.id)
        ? [ensured, ...list]
        : ensured
          ? list.map((a) => (a.id === ensured.id ? { ...a, ...ensured } : a))
          : list;
    setAddresses(next);
    const flagged = next.find((a) => a.is_default)?.id;
    setDefaultAddressId((prev) => flagged || preferDefault || (next.some((a) => a.id === prev) ? prev : ""));
  };

  const handleAddCard = async () => {
    setCardBusy("checkout");
    setCardNotice(null);
    try {
      const res = await createPaymentMethodCheckout(true);
      const url = asString(asRecord(res.data).checkout_url);
      if (!res.status || !/^https:\/\//i.test(url)) {
        setCardNotice({ kind: "error", text: apiMessage(res, "Could not start the secure card form.") });
        setCardBusy("");
        return;
      }
      window.location.assign(url);
    } catch (err) {
      setCardNotice({ kind: "error", text: errorText(err, "Could not start the secure card form.") });
      setCardBusy("");
    }
  };

  const handleSetDefaultCard = async () => {
    if (!activeMethodId) return;
    setCardBusy("default");
    setCardNotice(null);
    try {
      const res = await setDefaultStripePaymentMethod(activeMethodId);
      if (res.status) {
        setDefaultMethodId(activeMethodId);
        setCardNotice({ kind: "success", text: apiMessage(res, "Default card updated") });
      } else setCardNotice({ kind: "error", text: apiMessage(res, "Could not set default card.") });
    } catch (err) {
      setCardNotice({ kind: "error", text: errorText(err, "Could not set default card.") });
    } finally {
      setCardBusy("");
    }
  };

  const handleDeleteCard = async () => {
    const card = methods.find((m) => m.id === activeMethodId);
    if (!card) return;
    if (!window.confirm(`Remove the ${card.brand} card ending in ${card.last4}?`)) return;
    setCardBusy("delete");
    setCardNotice(null);
    try {
      const res = await deleteStripePaymentMethod(card.id);
      if (res.status) {
        const rest = methods.filter((m) => m.id !== card.id);
        setMethods(rest);
        setActiveMethodId(rest[0]?.id || "");
        if (defaultMethodId === card.id) setDefaultMethodId("");
        setCardNotice({ kind: "success", text: apiMessage(res, "Payment method removed") });
      } else setCardNotice({ kind: "error", text: apiMessage(res, "Could not remove card.") });
    } catch (err) {
      setCardNotice({ kind: "error", text: errorText(err, "Could not remove card.") });
    } finally {
      setCardBusy("");
    }
  };

  const openAddressModal = (address?: BillingAddress) => {
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
      const data = asRecord(res.data);
      const saved = asRecord(data.address);
      const savedId = asString(saved.id) || form.id;
      if (Array.isArray(data.addresses) || saved.id) {
        applyAddresses(
          Array.isArray(data.addresses) ? data.addresses : [],
          form.is_default ? savedId : undefined,
          saved.id
            ? {
                ...saved,
                notes: asString(saved.notes) || payload.shipnotes || "",
                is_default: form.is_default,
              }
            : undefined,
        );
      } else if (form.is_default && savedId) setDefaultAddressId(savedId);
      setModalOpen(false);
      setAddressNotice({ kind: "success", text: apiMessage(res, "Address saved") });
    } catch (err) {
      setFormError(errorText(err, "Could not save address."));
    } finally {
      setFormSaving(false);
    }
  };

  const handleSetDefaultAddress = async (address: BillingAddress) => {
    setAddressBusyId(address.id);
    setAddressNotice(null);
    try {
      const res = await setDefaultBillingAddress(address.id);
      if (res.status) {
        const data = asRecord(res.data);
        if (Array.isArray(data.addresses)) applyAddresses(data.addresses, address.id);
        setDefaultAddressId(address.id);
        setAddressNotice({ kind: "success", text: apiMessage(res, "Default address updated") });
      } else setAddressNotice({ kind: "error", text: apiMessage(res, "Could not set default address.") });
    } catch (err) {
      setAddressNotice({ kind: "error", text: errorText(err, "Could not set default address.") });
    } finally {
      setAddressBusyId("");
    }
  };

  const handleDeleteAddress = async (address: BillingAddress) => {
    if (!window.confirm(`Remove ${address.label || address.name || "this address"}?`)) return;
    setAddressBusyId(address.id);
    setAddressNotice(null);
    try {
      const res = await deleteBillingAddress(address.id);
      if (res.status) {
        const data = asRecord(res.data);
        if (Array.isArray(data.addresses)) applyAddresses(data.addresses);
        else setAddresses((prev) => prev.filter((a) => a.id !== address.id));
        if (defaultAddressId === address.id) setDefaultAddressId("");
        setAddressNotice({ kind: "success", text: apiMessage(res, "Address removed") });
      } else setAddressNotice({ kind: "error", text: apiMessage(res, "Could not remove address.") });
    } catch (err) {
      setAddressNotice({ kind: "error", text: errorText(err, "Could not remove address.") });
    } finally {
      setAddressBusyId("");
    }
  };

  const handleSaveEmail = async () => {
    setEmailSaving(true);
    setEmailNotice(null);
    try {
      const res = await savePortalProfile({ billingemail: billingEmail.trim() });
      setEmailNotice(res.status ? { kind: "success", text: apiMessage(res, "Billing email saved") } : { kind: "error", text: apiMessage(res, "Unable to save billing email.") });
    } catch (err) {
      setEmailNotice({ kind: "error", text: errorText(err, "Unable to save billing email.") });
    } finally {
      setEmailSaving(false);
    }
  };

  const sortedAddresses = useMemo(
    () => [...addresses].sort((a, b) => Number(b.id === defaultAddressId) - Number(a.id === defaultAddressId)),
    [addresses, defaultAddressId],
  );

  const activeMethod = methods.find((m) => m.id === activeMethodId);

  return (
    <div className="ma-billing">
      <h2>Payment Methods</h2>
      <div className="ma-payment-title">Your Cards</div>
      <hr className="ma-hr ma-payment-divider" />

      {methodsLoading ? (
        <SectionLoading label="Loading saved cards…" />
      ) : methodsError ? (
        <p className="ma-notice ma-notice--error mb-4">{methodsError}</p>
      ) : orderedMethods.length ? (
        <div className="card-stack ma-card-stack mb-4">
          {orderedMethods
            .slice(0, 3)
            .reverse()
            .map((m) => (
              <button
                key={m.id}
                type="button"
                className={`pay-card text-left ${m.id === activeMethodId ? "active" : ""}`}
                onClick={() => setActiveMethodId(m.id)}
                aria-pressed={m.id === activeMethodId}
              >
                <div className="card-header-custom relative z-10">
                  <small>{m.id === defaultMethodId ? "PRIMARY" : ""}</small>
                  <div className="card-logo">
                    <CardLogo brand={m.brand} />
                  </div>
                </div>
                <div className="card-body-custom relative z-10">
                  <div className="label">Cardholder</div>
                  <div className="value">{m.holder || "—"}</div>
                  <div className="card-row">
                    <div>
                      <div className="label">Number</div>
                      <div className="ma-card-num">**** **** **** {m.last4}</div>
                    </div>
                    <div>
                      <div className="label">Expiry Date</div>
                      <div className="ma-card-num">{formatExpiry(m.expMonth, m.expYear)}</div>
                    </div>
                  </div>
                </div>
              </button>
            ))}
        </div>
      ) : (
        <div className="dark-card ma-empty-cards mb-4">
          <div className="card-icon">
            <CreditCard className="w-5 h-5" />
          </div>
          <div>
            <div className="text-white">No saved cards</div>
            <div className="small-muted">
              {legacyCard?.last4
                ? `A legacy ${legacyCard.cardtype || "card"} ending in ${legacyCard.last4} is on file. Add a card to pay online.`
                : "Add a card to pay for orders online."}
            </div>
          </div>
        </div>
      )}
      {methods.length > 3 ? (
        <div className="ma-card-pills mb-2">
          {methods.map((m) => (
            <button key={m.id} type="button" className={`recovery-btn ${m.id === activeMethodId ? "active" : ""}`} onClick={() => setActiveMethodId(m.id)}>
              •••• {m.last4}
            </button>
          ))}
        </div>
      ) : null}

      <div className="ma-payment-actions flex flex-wrap gap-2">
        <button type="button" className="btn-dark-custom" disabled={Boolean(cardBusy)} onClick={() => void handleAddCard()}>
          {cardBusy === "checkout" ? "OPENING…" : "NEW CARD"}
        </button>
        {activeMethod && activeMethod.id !== defaultMethodId ? (
          <button type="button" className="btn-dark-custom" disabled={Boolean(cardBusy)} onClick={() => void handleSetDefaultCard()}>
            {cardBusy === "default" ? "SAVING…" : "SET DEFAULT"}
          </button>
        ) : null}
        {activeMethod ? (
          <button type="button" className="btn-dark-custom" disabled={Boolean(cardBusy)} onClick={() => void handleDeleteCard()}>
            {cardBusy === "delete" ? "REMOVING…" : "DELETE"}
          </button>
        ) : null}
      </div>
      <NoticeLine notice={cardNotice} />

      {SHOW_BILLING_ADDRESS_UI ? <div className="mt-10">
        <div className="address-title mb-3">Your Addresses</div>
        <hr className="ma-hr" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button type="button" className="address-card add-address ma-add-address" onClick={() => openAddressModal()}>
            <Plus className="w-9 h-9 mb-1" />
            <span className="ma-add-address-label">Add Address</span>
          </button>
          {sortedAddresses.map((a) => {
            const isDefault = a.id === defaultAddressId;
            const line2 = [a.city, [a.province, a.postal].filter(Boolean).join(" ")].filter(Boolean).join(", ");
            const busy = addressBusyId === a.id;
            return (
              <div key={a.id} className={`address-card ${isDefault ? "default-card" : ""}`}>
                {isDefault ? <div className="default-strip">DEFAULT</div> : null}
                {a.label ? <div className="ma-address-label">{a.label}</div> : null}
                <div className="name">{a.name || "—"}</div>
                <div className="text-white text-sm">
                  {a.street || a.unit ? (
                    <>
                      {[a.unit, a.street].filter(Boolean).join(" - ")}
                      <br />
                    </>
                  ) : null}
                  {line2 ? (
                    <>
                      {line2}
                      <br />
                    </>
                  ) : null}
                  {a.country || (!a.street && !line2 ? a.address : "")}
                </div>
                {a.phone ? <div className="mt-2 text-sm text-white">Phone: {a.phone}</div> : null}
                <div className="text-sm text-white">Notes: {a.notes || "N/A"}</div>
                <div className="address-actions mt-3">
                  {busy ? (
                    <Loader2 className="w-4 h-4 animate-spin text-[#B082F2]" />
                  ) : (
                    <>
                      <button type="button" onClick={() => openAddressModal(a)}>Edit</button>
                      <button type="button" onClick={() => void handleDeleteAddress(a)}>Remove</button>
                      {!isDefault ? (
                        <button type="button" onClick={() => void handleSetDefaultAddress(a)}>Set as Default</button>
                      ) : null}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <NoticeLine notice={addressNotice} />
      </div> : null}

      {SHOW_BILLING_CONTACT_UI ? <div className="dark-card max-w-xl mt-10">
        <h5 className="text-white mb-1">Billing Contact</h5>
        <div className="card-sub mb-4">Invoices and receipts are sent to this email.</div>
        <label className="form-label" htmlFor="ma-billing-email">Billing Email</label>
        <input
          id="ma-billing-email"
          type="email"
          className="form-control custom-input w-full mb-4"
          value={billingEmail}
          onChange={(e) => setBillingEmail(e.target.value)}
        />
        {SHOW_BILLING_ADDRESS_UI && billingAddressText ? (
          <>
            <div className="info-label">Billing Address on File</div>
            <div className="info-value">{billingAddressText}</div>
          </>
        ) : null}
        <button type="button" className="btn-purple" disabled={emailSaving} onClick={() => void handleSaveEmail()}>
          {emailSaving ? "Saving…" : "Save Billing Email"}
        </button>
        <NoticeLine notice={emailNotice} />
      </div> : null}

      {SHOW_BILLING_ADDRESS_UI ? <Dialog open={modalOpen} onOpenChange={(open) => !formSaving && setModalOpen(open)}>
        <DialogContent className="ma-dialog ma-dialog--center bg-[#1d1e20] border-[#303134] text-white sm:rounded-[32px] data-[state=open]:slide-in-from-left-0 data-[state=open]:slide-in-from-top-0 data-[state=closed]:slide-out-to-left-0 data-[state=closed]:slide-out-to-top-0">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit Address" : "Add Address"}</DialogTitle>
            <DialogDescription className="small-muted">Used for billing and delivery on your orders.</DialogDescription>
          </DialogHeader>
          <form
            className="ma-address-form"
            onSubmit={(e) => {
              e.preventDefault();
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
                  className="form-control custom-input w-full"
                  value={String(form[key] ?? "")}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                />
              </label>
            ))}
            <label className="ma-field-check col-span-2">
              <input type="checkbox" checked={form.is_default} onChange={(e) => setForm((f) => ({ ...f, is_default: e.target.checked }))} />
              <span>Set as default address</span>
            </label>
            {formError ? <p className="ma-notice ma-notice--error col-span-2">{formError}</p> : null}
            <div className="col-span-2 flex justify-end gap-2 mt-2">
              <button type="button" className="btn-outline-custom" disabled={formSaving} onClick={() => setModalOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="btn-purple" disabled={formSaving}>
                {formSaving ? "Saving…" : "Save Address"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog> : null}
    </div>
  );
}

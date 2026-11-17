import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  CreditCard,
  Eye,
  EyeOff,
  Facebook,
  FileText,
  Globe,
  Instagram,
  Linkedin,
  Lock,
  Palette,
  Truck,
  Twitter,
  User,
} from "lucide-react";
import { useLocation } from "wouter";
import { changePortalPassword, getPortalProfile, savePortalPreferences, savePortalProfile } from "@/lib/api";
import PortalFooter from "@/components/portal/PortalFooter";
import AccountStatement from "@/pages/profile/account-statement";
import BrandingSection from "@/pages/profile/sections/BrandingSection";
import BillingSection from "@/pages/profile/sections/BillingSection";
import ShippingSection from "@/pages/profile/sections/ShippingSection";
import { NoticeLine, SectionError, SectionLoading } from "@/pages/profile/sections/shared";
import { apiMessage, asString, errorText, parseJsonObject, readAddresses, type Notice } from "@/pages/profile/sections/helpers";
import "@/pages/profile/my-account-v2.css";

type ProfilePayload = {
  contact?: {
    primary?: { name?: string; email?: string; phone?: string; username?: string };
    administrator?: { adminemail?: string; adminphone?: string; adminname?: string; team?: string };
    web_social?: { domain?: string; twitter?: string; instagram?: string; facebook?: string; linkedin?: string };
    company?: { name?: string; phone?: string; address?: string };
    brokerage?: { name?: string; phone?: string; address?: string };
    preferences?: { spam?: string };
  };
  shipping?: {
    shipping?: string;
    unit?: string;
    street?: string;
    city?: string;
    province?: string;
    postal?: string;
    shipnotes?: string;
    farmroutes?: string;
    home_address?: string;
  };
  billing?: {
    billingemail?: string;
    billingaddress?: string;
    cardpoint?: { last4?: string; cardtype?: string; expiry_month?: string; expiry_year?: string };
  };
  login_security?: {
    recovery_email?: string;
    recovery_phone?: string;
    security_email_new_login?: number;
    security_sms_suspicious?: number;
  };
  summary?: { customer_since?: string };
  agent?: Record<string, unknown>;
};

const SHIPPING_LABELS: Record<string, string> = {
  agency: "Office delivery",
  home: "Home delivery",
  pickup: "Pickup",
  "pickup-outside": "Pickup (outside)",
  listing: "Listing",
};

type TabId = "profile" | "shipping" | "branding" | "preferences" | "media" | "statement" | "security" | "billing";

const TABS: Array<{ id: TabId; label: string; icon: typeof User }> = [
  { id: "profile", label: "Profile", icon: User },
  { id: "branding", label: "Branding", icon: Palette },
  { id: "shipping", label: "Shipping addresses", icon: Truck },
  { id: "security", label: "Login & Security", icon: Lock },
  { id: "billing", label: "Billing", icon: CreditCard },
  { id: "statement", label: "Account Statement", icon: FileText },
];

const TAB_ALIASES: Record<string, TabId> = { reports: "statement", "default-service-package": "profile" };

function tabFromUrl(pathname: string, search: string): TabId {
  const params = new URLSearchParams(search);
  const raw = params.get("tab") || params.get("section") || "";
  const q = (TAB_ALIASES[raw] || raw) as TabId;
  if (TABS.some((t) => t.id === q)) return q;
  if (pathname.includes("media-preferences")) return "profile";
  if (pathname.includes("preferences")) return "profile";
  if (pathname.includes("account-statement")) return "statement";
  return "profile";
}

type ProfileForm = {
  name: string;
  email: string;
  adminemail: string;
  phone: string;
  adminphone: string;
  instagram: string;
  facebook: string;
  twitter: string;
  linkedin: string;
  url: string;
  spam: "yes" | "no";
  sms: "yes" | "no";
};

type EditBlock = "contact" | "phone" | "social";

const BLOCK_KEYS: Record<EditBlock, Array<keyof ProfileForm>> = {
  contact: ["name", "email", "adminemail"],
  phone: ["phone", "adminphone"],
  social: ["instagram", "facebook", "twitter", "linkedin", "url"],
};

const EMPTY_FORM: ProfileForm = {
  name: "",
  email: "",
  adminemail: "",
  phone: "",
  adminphone: "",
  instagram: "",
  facebook: "",
  twitter: "",
  linkedin: "",
  url: "",
  spam: "yes",
  sms: "yes",
};

function isOff(value: unknown) {
  const v = asString(value).trim().toLowerCase();
  return v === "no" || v === "0" || v === "false";
}

function formFromPayload(payload: ProfilePayload): ProfileForm {
  const agent = payload.agent || {};
  const social = payload.contact?.web_social || {};
  return {
    name: payload.contact?.primary?.name || asString(agent.name),
    email: payload.contact?.primary?.email || asString(agent.email),
    adminemail: payload.contact?.administrator?.adminemail || asString(agent.adminemail),
    phone: payload.contact?.primary?.phone || asString(agent.phone),
    adminphone: payload.contact?.administrator?.adminphone || asString(agent.adminphone),
    instagram: social.instagram || asString(agent.instagram),
    facebook: social.facebook || asString(agent.facebook),
    twitter: social.twitter || asString(agent.twitter),
    linkedin: social.linkedin || asString(agent.linkedin),
    url: social.domain || asString(agent.url),
    spam: isOff(payload.contact?.preferences?.spam ?? agent.spam) ? "no" : "yes",
    sms: isOff(agent.sms) ? "no" : "yes",
  };
}

function socialHref(kind: "instagram" | "facebook" | "twitter" | "linkedin" | "url", value: string) {
  const v = value.trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v;
  if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(v)) return `https://${v}`;
  const handle = v.replace(/^@/, "");
  switch (kind) {
    case "instagram":
      return `https://instagram.com/${handle}`;
    case "facebook":
      return `https://facebook.com/${handle}`;
    case "twitter":
      return `https://x.com/${handle}`;
    case "linkedin":
      return v.includes("linkedin.com") ? `https://${v}` : `https://linkedin.com/in/${handle}`;
    default:
      return `https://${v}`;
  }
}

function socialLabel(kind: "instagram" | "facebook" | "twitter" | "linkedin" | "url", value: string) {
  const v = value.trim();
  if (kind === "url" || /^https?:\/\//i.test(v) || v.includes("/")) {
    return v.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "");
  }
  return `@${v.replace(/^@/, "")}`;
}

const SOCIAL_FIELDS: Array<{ key: "instagram" | "facebook" | "twitter" | "linkedin" | "url"; label: string; icon: typeof Globe }> = [
  { key: "instagram", label: "Instagram", icon: Instagram },
  { key: "facebook", label: "Facebook", icon: Facebook },
  { key: "twitter", label: "X / Twitter", icon: Twitter },
  { key: "linkedin", label: "LinkedIn", icon: Linkedin },
  { key: "url", label: "Website", icon: Globe },
];

export default function Profile({ defaultTab }: { defaultTab?: TabId }) {
  const [location, setLocation] = useLocation();
  const [tab, setTab] = useState<TabId>(defaultTab || tabFromUrl(window.location.pathname, window.location.search));
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [data, setData] = useState<ProfilePayload | null>(null);
  const [form, setForm] = useState<ProfileForm>(EMPTY_FORM);
  const [draft, setDraft] = useState<ProfileForm>(EMPTY_FORM);
  const [editing, setEditing] = useState<EditBlock | null>(null);
  const [savingBlock, setSavingBlock] = useState<EditBlock | "spam" | "sms" | null>(null);
  const [profileNotice, setProfileNotice] = useState<{ block: EditBlock | "comms"; notice: Notice } | null>(null);

  const [saving, setSaving] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoveryPhone, setRecoveryPhone] = useState("");
  const [editingRecovery, setEditingRecovery] = useState<"email" | "phone" | null>(null);
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [smsAlerts, setSmsAlerts] = useState(true);
  const [passwordNotice, setPasswordNotice] = useState<Notice>(null);
  const [securityNotice, setSecurityNotice] = useState<Notice>(null);

  useEffect(() => {
    setTab(defaultTab || tabFromUrl(location, window.location.search));
  }, [location, defaultTab]);

  const applyProfilePayload = (payload: ProfilePayload) => {
    setData(payload);
    const agent = payload.agent || {};
    const security = payload.login_security || {};
    const next = formFromPayload(payload);
    setForm(next);
    setDraft(next);
    setRecoveryEmail(asString(security.recovery_email ?? agent.recovery_email) || payload.contact?.primary?.email || "");
    setRecoveryPhone(asString(security.recovery_phone ?? agent.recovery_phone) || payload.contact?.primary?.phone || "");
    setEmailAlerts(!isOff(security.security_email_new_login ?? agent.security_email_new_login ?? 1));
    setSmsAlerts(!isOff(security.security_sms_suspicious ?? agent.security_sms_suspicious ?? 1));
  };

  const loadProfile = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await getPortalProfile();
      if (res.status && res.data) applyProfilePayload(res.data as ProfilePayload);
      else setLoadError(apiMessage(res, "Unable to load your account."));
    } catch (error) {
      setLoadError(errorText(error, "Unable to load your account."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadProfile();
  }, []);

  const selectTab = (id: TabId) => {
    const next =
      id === "preferences" || id === "media"
        ? "profile"
        : id;
    setTab(next);
    const path =
      next === "statement"
        ? "/account-statement"
        : `/profile?tab=${next}`;
    setLocation(path);
  };

  /** profile/save takes the agent column names from profile/details as-is. */
  const saveFields = async (fields: Record<string, unknown>) => {
    const res = await savePortalProfile(fields);
    if (res.status && res.data && typeof res.data === "object" && "contact" in (res.data as object)) {
      applyProfilePayload(res.data as ProfilePayload);
    }
    return res;
  };

  const startEdit = (block: EditBlock) => {
    setDraft(form);
    setEditing(block);
    setProfileNotice(null);
  };

  const saveBlock = async (block: EditBlock) => {
    const fields: Record<string, unknown> = {};
    for (const key of BLOCK_KEYS[block]) fields[key] = String(draft[key]).trim();
    if (block === "contact" && !String(fields.email)) {
      setProfileNotice({ block, notice: { kind: "error", text: "Primary email is required." } });
      return;
    }
    setSavingBlock(block);
    setProfileNotice(null);
    try {
      const res = await saveFields(fields);
      if (!res.status) {
        setProfileNotice({ block, notice: { kind: "error", text: apiMessage(res, "Unable to save changes.") } });
        return;
      }
      setForm((prev) => ({ ...prev, ...(fields as Partial<ProfileForm>) }));
      setEditing(null);
      setProfileNotice({ block, notice: { kind: "success", text: apiMessage(res, "Profile saved") } });
    } catch (err) {
      setProfileNotice({ block, notice: { kind: "error", text: errorText(err, "Unable to save changes.") } });
    } finally {
      setSavingBlock(null);
    }
  };

  const saveCommsPref = async (key: "spam" | "sms", value: "yes" | "no") => {
    const previous = form[key];
    setForm((prev) => ({ ...prev, [key]: value }));
    setSavingBlock(key);
    setProfileNotice(null);
    try {
      const res = await saveFields(key === "spam" ? { spam: value } : { sms: value === "yes" ? 1 : 0 });
      if (!res.status) {
        setForm((prev) => ({ ...prev, [key]: previous }));
        setProfileNotice({ block: "comms", notice: { kind: "error", text: apiMessage(res, "Unable to update preference.") } });
        return;
      }
      setProfileNotice({ block: "comms", notice: { kind: "success", text: apiMessage(res, "Preference updated") } });
    } catch (err) {
      setForm((prev) => ({ ...prev, [key]: previous }));
      setProfileNotice({ block: "comms", notice: { kind: "error", text: errorText(err, "Unable to update preference.") } });
    } finally {
      setSavingBlock(null);
    }
  };

  const handleUpdatePassword = async () => {
    setPasswordNotice(null);
    if (!currentPassword || !newPassword) {
      setPasswordNotice({ kind: "error", text: "Enter your current and new password." });
      return;
    }
    if (newPassword.length < 8) {
      setPasswordNotice({ kind: "error", text: "New password must be at least 8 characters." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordNotice({ kind: "error", text: "New passwords do not match." });
      return;
    }
    try {
      setSaving(true);
      const res = await changePortalPassword(currentPassword, newPassword);
      if (res.status) {
        setPasswordNotice({ kind: "success", text: apiMessage(res, "Password updated") });
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        setPasswordNotice({ kind: "error", text: apiMessage(res, "Current password not matched") });
      }
    } catch (error) {
      setPasswordNotice({ kind: "error", text: errorText(error, "Unable to update password") });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveRecovery = async () => {
    const fields = {
      recovery_email: recoveryEmail,
      recovery_phone: recoveryPhone,
      security_email_new_login: emailAlerts ? 1 : 0,
      security_sms_suspicious: smsAlerts ? 1 : 0,
    };
    try {
      setSaving(true);
      setSecurityNotice(null);
      const res = await saveFields(fields);
      if (res.status) {
        setEditingRecovery(null);
        setSecurityNotice({ kind: "success", text: "Security settings saved" });
        return;
      }
      const pref = await savePortalPreferences(fields);
      if (pref.status) {
        setEditingRecovery(null);
        setSecurityNotice({ kind: "success", text: "Security settings saved" });
      } else {
        setSecurityNotice({ kind: "error", text: res.msg || pref.msg || "Unable to save security settings" });
      }
    } catch (error) {
      setSecurityNotice({ kind: "error", text: errorText(error, "Unable to save security settings") });
    } finally {
      setSaving(false);
    }
  };

  const agent = data?.agent || {};
  const realtorId = data?.contact?.primary?.username || asString(agent.username) || "—";
  const since = data?.summary?.customer_since || "—";
  const brokerage = data?.contact?.company?.name ? data.contact.company : data?.contact?.brokerage;
  const passwordStrength = newPassword.length >= 10 ? 90 : newPassword.length >= 8 ? 70 : newPassword.length * 8;
  const shippingMethod = data?.shipping?.shipping || "";
  const shippingAddress = useMemo(() => {
    const s = data?.shipping || {};
    const street = [s.unit, s.street].filter(Boolean).join(" - ");
    const parts = [street, s.city, [s.province, s.postal].filter(Boolean).join(" ")].filter(Boolean);
    if (parts.length) return parts.join(", ");
    if (s.home_address) return s.home_address;
    if (shippingMethod === "agency") return data?.contact?.company?.address || "";
    return "";
  }, [data, shippingMethod]);

  const settingsBlob = useMemo(() => parseJsonObject(agent.settings_preferences), [agent.settings_preferences]);
  const billingAddresses = useMemo(() => {
    const fromSettings = readAddresses(settingsBlob.billing_addresses);
    if (fromSettings.length) return fromSettings;
    return readAddresses(settingsBlob.addresses);
  }, [settingsBlob]);
  const cardpoint = data?.billing?.cardpoint;

  const needsProfile = tab === "profile" || tab === "shipping" || tab === "security" || tab === "billing";

  const editLink = (block: EditBlock) =>
    editing === block ? (
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-purple ma-btn-sm" disabled={savingBlock === block} onClick={() => void saveBlock(block)}>
          {savingBlock === block ? "Saving…" : "Save"}
        </button>
        <button type="button" className="btn-outline-custom ma-btn-sm" disabled={savingBlock === block} onClick={() => setEditing(null)}>
          Cancel
        </button>
      </div>
    ) : (
      <button type="button" className="edit-link" disabled={Boolean(editing)} onClick={() => startEdit(block)}>
        EDIT
      </button>
    );

  const blockNotice = (block: EditBlock | "comms") => (profileNotice?.block === block ? <NoticeLine notice={profileNotice.notice} /> : null);

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="service-package my-account-v2">
        <div className="container mx-auto px-4">
          <div className="flex flex-col lg:flex-row">
            <nav className="account-sidebar p-3" aria-label="My account">
              <ul className="flex lg:flex-col gap-2 overflow-x-auto">
                {TABS.map((item) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        className={`nav-link w-full text-left whitespace-nowrap ${tab === item.id ? "active" : ""}`}
                        aria-current={tab === item.id ? "page" : undefined}
                        onClick={() => selectTab(item.id)}
                      >
                        <Icon className="inline w-4 h-4 me-2" /> {item.label}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </nav>

            <div className={`account-content ${tab === "statement" ? "account-content--statement" : ""}`}>
              {needsProfile && loading ? <SectionLoading label="Loading your account…" /> : null}
              {needsProfile && !loading && loadError ? <SectionError text={loadError} onRetry={() => void loadProfile()} /> : null}

              {tab === "profile" && data && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                  <div className="lg:col-span-7">
                    <h2 className="mb-4">Profile</h2>

                    <section className="ma-block">
                      <div className="mb-3">
                        <div className="email-label">Name</div>
                        {editing === "contact" ? (
                          <input className="form-control mt-1" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                        ) : (
                          <div className="email-value">{form.name || "—"}</div>
                        )}
                      </div>
                      <div className="mb-3">
                        <div className="email-label">Primary Email</div>
                        {editing === "contact" ? (
                          <input type="email" className="form-control mt-1" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
                        ) : (
                          <div className="email-value">{form.email || "—"}</div>
                        )}
                      </div>
                      <div className="mb-4">
                        <div className="email-label">Optional</div>
                        {editing === "contact" ? (
                          <label className="block">
                            <span className="small-muted">Admin email</span>
                            <input type="email" className="form-control mt-1" value={draft.adminemail} onChange={(e) => setDraft({ ...draft, adminemail: e.target.value })} />
                          </label>
                        ) : (
                          <div className="email-value">
                            Admin &nbsp;&nbsp;&nbsp; <span>{form.adminemail || "—"}</span>
                          </div>
                        )}
                      </div>
                      <div className="text-end">{editLink("contact")}</div>
                      {blockNotice("contact")}
                      <hr className="ma-hr" />
                    </section>

                    <section className="ma-block">
                      <h6 className="text-white mb-3">Phone</h6>
                      <div className="mb-2 flex justify-between items-center gap-4">
                        <div className="flex-1">
                          {editing === "phone" ? (
                            <input type="tel" className="form-control" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
                          ) : (
                            <div className="phone-number">{form.phone || "—"}</div>
                          )}
                        </div>
                        <div className="label">As Advertised</div>
                      </div>
                      <div className="mb-4 flex justify-between items-center gap-4">
                        <div className="flex-1">
                          {editing === "phone" ? (
                            <input type="tel" className="form-control" value={draft.adminphone} onChange={(e) => setDraft({ ...draft, adminphone: e.target.value })} />
                          ) : (
                            <div className="phone-number">{form.adminphone || "—"}</div>
                          )}
                        </div>
                        <div className="label">Admin</div>
                      </div>
                      <div className="text-end">{editLink("phone")}</div>
                      {blockNotice("phone")}
                      <hr className="ma-hr" />
                    </section>

                    <section className="ma-block mb-4">
                      <h6 className="text-white mb-3">Social Links</h6>
                      {editing === "social" ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                          {SOCIAL_FIELDS.map(({ key, label }) => (
                            <label key={key} className="block">
                              <span className="small-muted">{label}</span>
                              <input
                                className="form-control mt-1"
                                placeholder={key === "url" ? "www.example.com" : "@handle"}
                                value={draft[key]}
                                onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                              />
                            </label>
                          ))}
                        </div>
                      ) : SOCIAL_FIELDS.some(({ key }) => form[key]) ? (
                        <ul className="ma-social-list">
                          {SOCIAL_FIELDS.filter(({ key }) => form[key]).map(({ key, label, icon: Icon }) => (
                            <li key={key}>
                              <a href={socialHref(key, form[key])} target="_blank" rel="noopener noreferrer" aria-label={label}>
                                <Icon className="w-5 h-5" />
                                <span>{socialLabel(key, form[key])}</span>
                              </a>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="small-muted mb-2">No social links added.</p>
                      )}
                      <div className="text-end">{editLink("social")}</div>
                      {blockNotice("social")}
                    </section>
                    <hr className="ma-hr" />

                    <section className="ma-block">
                      <h6 className="text-white mb-3">Receive Email Promotions</h6>
                      <div className="ma-radio-row" role="radiogroup" aria-label="Receive email promotions">
                        {(["yes", "no"] as const).map((v) => (
                          <label key={v} className="ma-radio">
                            <input
                              type="radio"
                              name="ma-spam"
                              checked={form.spam === v}
                              disabled={savingBlock === "spam"}
                              onChange={() => void saveCommsPref("spam", v)}
                            />
                            <span>{v === "yes" ? "Yes" : "No"}</span>
                          </label>
                        ))}
                      </div>
                    </section>
                    {/* SMS communication preference hidden for V1; state and save logic retained. */}
                    {false && <>
                    <hr className="ma-hr" />
                    <section className="ma-block">
                      <h6 className="text-white mb-3">Receive SMS communication</h6>
                      <div className="ma-radio-row" role="radiogroup" aria-label="Receive SMS communication">
                        {(["yes", "no"] as const).map((v) => (
                          <label key={v} className="ma-radio">
                            <input
                              type="radio"
                              name="ma-sms"
                              checked={form.sms === v}
                              disabled={savingBlock === "sms"}
                              onChange={() => void saveCommsPref("sms", v)}
                            />
                            <span>{v === "yes" ? "Yes" : "No"}</span>
                          </label>
                        ))}
                      </div>
                      {blockNotice("comms")}
                    </section>
                    </>}
                  </div>

                  <div className="lg:col-span-5">
                    <div className="info-card">
                      <div className="verified">VERIFIED</div>
                      <div className="info-label">Realtor ID</div>
                      <div className="info-value">{realtorId}</div>
                      <div className="info-label">Name</div>
                      <div className="info-value">{form.name || "—"}</div>
                      <div className="info-label">Team Name</div>
                      <div className="info-value">{data.contact?.administrator?.team || "—"}</div>
                      <div className="info-label">Brokerage</div>
                      <div className="info-value">
                        {brokerage?.name || "—"}
                        {brokerage?.address ? (
                          <>
                            <br />
                            {brokerage.address}
                          </>
                        ) : null}
                        {brokerage?.phone ? (
                          <>
                            <br />
                            {brokerage.phone}
                          </>
                        ) : null}
                      </div>
                      <div className="info-label">Customer Since</div>
                      <div className="info-value mb-0">{since}</div>
                    </div>
                  </div>
                </div>
              )}

              {tab === "shipping" && data && (
                <ShippingSection
                  initialAddresses={billingAddresses}
                  initialDefaultAddressId={asString(settingsBlob.default_billing_address_id) || billingAddresses.find((address) => address.is_default)?.id || ""}
                  defaultName={form.name}
                  defaultPhone={form.phone}
                />
              )}

              {tab === "branding" && <BrandingSection />}

              {tab === "statement" && <AccountStatement />}

              {tab === "security" && data && (
                <div>
                  <h2>Login & Security</h2>
                  <p className="service-package-desc mb-6">Manage your account security and keep your data safe.</p>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div>
                      <div className="dark-card mb-4">
                        <div className="flex gap-3 items-start mb-4">
                          <div className="card-icon">
                            <Lock className="w-5 h-5" />
                          </div>
                          <div>
                            <h5 className="mb-1 text-white">Change Password</h5>
                            <div className="card-sub">Update your password regularly to keep your account secure.</div>
                          </div>
                        </div>
                        <div className="mb-3">
                          <label className="form-label" htmlFor="ma-current-pass">Current Password</label>
                          <div className="relative">
                            <input
                              id="ma-current-pass"
                              type={showPass ? "text" : "password"}
                              autoComplete="current-password"
                              className="form-control custom-input w-full"
                              value={currentPassword}
                              onChange={(e) => setCurrentPassword(e.target.value)}
                            />
                            <button type="button" className="eye-icon" aria-label={showPass ? "Hide passwords" : "Show passwords"} onClick={() => setShowPass((v) => !v)}>
                              {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>
                        <div className="mb-3">
                          <label className="form-label" htmlFor="ma-new-pass">New Password</label>
                          <input
                            id="ma-new-pass"
                            type={showPass ? "text" : "password"}
                            autoComplete="new-password"
                            className="form-control custom-input w-full"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                          />
                        </div>
                        <div className="flex justify-between items-center mb-2">
                          <div className="progress flex-grow me-3 h-2 bg-white/10 rounded">
                            <div
                              className="h-2 rounded"
                              style={{ width: `${Math.min(passwordStrength, 100)}%`, background: passwordStrength >= 70 ? "#57ff57" : "#c892ff" }}
                            />
                          </div>
                          <span style={{ color: passwordStrength >= 70 ? "#57ff57" : "#8d8d95", fontSize: 13 }}>
                            {newPassword ? (passwordStrength >= 70 ? "Strong" : "Weak") : ""}
                          </span>
                        </div>
                        <div className="small-muted mb-4">Use at least 8 characters with a mix of letters, numbers & symbols.</div>
                        <div className="mb-4">
                          <label className="form-label" htmlFor="ma-confirm-pass">Confirm New Password</label>
                          <input
                            id="ma-confirm-pass"
                            type={showPass ? "text" : "password"}
                            autoComplete="new-password"
                            className="form-control custom-input w-full"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                          />
                        </div>
                        <button type="button" className="btn-purple" disabled={saving} onClick={() => void handleUpdatePassword()}>
                          Update Password
                        </button>
                        <NoticeLine notice={passwordNotice} />
                      </div>
                    </div>
                    <div>
                      <div className="dark-card mb-4">
                        <div className="flex gap-3 items-start mb-4">
                          <div className="card-icon">
                            <User className="w-5 h-5" />
                          </div>
                          <div>
                            <h5 className="mb-1 text-white">Account Recovery</h5>
                            <div className="card-sub">Keep your recovery information up to date.</div>
                          </div>
                        </div>
                        <div className="recovery-row mb-4">
                          <div className="recovery-info">
                            <div className="text-white recovery-title">Recovery Email</div>
                            {editingRecovery === "email" ? (
                              <input className="form-control custom-input mt-2 w-full" value={recoveryEmail} onChange={(e) => setRecoveryEmail(e.target.value)} />
                            ) : (
                              <div className="small-muted">{recoveryEmail || "—"}</div>
                            )}
                          </div>
                          <button type="button" className="recovery-btn" onClick={() => setEditingRecovery(editingRecovery === "email" ? null : "email")}>
                            {editingRecovery === "email" ? "Done" : "Edit"}
                          </button>
                        </div>
                        <div className="recovery-row mb-4">
                          <div className="recovery-info">
                            <div className="text-white recovery-title">Recovery Phone</div>
                            {editingRecovery === "phone" ? (
                              <input className="form-control custom-input mt-2 w-full" value={recoveryPhone} onChange={(e) => setRecoveryPhone(e.target.value)} />
                            ) : (
                              <div className="small-muted">{recoveryPhone || "—"}</div>
                            )}
                          </div>
                          <button type="button" className="recovery-btn" onClick={() => setEditingRecovery(editingRecovery === "phone" ? null : "phone")}>
                            {editingRecovery === "phone" ? "Done" : "Edit"}
                          </button>
                        </div>
                        <button type="button" className="btn-purple" disabled={saving} onClick={() => void handleSaveRecovery()}>
                          Save Recovery
                        </button>
                      </div>
                      <div className="dark-card">
                        <div className="flex gap-3 items-start mb-4">
                          <div className="card-icon">
                            <Bell className="w-5 h-5" />
                          </div>
                          <div>
                            <h5 className="mb-1 text-white">Security Notifications</h5>
                            <div className="card-sub">Choose how you want to be notified about account activity.</div>
                          </div>
                        </div>
                        <label className="alert-box mb-3 flex justify-between items-center gap-4 cursor-pointer">
                          <div>
                            <div className="text-white">Email alerts for new logins</div>
                            <div className="small-muted">Get notified when a new device logs into your account.</div>
                          </div>
                          <input type="checkbox" role="switch" className="ma-switch" checked={emailAlerts} onChange={(e) => setEmailAlerts(e.target.checked)} />
                        </label>
                        <label className="alert-box mb-4 flex justify-between items-center gap-4 cursor-pointer">
                          <div>
                            <div className="text-white">SMS alerts for suspicious activity</div>
                            <div className="small-muted">Get notified about suspicious logins or security events.</div>
                          </div>
                          <input type="checkbox" role="switch" className="ma-switch" checked={smsAlerts} onChange={(e) => setSmsAlerts(e.target.checked)} />
                        </label>
                        <button type="button" className="btn-purple" disabled={saving} onClick={() => void handleSaveRecovery()}>
                          Save Notifications
                        </button>
                        <NoticeLine notice={securityNotice} />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {tab === "billing" && data && (
                <BillingSection
                  initialAddresses={billingAddresses}
                  initialDefaultAddressId={asString(settingsBlob.default_billing_address_id) || billingAddresses.find((a) => a.is_default)?.id || ""}
                  initialBillingEmail={data.billing?.billingemail || form.email}
                  billingAddressText={data.billing?.billingaddress || ""}
                  defaultName={form.name}
                  defaultPhone={form.phone}
                  legacyCard={
                    cardpoint?.last4
                      ? {
                          cardtype: cardpoint.cardtype || "",
                          last4: cardpoint.last4,
                          expiry_month: cardpoint.expiry_month || "",
                          expiry_year: cardpoint.expiry_year || "",
                        }
                      : null
                  }
                />
              )}
            </div>
          </div>
        </div>
      </div>
      <PortalFooter />
    </div>
  );
}

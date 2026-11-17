import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import { callAzureOpenAI, type ChatMessage } from "@/lib/chat-service";
import type { FeatureSheetFormState, FeatureSheetImages } from "./render-panels";

type Props = {
  form: FeatureSheetFormState;
  setForm: Dispatch<SetStateAction<FeatureSheetFormState>>;
  /** Extra gallery URLs (listing photos) for “P1 replace by 2” style commands. */
  galleryPhotos?: string[];
  onGoPhotosTab?: () => void;
};

function cloneForm(f: FeatureSheetFormState): FeatureSheetFormState {
  return JSON.parse(JSON.stringify(f)) as FeatureSheetFormState;
}

/** Builder slot map: P1 hero, P2 il1, P3–P5 lb, P6 rh, P7–P15 rg. */
function getSlotUrl(images: FeatureSheetImages, p: number): string | null {
  if (p === 1) return images.hero;
  if (p === 2) return images.il1;
  if (p >= 3 && p <= 5) return images.lb[p - 2] ?? null;
  if (p === 6) return images.rh;
  if (p >= 7 && p <= 15) return images.rg[p - 6] ?? null;
  return null;
}

function setSlotUrl(images: FeatureSheetImages, p: number, url: string | null): FeatureSheetImages {
  const next = { ...images, lb: { ...images.lb }, rg: { ...images.rg } };
  if (p === 1) next.hero = url;
  else if (p === 2) next.il1 = url;
  else if (p >= 3 && p <= 5) {
    if (url) next.lb[p - 2] = url;
    else delete next.lb[p - 2];
  } else if (p === 6) next.rh = url;
  else if (p >= 7 && p <= 15) {
    if (url) next.rg[p - 6] = url;
    else delete next.rg[p - 6];
  }
  return next;
}

function swapSlots(images: FeatureSheetImages, a: number, b: number): FeatureSheetImages {
  const ua = getSlotUrl(images, a);
  const ub = getSlotUrl(images, b);
  let next = setSlotUrl(images, a, ub);
  next = setSlotUrl(next, b, ua);
  return next;
}

function clearSlots(images: FeatureSheetImages, slots: number[]): FeatureSheetImages {
  let next = images;
  for (const p of slots) next = setSlotUrl(next, p, null);
  return next;
}

function keepOnlySlots(images: FeatureSheetImages, keep: Set<number>): FeatureSheetImages {
  let next = images;
  for (let p = 1; p <= 15; p++) {
    if (!keep.has(p)) next = setSlotUrl(next, p, null);
  }
  return next;
}

function buildGallery(form: FeatureSheetFormState, extra: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (u: string | null | undefined) => {
    const t = u?.trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };
  extra.forEach(add);
  add(form.images.hero);
  add(form.images.il1);
  add(form.images.rh);
  add(form.images.agent);
  add(form.images.logo);
  Object.values(form.images.lb).forEach(add);
  Object.values(form.images.rg).forEach(add);
  return out;
}

function parseReplace(text: string): { targetP: number; sourceIndex: number } | null {
  const normalized = text.toLowerCase().trim();
  const patterns = [
    /replace\s+p(\d+)\s+(?:image\s+)?(?:with|by)\s*#?(\d+)/,
    /p(\d+)\s+replace\s+(?:by\s+)?#?(\d+)/,
    /p(\d+)\s+(?:with|by|to)\s*#?(\d+)/,
    /replace\s+p(\d+)\s+(\d+)/,
  ];
  for (const re of patterns) {
    const m = normalized.match(re);
    if (m) return { targetP: parseInt(m[1], 10), sourceIndex: parseInt(m[2], 10) };
  }
  return null;
}

function parseSwap(text: string): { a: number; b: number } | null {
  const m =
    text.match(/(?:switch|swap|transpose)\s+p?(\d+)\s+(?:with|and|to)\s+p?(\d+)/i) ||
    text.match(/p(\d+)\s+(?:with|and)\s+p(\d+)/i);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) return null;
  return { a, b };
}

function parseRemoveSlots(text: string): number[] | null {
  if (!/\b(remove|omit|clear|delete)\b/i.test(text)) return null;
  if (/\ball\s+but\b/i.test(text)) return null;
  const slots = [...text.matchAll(/\bp\s*(\d+)\b/gi)].map((m) => Number(m[1])).filter((n) => n >= 1 && n <= 15);
  return slots.length ? slots : null;
}

function parseKeepOnly(text: string): number[] | null {
  if (!/\b(remove|omit|clear)\s+all\s+but\b/i.test(text) && !/\ball\s+but\b/i.test(text)) return null;
  const slots = [...text.matchAll(/\bp\s*(\d+)\b/gi)].map((m) => Number(m[1])).filter((n) => n >= 1 && n <= 15);
  return slots.length ? slots : null;
}

const INTENT_SYSTEM =
  "You are an intent detection engine for a feature sheet builder. " +
  "Respond with ONLY minified JSON, no markdown.\n" +
  "Intents:\n" +
  '{ "intent":"replace_image","targetP":number,"sourceIndex":number }\n' +
  '{ "intent":"swap_layout_slots","slotA":number,"slotB":number }\n' +
  '{ "intent":"remove_layout_slots","slots":[number] }\n' +
  '{ "intent":"remove_layout_slots_except","keepSlots":[number] }\n' +
  '{ "intent":"update_fields","fields":{ "addr"?:string,"city"?:string,"price"?:string,"agentName"?:string,"agentPhone"?:string,"agentEmail"?:string,"agentWeb"?:string,"agentBroker"?:string,"beds"?:string,"baths"?:string,"sqft"?:string,"tax"?:string,"strata"?:string,"bgColor"?:string,"textColor"?:string,"headingColor"?:string,"accentColor"?:string,"primaryColor"?:string } }\n' +
  '{ "intent":"rewrite_listing_description","instruction":string }\n' +
  '{ "intent":"update_bedrooms","bedrooms":string }\n' +
  '{ "intent":"update_bathrooms","bathrooms":string }\n' +
  '{ "intent":"set_headshot_from_gallery","sourceIndex":number }\n' +
  '{ "intent":"remove_headshot" }\n' +
  '{ "intent":"undo_last_edit" }\n' +
  '{ "intent":"none" }\n' +
  "Slots: P1=exterior hero, P2=interior left large, P3-P5=bottom row, P6=right hero, P7-P15=grid. " +
  "Hindi/English/Chinese OK.";

async function rewriteDescription(current: string, instruction: string): Promise<string | null> {
  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "You edit real-estate listing remarks. Apply the instruction. Output ONLY the revised full remarks text — no quotes, no markdown.",
    },
    {
      role: "user",
      content:
        (current.trim() ? `Current remarks:\n\n${current}\n\n` : "No existing remarks.\n\n") +
        `Instruction:\n${instruction}`,
    },
  ];
  const out = await callAzureOpenAI(messages, 0.2, 2048);
  return out?.trim() || null;
}

export function BuilderChatPanel({ form, setForm, galleryPhotos = [], onGoPhotosTab }: Props) {
  const [chatInput, setChatInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: "Ask me to edit address, beds, photos, or remarks.",
    },
  ]);
  const undoStackRef = useRef<FeatureSheetFormState[]>([]);
  const [undoDepth, setUndoDepth] = useState(0);

  const pushUndo = () => {
    undoStackRef.current = [...undoStackRef.current, cloneForm(form)].slice(-25);
    setUndoDepth(undoStackRef.current.length);
  };

  const handleUndo = () => {
    const prev = undoStackRef.current.pop();
    setUndoDepth(undoStackRef.current.length);
    if (!prev) {
      setChatMessages((m) => [
        ...m,
        { role: "assistant", content: "Nothing to undo yet." },
      ]);
      return;
    }
    setForm(prev);
    setChatMessages((m) => [
      ...m,
      { role: "assistant", content: "Undone — sheet restored to before the last chat edit." },
    ]);
  };

  const applyFields = (fields: Record<string, string>) => {
    setForm((prev) => {
      const next = { ...prev };
      const map: Record<string, keyof FeatureSheetFormState> = {
        address: "addr",
        addr: "addr",
        city: "city",
        price: "price",
        agentName: "agentName",
        agentPhone: "agentPhone",
        agentEmail: "agentEmail",
        agentWebsite: "agentWeb",
        agentWeb: "agentWeb",
        brokerage: "agentBroker",
        agentBroker: "agentBroker",
        beds: "beds",
        bedrooms: "beds",
        baths: "baths",
        bathrooms: "baths",
        sqft: "sqft",
        tax: "tax",
        strata: "strata",
        bgColor: "bgColor",
        textColor: "textColor",
        headingColor: "headingColor",
        accentColor: "accentColor",
        primaryColor: "primaryColor",
      };
      for (const [k, v] of Object.entries(fields)) {
        if (typeof v !== "string" || !v.trim()) continue;
        const key = map[k] ?? (k as keyof FeatureSheetFormState);
        if (key in next && typeof next[key] === "string") {
          (next as Record<string, unknown>)[key] = v.trim();
        }
      }
      return next;
    });
  };

  const handleSend = async () => {
    const text = chatInput.trim();
    if (!text || busy) return;
    setChatInput("");
    setChatMessages((prev) => [...prev, { role: "user", content: text }]);

    if (/^(undo|revert|wapas)$/i.test(text.replace(/\s+/g, " ").trim()) || /^undo\s+last/i.test(text)) {
      handleUndo();
      return;
    }

    pushUndo();
    const gallery = buildGallery(form, galleryPhotos);

    const keep = parseKeepOnly(text);
    if (keep) {
      setForm((prev) => ({ ...prev, images: keepOnlySlots(prev.images, new Set(keep)) }));
      setChatMessages((m) => [
        ...m,
        { role: "assistant", content: `Cleared layout except ${keep.map((p) => `P${p}`).join(", ")}.` },
      ]);
      return;
    }

    const swap = parseSwap(text);
    if (swap) {
      setForm((prev) => ({ ...prev, images: swapSlots(prev.images, swap.a, swap.b) }));
      setChatMessages((m) => [
        ...m,
        { role: "assistant", content: `Swapped P${swap.a} and P${swap.b}.` },
      ]);
      return;
    }

    const remove = parseRemoveSlots(text);
    if (remove) {
      setForm((prev) => ({ ...prev, images: clearSlots(prev.images, remove) }));
      setChatMessages((m) => [
        ...m,
        { role: "assistant", content: `Cleared ${remove.map((p) => `P${p}`).join(", ")}.` },
      ]);
      return;
    }

    const replace = parseReplace(text);
    if (replace) {
      const url = gallery[replace.sourceIndex - 1];
      if (!url) {
        setChatMessages((m) => [
          ...m,
          {
            role: "assistant",
            content: `No gallery image #${replace.sourceIndex}. Open Photos to upload images, or use a number from the current sheet photos.`,
          },
        ]);
        onGoPhotosTab?.();
        return;
      }
      setForm((prev) => ({
        ...prev,
        images: setSlotUrl(prev.images, replace.targetP, url),
      }));
      setChatMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: `Replaced P${replace.targetP} with gallery image #${replace.sourceIndex}.`,
        },
      ]);
      return;
    }

    // Local beds/baths / address shortcuts
    const bedsM = text.match(/(?:bedrooms?|beds?)\s*(?:to|=|:)?\s*(\d+)/i);
    const bathsM = text.match(/(?:bathrooms?|baths?)\s*(?:to|=|:)?\s*([\d.]+)/i);
    if (bedsM || bathsM) {
      const parts: string[] = [];
      setForm((prev) => {
        const next = { ...prev };
        if (bedsM) {
          next.beds = bedsM[1];
          parts.push(`beds → ${bedsM[1]}`);
        }
        if (bathsM) {
          next.baths = bathsM[1];
          parts.push(`baths → ${bathsM[1]}`);
        }
        return next;
      });
      setChatMessages((m) => [...m, { role: "assistant", content: `Done. ${parts.join(" · ")}.` }]);
      return;
    }

    const addrAdd = text.match(/add\s+(.+?)\s+to\s+(?:this\s+)?address/i);
    if (addrAdd) {
      const bit = addrAdd[1].trim();
      setForm((prev) => ({
        ...prev,
        addr: prev.addr.includes(bit) ? prev.addr : `${prev.addr}${prev.addr ? " " : ""}${bit}`.trim(),
      }));
      setChatMessages((m) => [
        ...m,
        { role: "assistant", content: `Added “${bit}” to the address.` },
      ]);
      return;
    }

    if (/\b(description|remarks|descrption|decription)\b/i.test(text)) {
      setBusy(true);
      try {
        const revised = await rewriteDescription(form.desc, text);
        if (revised) {
          setForm((prev) => ({ ...prev, desc: revised }));
          setChatMessages((m) => [
            ...m,
            { role: "assistant", content: "Updated listing remarks / description." },
          ]);
        } else {
          setChatMessages((m) => [
            ...m,
            { role: "assistant", content: "Could not revise remarks. Try rephrasing." },
          ]);
        }
      } catch {
        setChatMessages((m) => [
          ...m,
          { role: "assistant", content: "Failed to update remarks." },
        ]);
      } finally {
        setBusy(false);
      }
      return;
    }

    setBusy(true);
    try {
      const reply = await callAzureOpenAI(
        [
          { role: "system", content: INTENT_SYSTEM },
          { role: "user", content: text },
        ],
        0,
        700,
      );
      if (!reply) {
        setChatMessages((m) => [
          ...m,
          { role: "assistant", content: "No response — try again." },
        ]);
        return;
      }

      let parsed: Record<string, unknown> | null = null;
      try {
        parsed = JSON.parse(reply) as Record<string, unknown>;
      } catch {
        setChatMessages((m) => [...m, { role: "assistant", content: reply }]);
        return;
      }

      const intent = parsed.intent as string | undefined;

      if (intent === "undo_last_edit") {
        // We already pushed undo for this message — pop the push then undo previous
        undoStackRef.current.pop();
        setUndoDepth(undoStackRef.current.length);
        handleUndo();
        return;
      }

      if (intent === "replace_image") {
        const targetP = Number(parsed.targetP);
        const sourceIndex = Number(parsed.sourceIndex);
        const url = gallery[sourceIndex - 1];
        if (url && Number.isFinite(targetP)) {
          setForm((prev) => ({ ...prev, images: setSlotUrl(prev.images, targetP, url) }));
          setChatMessages((m) => [
            ...m,
            { role: "assistant", content: `Replaced P${targetP} with gallery #${sourceIndex}.` },
          ]);
        } else {
          setChatMessages((m) => [
            ...m,
            { role: "assistant", content: `Could not find gallery image #${sourceIndex}.` },
          ]);
        }
        return;
      }

      if (intent === "swap_layout_slots") {
        const a = Number(parsed.slotA);
        const b = Number(parsed.slotB);
        if (Number.isFinite(a) && Number.isFinite(b)) {
          setForm((prev) => ({ ...prev, images: swapSlots(prev.images, a, b) }));
          setChatMessages((m) => [
            ...m,
            { role: "assistant", content: `Swapped P${a} and P${b}.` },
          ]);
        }
        return;
      }

      if (intent === "remove_layout_slots" && Array.isArray(parsed.slots)) {
        const slots = (parsed.slots as unknown[])
          .map(Number)
          .filter((n) => Number.isFinite(n) && n >= 1 && n <= 15);
        setForm((prev) => ({ ...prev, images: clearSlots(prev.images, slots) }));
        setChatMessages((m) => [
          ...m,
          { role: "assistant", content: `Cleared ${slots.map((p) => `P${p}`).join(", ")}.` },
        ]);
        return;
      }

      if (intent === "remove_layout_slots_except" && Array.isArray(parsed.keepSlots)) {
        const keepSet = new Set(
          (parsed.keepSlots as unknown[])
            .map(Number)
            .filter((n) => Number.isFinite(n) && n >= 1 && n <= 15),
        );
        setForm((prev) => ({ ...prev, images: keepOnlySlots(prev.images, keepSet) }));
        setChatMessages((m) => [
          ...m,
          {
            role: "assistant",
            content: `Cleared layout except ${[...keepSet].map((p) => `P${p}`).join(", ")}.`,
          },
        ]);
        return;
      }

      if (intent === "rewrite_listing_description" && typeof parsed.instruction === "string") {
        const revised = await rewriteDescription(form.desc, parsed.instruction);
        if (revised) {
          setForm((prev) => ({ ...prev, desc: revised }));
          setChatMessages((m) => [
            ...m,
            { role: "assistant", content: "Updated listing remarks / description." },
          ]);
        } else {
          setChatMessages((m) => [
            ...m,
            { role: "assistant", content: "Could not revise remarks." },
          ]);
        }
        return;
      }

      if (intent === "update_bedrooms" && typeof parsed.bedrooms === "string") {
        setForm((prev) => ({ ...prev, beds: parsed.bedrooms as string }));
        setChatMessages((m) => [
          ...m,
          { role: "assistant", content: `Bedrooms → ${parsed.bedrooms}.` },
        ]);
        return;
      }

      if (intent === "update_bathrooms" && typeof parsed.bathrooms === "string") {
        setForm((prev) => ({ ...prev, baths: parsed.bathrooms as string }));
        setChatMessages((m) => [
          ...m,
          { role: "assistant", content: `Bathrooms → ${parsed.bathrooms}.` },
        ]);
        return;
      }

      if (intent === "set_headshot_from_gallery") {
        const n = Number(parsed.sourceIndex);
        const url = gallery[n - 1];
        if (url) {
          setForm((prev) => ({ ...prev, images: { ...prev.images, agent: url } }));
          setChatMessages((m) => [
            ...m,
            { role: "assistant", content: `Agent photo set from gallery #${n}.` },
          ]);
        } else {
          setChatMessages((m) => [
            ...m,
            { role: "assistant", content: `No gallery image #${n}.` },
          ]);
        }
        return;
      }

      if (intent === "remove_headshot") {
        setForm((prev) => ({ ...prev, images: { ...prev.images, agent: null } }));
        setChatMessages((m) => [
          ...m,
          { role: "assistant", content: "Removed agent photo." },
        ]);
        return;
      }

      if (intent === "update_fields" && parsed.fields && typeof parsed.fields === "object") {
        const fields = parsed.fields as Record<string, string>;
        applyFields(fields);
        const summary = Object.entries(fields)
          .filter(([, v]) => typeof v === "string" && v.trim())
          .map(([k, v]) => `${k} → "${v}"`)
          .join(" · ");
        setChatMessages((m) => [
          ...m,
          { role: "assistant", content: summary ? `Done. ${summary}.` : "No fields updated." },
        ]);
        return;
      }

      setChatMessages((m) => [
        ...m,
        {
          role: "assistant",
          content:
            'I did not understand that. Try: “change address to …”, “beds to 4”, “rewrite description …”, “P1 replace by 2”, or “switch P3 with P4”.',
        },
      ]);
    } catch (err) {
      console.error(err);
      setChatMessages((m) => [
        ...m,
        { role: "assistant", content: "Chat request failed. Try again." },
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fsb-chat-panel">
      <div className="fsb-chat-toolbar">
        <span className="fsb-chat-toolbar-label">Assistant</span>
        <button
          type="button"
          className="fsb-btn fsb-btn-sm"
          disabled={undoDepth === 0}
          onClick={handleUndo}
        >
          Undo last edit
        </button>
      </div>
      <div className="fsb-chat-input-wrap">
        <textarea
          className="fsb-chat-input"
          rows={1}
          placeholder="Type a message…"
          value={chatInput}
          disabled={busy}
          onChange={(e) => setChatInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
        />
        <button
          type="button"
          className="fsb-chat-send"
          disabled={busy || !chatInput.trim()}
          onClick={() => void handleSend()}
        >
          {busy ? "…" : "Send"}
        </button>
      </div>
      <div className="fsb-chat-messages">
        {chatMessages.map((msg, idx) =>
          msg.role === "user" ? (
            <div key={idx} className="fsb-chat-row fsb-chat-row-user">
              <div className="fsb-chat-bubble fsb-chat-bubble-user">{msg.content}</div>
            </div>
          ) : msg.role === "assistant" ? (
            <div key={idx} className="fsb-chat-row">
              <div className="fsb-chat-bubble fsb-chat-bubble-bot">{msg.content}</div>
            </div>
          ) : null,
        )}
      </div>
    </div>
  );
}

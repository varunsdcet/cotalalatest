import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { ArrowLeft, CheckCircle2, CreditCard, Info, Mic, MessageCircle, Send, ShieldCheck, X } from "lucide-react";
import {
  detectChatIntent,
  getIncompleteStepHint,
  isGreetingInput,
  type ChatIntent,
} from "@/lib/chatbot-rules";
import {
  addOrder,
  calculateTotalAmount,
  getCategory,
  getDateTimeSlots,
  getMyListings,
  getProfile,
  getSubCategoryNew,
  getUserIdFromStorage,
  reOrder,
  type MyListingsResponse,
  type ServiceArrayItem,
  type SubCategoryNewResponse,
  type UpcomingService,
} from "@/lib/api";
import britishColumbiaCities from "@/lib/britishColumbiaCities";
import blueSkyReplacementImg from "@/pages/images/cotala-photos/blue-sky-exterior-replacement.gif";
import dayNightOneImg from "@/pages/images/cotala-photos/daynight-1.gif";
import dayNightThreeImg from "@/pages/images/cotala-photos/daynight-2.gif";
import droneLotOutlineImg from "@/pages/images/cotala-photos/sas-drone-lot-outlines-example.gif";
import droneStillsImg from "@/pages/images/cotala-photos/sas-drone-stills-example.gif";
import hdrImg from "@/pages/images/cotala-photos/hdr-1.jpg";
import hdrComparisonImg from "@/pages/images/hdr.jpg";
import twilightExteriorImg from "@/pages/images/cotala-photos/twilight-exterior-1.jpg";
import twilightImg from "@/pages/images/cotala-photos/twilight.jpg";
import { ChatMessage } from "./ChatMessage";
import "./chat-widget.css";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type UserType = "existing" | "new" | "guest" | "unknown";
type PendingField = "none" | "lookup" | "sqft" | "address" | "date";
type Intent = ChatIntent;

type BookingStage =
  | "idle"
  | "selectReorder"
  | "selectRecent"
  | "address"
  | "homesize"
  | "lotsize"
  | "category"
  | "service"
  | "date"
  | "time"
  | "city"
  | "useSavedCard"
  | "cardnumber"
  | "expirydate"
  | "cvv"
  | "holdername"
  | "postalcode"
  | "notes"
  | "confirm"
  | "confirmed";

type BookingDraft = {
  address: string;
  homesize: string;
  lotsize: string;
  category: string;
  serviceName: string;
  serviceId: string | number | null;
  serviceIds: Array<string | number>;
  serviceType: string;
  serviceBaseAmount: string;
  date: string;
  time: string;
  city: string;
  cardnumber: string;
  expirydate: string;
  cvv: string;
  holdername: string;
  postalcode: string;
  notes: string;
  tourId: string | number | null;
};

type SavedCardInfo = {
  last4: string;
  expiryMMYY: string;
  token: string;
  cardType: string;
  holderName: string;
};

type BrowserSpeechRecognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionCtor = new () => BrowserSpeechRecognition;

export function ChatWidget() {
  const getServicePreviewForName = (serviceName: string): string | null => {
    const n = serviceName.toLowerCase();
    if (n.includes("hdr")) return hdrImg;
    if (n.includes("twilight exterior")) return twilightExteriorImg;
    if (n.includes("twilight")) return twilightImg;
    if (n.includes("blue sky")) return blueSkyReplacementImg;
    if (n.includes("day to night") && n.includes("3")) return dayNightThreeImg;
    if (n.includes("day to night")) return dayNightOneImg;
    if (n.includes("lot outline")) return droneLotOutlineImg;
    if (n.includes("drone still")) return droneStillsImg;
    return null;
  };
  const [isOpen, setIsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [userName, setUserName] = useState("");
  const [userType, setUserType] = useState<UserType>("unknown");
  const [pendingField, setPendingField] = useState<PendingField>("none");
  const [recentListings, setRecentListings] = useState<MyListingsResponse["tours"]>([]);
  const [recentOrders, setRecentOrders] = useState<UpcomingService[]>([]);
  const [standardPackageNames, setStandardPackageNames] = useState<string[]>([]);
  const [bookingStage, setBookingStage] = useState<BookingStage>("idle");
  const [bookingDraft, setBookingDraft] = useState<BookingDraft>({
    address: "",
    homesize: "",
    lotsize: "",
    category: "",
    serviceName: "",
    serviceId: null,
    serviceIds: [],
    serviceType: "",
    serviceBaseAmount: "0",
    date: "",
    time: "",
    city: "",
    cardnumber: "",
    expirydate: "",
    cvv: "",
    holdername: "",
    postalcode: "",
    notes: "",
    tourId: null,
  });
  const [bookingConfirmation, setBookingConfirmation] = useState<{
    reservationId: string;
    propertyAddress: string;
    city: string;
    date: string;
    time: string;
    totalAmount: string;
  } | null>(null);
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [serviceOptions, setServiceOptions] = useState<
    Array<{ id: string | number; name: string; type?: string; totalamount?: string | number }>
  >([]);
  const [selectedServiceItems, setSelectedServiceItems] = useState<
    Array<{ id: string | number; name: string; type?: string; totalamount?: string | number }>
  >([]);
  const [timeSlotOptions, setTimeSlotOptions] = useState<string[]>([]);
  const [datePickerValue, setDatePickerValue] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Hi, I'm Tav from Cotala. I can help you book services, compare packages, reorder, or show your recent properties.",
    },
  ]);
  const listRef = useRef<HTMLDivElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const [savedCard, setSavedCard] = useState<SavedCardInfo | null>(null);
  const [useSavedCardForOrder, setUseSavedCardForOrder] = useState(false);
  const [paymentCardNumberInput, setPaymentCardNumberInput] = useState("");
  const [paymentExpiryInput, setPaymentExpiryInput] = useState("");
  const [paymentCvvInput, setPaymentCvvInput] = useState("");
  const [paymentHolderInput, setPaymentHolderInput] = useState("");
  const [paymentPostalInput, setPaymentPostalInput] = useState("");
  const [uiSelectedCategoryIndexes, setUiSelectedCategoryIndexes] = useState<number[]>([]);
  const [uiSelectedServiceIndexes, setUiSelectedServiceIndexes] = useState<number[]>([]);
  const [uiSelectedReorderIndex, setUiSelectedReorderIndex] = useState<number | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const addressInputRef = useRef<HTMLInputElement>(null);
  const addressAutocompleteRef = useRef<any>(null);
  const [addressInputValue, setAddressInputValue] = useState("");
  const [servicePreview, setServicePreview] = useState<{ title: string; image: string } | null>(null);
  const [serviceInfoTooltip, setServiceInfoTooltip] = useState<{ key: string; text: string } | null>(null);
  const [photoComparisonOpen, setPhotoComparisonOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  useEffect(() => {
    const hydrateProfile = async () => {
      try {
        const profileResp = await getProfile();
        if (profileResp.status && profileResp.user_profile?.name) {
          setUserName(String(profileResp.user_profile.name));
          setUserType("existing");
          setPendingField("none");
          setBookingStage("idle");
          const p = profileResp.user_profile as any;
          if (Array.isArray(p?.standardpackagefiltered)) {
            setStandardPackageNames(
              p.standardpackagefiltered
                .map((pkg: any) => String(pkg?.name || "").trim())
                .filter(Boolean),
            );
          }
          if (p?.cardpoint_last4 && p?.cardpoint_token) {
            const mm = String(p.cardpoint_expiry_month || "").padStart(2, "0");
            const yy = String(p.cardpoint_expiry_year || "").slice(-2);
            const expiryMMYY = mm && yy ? `${mm}/${yy}` : "";
            setSavedCard({
              last4: String(p.cardpoint_last4),
              token: String(p.cardpoint_token),
              expiryMMYY,
              cardType: String(p.cardpoint_cardtype || "Card"),
              holderName: String(p.name || ""),
            });
          }
          setMessages([
            {
              role: "assistant",
              content:
                `Welcome back, ${String(profileResp.user_profile.name).split(" ")[0]}. I found your Cotala account. What would you like to do?`,
            },
          ]);
        }
      } catch (err) {
        console.error("Failed to load profile for chat widget", err);
      }
    };
    hydrateProfile();
  }, []);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  useEffect(() => {
    const openChat = () => setIsOpen(true);
    window.addEventListener("cotala-open-chat", openChat as EventListener);
    return () => {
      window.removeEventListener("cotala-open-chat", openChat as EventListener);
    };
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    setPaymentCardNumberInput((prev) => prev || bookingDraft.cardnumber || "");
    setPaymentExpiryInput((prev) => prev || bookingDraft.expirydate || "");
    setPaymentCvvInput((prev) => prev || bookingDraft.cvv || "");
    setPaymentHolderInput((prev) => prev || bookingDraft.holdername || "");
    setPaymentPostalInput((prev) => prev || bookingDraft.postalcode || "");
  }, [bookingDraft.cardnumber, bookingDraft.expirydate, bookingDraft.cvv, bookingDraft.holdername, bookingDraft.postalcode]);

  const handleAddressChange = useCallback((value: string) => {
    setAddressInputValue(value);
  }, []);

  useEffect(() => {
    if (bookingStage === "address" && !recentListings?.length) {
      void getMyListings()
        .then((data) => {
          setRecentListings(data?.tours?.slice(0, 20) || []);
        })
        .catch((e) => console.error("Failed to preload listings for address selection", e));
    }
  }, [bookingStage, recentListings]);

  useEffect(() => {
    if (bookingStage !== "address") return;
    const input = addressInputRef.current;
    if (!input) return;
    if (window.google?.maps?.places && !addressAutocompleteRef.current) {
      const autocomplete = new window.google.maps.places.Autocomplete(input, {
        componentRestrictions: { country: "ca" },
        fields: ["formatted_address", "address_components", "geometry"],
        types: ["address"],
      });
      autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        if (place.formatted_address) {
          handleAddressChange(place.formatted_address);
          void processInput(place.formatted_address);
        }
      });
      addressAutocompleteRef.current = autocomplete;
    }
    return () => {
      if (addressAutocompleteRef.current && window.google?.maps?.event) {
        window.google.maps.event.clearInstanceListeners(addressAutocompleteRef.current);
      }
      addressAutocompleteRef.current = null;
    };
  }, [bookingStage, handleAddressChange]);

  useEffect(() => {
    const w = window as Window & {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    const RecognitionCtor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!RecognitionCtor) {
      setSpeechSupported(false);
      return;
    }

    setSpeechSupported(true);
    const recognition = new RecognitionCtor();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;

    recognition.onresult = (event: any) => {
      const transcript = String(event?.results?.[0]?.[0]?.transcript || "").trim();
      if (!transcript) return;
      setInput(transcript);
      void processInput(transcript);
    };
    recognition.onerror = (event: any) => {
      const errorCode = String(event?.error || "");
      setIsListening(false);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            errorCode === "not-allowed"
              ? "Mic permission denied. Please allow microphone access and try again."
              : "I couldn't hear that clearly. Please try again or type your message.",
        },
      ]);
    };
    recognition.onend = () => {
      setIsListening(false);
    };
    recognitionRef.current = recognition;

    return () => {
      recognition.stop();
      recognitionRef.current = null;
    };
  }, []);

  const resolvedName = useMemo(() => userName?.trim() || "Customer", [userName]);
  const resolvedUserId = useMemo(() => getUserIdFromStorage() || "", []);

  const looksLikeLookupIdentifier = (text: string) =>
    /\S+@\S+\.\S+/.test(text) || /(\+?\d[\d\s-]{7,})/.test(text);

  const parseSqft = (text: string): number | null => {
    const match = text.match(/(\d{1,6})/);
    if (!match) return null;
    return Number(match[1]);
  };

  const parseHomeAndLot = (text: string): { home: string; lot: string } | null => {
    const nums = (text.match(/\d{3,6}/g) || []).map((n) => Number(n)).filter((n) => Number.isFinite(n));
    if (nums.length < 2) return null;
    return { home: String(nums[0]), lot: String(nums[1]) };
  };

  const parseChoiceIndex = (text: string): number | null => {
    const m = text.trim().match(/^(\d{1,2})$/);
    if (!m) return null;
    return Number(m[1]);
  };

  const normalizeChoiceText = (value: string): string =>
    value
      .toLowerCase()
      .replace(/\$\s*\d+[.,]?\d*/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const parseMultipleIndexes = (text: string): number[] => {
    const tokens = text
      .split(/[,\s/]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    return tokens
      .map((t) => Number(t))
      .filter((n) => Number.isFinite(n) && n > 0);
  };

  const splitMultiChoiceText = (text: string): string[] => {
    return text
      .replace(/\s+(and|or)\s+/gi, ",")
      .replace(/[+&]/g, ",")
      .split(/[,\n/]+/)
      .map((t) => t.trim())
      .filter(Boolean);
  };

  const isValidDate = (value: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(value);
  const formatDateYMD = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const formatDateDisplay = (value: string): string => {
    // Expect YYYY-MM-DD but be defensive.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value || "";
    const d = new Date(`${value}T00:00:00`);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const validateCardNumber = (cardNumber: string): boolean => {
    const cleaned = cardNumber.replace(/\s+/g, "").replace(/\D/g, "");
    if (cleaned.length < 13 || cleaned.length > 19) return false;
    let sum = 0;
    let isEven = false;
    for (let i = cleaned.length - 1; i >= 0; i--) {
      let digit = parseInt(cleaned[i], 10);
      if (isEven) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
      isEven = !isEven;
    }
    return sum % 10 === 0;
  };

  const formatCardNumberForUI = (value: string): string => {
    const digits = value.replace(/\D/g, "");
    const parts = digits.match(/.{1,4}/g) || [];
    return parts.join(" ");
  };

  const validateExpiryDate = (expiryDate: string): boolean => {
    const cleaned = expiryDate.replace(/\D/g, "");
    if (cleaned.length !== 4) return false;
    const month = parseInt(cleaned.substring(0, 2), 10);
    const year = parseInt(cleaned.substring(2, 4), 10);
    if (month < 1 || month > 12) return false;
    const now = new Date();
    const currentYear = now.getFullYear() % 100;
    const currentMonth = now.getMonth() + 1;
    return !(year < currentYear || (year === currentYear && month < currentMonth));
  };

  const formatExpiryForUI = (value: string): string => {
    const digits = value.replace(/\D/g, "").slice(0, 4);
    if (digits.length <= 2) return digits;
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  };

  const normalizeDate = (value: string): string => {
    if (value.toLowerCase().trim() === "today") return new Date().toISOString().split("T")[0];
    return value.trim();
  };

  const detectBCity = (text: string): string | null => {
    const lower = text.toLowerCase();
    const found = britishColumbiaCities.find((c) => lower.includes(c.toLowerCase()));
    return found || null;
  };

  const isLikelyCanadianAddress = (text: string): boolean => {
    const t = text.toLowerCase();
    return /\b(canada|bc|british columbia|ab|alberta|sk|saskatchewan|mb|manitoba|on|ontario|qc|quebec|ns|nova scotia|nb|new brunswick|nl|newfoundland|pei|prince edward island|yt|yukon|nt|northwest territories|nu|nunavut)\b/.test(
      t,
    );
  };

  const extractLikelyCity = (text: string): string | null => {
    const cleaned = text
      .replace(/\b(my address is|address is|address|at)\b/gi, " ")
      .replace(/[0-9#/-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!cleaned) return null;

    const parts = cleaned.split(",");
    if (parts.length > 1) {
      const candidate = parts[parts.length - 1].trim() || null;
      if (!candidate) return null;
      if (/\b(sq|square|feet|foot|ft|size|lot)\b/i.test(candidate)) return null;
      return candidate;
    }

    const tokens = cleaned.split(" ").filter(Boolean);
    if (tokens.length === 0) return null;
    if (tokens.length >= 2) {
      const candidate = `${tokens[tokens.length - 2]} ${tokens[tokens.length - 1]}`;
      if (/\b(sq|square|feet|foot|ft|size|lot)\b/i.test(candidate)) return null;
      return candidate;
    }
    const candidate = tokens[tokens.length - 1];
    if (/\b(sq|square|feet|foot|ft|size|lot)\b/i.test(candidate)) return null;
    return candidate;
  };

  const looksLikeAddressInput = (text: string): boolean => {
    const hasNumber = /\d{1,6}/.test(text);
    const hasNumberWord =
      /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/i.test(text);
    const hasAddressKeyword =
      /\b(street|st|avenue|ave|road|rd|drive|dr|lane|ln|way|blvd|boulevard|court|ct|place|pl)\b/i.test(text);
    return (hasNumber || hasNumberWord) && hasAddressKeyword;
  };

  const parseSpokenSmallNumber = (text: string): number | null => {
    const dict: Record<string, number> = {
      one: 1,
      two: 2,
      three: 3,
      four: 4,
      five: 5,
      six: 6,
      seven: 7,
      eight: 8,
      nine: 9,
      ten: 10,
      eleven: 11,
      twelve: 12,
      thirteen: 13,
      fourteen: 14,
      fifteen: 15,
      sixteen: 16,
      seventeen: 17,
      eighteen: 18,
      nineteen: 19,
      twenty: 20,
    };
    const words = text.toLowerCase().split(/[^a-z]+/).filter(Boolean);
    for (const w of words) {
      if (dict[w] != null) return dict[w];
    }
    return null;
  };

  const editFieldToStage = (field: string): BookingStage | null => {
    const f = field.toLowerCase().trim();
    if (f === "address") return "address";
    if (f === "city") return "city";
    if (f === "homesize" || f === "home size" || f === "sqft") return "homesize";
    if (f === "lotsize" || f === "lot size") return "lotsize";
    if (f === "date") return "date";
    if (f === "time") return "time";
    if (f === "cardnumber" || f === "card number") return "cardnumber";
    if (f === "expiry" || f === "expirydate" || f === "expiry date") return "expirydate";
    if (f === "cvv") return "cvv";
    if (f === "holdername" || f === "holder name") return "holdername";
    if (f === "postal" || f === "postalcode" || f === "postal code") return "postalcode";
    if (f === "notes" || f === "note") return "notes";
    return null;
  };

  const getPackageSuggestion = (sqft: number): string => {
    if (sqft >= 2000 && sqft <= 4000) {
      return "Best value: Photos + 25 Feature Sheets. Strong starter package for most listings in this range.";
    }
    if (sqft > 4000) {
      return "Premium suggestion: HDR Photos + Cinematic Walkthrough + Drone (+ Floorplan if layout-heavy).";
    }
    return "Starter suggestion: Standard Photos + optional Feature Sheets. Add Floorplan if layout clarity matters.";
  };

  const parseTimeRange = (slot: string): { start: string; end: string } => {
    const [start = "", end = ""] = slot.split("-").map((s) => s.trim());
    return { start, end };
  };

  const parseHourFromSlot = (slot: string): number | null => {
    // "08:00 am - 11:00 am" -> 8, "02:00 pm - 05:00 pm" -> 14
    const m = slot.match(/(\d{1,2}):\d{2}\s*(am|pm)/i);
    if (!m) return null;
    let h = Number(m[1]);
    const ampm = m[2].toLowerCase();
    if (ampm === "pm" && h !== 12) h += 12;
    if (ampm === "am" && h === 12) h = 0;
    return h;
  };

  const findTimeSlotFromInput = (text: string, options: string[]): string | null => {
    if (!options.length) return null;

    const idx = parseChoiceIndex(text);
    if (idx && idx >= 1 && idx <= options.length) return options[idx - 1];

    const normalizedInput = normalizeChoiceText(text);
    const direct =
      options.find((o) => normalizeChoiceText(o) === normalizedInput) ||
      options.find((o) => normalizeChoiceText(o).includes(normalizedInput)) ||
      options.find((o) => normalizedInput.includes(normalizeChoiceText(o)));
    if (direct) return direct;

    const hourMatch = text.match(/(?:^|\s)(\d{1,2})(?::\d{2})?\s*(am|pm)?(?:\s|$)/i);
    if (hourMatch) {
      let targetHour = Number(hourMatch[1]);
      const ampm = hourMatch[2]?.toLowerCase();
      if (ampm === "pm" && targetHour !== 12) targetHour += 12;
      if (ampm === "am" && targetHour === 12) targetHour = 0;
      if (!ampm && targetHour <= 8) {
        // If user types "7" or "8", bias to morning
        targetHour = targetHour;
      } else if (!ampm && targetHour < 7) {
        targetHour = targetHour + 12;
      }

      let best: { slot: string; distance: number } | null = null;
      options.forEach((slot) => {
        const h = parseHourFromSlot(slot);
        if (h == null) return;
        const d = Math.abs(h - targetHour);
        if (!best || d < best.distance) best = { slot, distance: d };
      });
      if (best) return best.slot;
    }

    return null;
  };

  const submitOrderFromChat = async (draft: BookingDraft) => {
    const { start, end } = parseTimeRange(draft.time);
    const pickedServices =
      selectedServiceItems.length > 0
        ? selectedServiceItems
        : [
            {
              id: draft.serviceId || "",
              name: draft.serviceName,
              type: draft.serviceType || draft.category,
              totalamount: draft.serviceBaseAmount || "0",
            },
          ];

    const servicearray: ServiceArrayItem[] = pickedServices.map((svc) => ({
      service: svc.id || "",
      qty: 1,
      rush: "no",
      type: svc.type || draft.category,
      rush_option: "",
      name: svc.name,
      totalamount: svc.totalamount ?? "0",
      customer_preferred: draft.date,
      customer_preferred_datestarttime: `${draft.date} ${start}:00`,
      customer_preferred_dateendtime: `${draft.date} ${end}:00`,
    }));

    const calc = await calculateTotalAmount({ servicearray });
    const totalNum = Number(calc.totalamount ?? calc.paymentgatewayamount ?? 0) || 0;
    const amountNum = Number(calc.paymentgatewayamount ?? calc.totalamount ?? 0) || 0;

    const orderRes = await addOrder({
      address: draft.address,
      city: draft.city,
      date: draft.date,
      time: start,
      end_time: end,
      is_same_date: true,
      homesize: draft.homesize || "",
      lotsize: draft.lotsize || "",
      notes: draft.notes || "",
      photographer: "",
      amount: amountNum,
      total: totalNum,
      cardnumber: draft.cardnumber,
      expirydate: draft.expirydate,
      cvv: draft.cvv,
      holdername: draft.holdername,
      postalcode: draft.postalcode,
      savecarddetails: false,
      servicearray:
        (calc.servicearray as ServiceArrayItem[] | undefined) && calc.servicearray.length > 0
          ? (calc.servicearray as ServiceArrayItem[])
          : servicearray,
      tour_id: draft.tourId ?? undefined,
    });

    return { calc, orderRes };
  };

  const showRecentProperties = async () => {
    setLoading(true);
    try {
      const data = await getMyListings();
      const tours = data?.tours?.slice(0, 10) || [];
      setRecentListings(tours);
      if (tours.length === 0) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "I could not find recent properties yet. Want to start a new booking instead?",
          },
        ]);
        return;
      }
      const lines = tours.map((t, idx) => {
        const addr = `${t.address || "Address"}${t.city ? `, ${t.city}` : ""}`;
        return `${idx + 1}. ${addr}`;
      });
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            `Here are your 10 most recent properties:\n${lines.join("\n")}\n\nWant me to start a new order for one of these?`,
        },
      ]);
    } catch (err) {
      console.error("Failed to load recent properties", err);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "I couldn't fetch recent properties right now. Please try again in a moment.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const showRecentOrdersForReorder = async () => {
    setLoading(true);
    try {
      const data = await getMyListings();
      const orders = (data?.upcomingservice || []).slice(0, 10);
      setRecentOrders(orders);
      setUiSelectedReorderIndex(null);
      if (orders.length === 0) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "I could not find your recent orders right now. You can say 'book service' to create a new order.",
          },
        ]);
        return;
      }
      setBookingStage("selectReorder");
      const lines = orders.map((o, idx) => {
        const addr = `${(o as any)?.tourdetails?.address || "Address"}${(o as any)?.tourdetails?.city ? `, ${(o as any).tourdetails.city}` : ""}`;
        const total = o.total ? ` | $${o.total}` : "";
        return `${idx + 1}. Order #${o.id} - ${addr}${total}`;
      });
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Here are your last 10 orders. Reply with number to reorder:\n${lines.join("\n")}`,
        },
      ]);
    } catch (err) {
      console.error("Failed to load recent orders for reorder", err);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "I couldn't load recent orders right now. Please try again in a moment.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const showMyLastOrder = async () => {
    setLoading(true);
    try {
      const data = await getMyListings();
      const orders = (data?.upcomingservice || []) as UpcomingService[];
      const last = orders[0];
      if (!last) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "I couldn't find your last order right now. You can say 'book service' to create a new order.",
          },
        ]);
        return;
      }

      const addr = `${(last as any)?.tourdetails?.address || "Address"}${
        (last as any)?.tourdetails?.city ? `, ${(last as any)?.tourdetails?.city}` : ""
      }`;
      const total = last.total ? `$${last.total}` : "—";
      const status = last.status ? ` (${last.status})` : "";

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Your last order is #${last.id} for ${addr}. Total: ${total}${status}.`,
        },
      ]);
    } catch (err) {
      console.error("Failed to load last order", err);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "I couldn't load your last order right now. Please try again in a moment." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const proceedAfterLotSize = async (lotSize: string) => {
    const homesize = bookingDraft.homesize || "";
    setBookingDraft((prev) => ({ ...prev, lotsize: lotSize }));
    try {
      const cat = await getCategory();
      const options = (cat.list || []).map((c) => c.name).filter(Boolean);
      setCategoryOptions(options);
      setUiSelectedCategoryIndexes([]);

      setBookingStage("category");
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Perfect. Choose category from the selection card below.",
        },
      ]);
    } catch (e) {
      console.error("Failed to load categories for chat booking", e);
      setBookingStage("idle");
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "I couldn't load categories right now. Please try again or continue in /new-appointment.",
        },
      ]);
    }
  };

  const processInput = async (text: string) => {
    const lc = text.toLowerCase().trim();

    // Global restart: always reset booking flow to the starting address step
    if (/restart|start over|start again|new booking|book service|again/.test(lc)) {
      setBookingConfirmation(null);
      setPhotoComparisonOpen(false);
      setServicePreview(null);
      setServiceInfoTooltip(null);
      setPendingField("none");

      setBookingDraft({
        address: "",
        homesize: "",
        lotsize: "",
        category: "",
        serviceName: "",
        serviceId: null,
        serviceIds: [],
        serviceType: "",
        serviceBaseAmount: "0",
        date: "",
        time: "",
        city: "",
        cardnumber: "",
        expirydate: "",
        cvv: "",
        holdername: "",
        postalcode: "",
        notes: "",
        tourId: null,
      });

      setUiSelectedCategoryIndexes([]);
      setUiSelectedServiceIndexes([]);
      setSelectedServiceItems([]);

      setMessages([
        {
          role: "assistant",
          content:
            "Perfect — let's start from the beginning. Please share full Canada property address with city (e.g., 123 Main St, Vancouver, Canada).",
        },
      ]);
      setBookingStage("address");
      return;
    }

    if (bookingStage === "confirmed") {
      const lc = text.toLowerCase().trim();

      // If user wants to restart the whole flow
      if (/restart|start over|start again|book service|new booking|again/.test(lc)) {
        setBookingConfirmation(null);
        setPhotoComparisonOpen(false);
        setServicePreview(null);
        setPendingField("none");
        setBookingStage("address");
        setBookingDraft({
          address: "",
          homesize: "",
          lotsize: "",
          category: "",
          serviceName: "",
          serviceId: null,
          serviceIds: [],
          serviceType: "",
          serviceBaseAmount: "0",
          date: "",
          time: "",
          city: "",
          cardnumber: "",
          expirydate: "",
          cvv: "",
          holdername: "",
          postalcode: "",
          notes: "",
          tourId: null,
        });
        setUiSelectedCategoryIndexes([]);
        setUiSelectedServiceIndexes([]);
        setMessages([
          {
            role: "assistant",
            content: "Perfect — let's start from the beginning. Please share full Canada property address with city (e.g., 123 Main St, Vancouver, Canada).",
          },
        ]);
        return;
      }

      // If user asks to open orders page
      if (/my order|my orders|orders|view my bookings|see my bookings/.test(lc)) {
        window.location.href = "/orders";
        return;
      }

      setMessages((prev) => [
        ...prev,
        { role: "user", content: text },
        {
          role: "assistant",
          content:
            "Your booking is already confirmed. Say 'my orders' to open it, or say 'restart' to start a new booking.",
        },
      ]);
      return;
    }
    if (isGreetingInput(text)) {
      const userMessage: Message = { role: "user", content: text };
      setMessages((prev) => [...prev, userMessage]);
      setPendingField("none");
      setBookingStage("idle");
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Hi! I can help with booking, reorder, pricing, or your recent listings. You can say: 'book service', 'reorder', or 'show my listings'.",
        },
      ]);
      return;
    }

    if (bookingStage === "selectReorder") {
      const userMessage: Message = { role: "user", content: text };
      setMessages((prev) => [...prev, userMessage]);
      const pickedIndex = parseChoiceIndex(text);
      if (!pickedIndex || pickedIndex < 1 || pickedIndex > (recentOrders?.length || 0)) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Please choose a valid order number from the list." },
        ]);
        return;
      }
      const selectedOrder = recentOrders[pickedIndex - 1];
      const userId = resolvedUserId || getUserIdFromStorage() || "";
      if (!userId) {
        setBookingStage("idle");
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "I could not find your user session for reorder. Please log in again and retry.",
          },
        ]);
        return;
      }

      setLoading(true);
      try {
        const response = await reOrder({
          orderid: selectedOrder.id,
          user_id: userId,
        });
        setBookingStage("idle");
        if (response?.status) {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content:
                `${response.msg || "Order reordered successfully."}\n` +
                `${response.new_order_id ? `New Order ID: ${response.new_order_id}\n` : ""}` +
                "Anything else you want me to help with?",
            },
          ]);
        } else {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: response?.msg || "Reorder failed. Please try again in a moment.",
            },
          ]);
        }
      } catch (e: any) {
        console.error("Reorder failed in chat widget", e);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `Reorder failed. ${e?.message || "Please try again."}`,
          },
        ]);
      } finally {
        setLoading(false);
      }
      return;
    }

    const rawIntent = detectChatIntent(text);
    // Global interruption: if user asks to start booking mid-flow, always restart at address.
    if (
      rawIntent === "start_booking" &&
      bookingStage !== "address" &&
      bookingStage !== "idle"
    ) {
      const userMessage: Message = { role: "user", content: text };
      setMessages((prev) => [...prev, userMessage]);
      setPendingField("none");
      setBookingDraft((prev) => ({
        ...prev,
        address: "",
        city: "",
        homesize: "",
        lotsize: "",
        category: "",
        serviceName: "",
        serviceId: null,
        serviceIds: [],
        serviceType: "",
        serviceBaseAmount: "0",
        date: "",
        time: "",
        notes: "",
        tourId: null,
      }));
      setSelectedServiceItems([]);
      setUiSelectedCategoryIndexes([]);
      setUiSelectedServiceIndexes([]);
      setBookingStage("address");
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Sure — let's start a new booking. Please share full Canada property address with city (e.g., 123 Main St, Vancouver, Canada).",
        },
      ]);
      return;
    }

    // Safety: if stage says "address" but we already captured address+city, and user sends sqft,
    // continue as home-size instead of showing "non-BC city" message.
    if (bookingStage === "address" && bookingDraft.address && bookingDraft.city) {
      const home = parseSqft(text);
      if (home) {
        const userMessage: Message = { role: "user", content: text };
        setMessages((prev) => [...prev, userMessage]);
        setBookingDraft((prev) => ({ ...prev, homesize: String(home) }));
        setBookingStage("lotsize");
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Thanks. What's the lot size? (e.g., 8000 sq ft)" },
        ]);
        return;
      }
    }

    // If user shares address directly while idle, start booking flow from home size.
    if (bookingStage === "idle") {
      const cityInAddress = detectBCity(text);
      if (cityInAddress && looksLikeAddressInput(text)) {
        const userMessage: Message = { role: "user", content: text };
        setMessages((prev) => [...prev, userMessage]);
        setPendingField("none");
        setBookingDraft((prev) => ({
          ...prev,
          address: text,
          city: cityInAddress,
        }));
        setBookingStage("homesize");
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "Great. First share home size (e.g., 5000 sq ft).",
          },
        ]);
        return;
      }
    }

    // If we already have address context but stage got reset/interrupted, continue booking deterministically.
    if (bookingStage === "idle" && bookingDraft.address && bookingDraft.city) {
      const home = parseSqft(text);
      if (home) {
        const userMessage: Message = { role: "user", content: text };
        setMessages((prev) => [...prev, userMessage]);
        setBookingDraft((prev) => ({ ...prev, homesize: String(home) }));
        setBookingStage("lotsize");
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Thanks. What's the lot size? (e.g., 8000 sq ft)" },
        ]);
        return;
      }
    }

    if (bookingStage === "selectRecent") {
      const userMessage: Message = { role: "user", content: text };
      setMessages((prev) => [...prev, userMessage]);
      const pickedIndex = parseChoiceIndex(text);
      if (!pickedIndex || pickedIndex < 1 || pickedIndex > (recentListings?.length || 0)) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Please choose a valid property number from the list." },
        ]);
        return;
      }
      const picked = recentListings![pickedIndex - 1] as any;
      const addr = `${picked.address || ""}${picked.city ? `, ${picked.city}` : ""}`.trim();
      setBookingDraft((prev) => ({
        ...prev,
        address: addr,
        city: picked.city || "",
        tourId: picked.tourid ?? null,
      }));
      setBookingStage("homesize");
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Great, selected: ${addr}. What's the home size (sqft)?`,
        },
      ]);
      return;
    }

    const userMessage: Message = { role: "user", content: text };
    setMessages((prev) => [...prev, userMessage]);
    const intent = detectChatIntent(text);

    if (intent === "show_recent_orders") {
      await showMyLastOrder();
      return;
    }

    // Global interrupt: if user asks to book service, always restart from address
    // unless they already sent a valid BC address in the same message.
    if (intent === "start_booking") {
      const cityInAddress = detectBCity(text);
      const hasAddressInMessage = looksLikeAddressInput(text);
      if (!(cityInAddress && hasAddressInMessage)) {
        setPendingField("none");
        setBookingDraft((prev) => ({
          ...prev,
          address: "",
          city: "",
          homesize: "",
          lotsize: "",
          category: "",
          serviceName: "",
          serviceId: null,
          serviceIds: [],
          serviceType: "",
          serviceBaseAmount: "0",
          date: "",
          time: "",
          notes: "",
          tourId: null,
        }));
        setSelectedServiceItems([]);
        setUiSelectedCategoryIndexes([]);
        setUiSelectedServiceIndexes([]);
        setBookingStage("address");
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "Perfect — let's start booking. Please share full Canada property address with city (e.g., 123 Main St, Vancouver, Canada).",
          },
        ]);
        return;
      }
    }

    // Conversational booking flow (one field at a time)
    if (bookingStage === "address") {
      const cityInAddress = detectBCity(text);
      const probableCity = extractLikelyCity(text);
      const canadianAddress = isLikelyCanadianAddress(text) || Boolean(cityInAddress);
      if (!canadianAddress) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "Please share a valid Canada property address with city (e.g., 123 Main St, Vancouver, Canada).",
          },
        ]);
        return;
      }
      if (!probableCity && !cityInAddress) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "Please include city in the address (e.g., 123 Main St, Vancouver, Canada).",
          },
        ]);
        return;
      }
      setAddressInputValue(text);
      setBookingDraft((prev) => ({ ...prev, address: text, city: cityInAddress || probableCity || "" }));
      setBookingStage("homesize");
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Great. First share home size (e.g., 5000 sq ft)." },
      ]);
      return;
    }
    if (bookingStage === "homesize") {
      if (!bookingDraft.address || !bookingDraft.city) {
        const cityInAddress = detectBCity(text);
        const probableCity = extractLikelyCity(text);
        if ((cityInAddress || (isLikelyCanadianAddress(text) && probableCity)) && looksLikeAddressInput(text)) {
          setBookingDraft((prev) => ({ ...prev, address: text, city: cityInAddress || probableCity || "" }));
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: "Great. Now share home size (e.g., 5000 sq ft)." },
          ]);
          return;
        }
        setBookingStage("address");
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "Let's start with property location first. Please share full Canada address with city (e.g., 123 Main St, Vancouver, Canada).",
          },
        ]);
        return;
      }
      // Voice transcripts sometimes capture "lot size" while still in homesize stage.
      // If homesize is already present, treat this as lot size input and continue.
      if (bookingDraft.homesize) {
        const lotHint = /\b(lot|load|plot|land)\b/i.test(text);
        const lotSqft = parseSqft(text);
        if (lotHint && lotSqft) {
          await proceedAfterLotSize(String(lotSqft));
          return;
        }
      }
      const cityInAddress = detectBCity(text);
      if (cityInAddress) {
        setAddressInputValue(text);
        setBookingDraft((prev) => ({ ...prev, address: text, city: cityInAddress }));
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "Address updated. Now share numeric home size (e.g., 5000 sq ft).",
          },
        ]);
        return;
      }
      const both = parseHomeAndLot(text);
      if (both) {
        setBookingDraft((prev) => ({ ...prev, homesize: both.home, lotsize: both.lot }));
        try {
          const cat = await getCategory();
          const options = (cat.list || []).map((c) => c.name).filter(Boolean);
          setCategoryOptions(options);
          setUiSelectedCategoryIndexes([]);
          setBookingStage("category");
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: "Perfect. Choose category from the selection card below.",
            },
          ]);
        } catch (e) {
          console.error("Failed to load categories for chat booking", e);
          setBookingStage("idle");
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: "I couldn't load categories right now. Please try again." },
          ]);
        }
      } else {
        const home = parseSqft(text);
        if (!home) {
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: "Please share numeric home size, e.g. 5000 sq ft." },
          ]);
          return;
        }
        setBookingDraft((prev) => ({ ...prev, homesize: String(home) }));
        setBookingStage("lotsize");
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Thanks. What's the lot size? (e.g., 8000 sq ft)" },
        ]);
      }
      return;
    }
    if (bookingStage === "lotsize") {
      const lotSqft = parseSqft(text);
      const spokenLot = lotSqft || parseSpokenSmallNumber(text);
      if (!spokenLot) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Please share numeric lot size only (e.g., 8000 sq ft)." },
        ]);
        return;
      }
      await proceedAfterLotSize(String(spokenLot));
      return;
    }
    if (bookingStage === "category") {
      const pickedIndexes = parseMultipleIndexes(text);
      let pickedCategories: string[] = [];

      if (pickedIndexes.length > 0) {
        pickedCategories = pickedIndexes
          .filter((idx) => idx <= categoryOptions.length)
          .map((idx) => categoryOptions[idx - 1]);
      } else {
        const typedTokens = splitMultiChoiceText(text);
        pickedCategories = typedTokens
          .map((token) => {
            const normToken = normalizeChoiceText(token);
            return (
              categoryOptions.find((c) => normalizeChoiceText(c) === normToken) ||
              categoryOptions.find((c) => normalizeChoiceText(c).includes(normToken))
            );
          })
          .filter((v): v is string => Boolean(v));
      }

      pickedCategories = Array.from(new Set(pickedCategories));

      if (pickedCategories.length === 0) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "Please pick valid category number(s) or name(s). Example: 1,2 or photography, videography.",
          },
        ]);
        return;
      }
      setBookingDraft((prev) => ({ ...prev, category: pickedCategories.join(", ") }));
      try {
        const sub = await getSubCategoryNew({
          category: pickedCategories,
          homesize: bookingDraft.homesize || text,
        });
        const listObj = (sub.list || {}) as SubCategoryNewResponse["list"];
        const services: Array<{ id: string | number; name: string; type?: string; totalamount?: string | number }> = [];
        if (listObj && typeof listObj === "object") {
          Object.values(listObj).forEach((arr) => {
            (arr || []).forEach((item) => {
              services.push({
                id: item.id,
                name: item.name,
                type: (item as any).type || pickedCategories[0] || "",
                totalamount: (item as any).totalamount ?? "0",
              });
            });
          });
        }
        setServiceOptions(services);
        setUiSelectedServiceIndexes([]);
        setBookingStage("service");
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "Nice choice. Select services from the selection card below.",
          },
        ]);
      } catch (e) {
        console.error("Failed to load services for chat booking", e);
        setBookingStage("idle");
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "I couldn't load services right now. Please try again." },
        ]);
      }
      return;
    }
    if (bookingStage === "service") {
      const pickedIndexes = parseMultipleIndexes(text);
      let pickedServices: Array<{ id: string | number; name: string; type?: string; totalamount?: string | number }> = [];

      if (pickedIndexes.length > 0) {
        pickedServices = pickedIndexes
          .filter((idx) => idx >= 1 && idx <= serviceOptions.length)
          .map((idx) => serviceOptions[idx - 1]);
      } else {
        const tokens = splitMultiChoiceText(text);
        pickedServices = tokens
          .map((token) => {
            const normalizedInput = normalizeChoiceText(token);
            return (
              serviceOptions.find((s) => normalizeChoiceText(s.name) === normalizedInput) ||
              serviceOptions.find((s) => normalizeChoiceText(s.name).includes(normalizedInput)) ||
              serviceOptions.find((s) => normalizedInput.includes(normalizeChoiceText(s.name)))
            );
          })
          .filter((v): v is { id: string | number; name: string; type?: string; totalamount?: string | number } => Boolean(v));
      }

      pickedServices = Array.from(new Map(pickedServices.map((s) => [String(s.id), s])).values());

      if (pickedServices.length === 0) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "Please pick valid service number(s) or name(s), e.g. 1,2 or 'Photography..., Virtual Tour...'",
          },
        ]);
        return;
      }
      setSelectedServiceItems(pickedServices);
      setUiSelectedServiceIndexes([]);
      setBookingDraft((prev) => ({
        ...prev,
        serviceName: pickedServices.map((s) => s.name).join(", "),
        serviceId: pickedServices[0].id,
        serviceIds: pickedServices.map((s) => s.id),
        serviceType: pickedServices[0].type || prev.category,
        serviceBaseAmount: String(pickedServices[0].totalamount ?? "0"),
      }));
      setBookingStage("date");
      setCalendarMonth(() => {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), 1);
      });
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            `Selected services:\n${pickedServices.map((s, i) => `${i + 1}. ${s.name}`).join("\n")}\n\nGreat. Share preferred date in YYYY-MM-DD format (or type 'today').`,
        },
      ]);
      return;
    }
    if (bookingStage === "date") {
      const date = normalizeDate(text);
      if (!isValidDate(date)) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Please enter date in YYYY-MM-DD format (or type 'today')." },
        ]);
        return;
      }
      setBookingDraft((prev) => ({ ...prev, date }));
      setDatePickerValue(date);
      try {
        const slots = await getDateTimeSlots({ date });
        const options = (slots.timeSlots || []).map((s) => `${s.slotStart} - ${s.slotEnd}`);
        setTimeSlotOptions(options);
        setBookingStage("time");
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              options.length > 0
                ? "Pick a 3-hour time slot from the selection card below."
                : "No slots found for that date. Please share another date (YYYY-MM-DD).",
          },
        ]);
        if (options.length === 0) setBookingStage("date");
      } catch (e) {
        console.error("Failed to load timeslots for chat booking", e);
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Could not load time slots. Try another date." },
        ]);
      }
      return;
    }
    if (bookingStage === "time") {
      const slot = findTimeSlotFromInput(text, timeSlotOptions) || "";
      if (!slot) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "Please pick a valid time slot. You can enter slot number, full slot text, or an hour like 7 / 8 / 13.",
          },
        ]);
        return;
      }
      setBookingDraft((prev) => ({ ...prev, time: slot }));
      if (savedCard) {
        setUseSavedCardForOrder(false);
        setBookingStage("useSavedCard");
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              `I found your saved ${savedCard.cardType} ending in ${savedCard.last4}` +
              `${savedCard.expiryMMYY ? ` (exp ${savedCard.expiryMMYY})` : ""}. ` +
              `Type "yes" to use this card, or "no" to enter new card details.`,
          },
        ]);
      } else {
        setBookingStage("cardnumber");
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "Great. Now payment details. Enter card number (you can paste with spaces).",
          },
        ]);
      }
      return;
    }
    if (bookingStage === "city") {
      const city = detectBCity(text);
      const fallbackCity = extractLikelyCity(text);
      if (!city && !fallbackCity) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "Please enter a valid city name (e.g., Vancouver, Toronto, Calgary).",
          },
        ]);
        return;
      }
      setBookingDraft((prev) => ({ ...prev, city: city || fallbackCity || "" }));
      if (savedCard) {
        setBookingStage("useSavedCard");
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              `I found your saved ${savedCard.cardType} ending in ${savedCard.last4}` +
              `${savedCard.expiryMMYY ? ` (exp ${savedCard.expiryMMYY})` : ""}. ` +
              `Type "yes" to use this card, or "no" to enter new card details.`,
          },
        ]);
      } else {
        setBookingStage("cardnumber");
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "Great. Payment details: enter card number (you can paste with spaces).",
          },
        ]);
      }
      return;
    }
    if (bookingStage === "useSavedCard") {
      const reply = text.toLowerCase().trim();
      if (reply === "yes" || reply === "y") {
        if (!savedCard) {
          setBookingStage("cardnumber");
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: "Saved card not available. Please enter card number." },
          ]);
          return;
        }
        setBookingDraft((prev) => ({
          ...prev,
          cardnumber: savedCard.token,
          expirydate: savedCard.expiryMMYY || prev.expirydate,
          holdername: savedCard.holderName || prev.holdername,
        }));
        setUseSavedCardForOrder(true);
        setBookingStage("cvv");
        setPaymentCvvInput("");
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              `Perfect, using saved card ${savedCard.cardType} •••• ${savedCard.last4}. ` +
              `For security, please enter CVV.`,
          },
        ]);
      } else if (reply === "no" || reply === "n") {
        setUseSavedCardForOrder(false);
        setBookingStage("cardnumber");
        setPaymentCardNumberInput("");
        setPaymentExpiryInput("");
        setPaymentCvvInput("");
        setPaymentHolderInput("");
        setPaymentPostalInput("");
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "No problem. Please enter new card number." },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `Please type "yes" to use saved card or "no" to enter new details.` },
        ]);
      }
      return;
    }
    if (bookingStage === "cardnumber") {
      if (!validateCardNumber(text)) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Please enter a valid card number." },
        ]);
        return;
      }
      setBookingDraft((prev) => ({ ...prev, cardnumber: text }));
      setBookingStage("expirydate");
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Enter expiry date (MM/YY)." },
      ]);
      return;
    }
    if (bookingStage === "expirydate") {
      if (!validateExpiryDate(text)) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Please enter a valid expiry date in MM/YY format." },
        ]);
        return;
      }
      setBookingDraft((prev) => ({ ...prev, expirydate: text }));
      setBookingStage("cvv");
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Enter CVV." },
      ]);
      return;
    }
    if (bookingStage === "cvv") {
      const cvv = text.replace(/\D/g, "");
      if (cvv.length < 3 || cvv.length > 4) {
        setMessages((prev) => [...prev, { role: "assistant", content: "Please enter a valid CVV (3 or 4 digits)." }]);
        return;
      }
      setBookingDraft((prev) => ({ ...prev, cvv: text }));
      if (useSavedCardForOrder) {
        setBookingStage("notes");
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Any additional services or notes? Type notes, or type 'skip'." },
        ]);
      } else {
        setBookingStage("holdername");
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Enter card holder name." },
        ]);
      }
      return;
    }
    if (bookingStage === "holdername") {
      setBookingDraft((prev) => ({ ...prev, holdername: text }));
      setBookingStage("postalcode");
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Enter card postal code." },
      ]);
      return;
    }
    if (bookingStage === "postalcode") {
      if (!text.trim()) {
        setMessages((prev) => [...prev, { role: "assistant", content: "Postal code cannot be empty." }]);
        return;
      }
      setBookingDraft((prev) => ({ ...prev, postalcode: text.trim() }));
      setBookingStage("notes");
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Any additional services or notes? Type notes, or type 'skip'." },
      ]);
      return;
    }
    if (bookingStage === "notes") {
      const notes = text.toLowerCase() === "skip" ? "" : text;
      const draft = { ...bookingDraft, notes };
      setBookingDraft(draft);
      setBookingStage("confirm");
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            `Please confirm to place order:\n` +
            `Address: ${draft.address}\nCity: ${draft.city}\n` +
            `Home Size: ${draft.homesize}\nLot Size: ${draft.lotsize}\n` +
            `Category: ${draft.category}\nService: ${draft.serviceName}\n` +
            `Date: ${draft.date}\nTime: ${draft.time}\n\n` +
            `Reply: yes to submit, or no to cancel.`,
        },
      ]);
      return;
    }
    if (bookingStage === "confirm") {
      const lc = text.toLowerCase().trim();
      const editMatch = lc.match(/^edit\s+(.+)$/);
      if (editMatch) {
        const stage = editFieldToStage(editMatch[1]);
        if (!stage) {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content:
                "Unknown field. Use: edit address|city|homesize|lotsize|date|time|cardnumber|expiry|cvv|holdername|postalcode|notes",
            },
          ]);
          return;
        }
        setBookingStage(stage);
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `Okay, updating ${editMatch[1]}. Please enter new value.` },
        ]);
        return;
      }
      if (lc !== "yes") {
        setBookingStage("idle");
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Okay, cancelled. Say 'book service' whenever you want to restart." },
        ]);
        return;
      }

      setLoading(true);
      setMessages((prev) => [...prev, { role: "assistant", content: "Placing your order..." }]);
      try {
        const finalDraft = { ...bookingDraft };
        const { calc, orderRes } = await submitOrderFromChat(finalDraft);
        const reservationId =
          String((orderRes as any)?.orderid ?? (orderRes as any)?.id ?? (orderRes as any)?.order_id ?? "").trim() ||
          `KT-${Math.floor(Date.now() / 1000).toString().slice(-4)}${Math.floor(Math.random() * 1000)}`;
        setBookingConfirmation({
          reservationId,
          propertyAddress: finalDraft.address || "",
          city: finalDraft.city || "",
          date: finalDraft.date || "",
          time: finalDraft.time || "",
          totalAmount: String(calc.totalamount ?? calc.paymentgatewayamount ?? ""),
        });
        setBookingStage("confirmed");
        setMessages([]);
      } catch (e: any) {
        console.error("Failed to submit chat order", e);
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `Order submission failed. ${e?.message || "Please try again."}` },
        ]);
      } finally {
        setLoading(false);
      }
      return;
    }

    // Interruption handling: if a new intent appears while collecting a field, route to new intent.
    if (pendingField !== "none" && intent !== "unknown") {
      setPendingField("none");
    }

    if (intent === "show_recent_properties") {
      if (userType === "existing" || resolvedUserId) {
        await showRecentProperties();
      } else {
        setPendingField("lookup");
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "Absolutely — I can pull your recent properties once I verify your account. Please share the email or phone linked to Cotala.",
          },
        ]);
      }
      return;
    }

    if (pendingField === "lookup") {
      if (looksLikeLookupIdentifier(text)) {
        setUserType("guest");
        setPendingField("none");
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "Thanks — account lookup by email/phone is not wired in this build yet. I can continue as guest and help with package recommendation or booking now.",
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Please share a valid email or phone number so I can try account lookup." },
        ]);
      }
      return;
    }

    if (intent === "recommend_package" || intent === "ask_pricing") {
      setPendingField("none");
      setBookingStage("address");
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
              "Let's skip package suggestions and go straight to booking. Please share full Canada property address with city (e.g., 123 Main St, Vancouver, Canada).",
        },
      ]);
      return;
    }

    if (intent === "reorder_service") {
      await showRecentOrdersForReorder();
      return;
    }

    if (intent === "start_booking") {
      setPendingField("none");
      setBookingStage("address");
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Perfect — let's start your order flow. Please share full property address with city, e.g. 123 Main St, Vancouver.",
        },
      ]);
      return;
    }

    if (intent === "ask_services") {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "We offer Photography, HDR, Floorplans, Matterport, Drone, Video Walkthroughs, Feature Sheets, and social add-ons. Tell me your service goal and I will guide booking step-by-step.",
        },
      ]);
      return;
    }

    // Context guard: do not fall back to AI when an in-progress booking step is incomplete.
    if (bookingStage !== "idle" && bookingStage !== "confirmed") {
      const hint = getIncompleteStepHint(bookingStage, Boolean(bookingDraft.address && bookingDraft.city));
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            `Looks like we are out of context for the current booking step.\n` +
            `Current step: ${bookingStage}\n` +
            `${hint}`,
        },
      ]);
      return;
    }

    // Booking-only fallback (no package/chatbot freeform suggestions)
    setPendingField("none");
    setBookingStage("address");
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content:
          "I am your booking assistant. Please choose city from below or enter full Canada property address with city to continue booking.",
      },
    ]);
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    await processInput(text);
  };

  const handleMicClick = () => {
    if (!speechSupported || loading) return;
    const recognition = recognitionRef.current;
    if (!recognition) return;

    if (isListening) {
      recognition.stop();
      setIsListening(false);
      return;
    }

    try {
      setIsListening(true);
      recognition.start();
    } catch {
      setIsListening(false);
    }
  };

  return (
    <div
      className={
        isOpen
          ? "cotala-chat-widget cotala-chat-open fixed inset-0 z-[120] bg-black"
          : "cotala-chat-widget fixed bottom-2 left-16 right-2 px-0 sm:px-0 sm:bottom-6 sm:right-6 sm:left-auto z-[120]"
      }
    >
      {!isOpen ? (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="cotala-chat-fab h-14 w-14 rounded-full text-white shadow-2xl flex items-center justify-center"
          aria-label="Open chat widget"
        >
          <MessageCircle className="h-6 w-6" />
        </button>
      ) : (
        <div className="h-full w-full flex flex-col">
          <div className="cotala-chat-header flex items-center justify-between px-6 py-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => window.history.back()}
                className="cotala-chat-icon-btn h-9 w-9 rounded-full border flex items-center justify-center"
                aria-label="Go back"
                title="Back"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div>
              <p className="text-white font-bold text-lg">Cotala</p>
              <p className="cotala-chat-muted text-xs">Hi {resolvedName}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="cotala-chat-muted text-xs hidden sm:block">Scheduling Assistant</div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="cotala-chat-icon-btn h-9 w-9 rounded-full flex items-center justify-center"
                aria-label="Close chat widget"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div ref={listRef} className="cotala-chat-messages flex-1 overflow-y-auto p-6 space-y-4 max-w-4xl w-full mx-auto">
            {bookingStage === "confirmed" && bookingConfirmation ? (
              <div className="w-full flex flex-col items-center justify-center gap-6">
                <div className="mb-2 w-20 h-20 rounded-full bg-emerald-50 flex items-center justify-center">
                  <CheckCircle2 className="h-10 w-10 text-emerald-600" />
                </div>
                <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Booking Confirmed</h1>
                <p className="text-slate-600 text-sm">Reservation ID: #{bookingConfirmation.reservationId}</p>

                <div className="w-full rounded-[2rem] shadow-[0_20px_50px_rgba(0,0,0,0.04)] border border-slate-200 bg-white p-8">
                  <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                    <div className="bg-slate-50 p-5 rounded-2xl text-left">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block mb-2">
                        Property Address
                      </span>
                      <p className="font-semibold text-slate-900 break-words">
                        {bookingConfirmation.propertyAddress || "—"}
                      </p>
                      {bookingConfirmation.city ? (
                        <p className="text-sm text-slate-600">{bookingConfirmation.city}</p>
                      ) : null}
                    </div>
                    <div className="bg-slate-50 p-5 rounded-2xl text-left">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block mb-2">
                        Date &amp; Time
                      </span>
                      <p className="font-semibold text-slate-900">
                        {bookingConfirmation.date ? formatDateDisplay(bookingConfirmation.date) : "—"}
                      </p>
                      <p className="text-sm text-slate-600">{bookingConfirmation.time || "—"}</p>
                    </div>
                  </div>

                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block mb-1">
                        Total Amount
                      </span>
                      <p className="text-2xl font-black text-slate-900 headline-font">
                        ${bookingConfirmation.totalAmount || "0.00"}
                      </p>
                    </div>
                    <div className="bg-emerald-100 px-4 py-2 rounded-full">
                      <span className="text-xs font-bold text-emerald-800">PAID IN FULL</span>
                    </div>
                  </div>
                </div>

                <div className="w-full flex flex-col sm:flex-row gap-3 sm:items-center justify-center">
                  <button
                    type="button"
                    onClick={() => {
                      window.location.href = "/orders";
                    }}
                    className="w-full sm:w-auto px-12 py-4 bg-black text-white rounded-full font-bold text-sm shadow-xl hover:shadow-2xl transition-all active:scale-95 flex items-center justify-center gap-2"
                  >
                    View My Bookings
                  </button>
                </div>

                {messages.map((m, idx) => (
                  <div key={`${m.role}-${idx}`} className="w-full">
                    <ChatMessage role={m.role} content={m.content} />
                  </div>
                ))}

                {loading && <ChatMessage role="assistant" content="Typing..." />}
              </div>
            ) : (
              <>
                {messages.map((m, idx) => (
                  <div key={`${m.role}-${idx}`} className="space-y-2">
                    <ChatMessage role={m.role} content={m.content} />
                  </div>
                ))}
                {loading && <ChatMessage role="assistant" content="Typing..." />}
              </>
            )}
          </div>

          {servicePreview && (
            <div
              className="fixed inset-0 z-[250] bg-black/40 backdrop-blur-sm flex items-center justify-center px-4"
              onClick={() => setServicePreview(null)}
              role="dialog"
              aria-modal="true"
            >
              <div
                className="w-full max-w-2xl rounded-3xl bg-white border border-slate-200 shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-b border-slate-200">
                  <div className="text-sm font-bold text-slate-900">Service Preview</div>
                  <button
                    type="button"
                    onClick={() => setServicePreview(null)}
                    className="h-9 w-9 rounded-full bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 flex items-center justify-center"
                    aria-label="Close preview"
                    title="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="p-5">
                  <p className="text-xs font-semibold text-slate-700 mb-3">{servicePreview.title}</p>
                  <img
                    src={servicePreview.image}
                    alt={servicePreview.title}
                    className="w-full max-h-[60vh] object-contain rounded-lg bg-slate-50"
                  />
                </div>
              </div>
            </div>
          )}

          {photoComparisonOpen && (
            <div
              className="fixed inset-0 z-[240] bg-black/40 backdrop-blur-sm flex items-center justify-center px-4"
              onClick={() => setPhotoComparisonOpen(false)}
              role="dialog"
              aria-modal="true"
            >
              <div
                className="w-full max-w-3xl rounded-3xl bg-white border border-slate-200 shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-b border-slate-200">
                  <div className="text-sm font-bold text-slate-900">Standard &amp; HDR Comparison</div>
                  <button
                    type="button"
                    onClick={() => setPhotoComparisonOpen(false)}
                    className="h-9 w-9 rounded-full bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 flex items-center justify-center"
                    aria-label="Close comparison"
                    title="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="p-5">
                  <p className="text-xs text-slate-600 mb-3">Preview image (Standard vs HDR)</p>
                  <img
                      src={hdrComparisonImg}
                    alt="Standard & HDR comparison"
                    className="w-full max-h-[70vh] object-contain rounded-lg bg-slate-50"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="cotala-chat-footer border-t p-4 max-w-4xl w-full mx-auto">
            {bookingStage === "address" && (
              <div className="cotala-chat-panel mb-3 rounded-2xl border p-3 shadow-sm">
                <div className="mb-2">
                  <h4 className="text-sm font-bold text-slate-900">Property Address (BC)</h4>
                  <p className="text-xs text-slate-500">Type/select full address, city must be in British Columbia</p>
                </div>
                <input
                  ref={addressInputRef}
                  value={addressInputValue}
                  onChange={(e) => handleAddressChange(e.target.value)}
                  placeholder="123 Main St, Vancouver"
                  className="w-full h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none focus:border-[#b284f6]"
                />
                {recentListings.length > 0 && (
                  <div className="mt-2 max-h-40 overflow-y-auto space-y-1">
                    {recentListings
                      .map((tour: any) => `${tour.address || ""}${tour.city ? `, ${tour.city}` : ""}`.trim())
                      .filter((addr) => addr && (!addressInputValue || addr.toLowerCase().includes(addressInputValue.toLowerCase())))
                      .slice(0, 5)
                      .map((addr, idx) => (
                        <button
                          key={`${addr}-${idx}`}
                          type="button"
                          onClick={() => {
                            handleAddressChange(addr);
                            void processInput(addr);
                          }}
                          className="w-full text-left px-3 py-2 rounded-lg text-xs bg-slate-50 hover:bg-slate-100 border border-slate-200"
                        >
                          {addr}
                        </button>
                      ))}
                  </div>
                )}
                <div className="mt-3 rounded-xl overflow-hidden border border-slate-200">
                  <iframe
                    title="Address map preview"
                    src={`https://maps.google.com/maps?q=${encodeURIComponent(
                      addressInputValue?.trim() ? addressInputValue : "Vancouver, Canada",
                    )}&z=13&output=embed`}
                    className="w-full h-52"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                </div>
                <button
                  type="button"
                  disabled={!addressInputValue.trim() || loading}
                  onClick={() => void processInput(addressInputValue)}
                  className="mt-3 w-full rounded-full bg-black text-white py-2 text-xs font-semibold disabled:opacity-50"
                >
                  Confirm Address
                </button>
              </div>
            )}
            {bookingStage === "city" && (
              <div className="cotala-chat-panel mb-3 rounded-2xl border p-3 shadow-sm">
                <div className="mb-2">
                  <h4 className="text-sm font-bold text-slate-900">Select BC City</h4>
                  <p className="text-xs text-slate-500">Choose a city we currently serve in British Columbia</p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-56 overflow-y-auto">
                  {britishColumbiaCities.map((city) => (
                    <button
                      key={city}
                      type="button"
                      onClick={() => void processInput(city)}
                      className="px-3 py-2 rounded-lg text-xs bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-left"
                    >
                      {city}
                    </button>
                  ))}
                </div>
                <div className="mt-3 rounded-xl overflow-hidden border border-slate-200">
                  <iframe
                    title="City map preview"
                    src={`https://maps.google.com/maps?q=${encodeURIComponent(
                      `${bookingDraft.city || "Vancouver"}, Canada`,
                    )}&z=12&output=embed`}
                    className="w-full h-52"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                </div>
              </div>
            )}
            {/* Service selection mini-app */}
            {bookingStage === "selectReorder" && recentOrders.length > 0 && (
              <div className="cotala-chat-panel mb-3 rounded-2xl border p-3 shadow-sm">
                <div className="mb-2">
                  <h4 className="text-sm font-bold text-slate-900">Reorder Selection</h4>
                  <p className="text-xs text-slate-500">Select one recent order</p>
                </div>
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {recentOrders.map((order, i) => {
                    const selected = uiSelectedReorderIndex === i + 1;
                    const addr = `${(order as any)?.tourdetails?.address || "Address"}${
                      (order as any)?.tourdetails?.city ? `, ${(order as any).tourdetails.city}` : ""
                    }`;
                    return (
                      <button
                        key={`${order.id}-${i}`}
                        type="button"
                        onClick={() => setUiSelectedReorderIndex(i + 1)}
                        className={`w-full text-left px-3 py-2 rounded-xl border transition ${
                          selected
                            ? "border-[#b284f6] bg-[#f3ecff]"
                            : "border-slate-200 bg-slate-50 hover:bg-slate-100"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-slate-700">
                            {i + 1}. Order #{order.id} - {addr}
                          </span>
                          <span className="text-xs font-semibold text-slate-900">
                            {order.total ? `$${order.total}` : "-"}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  disabled={!uiSelectedReorderIndex || loading}
                  onClick={() => {
                    if (!uiSelectedReorderIndex) return;
                    void processInput(String(uiSelectedReorderIndex));
                  }}
                  className="mt-3 w-full rounded-full bg-black text-white py-2 text-xs font-semibold disabled:opacity-50"
                >
                  Confirm Selection
                </button>
              </div>
            )}

            {/* Service selection mini-app */}
            {bookingStage === "category" && categoryOptions.length > 0 && (
              <div className="cotala-chat-panel mb-3 rounded-2xl border p-3 shadow-sm">
                <div className="mb-2">
                  <h4 className="text-sm font-bold text-slate-900">Category Selection</h4>
                  <p className="text-xs text-slate-500">Select one or more categories</p>
                </div>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {categoryOptions.map((c, i) => {
                    const selected = uiSelectedCategoryIndexes.includes(i + 1);
                    const currentCategoryLower = String(c || "").toLowerCase();
                    const isPhotographyCategory = currentCategoryLower.includes("photo");
                    const selectedByDraft = String(bookingDraft.category || "").toLowerCase().includes(currentCategoryLower);
                    const showComparisonUnderThisRow = isPhotographyCategory && (selected || selectedByDraft);
                    return (
                      <div key={`${c}-${i}`} className="space-y-2">
                        <button
                          type="button"
                          onClick={() => {
                            setUiSelectedCategoryIndexes((prev) =>
                              prev.includes(i + 1) ? prev.filter((x) => x !== i + 1) : [...prev, i + 1],
                            );
                          }}
                          className={`w-full text-left px-3 py-2 rounded-xl border transition ${
                            selected
                              ? "border-[#b284f6] bg-[#f3ecff]"
                              : "border-slate-200 bg-slate-50 hover:bg-slate-100"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs text-slate-700">
                              {i + 1}. {c}
                            </span>
                            <span
                              className={`h-4 w-4 rounded border ${
                                selected ? "bg-[#b284f6] border-[#b284f6]" : "bg-white border-slate-300"
                              }`}
                            />
                          </div>
                        </button>

                        {showComparisonUnderThisRow && (
                          <button
                            type="button"
                            onClick={() => setPhotoComparisonOpen(true)}
                            className="w-full rounded-full bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 py-2 text-xs font-semibold"
                          >
                            View Standard &amp; HDR Comparison
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
                <button
                  type="button"
                  disabled={uiSelectedCategoryIndexes.length === 0 || loading}
                  onClick={() => {
                    const value = uiSelectedCategoryIndexes.sort((a, b) => a - b).join(",");
                    void processInput(value);
                  }}
                  className="mt-3 w-full rounded-full bg-black text-white py-2 text-xs font-semibold disabled:opacity-50"
                >
                  Confirm Selection
                </button>
              </div>
            )}

            {/* Service selection mini-app */}
            {bookingStage === "service" && serviceOptions.length > 0 && (
              <div className="cotala-chat-panel mb-3 rounded-2xl border p-3 shadow-sm">
                <div className="mb-2">
                  <h4 className="text-sm font-bold text-slate-900">Service Selection</h4>
                  <p className="text-xs text-slate-500">Select one or more services</p>
                </div>
                {bookingDraft.category.toLowerCase().includes("photo") && (
                  <button
                    type="button"
                    onClick={() => setPhotoComparisonOpen(true)}
                    className="mb-3 w-full rounded-full bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 py-2 text-xs font-semibold"
                  >
                    View Standard &amp; HDR Comparison
                  </button>
                )}
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {serviceOptions.slice(0, 12).map((s, i) => {
                    const selected = uiSelectedServiceIndexes.includes(i + 1);
                    return (
                      <div
                        key={`${s.id}-${i}`}
                        className={`w-full text-left px-3 py-2 rounded-xl border transition ${
                          selected
                            ? "border-[#b284f6] bg-[#f3ecff]"
                            : "border-slate-200 bg-slate-50 hover:bg-slate-100"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setUiSelectedServiceIndexes((prev) =>
                                prev.includes(i + 1) ? prev.filter((x) => x !== i + 1) : [...prev, i + 1],
                              );
                            }}
                            className="flex-1 text-left"
                          >
                            <span className="text-xs text-slate-700">
                              {i + 1}. {s.name}
                            </span>
                          </button>
                          <div className="flex items-center gap-2">
                            <div className="relative">
                              <button
                              type="button"
                              onClick={() => {
                                const preview = getServicePreviewForName(String(s.name || ""));
                                if (!preview) {
                                  setServiceInfoTooltip({
                                    key: String(s.id ?? s.name ?? i),
                                    text: `Preview not available for "${String(s.name || "")}".`,
                                  });
                                  window.setTimeout(() => setServiceInfoTooltip(null), 2500);
                                  return;
                                }
                                setServicePreview({ title: String(s.name), image: preview });
                              }}
                              className="h-7 w-7 rounded-full border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 flex items-center justify-center"
                              aria-label={`Show preview for ${s.name}`}
                              title="Service preview"
                            >
                              <Info className="h-3.5 w-3.5" />
                            </button>
                              {serviceInfoTooltip &&
                                serviceInfoTooltip.key === String(s.id ?? s.name ?? i) && (
                                  <div className="absolute z-[260] bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-xs rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700 shadow-lg">
                                    {serviceInfoTooltip.text}
                                  </div>
                                )}
                            </div>
                            <span
                              className={`h-4 w-4 rounded border ${
                                selected ? "bg-[#b284f6] border-[#b284f6]" : "bg-white border-slate-300"
                              }`}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <button
                  type="button"
                  disabled={uiSelectedServiceIndexes.length === 0 || loading}
                  onClick={() => {
                    const value = uiSelectedServiceIndexes.sort((a, b) => a - b).join(",");
                    void processInput(value);
                  }}
                  className="mt-3 w-full rounded-full bg-black text-white py-2 text-xs font-semibold disabled:opacity-50"
                >
                  Confirm Selection
                </button>
              </div>
            )}

            {bookingStage === "date" && (
              <div className="cotala-chat-panel mb-3 rounded-2xl border p-3 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="text-sm font-bold text-slate-900">
                    {calendarMonth.toLocaleString("en-US", { month: "long", year: "numeric" })}
                  </h4>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        setCalendarMonth(
                          (prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1),
                        )
                      }
                      className="h-7 w-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs"
                      aria-label="Previous month"
                    >
                      {"<"}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setCalendarMonth(
                          (prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1),
                        )
                      }
                      className="h-7 w-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs"
                      aria-label="Next month"
                    >
                      {">"}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-1 mb-2 text-center text-[10px] font-semibold text-slate-500">
                  {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
                    <div key={d} className="py-1">
                      {d}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-1">
                  {(() => {
                    const year = calendarMonth.getFullYear();
                    const month = calendarMonth.getMonth();
                    const firstDay = new Date(year, month, 1);
                    const firstWeekday = (firstDay.getDay() + 6) % 7;
                    const daysInMonth = new Date(year, month + 1, 0).getDate();
                    const today = formatDateYMD(new Date());
                    const cells: JSX.Element[] = [];

                    for (let i = 0; i < firstWeekday; i += 1) {
                      cells.push(<div key={`blank-${i}`} className="h-8" />);
                    }
                    for (let day = 1; day <= daysInMonth; day += 1) {
                      const d = new Date(year, month, day);
                      const ymd = formatDateYMD(d);
                      const selected = ymd === datePickerValue;
                      const disabled = ymd < today;
                      cells.push(
                        <button
                          key={ymd}
                          type="button"
                          disabled={disabled}
                          onClick={() => setDatePickerValue(ymd)}
                          className={`h-8 rounded-lg text-xs ${
                            selected
                              ? "bg-black text-white"
                              : disabled
                                ? "text-slate-300 cursor-not-allowed"
                                : "text-slate-700 hover:bg-slate-100"
                          }`}
                        >
                          {day}
                        </button>,
                      );
                    }
                    return cells;
                  })()}
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <input
                    ref={dateInputRef}
                    type="date"
                    value={datePickerValue}
                    min={new Date().toISOString().split("T")[0]}
                    onChange={(e) => setDatePickerValue(e.target.value)}
                    className="flex-1 h-9 rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs text-slate-900 outline-none focus:border-[#b284f6]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const el = dateInputRef.current as HTMLInputElement & { showPicker?: () => void };
                      if (!el) return;
                      if (typeof el.showPicker === "function") {
                        el.showPicker();
                      } else {
                        el.focus();
                        el.click();
                      }
                    }}
                    className="h-9 rounded-lg px-3 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700"
                  >
                    Open
                  </button>
                </div>
                <button
                  type="button"
                  disabled={!datePickerValue || loading}
                  onClick={() => {
                    void processInput(datePickerValue);
                  }}
                  className="mt-3 w-full rounded-full bg-black text-white py-2 text-xs font-semibold disabled:opacity-50"
                >
                  Confirm Date
                </button>
              </div>
            )}

            {/* Time slot mini-app */}
            {bookingStage === "time" && timeSlotOptions.length > 0 && (
              <div className="mb-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="mb-2">
                  <h4 className="text-sm font-bold text-slate-900">Available 3-hour slots</h4>
                </div>
                <div className="space-y-2">
                  {timeSlotOptions.map((slot, idx) => (
                    <button
                      key={`${slot}-${idx}`}
                      type="button"
                      onClick={() => {
                        void processInput(String(idx + 1));
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs text-slate-700"
                    >
                      {idx + 1}. {slot}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Card details mini-app hint */}
            {(bookingStage === "useSavedCard" ||
              bookingStage === "cardnumber" ||
              bookingStage === "expirydate" ||
              bookingStage === "cvv" ||
              bookingStage === "holdername" ||
              bookingStage === "postalcode") && (
              <div className="mb-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_20px_40px_rgba(0,0,0,0.06)]">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-base font-extrabold tracking-tight text-slate-900">Secure Checkout</h4>
                    <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-500 uppercase tracking-wider">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      <span>SSL Secure</span>
                      <span className="opacity-40">•</span>
                      <span>Encrypted</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Amount</p>
                    <p className="text-xl font-extrabold tracking-tight text-slate-900">At Confirmation</p>
                  </div>
                </div>

                <div className="space-y-3">
                  {bookingStage === "useSavedCard" && savedCard ? (
                    <div className="rounded-xl border border-[#d8bcff] bg-[#f3ecff] p-3">
                      <p className="text-xs text-slate-700">
                        Saved card available: {savedCard.cardType} ending {savedCard.last4}
                        {savedCard.expiryMMYY ? ` (exp ${savedCard.expiryMMYY})` : ""}
                      </p>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            void processInput("yes");
                          }}
                          className="rounded-full bg-black text-white py-2 text-xs font-semibold"
                        >
                          Use Saved Card
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            void processInput("no");
                          }}
                          className="rounded-full bg-white text-slate-700 border border-slate-200 py-2 text-xs font-semibold"
                        >
                          Enter New Card
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                  <div className="rounded-xl bg-slate-100 p-3">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Card Number</p>
                    <div className="mt-1 flex items-center justify-between">
                      {bookingStage === "cardnumber" ? (
                        <input
                          type="text"
                          value={paymentCardNumberInput}
                          onChange={(e) => setPaymentCardNumberInput(formatCardNumberForUI(e.target.value))}
                          placeholder="0000 0000 0000 0000"
                          className="w-full bg-transparent font-mono text-sm text-slate-800 outline-none"
                        />
                      ) : (
                        <p className="font-mono text-sm text-slate-800">
                          {bookingDraft.cardnumber
                            ? bookingDraft.cardnumber.replace(/\s+/g, "").replace(/\d(?=\d{4})/g, "*")
                            : "0000 0000 0000 0000"}
                        </p>
                      )}
                      <CreditCard className="h-4 w-4 text-slate-400" />
                    </div>
                    {bookingStage === "cardnumber" && (
                      <p className="mt-1 text-[11px] text-[#8e5ce0]">Enter card number here.</p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-slate-100 p-3">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Expiry</p>
                      {bookingStage === "expirydate" ? (
                        <input
                          type="text"
                          value={paymentExpiryInput}
                          onChange={(e) => setPaymentExpiryInput(formatExpiryForUI(e.target.value))}
                          placeholder="MM/YY"
                          className="mt-1 w-full bg-transparent font-mono text-sm text-slate-800 outline-none"
                        />
                      ) : (
                        <input
                          type="text"
                          value={paymentExpiryInput}
                          onChange={(e) => setPaymentExpiryInput(formatExpiryForUI(e.target.value))}
                          placeholder="MM/YY"
                          className="mt-1 w-full bg-transparent font-mono text-sm text-slate-800 outline-none"
                        />
                      )}
                      {bookingStage === "expirydate" && (
                        <p className="mt-1 text-[11px] text-[#8e5ce0]">Enter expiry in MM/YY here.</p>
                      )}
                    </div>
                    <div className="rounded-xl bg-slate-100 p-3">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">CVC</p>
                      {bookingStage === "cvv" ? (
                        <input
                          type="password"
                          value={paymentCvvInput}
                          onChange={(e) => setPaymentCvvInput(e.target.value)}
                          placeholder="***"
                          className="mt-1 w-full bg-transparent font-mono text-sm text-slate-800 outline-none"
                        />
                      ) : (
                        <input
                          type="password"
                          value={paymentCvvInput}
                          onChange={(e) => setPaymentCvvInput(e.target.value)}
                          placeholder="***"
                          className="mt-1 w-full bg-transparent font-mono text-sm text-slate-800 outline-none"
                        />
                      )}
                      {bookingStage === "cvv" && (
                        <p className="mt-1 text-[11px] text-[#8e5ce0]">Enter 3 or 4 digits here.</p>
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl bg-slate-100 p-3">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Card Holder</p>
                    {bookingStage === "holdername" ? (
                      <input
                        type="text"
                        value={paymentHolderInput}
                        onChange={(e) => setPaymentHolderInput(e.target.value)}
                        placeholder="Full name on card"
                        className="mt-1 w-full bg-transparent text-sm text-slate-800 outline-none"
                      />
                    ) : (
                      <input
                        type="text"
                        value={paymentHolderInput}
                        onChange={(e) => setPaymentHolderInput(e.target.value)}
                        placeholder="Full name on card"
                        className="mt-1 w-full bg-transparent text-sm text-slate-800 outline-none"
                      />
                    )}
                    {bookingStage === "holdername" && (
                      <p className="mt-1 text-[11px] text-[#8e5ce0]">Enter card holder name here.</p>
                    )}
                  </div>

                  <div className="rounded-xl bg-slate-100 p-3">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Postal Code</p>
                    {bookingStage === "postalcode" ? (
                      <input
                        type="text"
                        value={paymentPostalInput}
                        onChange={(e) => setPaymentPostalInput(e.target.value)}
                        placeholder="Postal code"
                        className="mt-1 w-full bg-transparent text-sm text-slate-800 outline-none"
                      />
                    ) : (
                      <input
                        type="text"
                        value={paymentPostalInput}
                        onChange={(e) => setPaymentPostalInput(e.target.value)}
                        placeholder="Postal code"
                        className="mt-1 w-full bg-transparent text-sm text-slate-800 outline-none"
                      />
                    )}
                    {bookingStage === "postalcode" && (
                      <p className="mt-1 text-[11px] text-[#8e5ce0]">Enter postal code now.</p>
                    )}
                  </div>
                    </>
                  )}
                </div>

                {bookingStage !== "useSavedCard" && (
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => {
                        const cardNo = paymentCardNumberInput.trim();
                        const expiry = paymentExpiryInput.trim();
                        const cvv = paymentCvvInput.trim();
                        const holder = paymentHolderInput.trim();
                        const postal = paymentPostalInput.trim();

                        if (!cardNo || !expiry || !cvv || !holder || !postal) {
                          setMessages((prev) => [
                            ...prev,
                            {
                              role: "assistant",
                              content:
                                "Please fill all payment fields (card number, expiry, CVV, card holder, postal code).",
                            },
                          ]);
                          return;
                        }
                        if (!validateCardNumber(cardNo)) {
                          setMessages((prev) => [...prev, { role: "assistant", content: "Please enter a valid card number." }]);
                          return;
                        }
                        if (!validateExpiryDate(expiry)) {
                          setMessages((prev) => [
                            ...prev,
                            { role: "assistant", content: "Please enter a valid expiry date in MM/YY format." },
                          ]);
                          return;
                        }
                        const cvvDigits = cvv.replace(/\D/g, "");
                        if (cvvDigits.length < 3 || cvvDigits.length > 4) {
                          setMessages((prev) => [
                            ...prev,
                            { role: "assistant", content: "Please enter a valid CVV (3 or 4 digits)." },
                          ]);
                          return;
                        }

                        setBookingDraft((prev) => ({
                          ...prev,
                          cardnumber: cardNo,
                          expirydate: expiry,
                          cvv,
                          holdername: holder,
                          postalcode: postal,
                        }));
                        setBookingStage("notes");
                        setMessages((prev) => [
                          ...prev,
                          { role: "assistant", content: "Payment details captured. Any additional services or notes? Type notes, or type 'skip'." },
                        ]);
                      }}
                      disabled={
                        loading ||
                        !paymentCardNumberInput.trim() ||
                        !paymentExpiryInput.trim() ||
                        !paymentCvvInput.trim() ||
                        !paymentHolderInput.trim() ||
                        !paymentPostalInput.trim()
                      }
                      className="w-full h-10 rounded-full bg-black text-white text-xs font-semibold disabled:opacity-50"
                    >
                      Proceed
                    </button>
                  </div>
                )}

                <div className="mt-3 rounded-2xl bg-slate-50 p-3 flex items-start gap-2">
                  <ShieldCheck className="h-4 w-4 text-slate-500 mt-0.5 shrink-0" />
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    Your payment is processed through a PCI-compliant gateway. Cotala does not store your full card
                    details on our servers.
                  </p>
                </div>
              </div>
            )}

            {/* Confirmation summary mini-app */}
            {bookingStage === "confirm" && (
              <div className="mb-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <h4 className="text-sm font-bold text-slate-900">Booking Summary</h4>
                </div>
                <div className="text-xs text-slate-600 space-y-1">
                  <p>Address: {bookingDraft.address}</p>
                  <p>Date/Time: {bookingDraft.date} • {bookingDraft.time}</p>
                  <p>Services: {bookingDraft.serviceName}</p>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setInput("yes");
                    }}
                    className="rounded-full bg-black text-white py-2 text-xs font-semibold"
                  >
                    Confirm (Yes)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setInput("no");
                    }}
                    className="rounded-full bg-slate-100 text-slate-700 py-2 text-xs font-semibold"
                  >
                    Cancel (No)
                  </button>
                </div>
              </div>
            )}
            <div className="flex items-center gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Type a message..."
                className="cotala-chat-input flex-1 h-10 rounded-full border px-4 text-sm outline-none focus:border-[#b388ff]"
              />
              <button
                type="button"
                onClick={handleMicClick}
                disabled={!speechSupported || loading}
                className={`h-10 w-10 rounded-full text-white flex items-center justify-center disabled:opacity-50 ${
                  isListening ? "bg-[#b388ff] animate-pulse" : "bg-zinc-700 hover:bg-zinc-600"
                }`}
                aria-label={isListening ? "Stop voice input" : "Start voice input"}
                title={speechSupported ? (isListening ? "Listening..." : "Speak with mic") : "Voice not supported"}
              >
                <Mic className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={handleSend}
                disabled={loading || !input.trim()}
                className="cotala-chat-send h-10 w-10 rounded-full disabled:opacity-50 text-white flex items-center justify-center"
                aria-label="Send message"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Link, useSearch } from "wouter";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import cardImg from "@/pages/images/card.png";
import lightLogo from "@/pages/images/logos/light-logo.svg";
import heroBg from "@/pages/images/banner-09.png";
import photoFallback from "@/pages/images/standard-real-estate-photography-4-1024x683.jpg";
import videoFallback from "@/pages/images/hdr.jpg";
import floorFallback from "@/pages/images/img-5.png";
import floorPlanImg from "@/pages/images/floor.png";
import printSheetFallback from "@/pages/images/p-2.jpg";
import printTriFallback from "@/pages/images/brochure.png";
import printBookFallback from "@/pages/images/listing-magazine-1.jpeg";
import twilightImg from "@/pages/images/cotala-photos/twilight.jpg";
import twilightExtImg from "@/pages/images/cotala-photos/twilight-exterior-1.jpg";
import droneStillsImg from "@/pages/images/cotala-photos/sas-drone-stills-example.gif";
import hdrCloseImg from "@/pages/images/cotala-photos/hdr-1.jpg";
import panoImg from "@/pages/images/pano1.jpeg";
import panoTwoImg from "@/pages/images/pano2.jpeg";
import { MapPin, Ruler, Check, ChevronDown, CheckCircle2 } from "lucide-react";
import { 
  getSubCategoryNew,
  getSubCategoryAddon,
  getDateTimeSlots,
  calculateTotalAmount,
  createPortalOrder,
  addOrder,
  getOrderOptions,
  getCoRealtorList,
  getPortalListings,
  getStripeConfig,
  getStripePaymentMethods,
  saveStripeCustomer,
  addStripePaymentMethod,
  createStripeSetupIntent,
  autoChargeStripe,
  STRIPE_TEST_MODE,
  STRIPE_TEST_PUBLISHABLE_KEY,
  type PortalListing,
  type CategoryResponse,
  type SubCategoryNewResponse,
  type SubCategoryAddonResponse,
  type ServiceArrayItem
} from "@/lib/api";
import { createStripeCardPaymentMethodId } from "@/lib/stripe-client";

type OrderOptionService = {
  id: string | number;
  name?: string;
  frontendtitle?: string;
  productimage?: string;
  image?: string;
  image_url?: string;
  virtual_flag?: number;
  display_price?: number | string;
  type?: string;
  pricing?: {
    total?: string | number;
    rate?: string | number;
  };
};

function formatMoney(value?: string | number | null) {
  const n = Number(String(value ?? 0).replace(/,/g, ""));
  if (Number.isNaN(n)) return "$0.00";
  return `$${n.toFixed(2)}`;
}

function optionTitle(service: OrderOptionService) {
  return service.frontendtitle || service.name || "Service";
}

function asServiceList(value: unknown): OrderOptionService[] {
  if (Array.isArray(value)) return value as OrderOptionService[];
  if (value && typeof value === "object") return Object.values(value) as OrderOptionService[];
  return [];
}

function hasAnyService(options: {
  photography?: OrderOptionService[];
  photography_extra?: OrderOptionService[];
  printaddon?: OrderOptionService[];
  videography?: OrderOptionService[];
  videography_extra?: OrderOptionService[];
  virtual_tour?: OrderOptionService[];
  FloorplansandMatterport?: OrderOptionService[];
} | null) {
  if (!options) return false;
  return Object.values(options).some((list) => Array.isArray(list) && list.length > 0);
}

const FALLBACK_ORDER_OPTIONS = {
  photography: [
    { id: "std", frontendtitle: "Standard Photos", pricing: { total: "169.00" } },
    { id: "hdr", frontendtitle: "HDR Photos", pricing: { total: "239.00" } },
    { id: "twilight", frontendtitle: "Twilight Exterior", pricing: { total: "329.00" } },
    { id: "twilight-only", frontendtitle: "Twilight Exterior Only", pricing: { total: "239.00" } },
    { id: "drone", frontendtitle: "Drone Stills", pricing: { total: "169.00" } },
    { id: "std-tour", frontendtitle: "Standard + Tour", virtual_flag: 1, pricing: { total: "169.00" } },
    { id: "hdr-tour", frontendtitle: "HDR + Tour", virtual_flag: 1, pricing: { total: "239.00" } },
  ],
  photography_extra: [
    { id: "vs", frontendtitle: "Virtual Staging" },
    { id: "slideshow", frontendtitle: "Photo Slideshow" },
    { id: "daynight", frontendtitle: "Day to Night Conversion" },
    { id: "sky", frontendtitle: "Blue Sky Replacement" },
    { id: "lot", frontendtitle: "Drone Lot Outlines" },
    { id: "pano", frontendtitle: "Drone 360° Panorama" },
  ],
  printaddon: [
    { id: 19, frontendtitle: "Oversized Feature Sheets", pricing: { total: "70.00" } },
    { id: 136, frontendtitle: "Oversized Trifold Brochure", pricing: { total: "239.00" } },
    { id: 202, frontendtitle: "8-Page Listing Booklet", pricing: { total: "329.00" } },
  ],
  videography: [
    { id: "cine", frontendtitle: "Cinematic Video", pricing: { total: "169.00" } },
    { id: "drone-vid", frontendtitle: "Drone Video", pricing: { total: "239.00" } },
  ],
  videography_extra: [
    { id: "intro", frontendtitle: "Realtor Intro" },
    { id: "vid-daynight", frontendtitle: "Day to Night Conversion" },
  ],
  virtual_tour: [] as OrderOptionService[],
  FloorplansandMatterport: [
    { id: "floor", frontendtitle: "Standard Floorplan", pricing: { total: "0.00" } },
    { id: "floor-mp", frontendtitle: "Standard Floorplan+Matterport", pricing: { total: "239.00" } },
    { id: "mp", frontendtitle: "Matterport Only", pricing: { total: "239.00" } },
    { id: "simple", frontendtitle: "Simplified Floorplan", pricing: { total: "239.00" } },
    { id: "simple-mp", frontendtitle: "Simplified Floorplan + Matterport", pricing: { total: "0.00" } },
  ],
};

function optionPrice(service: OrderOptionService) {
  return Number(String(service.pricing?.total || service.pricing?.rate || service.display_price || 0).replace(/,/g, "")) || 0;
}

const GENERIC_IMAGE_HINTS = [
  "standard-real-estate-photography",
  "virtual-staging",
  "/images/category/",
  "img-5.png",
];

function isGenericApiImage(url?: string) {
  if (!url) return true;
  const value = url.toLowerCase();
  return GENERIC_IMAGE_HINTS.some((hint) => value.includes(hint));
}

function imageForService(service: OrderOptionService, fallback: string) {
  const apiImage = service.productimage || service.image || service.image_url || "";
  if (apiImage && !isGenericApiImage(apiImage)) {
    return apiImage;
  }

  const title = `${service.frontendtitle || ""} ${service.name || ""}`.toLowerCase();

  if (title.includes("trifold")) return printTriFallback;
  if (title.includes("booklet") || title.includes("magazine") || title.includes("listing book")) {
    return printBookFallback;
  }
  if (title.includes("feature sheet") || title.includes("oversized")) return printSheetFallback;

  if (title.includes("drone") && (title.includes("video") || title.includes("cine"))) return droneStillsImg;
  if (title.includes("drone")) return droneStillsImg;

  if (title.includes("twilight") && title.includes("only")) return twilightExtImg;
  if (title.includes("twilight")) return twilightImg;

  if (title.includes("hdr")) return videoFallback;
  if (title.includes("cinematic") || title.includes("walkthrough") || title.includes("video")) {
    return hdrCloseImg;
  }

  if (title.includes("matterport") && title.includes("only")) return panoTwoImg;
  if (title.includes("matterport")) return panoImg;
  if (title.includes("floorplan") || title.includes("floor plan")) return floorPlanImg;

  if (title.includes("virtual") || title.includes("360") || title.includes("tour")) return panoImg;
  if (title.includes("standard")) return photoFallback;

  return fallback;
}

function ServiceOptionCard({
  service,
  fallback,
  selected,
  onToggle,
}: {
  service: OrderOptionService;
  fallback: string;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={`option-card-1 ${selected ? "active" : ""}`}
      onClick={onToggle}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
    >
      {service.virtual_flag ? <span className="badge-tag">+ Virtual Tour</span> : null}
      <img
        src={imageForService(service, fallback)}
        alt={optionTitle(service)}
        onError={(e) => {
          if (fallback && e.currentTarget.src !== fallback) e.currentTarget.src = fallback;
        }}
      />
      <h6>{optionTitle(service)}</h6>
      <p>{formatMoney(optionPrice(service))}</p>
    </div>
  );
}

function ExtraPills({
  extras,
  selectedIds,
  onToggle,
}: {
  extras: OrderOptionService[];
  selectedIds: Array<string | number>;
  onToggle: (service: OrderOptionService) => void;
}) {
  if (!extras?.length) return null;
  return (
    <div className="photography flex flex-wrap mb-4">
      {extras.map((extra) => {
        const active = selectedIds.some((id) => String(id) === String(extra.id));
        return (
          <label
            key={String(extra.id)}
            className={`btn ${active ? "active" : ""}`}
            onClick={() => onToggle(extra)}
          >
            {optionTitle(extra)}
          </label>
        );
      })}
    </div>
  );
}

function SelectionBar({
  onClear,
  onConfirm,
  confirmLabel = "CONFIRM SELECTION",
}: {
  onClear?: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
}) {
  return (
    <div className="selection-bar flex justify-end gap-3 items-center px-3 mt-4">
      {onClear ? (
        <button type="button" className="btn-clear" onClick={onClear}>
          CLEAR
        </button>
      ) : null}
      <button type="button" className="btn-confirm" onClick={onConfirm}>
        <Check className="w-4 h-4" />
        {confirmLabel}
      </button>
    </div>
  );
}

interface OrderItem {
  category: string;
  name: string;
  price: number;
  date?: string;
  serviceId?: string | number;
  qty?: number;
  rush?: "yes" | "no";
  rush_option?: string;
  type?: string;
}

interface CategoryData {
  name: string;
  image: string;
  subcategories?: SubCategoryNewResponse["list"];
  addons?: SubCategoryAddonResponse["list"];
}

export default function NewOrder() {
  const [userName, setUserName] = useState("");
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  const [cardNumberError, setCardNumberError] = useState("");
  const [expiryDateError, setExpiryDateError] = useState("");

  // Capitalize first letter of name
  const capitalizeFirstLetter = (str: string): string => {
    if (!str) return str;
    return str.charAt(0).toUpperCase() + str.slice(1);
  };

  // Card number validation (Luhn algorithm)
  const validateCardNumber = (cardNumber: string): boolean => {
    // Remove spaces and non-digits
    const cleaned = cardNumber.replace(/\s+/g, "").replace(/\D/g, "");
    
    // Check if it's 13-19 digits (standard card length)
    if (cleaned.length < 13 || cleaned.length > 19) {
      return false;
    }

    // Luhn algorithm
    let sum = 0;
    let isEven = false;
    
    for (let i = cleaned.length - 1; i >= 0; i--) {
      let digit = parseInt(cleaned[i]);
      
      if (isEven) {
        digit *= 2;
        if (digit > 9) {
          digit -= 9;
        }
      }
      
      sum += digit;
      isEven = !isEven;
    }
    
    return sum % 10 === 0;
  };

  // Format card number with spaces every 4 digits
  const formatCardNumber = (value: string): string => {
    // Remove all non-digits
    const cleaned = value.replace(/\D/g, "");
    // Add space every 4 digits
    const formatted = cleaned.match(/.{1,4}/g)?.join(" ") || cleaned;
    return formatted;
  };

  // Validate expiry date (MM/YY format)
  const validateExpiryDate = (expiryDate: string): boolean => {
    // Remove slashes and spaces
    const cleaned = expiryDate.replace(/\D/g, "");
    
    // Should be 4 digits (MMYY)
    if (cleaned.length !== 4) {
      return false;
    }
    
    const month = parseInt(cleaned.substring(0, 2));
    const year = parseInt(cleaned.substring(2, 4));
    
    // Month should be 01-12
    if (month < 1 || month > 12) {
      return false;
    }
    
    // Check if date is not expired
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear() % 100; // Last 2 digits
    const currentMonth = currentDate.getMonth() + 1;
    
    if (year < currentYear || (year === currentYear && month < currentMonth)) {
      return false;
    }
    
    return true;
  };

  // Format expiry date as MM/YY
  const formatExpiryDate = (value: string): string => {
    // Remove all non-digits
    const cleaned = value.replace(/\D/g, "");
    
    // Limit to 4 digits
    const limited = cleaned.substring(0, 4);
    
    // Add slash after 2 digits
    if (limited.length >= 2) {
      return `${limited.substring(0, 2)}/${limited.substring(2)}`;
    }
    
    return limited;
  };

  // Handle card number input
  const handleCardNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCardNumber(e.target.value);
    e.target.value = formatted;
    
    // Validate
    if (formatted.replace(/\s/g, "").length > 0) {
      if (validateCardNumber(formatted)) {
        setCardNumberError("");
      } else {
        setCardNumberError("Please enter a valid card number");
      }
    } else {
      setCardNumberError("");
    }
  };

  // Handle card number blur (validate on focus loss)
  const handleCardNumberBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value.replace(/\s/g, "").length > 0) {
      if (!validateCardNumber(value)) {
        setCardNumberError("Please enter a valid card number");
      }
    }
  };

  // Handle expiry date input
  const handleExpiryDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatExpiryDate(e.target.value);
    e.target.value = formatted;
    
    // Validate
    if (formatted.replace(/\D/g, "").length === 4) {
      if (validateExpiryDate(formatted)) {
        setExpiryDateError("");
      } else {
        setExpiryDateError("Please enter a valid expiry date (MM/YY)");
      }
    } else {
      setExpiryDateError("");
    }
  };

  // Handle expiry date blur (validate on focus loss)
  const handleExpiryDateBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value.replace(/\D/g, "").length === 4) {
      if (!validateExpiryDate(value)) {
        setExpiryDateError("Please enter a valid expiry date (MM/YY)");
      }
    } else if (value.replace(/\D/g, "").length > 0) {
      setExpiryDateError("Please enter a valid expiry date (MM/YY)");
    }
  };
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [listingAddress, setListingAddress] = useState("");
  const [listingSize, setListingSize] = useState("");
  const [myListings, setMyListings] = useState<PortalListing[]>([]);
  const [savedPaymentMethods, setSavedPaymentMethods] = useState<Array<{ id: string; card?: { brand?: string; last4?: string; exp_month?: number; exp_year?: number } }>>([]);
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState("");
  const [stripeCustomerId, setStripeCustomerId] = useState("");
  const [stripePublishableKey, setStripePublishableKey] = useState("");
  const [savingPayment, setSavingPayment] = useState(false);
  const [paymentSaved, setPaymentSaved] = useState(false);
  const [paymentSaveError, setPaymentSaveError] = useState("");
  const [selectedListingId, setSelectedListingId] = useState<string>("");
  const [useGooglePlaces, setUseGooglePlaces] = useState(false);
  const autocompleteRef = useRef<any>(null);
  const [categories, setCategories] = useState<CategoryData[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [homesize, setHomesize] = useState<string>("");
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [timeSlots, setTimeSlots] = useState<Array<{ slotStart: string; slotEnd: string }>>([]);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string>("");
  const [selectedDateStr, setSelectedDateStr] = useState<string>("");
  const [totalAmount, setTotalAmount] = useState<number>(0);
  const [calculatedAmount, setCalculatedAmount] = useState<{ totalamount?: number | string; paymentgatewayamount?: number | string } | null>(null);
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [dateTimePreference, setDateTimePreference] = useState<string>("");
  const [serviceDates, setServiceDates] = useState<{ [key: string]: { date: string; timeSlot: string } }>({});
  const [serviceTimeSlots, setServiceTimeSlots] = useState<{ [key: string]: Array<{ slotStart: string; slotEnd: string }> }>({});
  const [listingDetailsSaved, setListingDetailsSaved] = useState(false);
  const [categorySaved, setCategorySaved] = useState<{ [key: string]: boolean }>({});
  const [dateTimeSameSaved, setDateTimeSameSaved] = useState(false);
  const [dateTimeDifferentSaved, setDateTimeDifferentSaved] = useState(false);
  const [openAccordion, setOpenAccordion] = useState<string>("flush-collapseOne");
  const [orderOptions, setOrderOptions] = useState<{
    photography?: OrderOptionService[];
    photography_extra?: OrderOptionService[];
    printaddon?: OrderOptionService[];
    videography?: OrderOptionService[];
    videography_extra?: OrderOptionService[];
    virtual_tour?: OrderOptionService[];
    FloorplansandMatterport?: OrderOptionService[];
  } | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [videoOrientation, setVideoOrientation] = useState<"horizontal" | "vertical" | "">("");
  const [propertyType, setPropertyType] = useState<"residential" | "commercial">("residential");
  const [isCoListed, setIsCoListed] = useState<"yes" | "no">("no");
  const [coRealtors, setCoRealtors] = useState<Array<{ name: string; username: string }>>([]);
  const [coRealtorsLoading, setCoRealtorsLoading] = useState(false);
  const [coRealtorKey, setCoRealtorKey] = useState("");
  const [coRealtorQuery, setCoRealtorQuery] = useState("");
  const [coRealtorOpen, setCoRealtorOpen] = useState(false);
  const [includeDecks, setIncludeDecks] = useState(false);
  const [sellerName, setSellerName] = useState("");
  const [sellerPhone, setSellerPhone] = useState("");
  const [sellerNotes, setSellerNotes] = useState("");
  const [sellerConfirmed, setSellerConfirmed] = useState(false);
  const [orderNotes, setOrderNotes] = useState("");
  const [priceConsent, setPriceConsent] = useState(false);

  useEffect(() => {
    if (isCoListed !== "yes" || coRealtors.length || coRealtorsLoading) return;
    setCoRealtorsLoading(true);
    getCoRealtorList()
      .then((res) => {
        const list = Array.isArray(res.list) ? res.list : [];
        setCoRealtors(list.filter((r) => r && String(r.name || "").trim()));
      })
      .catch((err) => console.error("Failed to load co-listing realtors", err))
      .finally(() => setCoRealtorsLoading(false));
  }, [isCoListed, coRealtors.length, coRealtorsLoading]);

  const selectedCoRealtor = useMemo(
    () => coRealtors.find((r) => r.name === coRealtorKey) || null,
    [coRealtors, coRealtorKey],
  );

  const coRealtorMatches = useMemo(() => {
    const q = coRealtorQuery.trim().toLowerCase();
    const list = q
      ? coRealtors.filter((r) => r.name.toLowerCase().includes(q) || r.username.toLowerCase().includes(q))
      : coRealtors;
    return list.slice(0, 50);
  }, [coRealtors, coRealtorQuery]);

  const search = useSearch();
  const urlTourId = useMemo(() => {
    const p = new URLSearchParams(search);
    return (p.get("tourid") || p.get("tour_id") || "").trim();
  }, [search]);

  useEffect(() => {
    // Get user name from localStorage
    const userData = localStorage.getItem("cotala_user");
    if (userData) {
      try {
        const user = JSON.parse(userData);
        const name = user.name || user.username || user.email || "";
        setUserName(capitalizeFirstLetter(name));
      } catch (e) {
        console.error("Failed to parse user data", e);
      }
    }

    const loadMyListings = async () => {
      try {
        const data = await getPortalListings();
        if (data.status && Array.isArray(data.data)) {
          setMyListings(data.data as PortalListing[]);
        }
      } catch (error) {
        console.error("Failed to load listings", error);
      }
    };
    loadMyListings();

    const loadStripe = async () => {
      try {
        if (STRIPE_TEST_MODE) {
          setStripePublishableKey(STRIPE_TEST_PUBLISHABLE_KEY);
        } else {
          const config = await getStripeConfig();
          const configData = (config.data || {}) as { publishable_key?: string };
          if (configData.publishable_key) {
            setStripePublishableKey(configData.publishable_key);
          }
        }
        const methods = await getStripePaymentMethods();
        const payload = (methods.data || {}) as {
          customer?: { stripe_customer_id?: string };
          payment_methods?: Array<{ id: string; card?: { brand?: string; last4?: string; exp_month?: number; exp_year?: number } }>;
        };
        if (payload.customer?.stripe_customer_id) {
          setStripeCustomerId(payload.customer.stripe_customer_id);
          await saveStripeCustomer(payload.customer.stripe_customer_id);
        }
        const list = payload.payment_methods || [];
        setSavedPaymentMethods(list);
        if (list[0]?.id) setSelectedPaymentMethodId(list[0].id);
      } catch (error) {
        console.error("Failed to load Stripe billing", error);
      }
    };
    loadStripe();
  }, []);

  useEffect(() => {
    if (!urlTourId) return;
    const match = myListings.find((t) => String(t.tourid) === urlTourId);
    if (match) {
      const addr = `${match.address || ""}${match.city ? `, ${match.city}` : ""}`.trim();
      setSelectedListingId(String(match.tourid));
      if (addr) setListingAddress(addr);
      setUseGooglePlaces(false);
    } else {
      setSelectedListingId(urlTourId);
      setListingAddress((prev) => prev || `Tour ${urlTourId}`);
    }
  }, [urlTourId, myListings]);

  // Handle address input change and detect if it's from listings
  const handleAddressChange = useCallback((value: string) => {
    setListingAddress(value);
    
    // Check if the value matches any listing
    const matchingListing = myListings?.find(
      (tour) => `${tour.address}${tour.city ? `, ${tour.city}` : ""}` === value
    );
    
    if (matchingListing) {
      setSelectedListingId(String(matchingListing.tourid));
      setUseGooglePlaces(false);
    } else {
      setSelectedListingId("");
      setUseGooglePlaces(true);
    }
  }, [myListings]);

  const addressChangeRef = useRef(handleAddressChange);
  addressChangeRef.current = handleAddressChange;
  const autocompleteInputRef = useRef<HTMLInputElement | null>(null);

  // Initialize Google Places Autocomplete (always enabled for Canada addresses)
  useEffect(() => {
    if (window.google?.maps?.places) {
      // Small delay to ensure input is rendered
      const timer = setTimeout(() => {
        const addressInput = document.getElementById("address") as HTMLInputElement;
        if (addressInput && autocompleteInputRef.current !== addressInput && autocompleteRef.current) {
          window.google?.maps?.event?.clearInstanceListeners(autocompleteRef.current);
          autocompleteRef.current = null;
        }
        if (addressInput && !autocompleteRef.current && window.google && window.google.maps && window.google.maps.places) {
          // Initialize Google Places Autocomplete for Canada
          const autocomplete = new window.google.maps.places.Autocomplete(addressInput, {
            componentRestrictions: { country: "ca" }, // Restrict to Canada
            fields: ["formatted_address", "address_components", "geometry"],
            types: ["address"],
          });

          autocomplete.addListener("place_changed", () => {
            const place = autocomplete.getPlace();
            if (place.formatted_address) {
              addressChangeRef.current(place.formatted_address);
              // Extract city from address components
              const cityComponent = place.address_components?.find(
                (component) => component.types.includes("locality") || component.types.includes("administrative_area_level_2")
              );
              if (cityComponent) {
                // You can set city if needed
              }
            }
          });

          autocompleteRef.current = autocomplete;
          autocompleteInputRef.current = addressInput;
        }
      }, 100);

      return () => {
        clearTimeout(timer);
      };
    }
  }, [openAccordion]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (autocompleteRef.current && window.google && window.google.maps && window.google.maps.event) {
        window.google.maps.event.clearInstanceListeners(autocompleteRef.current);
      }
    };
  }, []);

  const handleTimeSlotClick = (slot: string) => {
    if (selectedSlots.includes(slot)) {
      setSelectedSlots(selectedSlots.filter((s) => s !== slot));
    } else {
      setSelectedSlots([...selectedSlots, slot]);
    }
  };

  const handleSaveListingDetails = () => {
    const sizeValue = listingSize || "2000";
    setListingSize(sizeValue);
    setHomesize(sizeValue);
  };

  const loadOrderOptions = async (size: string) => {
    const homesizeValue = String(size || "").replace(/[^\d]/g, "") || "2000";
    setHomesize(homesizeValue);
    setLoadingOptions(true);
    let next: typeof orderOptions = null;
    try {
      try {
        const data = await getOrderOptions(homesizeValue);
        const payload = ((data as { data?: unknown })?.data || data) as Record<string, unknown>;
        const photography = asServiceList(payload?.photography);
        const videography = asServiceList(payload?.videography);
        if (photography.length || videography.length || asServiceList(payload?.FloorplansandMatterport).length) {
          next = {
            photography,
            photography_extra: asServiceList(payload?.photography_extra),
            printaddon: asServiceList(payload?.printaddon),
            videography,
            videography_extra: asServiceList(payload?.videography_extra),
            virtual_tour: asServiceList(payload?.virtual_tour),
            FloorplansandMatterport: asServiceList(payload?.FloorplansandMatterport),
          };
        }
      } catch (error) {
        console.error("Failed to load order options", error);
      }

      if (!hasAnyService(next)) {
        const data = await getSubCategoryNew({
          category: ["photography", "videography", "drafting"],
          homesize: homesizeValue,
        });
        const list = (data.list || {}) as Record<string, OrderOptionService[]>;
        const photography = asServiceList(list.photography);
        const videography = asServiceList(list.videography);
        const drafting = asServiceList(list.drafting);
        next = {
          photography: photography.filter((item) => !String(item.name || item.frontendtitle || "").toLowerCase().includes("virtual tour")),
          photography_extra: photography.flatMap((item) => asServiceList((item as { addon?: unknown }).addon)),
          videography,
          videography_extra: videography.flatMap((item) => asServiceList((item as { addon?: unknown }).addon)),
          virtual_tour: photography.filter((item) => String(item.name || item.frontendtitle || "").toLowerCase().includes("virtual")),
          FloorplansandMatterport: drafting,
          printaddon: FALLBACK_ORDER_OPTIONS.printaddon,
        };
      }
    } catch (fallbackError) {
      console.error("Failed to load fallback services", fallbackError);
    } finally {
      setOrderOptions(hasAnyService(next) ? next : FALLBACK_ORDER_OPTIONS);
      setLoadingOptions(false);
    }
  };

  useEffect(() => {
    loadOrderOptions(listingSize || "2000");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load subcategories for a category
  const loadSubcategories = async (categoryName: string) => {
    if (!homesize) {
      const sizeInput = document.getElementById("size") as HTMLInputElement;
      if (sizeInput && sizeInput.value) {
        setHomesize(sizeInput.value);
      } else {
        alert("Please enter home size first");
        return;
      }
    }

    try {
      const data = await getSubCategoryNew({
        category: [categoryName],
        homesize: homesize || "2000"
      });
      
      if (data.status && data.list) {
        setCategories(prev => prev.map(cat => 
          cat.name.toLowerCase() === categoryName.toLowerCase() 
            ? { ...cat, subcategories: data.list }
            : cat
        ));
      }
    } catch (error) {
      console.error("Failed to load subcategories", error);
    }
  };

  // Load addons for categories
  const loadAddons = async (categoryNames: string[]) => {
    if (!homesize) {
      const sizeInput = document.getElementById("size") as HTMLInputElement;
      if (sizeInput && sizeInput.value) {
        setHomesize(sizeInput.value);
      } else {
        alert("Please enter home size first");
        return;
      }
    }

    try {
      const data = await getSubCategoryAddon({
        category: categoryNames,
        homesize: homesize || "2000"
      });
      
      if (data.status && data.list) {
        // Store addons in state - you can organize this as needed
        console.log("Addons loaded:", data.list);
      }
    } catch (error) {
      console.error("Failed to load addons", error);
    }
  };

  // Handle category accordion open
  const handleCategoryOpen = (categoryName: string) => {
    const category = categories.find(cat => cat.name.toLowerCase() === categoryName.toLowerCase());
    if (category && !category.subcategories) {
      loadSubcategories(categoryName);
    }
  };

  // Calculate total amount for selected services and update individual prices
  const calculateTotalAmountForServices = async (items: OrderItem[]) => {
    if (items.length === 0) {
      setCalculatedAmount(null);
      setTotalAmount(0);
      // Clear prices from order items
      setOrderItems(prev => prev.map(item => ({ ...item, price: 0 })));
      return;
    }

    try {
      const serviceArray: ServiceArrayItem[] = items.map(item => ({
        service: String(item.serviceId || ""),
        qty: item.qty || 1,
        rush: item.rush || "no",
        type: item.type || item.category.toLowerCase(),
        rush_option: item.rush_option || "",
        name: item.name,
        totalamount: "0"
      }));

      const data = await calculateTotalAmount({ servicearray: serviceArray });
      if (data.status) {
        setCalculatedAmount({
          totalamount: data.totalamount,
          paymentgatewayamount: data.paymentgatewayamount
        });
        const total = Number(data.totalamount) || 0;
        setTotalAmount(total);
        
        // Update order items with calculated prices from API response
        if (data.servicearray && data.servicearray.length > 0) {
          // API returned individual service amounts
          setOrderItems(prev => {
            return prev.map((item) => {
              // Find matching service in API response
              const apiService = data.servicearray!.find(
                s => String(s.service) === String(item.serviceId) && s.name === item.name
              );
              if (apiService) {
                return {
                  ...item,
                  price: Number(apiService.totalamount) || 0
                };
              }
              return item;
            });
          });
        } else {
          // API didn't return individual amounts, calculate proportionally
          // This is a fallback - ideally API should return individual amounts
          const pricePerService = items.length > 0 ? total / items.length : 0;
          setOrderItems(prev => {
            return prev.map((item) => {
              const matchingItem = items.find(
                i => i.serviceId === item.serviceId && i.category === item.category
              );
              if (matchingItem) {
                return {
                  ...item,
                  price: pricePerService
                };
              }
              return item;
            });
          });
        }
      }
    } catch (error) {
      console.error("Failed to calculate total amount", error);
    }
  };

  // Load datetime slots when date is selected
  const loadDateTimeSlots = async (date: string) => {
    try {
      const data = await getDateTimeSlots({ date });
      if (data.status && data.timeSlots) {
        setTimeSlots(data.timeSlots);
      }
    } catch (error) {
      console.error("Failed to load time slots", error);
    }
  };

  // Handle service selection
  const handleServiceSelect = (
    categoryName: string,
    serviceId: string | number,
    serviceName: string,
    isAddon: boolean = false,
    price = 0,
    serviceType?: string
  ) => {
    const newItem: OrderItem = {
      category: categoryName,
      name: serviceName,
      price,
      serviceId,
      qty: 1,
      rush: "no",
      rush_option: "",
      type: isAddon ? "addon" : (serviceType || categoryName.toLowerCase())
    };
    
    setOrderItems(prev => {
      const exists = prev.some(item =>
        item.serviceId === serviceId && item.category.toLowerCase() === categoryName.toLowerCase()
      );
      const filtered = prev.filter(item =>
        !(item.serviceId === serviceId && item.category.toLowerCase() === categoryName.toLowerCase())
      );
      const updated = exists ? filtered : [...filtered, newItem];
      calculateTotalAmountForServices(updated);
      return updated;
    });
  };

  const isServiceSelected = (categoryName: string, serviceId: string | number) =>
    orderItems.some(item =>
      item.serviceId === serviceId && item.category.toLowerCase() === categoryName.toLowerCase()
    );

  // Handle order submission
  const handleSubmitOrder = async () => {
    if (!listingAddress) {
      alert("Please enter listing address");
      return;
    }
    if (!homesize) {
      alert("Please enter home size");
      return;
    }
    if (isCoListed === "yes" && !selectedCoRealtor) {
      alert("Please select the connected realtor for this co-listing");
      return;
    }
    if (dateTimePreference === "contact" && (!sellerName.trim() || !sellerPhone.trim())) {
      alert("Please enter the seller name and phone number");
      return;
    }
    if (!priceConsent) {
      alert("Please confirm you understand the final price may vary");
      return;
    }
    if (orderItems.length === 0) {
      alert("Please select at least one service");
      return;
    }
    
    // Only require date/time if not "as soon as possible" or "contact my seller"
    if (dateTimePreference !== "asap" && dateTimePreference !== "contact") {
      if (!selectedDateStr || !selectedTimeSlot) {
        alert("Please select date and time");
        return;
      }
    }

    const usingSavedCard = Boolean(selectedPaymentMethodId);
    const cardnumberInput = document.getElementById("cardnumber") as HTMLInputElement;
    const cardnumber = cardnumberInput?.value || "";
    const expirydateInput = document.getElementById("expirydate") as HTMLInputElement;
    const expirydate = expirydateInput?.value || "";
    if (!usingSavedCard) {
      if (!cardnumber || !validateCardNumber(cardnumber)) {
        setCardNumberError("Please enter a valid card number");
        alert("Please enter a valid card number");
        return;
      }
      if (!expirydate || !validateExpiryDate(expirydate)) {
        setExpiryDateError("Please enter a valid expiry date (MM/YY)");
        alert("Please enter a valid expiry date (MM/YY)");
        return;
      }
    }
    
    // For "as soon as possible", set default values if not set
    let finalDate = selectedDateStr;
    let finalTime = selectedTimeSlot;
    if (dateTimePreference === "asap") {
      if (!finalDate) {
        const today = new Date();
        finalDate = today.toISOString().split('T')[0];
      }
      if (!finalTime) {
        finalTime = "As soon as possible";
      }
    }

    setSubmittingOrder(true);
    try {
      // Get payment details from form
      // Get payment details (already validated above, remove formatting for API)
      const cardnumberInput = document.getElementById("cardnumber") as HTMLInputElement;
      const expirydateInput = document.getElementById("expirydate") as HTMLInputElement;
      const cardnumber = cardnumberInput?.value.replace(/\s/g, "") || ""; // Remove spaces for API
      const expirydate = expirydateInput?.value.replace(/\//g, "") || ""; // Remove slash for API
      const cvv = (document.getElementById("cvv") as HTMLInputElement)?.value || "";
      const holdername = (document.getElementById("holdername") as HTMLInputElement)?.value || "";
      const saveCardCheckbox = document.getElementById("savecarddetails") as HTMLInputElement;
      const savecarddetails = saveCardCheckbox?.checked || false;
      const sellerLine =
        dateTimePreference === "contact" && (sellerName || sellerPhone || sellerNotes)
          ? `Seller: ${[sellerName, sellerPhone, sellerNotes].filter(Boolean).join(" / ")}`
          : "";
      const notes = [
        orderNotes.trim(),
        sellerLine,
        includeDecks ? "Floorplan: include decks/patios/outbuildings" : "",
      ]
        .filter(Boolean)
        .join("\n");
      const photographer = ""; // Get from photographer selection if available

      // Extract city from address (you might want to improve this)
      const city = listingAddress.split(",").slice(-2, -1)[0]?.trim() || "";

      // Format time to match API format (e.g., "11:00 am")
      const formatTime = (timeStr: string) => {
        // If already in correct format, return as is
        if (timeStr.toLowerCase().includes("am") || timeStr.toLowerCase().includes("pm")) {
          return timeStr.toLowerCase();
        }
        // If it's "As soon as possible", return as is
        if (timeStr.toLowerCase().includes("as soon")) {
          return timeStr;
        }
        // Otherwise, assume it's in "HH:MM - HH:MM" format and extract first part
        const timePart = timeStr.split("-")[0]?.trim() || timeStr;
        return timePart.toLowerCase();
      };

      // Parse time slot to get start and end time
      let parsedTime = finalTime;
      let parsedEndTime = finalTime;
      if (finalTime && finalTime.includes("-")) {
        const [start, end] = finalTime.split("-").map(t => t.trim());
        parsedTime = formatTime(start);
        parsedEndTime = formatTime(end);
      } else if (finalTime) {
        parsedTime = formatTime(finalTime);
        parsedEndTime = parsedTime; // Use same time if no end time specified
      }

      // Helper function to convert time to 24-hour format for datetime
      const convertTo24Hour = (timeStr: string): string => {
        if (!timeStr) return "00:00:00";
        // If already in 24-hour format (HH:MM), return with seconds
        if (timeStr.match(/^\d{2}:\d{2}$/)) {
          return `${timeStr}:00`;
        }
        // If in 12-hour format with AM/PM
        const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(am|pm)/i);
        if (match) {
          let hours = parseInt(match[1]);
          const minutes = match[2];
          const ampm = match[3].toLowerCase();
          if (ampm === "pm" && hours !== 12) hours += 12;
          if (ampm === "am" && hours === 12) hours = 0;
          return `${String(hours).padStart(2, "0")}:${minutes}:00`;
        }
        return "00:00:00";
      };

      // Determine customer_preferred based on date/time preference
      let customerPreferred = "";
      let customerPreferredDateStartTime = "";
      let customerPreferredDateEndTime = "";

      if (dateTimePreference === "asap") {
        customerPreferred = "alltime";
      } else if (dateTimePreference === "contact") {
        customerPreferred = "seller";
      } else if (dateTimePreference === "same" || dateTimePreference === "different") {
        // Format: "2018-06-19 16:18:32"
        if (finalDate && parsedTime && parsedEndTime) {
          const startTime24 = convertTo24Hour(parsedTime);
          const endTime24 = convertTo24Hour(parsedEndTime);
          customerPreferred = `${finalDate} ${startTime24}`;
          customerPreferredDateStartTime = `${finalDate} ${startTime24}`;
          customerPreferredDateEndTime = `${finalDate} ${endTime24}`;
        }
      }

      const serviceArray: ServiceArrayItem[] = orderItems.map(item => {
        // For "different days", get the specific date/time for this service
        let servicePreferred = customerPreferred;
        let serviceStartTime = customerPreferredDateStartTime;
        let serviceEndTime = customerPreferredDateEndTime;

        if (dateTimePreference === "different" && item.date) {
          // Extract date and time from item.date (format: "2024-12-25 - 09:00 AM - 10:00 AM")
          const dateMatch = item.date.match(/(\d{4}-\d{2}-\d{2})\s*-\s*(.+)/);
          if (dateMatch) {
            const serviceDate = dateMatch[1];
            const timePart = dateMatch[2];
            if (timePart.includes("-")) {
              const [start, end] = timePart.split("-").map(t => t.trim());
              const startTime24 = convertTo24Hour(start);
              const endTime24 = convertTo24Hour(end);
              servicePreferred = `${serviceDate} ${startTime24}`;
              serviceStartTime = `${serviceDate} ${startTime24}`;
              serviceEndTime = `${serviceDate} ${endTime24}`;
            } else {
              const time24 = convertTo24Hour(timePart);
              servicePreferred = `${serviceDate} ${time24}`;
              serviceStartTime = `${serviceDate} ${time24}`;
              serviceEndTime = `${serviceDate} ${time24}`;
            }
          }
        }

        return {
          service: Number(item.serviceId || 0),
          qty: item.qty || 1,
          rush: item.rush || "no",
          type: item.type || item.category.toLowerCase(),
          servicetype: item.type || "field",
          rush_option: item.rush_option || "",
          name: item.name,
          totalamount: String(item.price || 0),
          other_options: "",
          customer_preferred: servicePreferred || customerPreferred,
          customer_preferred_datestarttime: serviceStartTime || customerPreferredDateStartTime,
          customer_preferred_dateendtime: serviceEndTime || customerPreferredDateEndTime
        };
      });

      // Determine tour_id - set to 0 if no listing is selected
      const tourId = selectedListingId ? Number(selectedListingId) : 0;

      const orderPayload = {
        address: listingAddress,
        city: city || listingAddress,
        date: finalDate || new Date().toISOString().split("T")[0],
        time: parsedTime || "9:00 am",
        end_time: parsedEndTime || parsedTime || "10:00 am",
        is_same_date: dateTimePreference === "same" || dateTimePreference === "asap",
        homesize: String(homesize || "2000"),
        lotsize: "100",
        property_type: propertyType,
        colisted: isCoListed,
        colisted_realtor: isCoListed === "yes" ? selectedCoRealtor?.username || "" : "",
        colisted_realtor_name: isCoListed === "yes" ? selectedCoRealtor?.name || "" : "",
        floorplan_options: includeDecks ? ["include_decks_patios_outbuildings"] : [],
        seller_name: dateTimePreference === "contact" ? sellerName : "",
        seller_phone: dateTimePreference === "contact" ? sellerPhone : "",
        seller_notes: dateTimePreference === "contact" ? sellerNotes : "",
        notes: notes || "New appointment from customer portal",
        photographer: photographer || "",
        tour_id: tourId,
        amount: calculatedAmount?.paymentgatewayamount ? Number(calculatedAmount.paymentgatewayamount) : totalAmount,
        total: calculatedAmount?.totalamount ? Number(calculatedAmount.totalamount) : totalAmount,
        cardnumber: cardnumber || (STRIPE_TEST_MODE ? "4242424242424242" : ""),
        expirydate: expirydate || (STRIPE_TEST_MODE ? "1228" : ""),
        cvv: cvv || (STRIPE_TEST_MODE ? "123" : ""),
        holdername: holdername || (STRIPE_TEST_MODE ? "Test User" : ""),
        savecarddetails: Boolean(savecarddetails),
        payment_method_id: selectedPaymentMethodId || undefined,
        servicearray: serviceArray
      };

      let data: { status?: boolean; msg?: string; message?: string; data?: unknown; order?: { id?: string | number } };
      try {
        data = await createPortalOrder(orderPayload);
      } catch (portalError) {
        console.warn("Portal create order failed, using add-order", portalError);
        data = { status: false };
      }
      if (!data.status) {
        data = await addOrder(orderPayload);
      }
      if (data.status) {
        const orderId =
          (data.data as { order?: { id?: string | number } } | undefined)?.order?.id ||
          (data as { order?: { id?: string | number } }).order?.id;
        if (stripeCustomerId) {
          await saveStripeCustomer(stripeCustomerId);
        }
        if (orderId && selectedPaymentMethodId) {
          try {
            await autoChargeStripe(
              orderId,
              selectedPaymentMethodId,
              calculatedAmount?.paymentgatewayamount ? Number(calculatedAmount.paymentgatewayamount) : totalAmount
            );
          } catch (chargeErr) {
            console.error("Stripe auto-charge failed", chargeErr);
          }
        }
        window.location.href = "/order-success";
      } else {
        alert(data.msg || data.message || "Failed to place order");
      }
    } catch (error) {
      console.error("Failed to submit order", error);
      alert("Unable to place order. Please try again.");
    } finally {
      setSubmittingOrder(false);
    }
  };

  const handleSavePhotography = () => {
    // Get selected photography items
    const selectedPhotos: OrderItem[] = [];
    // Find all checked checkboxes that are within the Photography accordion
    // Look for checkboxes with IDs starting with "photo-" or "extra-"
    const photoCheckboxes = document.querySelectorAll('input[id^="photo-"]:checked, input[id^="extra-"]:checked');
    photoCheckboxes.forEach((cb) => {
      const checkbox = cb as HTMLInputElement;
      const label = document.querySelector(`label[for="${checkbox.id}"]`);
      if (label) {
        const name = label.textContent?.trim() || "";
        // Map photo types to prices
        const prices: { [key: string]: number } = {
          "Standard Photos": 199,
          "HDR Photos": 239,
          "Twilight Photos": 299,
          "Twilight Exteriors": 349,
          "Drone Stills": 399,
          "Virtual Staging": 40,
          "Photo Slideshow": 50,
        };
        const price = prices[name] || 0;
        if (price > 0 && name) {
          selectedPhotos.push({ category: "Photography", name, price });
        }
      }
    });

    // Remove existing photography items and add new ones
    setOrderItems((prev) => prev.filter((item) => item.category !== "Photography").concat(selectedPhotos));
  };

  const handleSaveVideo = () => {
    const selectedVideos: OrderItem[] = [];
    // Find all checked checkboxes that are within the Video accordion
    // Look for checkboxes with IDs starting with "video-"
    const videoCheckboxes = document.querySelectorAll('input[id^="video-"]:checked');
    videoCheckboxes.forEach((cb) => {
      const checkbox = cb as HTMLInputElement;
      const label = document.querySelector(`label[for="${checkbox.id}"]`);
      if (label) {
        const name = label.textContent?.trim() || "";
        const prices: { [key: string]: number } = {
          "Cinematic Walkthrough": 499,
          "Drone Video": 599,
        };
        const price = prices[name] || 0;
        if (price > 0 && name) {
          selectedVideos.push({ category: "Video", name, price });
        }
      }
    });

    setOrderItems((prev) => prev.filter((item) => item.category !== "Video").concat(selectedVideos));
  };

  const handleSaveDateSelection = async () => {
    const dateInput = document.getElementById("customDate") as HTMLInputElement;
    const timeSelect = document.querySelector('[data-value="flush-collapseSix"] select') as HTMLSelectElement;
    
    if (dateInput?.value) {
      const dateStr = dateInput.value;
      setSelectedDateStr(dateStr);
      // Load time slots for selected date
      await loadDateTimeSlots(dateStr);
      
      if (timeSelect?.value) {
      const timeText = timeSelect.options[timeSelect.selectedIndex]?.text || "";
        setSelectedTimeSlot(timeText);
      // Update existing items with date/time
      setOrderItems((prev) =>
        prev.map((item) => ({
          ...item,
            date: `${dateStr} - ${timeText}`,
        }))
      );
      }
    }
  };

  const removeOrderItem = (category: string, name: string) => {
    setOrderItems((prev) => {
      const filtered = prev.filter((item) => !(item.category === category && item.name === name));
      // Recalculate total when item is removed
      calculateTotalAmountForServices(filtered);
      return filtered;
    });
  };

  const calculateTotal = () => {
    // Use calculated amount from API if available, otherwise calculate from items
    if (calculatedAmount?.totalamount) {
      return Number(calculatedAmount.totalamount);
    }
    return orderItems.reduce((sum, item) => sum + item.price, 0);
  };

  // Helper functions to check if sections are filled
  const isListingDetailsFilled = () => {
    return listingDetailsSaved || !!(listingAddress && (homesize || listingSize));
  };

  const isCategoryFilled = (categoryName: string) => {
    return orderItems.some(item => 
      item.category.toLowerCase() === categoryName.toLowerCase()
    );
  };

  const isDateTimeFilled = () => {
    if (dateTimePreference === "asap" || dateTimePreference === "contact") {
      return true;
    }
    if (dateTimePreference === "same") {
      return !!(selectedDateStr && selectedTimeSlot);
    }
    if (dateTimePreference === "different") {
      return orderItems.every(item => item.date);
    }
    return false;
  };

  const [paymentFieldsFilled, setPaymentFieldsFilled] = useState(false);

  // Check payment fields periodically
  useEffect(() => {
    const checkPaymentFields = () => {
      const cardnumberInput = document.getElementById("cardnumber") as HTMLInputElement;
      const expirydateInput = document.getElementById("expirydate") as HTMLInputElement;
      const cvvInput = document.getElementById("cvv") as HTMLInputElement;
      const holdernameInput = document.getElementById("holdername") as HTMLInputElement;
      
      const isFilled = !!(
        cardnumberInput?.value && 
        validateCardNumber(cardnumberInput.value) &&
        expirydateInput?.value && 
        validateExpiryDate(expirydateInput.value) &&
        cvvInput?.value &&
        holdernameInput?.value
      );
      
      setPaymentFieldsFilled(isFilled);
    };

    // Check on mount and set up interval to check periodically
    checkPaymentFields();
    const interval = setInterval(checkPaymentFields, 500);
    
    // Also check on input events
    const cardnumberInput = document.getElementById("cardnumber");
    const expirydateInput = document.getElementById("expirydate");
    const cvvInput = document.getElementById("cvv");
    const holdernameInput = document.getElementById("holdername");
    
    [cardnumberInput, expirydateInput, cvvInput, holdernameInput].forEach(input => {
      if (input) {
        input.addEventListener("input", checkPaymentFields);
        input.addEventListener("blur", checkPaymentFields);
      }
    });

    return () => {
      clearInterval(interval);
      [cardnumberInput, expirydateInput, cvvInput, holdernameInput].forEach(input => {
        if (input) {
          input.removeEventListener("input", checkPaymentFields);
          input.removeEventListener("blur", checkPaymentFields);
        }
      });
    };
  }, []);

  const isPaymentFilled = () => {
    return paymentSaved || paymentFieldsFilled || Boolean(selectedPaymentMethodId);
  };

  const refreshSavedCards = async (preferId?: string) => {
    const methods = await getStripePaymentMethods();
    const payload = (methods.data || {}) as {
      customer?: { stripe_customer_id?: string };
      payment_methods?: Array<{ id: string; card?: { brand?: string; last4?: string; exp_month?: number; exp_year?: number } }>;
    };
    if (payload.customer?.stripe_customer_id) {
      setStripeCustomerId(payload.customer.stripe_customer_id);
    }
    const list = payload.payment_methods || [];
    setSavedPaymentMethods(list);
    const nextId = preferId || list[0]?.id || "";
    if (nextId) setSelectedPaymentMethodId(nextId);
    return list;
  };

  const handleSavePayment = async () => {
    setPaymentSaveError("");
    if (selectedPaymentMethodId && !(document.getElementById("cardnumber") as HTMLInputElement)?.value.replace(/\s/g, "")) {
      setPaymentSaved(true);
      setPaymentFieldsFilled(true);
      return;
    }

    const cardnumber = ((document.getElementById("cardnumber") as HTMLInputElement)?.value || "").replace(/\s/g, "");
    const expirydate = (document.getElementById("expirydate") as HTMLInputElement)?.value || "";
    const cvv = (document.getElementById("cvv") as HTMLInputElement)?.value || "";
    const holdername = (document.getElementById("holdername") as HTMLInputElement)?.value || "";
    const postalcode = (document.getElementById("postalcode") as HTMLInputElement)?.value || "";
    const saveCard = (document.getElementById("savecarddetails") as HTMLInputElement)?.checked ?? true;

    if (!cardnumber || !validateCardNumber(cardnumber)) {
      setCardNumberError("Please enter a valid card number");
      setPaymentSaveError("Please enter a valid card number. Stripe test card is 16 digits: 4242 4242 4242 4242");
      return;
    }
    if (!expirydate || !validateExpiryDate(expirydate)) {
      setExpiryDateError("Please enter a valid expiry date (MM/YY)");
      setPaymentSaveError("Please enter a valid expiry date (MM/YY)");
      return;
    }
    if (!cvv || cvv.replace(/\D/g, "").length < 3) {
      setPaymentSaveError("Please enter a valid CVV");
      return;
    }
    if (!holdername.trim()) {
      setPaymentSaveError("Please enter the card holder name");
      return;
    }

    setSavingPayment(true);
    try {
      let publishableKey = STRIPE_TEST_MODE ? STRIPE_TEST_PUBLISHABLE_KEY : stripePublishableKey;
      if (!publishableKey) {
        const config = await getStripeConfig();
        publishableKey = ((config.data || {}) as { publishable_key?: string }).publishable_key || "";
        if (publishableKey) setStripePublishableKey(publishableKey);
      }
      if (STRIPE_TEST_MODE) {
        publishableKey = STRIPE_TEST_PUBLISHABLE_KEY;
        setStripePublishableKey(publishableKey);
      }
      if (!publishableKey) {
        throw new Error("Stripe is not configured");
      }
      if (cardnumber.startsWith("4242") && !publishableKey.startsWith("pk_test")) {
        throw new Error("4242 is a Stripe TEST card. Cotala is on live Stripe — use a real card.");
      }

      const exp = expirydate.replace(/\D/g, "");
      const paymentMethodId = await createStripeCardPaymentMethodId({
        publishableKey,
        cardNumber: cardnumber,
        expMonth: exp.substring(0, 2),
        expYear: exp.substring(2, 4),
        cvc: cvv.replace(/\D/g, ""),
        name: holdername.trim(),
        postalCode: postalcode.trim(),
      });

      try {
        await createStripeSetupIntent({ name: holdername.trim() });
      } catch (error) {
        console.warn("Stripe setup intent skipped", error);
      }

      try {
        const nickname = ((document.getElementById("cardnickname") as HTMLInputElement)?.value || "").trim();
        const saved = await addStripePaymentMethod(paymentMethodId, saveCard, {
          name: holdername.trim(),
          ...(nickname ? { nickname } : {}),
        });
        if ((saved as { status?: boolean }).status === false) {
          throw new Error(
            (saved as { msg?: string; message?: string }).msg ||
              (saved as { message?: string }).message ||
              "Unable to save card"
          );
        }
        const customerId =
          ((saved.data || {}) as { customer_id?: string }).customer_id || stripeCustomerId;
        if (customerId) {
          setStripeCustomerId(customerId);
          await saveStripeCustomer(customerId);
        }
        await refreshSavedCards(paymentMethodId);
      } catch (error) {
        if (!STRIPE_TEST_MODE) throw error;
        console.warn("Live billing skipped in Stripe test mode", error);
        setSavedPaymentMethods([
          {
            id: paymentMethodId,
            card: {
              brand: "visa",
              last4: cardnumber.slice(-4),
              exp_month: Number(exp.substring(0, 2)),
              exp_year: Number(exp.substring(2, 4).length === 2 ? `20${exp.substring(2, 4)}` : exp.substring(2, 4)),
            },
          },
        ]);
        setSelectedPaymentMethodId(paymentMethodId);
      }

      setPaymentSaved(true);
      setPaymentFieldsFilled(true);
      setPaymentSaveError("");
    } catch (error) {
      console.error("Failed to save payment method", error);
      setPaymentSaveError(error instanceof Error ? error.message : "Unable to save card");
    } finally {
      setSavingPayment(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="w-full p-0 bg-black">
        <div className="flex flex-wrap m-0">
          {/* Main Content - Left Side (9 columns on desktop) */}
          <div className="w-full md:w-9/12 p-0">
            {/* Hero Section */}
            <div
              className="w-full text-white px-6 md:px-10 pt-12 pb-12 md:pt-[100px] md:pb-[50px] h-[25vh] md:h-[45vh] min-h-[180px]"
              style={{
                backgroundImage: `url(${heroBg})`,
                backgroundSize: "cover",
                backgroundPosition: "bottom",
              }}
            >
              <h1 className="text-white text-[28px] md:text-[36px] font-medium leading-snug mb-2.5">
                Let’s book your appointment,
                {userName ? (
                  <>
                    <br />
                    {capitalizeFirstLetter(userName)}
                  </>
                ) : null}
              </h1>
            </div>
            <Accordion
              type="single"
              collapsible
              className="accordion-flush bg-black"
              value={openAccordion}
              onValueChange={(value) => {
                setOpenAccordion(value || "");
                if (value?.startsWith("category-") && !loadingOptions && !orderOptions) {
                  loadOrderOptions(listingSize || homesize || "2000");
                }
              }}
            >
              {/* Listing Details */}
              <AccordionItem value="flush-collapseOne" className="border-b border-white/20">
                <AccordionTrigger className="text-white hover:no-underline px-4 md:px-6 [&>svg]:hidden group">
                  <div className="flex items-center justify-between w-full pr-4">
                    <span>Listing Details</span>
                    <div className="flex items-center gap-2">
                      {isListingDetailsFilled() && (
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                      )}
                      <ChevronDown className="h-5 w-5 text-white/70 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 md:px-6 pb-4" style={{ backgroundColor: "#222023" }}>
                  <div className="form-section">
                    <div className="mb-4 flex items-center gap-3">
                      <span className="icon-label flex-shrink-0">
                        <MapPin className="h-6 w-6 text-[#b084f0]" fill="#b084f0" stroke="#222023" />
                      </span>
                      <div className="flex-grow" style={{ marginTop: "0.5rem" }}>
                        <Label htmlFor="address" className="text-white/70 mb-2 block" style={{ marginTop: "0.75rem" }}>
                          Listing Address
                        </Label>
                        <div className="relative">
                        <Input
                          type="text"
                          id="address"
                            placeholder="Select from your listings or type a Canada address..."
                            className="bg-black/40 border-white/20 text-white pr-10"
                            style={{ paddingTop: "0.75rem", paddingBottom: "0.75rem" }}
                            value={listingAddress}
                            onChange={(e) => handleAddressChange(e.target.value)}
                            onFocus={() => {
                              if (!selectedListingId) {
                                setUseGooglePlaces(true);
                              }
                            }}
                            list="my-listings-options"
                          />
                          {myListings && myListings.length > 0 && (
                            <datalist id="my-listings-options">
                              {myListings.map((tour) => (
                                <option
                                  key={tour.tourid}
                                  value={`${tour.address}${tour.city ? `, ${tour.city}` : ""}`}
                                  data-tourid={tour.tourid}
                                />
                              ))}
                            </datalist>
                          )}
                          {listingAddress && (
                            <div className="absolute right-2 top-1/2 -translate-y-1/2">
                              <button
                                type="button"
                                onClick={() => {
                                  setListingAddress("");
                                  setSelectedListingId("");
                                  setUseGooglePlaces(true);
                                }}
                                className="text-white/50 hover:text-white"
                              >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  width="16"
                                  height="16"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <line x1="18" y1="6" x2="6" y2="18"></line>
                                  <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                              </button>
                            </div>
                          )}
                        </div>
                        {myListings && myListings.length > 0 && (
                          <p className="text-xs text-white/50 mt-1">
                            Select from your listings above or type a new address
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="mb-4 flex items-center gap-3">
                      <span className="icon-label flex-shrink-0">
                        <Ruler className="h-6 w-6 text-[#b084f0]" />
                      </span>
                      <div className="flex-grow">
                        <Label htmlFor="size" className="text-white/70 mb-2 block" style={{ marginTop: "0.75rem" }}>
                          Approximate Size
                        </Label>
                        <Input
                          type="text"
                          style={{ paddingTop: "0.75rem", paddingBottom: "0.75rem" }}
                          id="size"
                          placeholder="2000"
                          className="bg-black/40 border-white/20 text-white"
                          value={listingSize}
                          onChange={(e) => {
                            setListingSize(e.target.value);
                            setHomesize(e.target.value);
                          }}
                        />
                      </div>
                    </div>
                    <h6 className="text-white mb-3">Property Type</h6>
                    <div className="photography flex flex-wrap mb-4">
                      <label
                        className={`btn ${propertyType === "residential" ? "active" : ""}`}
                        onClick={() => setPropertyType("residential")}
                      >
                        Residential
                      </label>
                      <label
                        className={`btn ${propertyType === "commercial" ? "active" : ""}`}
                        onClick={() => setPropertyType("commercial")}
                      >
                        Commercial
                      </label>
                    </div>
                    <h6 className="text-white mb-3">Is this Co-Listed?</h6>
                    <div className="photography flex flex-wrap mb-4">
                      <label
                        className={`btn ${isCoListed === "yes" ? "active" : ""}`}
                        onClick={() => setIsCoListed("yes")}
                      >
                        Yes
                      </label>
                      <label
                        className={`btn ${isCoListed === "no" ? "active" : ""}`}
                        onClick={() => {
                          setIsCoListed("no");
                          setCoRealtorKey("");
                        }}
                      >
                        No
                      </label>
                    </div>
                    {isCoListed === "yes" && (
                      <div className="mb-6 relative">
                        <Input
                          type="text"
                          value={coRealtorOpen ? coRealtorQuery : selectedCoRealtor?.name || coRealtorQuery}
                          placeholder={coRealtorsLoading ? "Loading realtors..." : "Select Connected Realtor"}
                          className="bg-black/40 border-white/20 text-white"
                          style={{ paddingTop: "0.75rem", paddingBottom: "0.75rem" }}
                          onFocus={() => {
                            setCoRealtorOpen(true);
                            setCoRealtorQuery("");
                          }}
                          onBlur={() => window.setTimeout(() => setCoRealtorOpen(false), 150)}
                          onChange={(e) => {
                            setCoRealtorQuery(e.target.value);
                            setCoRealtorKey("");
                            setCoRealtorOpen(true);
                          }}
                        />
                        {coRealtorOpen && !coRealtorsLoading && (
                          <ul className="absolute z-20 mt-1 w-full max-h-72 overflow-y-auto rounded-md border border-white/20 bg-[#1c1a1d] py-1 shadow-lg">
                            {coRealtorMatches.length === 0 ? (
                              <li className="px-3 py-2 text-sm text-white/50">No connected realtors found.</li>
                            ) : (
                              coRealtorMatches.map((realtor) => (
                                <li key={realtor.name}>
                                  <button
                                    type="button"
                                    className={`w-full text-left px-3 py-2 text-sm hover:bg-white/10 ${
                                      coRealtorKey === realtor.name ? "text-[#b388ff]" : "text-white"
                                    }`}
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => {
                                      setCoRealtorKey(realtor.name);
                                      setCoRealtorQuery("");
                                      setCoRealtorOpen(false);
                                    }}
                                  >
                                    {realtor.name}
                                    {realtor.username ? (
                                      <span className="text-white/40"> ({realtor.username})</span>
                                    ) : null}
                                  </button>
                                </li>
                              ))
                            )}
                          </ul>
                        )}
                      </div>
                    )}
                    <SelectionBar
                      onClear={() => {
                        setListingAddress("");
                        setSelectedListingId("");
                        setUseGooglePlaces(true);
                        setListingSize("");
                        setHomesize("");
                        setPropertyType("residential");
                        setIsCoListed("no");
                        setCoRealtorKey("");
                        setListingDetailsSaved(false);
                      }}
                      onConfirm={async () => {
                        const sizeValue = listingSize || "2000";
                        setListingSize(sizeValue);
                        setHomesize(sizeValue);
                        handleSaveListingDetails();
                        setListingDetailsSaved(true);
                        await loadOrderOptions(sizeValue);
                        setOpenAccordion("category-photography");
                      }}
                    />
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* Service sections with image + price cards */}
              {([
                {
                  key: "photography",
                  title: "Photography",
                  fallback: photoFallback,
                  extras: orderOptions?.photography_extra || [],
                  extrasTitle: "Photography Extras",
                  printAddons: orderOptions?.printaddon || [],
                  services: orderOptions?.photography || [],
                  orientation: false,
                },
                {
                  key: "videography",
                  title: "Video",
                  fallback: videoFallback,
                  extras: orderOptions?.videography_extra || [],
                  extrasTitle: "Videography Extras",
                  printAddons: [] as OrderOptionService[],
                  services: orderOptions?.videography || [],
                  orientation: true,
                },
                {
                  key: "virtual_tour",
                  title: "Virtual Tours",
                  fallback: photoFallback,
                  extras: [] as OrderOptionService[],
                  extrasTitle: "",
                  printAddons: [] as OrderOptionService[],
                  services: orderOptions?.virtual_tour || [],
                  orientation: false,
                },
                {
                  key: "FloorplansandMatterport",
                  title: "Floorplans and Matterport",
                  fallback: floorFallback,
                  extras: [] as OrderOptionService[],
                  extrasTitle: "",
                  printAddons: [] as OrderOptionService[],
                  services: orderOptions?.FloorplansandMatterport || [],
                  orientation: false,
                },
              ]).map((section) => (
                <AccordionItem
                  key={section.key}
                  value={`category-${section.key}`}
                  className="border-b border-white/20"
                >
                  <AccordionTrigger className="text-white hover:no-underline px-4 md:px-6 [&>svg]:hidden group">
                    <div className="flex items-center justify-between w-full pr-4">
                      <span>{section.title}</span>
                      <div className="flex items-center gap-2">
                        {(isCategoryFilled(section.title) ||
                          (section.key === "photography" && isCategoryFilled("Print Add-ons"))) && (
                          <CheckCircle2 className="h-5 w-5 text-green-500" />
                        )}
                        <ChevronDown className="h-5 w-5 text-white/70 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-4 md:px-6 pb-4" style={{ backgroundColor: "#222023" }}>
                    {loadingOptions ? (
                      <p className="text-white/70">Loading services...</p>
                    ) : !orderOptions ? (
                      <p className="text-white/70">Loading services...</p>
                    ) : (
                      <>
                        {section.services.length > 0 && (
                          <>
                            <h6 className="text-white mb-3">Select all that apply</h6>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                              {section.services.map((service) => (
                                <ServiceOptionCard
                                  key={String(service.id)}
                                  service={service}
                                  fallback={section.fallback}
                                  selected={isServiceSelected(section.title, service.id)}
                                  onToggle={() =>
                                    handleServiceSelect(
                                      section.title,
                                      service.id,
                                      optionTitle(service),
                                      false,
                                      optionPrice(service),
                                      "field"
                                    )
                                  }
                                />
                              ))}
                            </div>
                          </>
                        )}

                        {section.extras.length > 0 && (
                          <>
                            <h6 className="text-white mb-3 mt-3">{section.extrasTitle}</h6>
                            <ExtraPills
                              extras={section.extras}
                              selectedIds={orderItems
                                .filter((item) => item.category === section.title && item.type === "addon")
                                .map((item) => item.serviceId || "")}
                              onToggle={(extra) =>
                                handleServiceSelect(
                                  section.title,
                                  extra.id,
                                  optionTitle(extra),
                                  true,
                                  optionPrice(extra),
                                  "addon"
                                )
                              }
                            />
                          </>
                        )}

                        {section.printAddons.length > 0 && (
                          <>
                            <h6 className="text-white mb-3 mt-3">Print Add-ons</h6>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                              {section.printAddons.map((addon) => (
                                <ServiceOptionCard
                                  key={String(addon.id)}
                                  service={addon}
                                  fallback={
                                    Number(addon.id) === 202
                                      ? printBookFallback
                                      : Number(addon.id) === 136
                                        ? printTriFallback
                                        : printSheetFallback
                                  }
                                  selected={isServiceSelected("Print Add-ons", addon.id)}
                                  onToggle={() =>
                                    handleServiceSelect(
                                      "Print Add-ons",
                                      addon.id,
                                      optionTitle(addon),
                                      false,
                                      optionPrice(addon),
                                      "print"
                                    )
                                  }
                                />
                              ))}
                            </div>
                          </>
                        )}

                        {section.orientation ? (
                          <>
                            <h6 className="text-white mb-3">Orientation</h6>
                            <div className="photography flex flex-wrap mb-4">
                              <label
                                className={`btn ${videoOrientation === "horizontal" ? "active" : ""}`}
                                onClick={() => setVideoOrientation("horizontal")}
                              >
                                Horizontal
                              </label>
                              <label
                                className={`btn ${videoOrientation === "vertical" ? "active" : ""}`}
                                onClick={() => setVideoOrientation("vertical")}
                              >
                                Vertical (Best for Mobile)
                              </label>
                            </div>
                          </>
                        ) : null}

                        {section.key === "FloorplansandMatterport" ? (
                          <>
                            <h6 className="text-white mb-3 mt-3">Floorplan Options</h6>
                            <div className="photography flex flex-wrap mb-4">
                              <label
                                className={`btn ${includeDecks ? "active" : ""}`}
                                onClick={() => setIncludeDecks((v) => !v)}
                              >
                                Include Decks/Patios/Outbuildings
                              </label>
                            </div>
                          </>
                        ) : null}

                        {!section.services.length && !section.extras.length && !section.printAddons.length ? (
                          <p className="text-white/70">No services available for this home size</p>
                        ) : null}

                        <SelectionBar
                          confirmLabel={
                            section.key === "videography" &&
                            !orderItems.some((item) => item.category.toLowerCase() === section.title.toLowerCase())
                              ? "NO THANKS"
                              : "CONFIRM SELECTION"
                          }
                          onClear={() => {
                            setOrderItems((prev) => {
                              const filtered = prev.filter((item) =>
                                item.category.toLowerCase() !== section.title.toLowerCase() &&
                                !(section.key === "photography" && item.category === "Print Add-ons")
                              );
                              calculateTotalAmountForServices(filtered);
                              return filtered;
                            });
                          }}
                          onConfirm={() => {
                            setCategorySaved((prev) => ({ ...prev, [section.title]: true }));
                            setOpenAccordion("");
                          }}
                        />
                      </>
                    )}
                  </AccordionContent>
                </AccordionItem>
              ))}

              {/* Date / Time Preference */}
              <AccordionItem value="flush-collapseSix" className="border-b border-white/20">
                <AccordionTrigger className="text-white hover:no-underline px-4 md:px-6 [&>svg]:hidden group">
                  <div className="flex items-center justify-between w-full pr-4">
                    <span>Date / Time Preference</span>
                    <div className="flex items-center gap-2">
                      {isDateTimeFilled() && (
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                      )}
                      <ChevronDown className="h-5 w-5 text-white/70 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 md:px-6 pb-4" style={{ backgroundColor: "#222023" }}>
                  <Select value={dateTimePreference} onValueChange={setDateTimePreference}>
                    <SelectTrigger className="mb-5 bg-black/40 border-white/20 text-white" style={{ paddingTop: "0.75rem", paddingBottom: "0.75rem", marginTop: "0.75rem" }}>
                      <SelectValue placeholder="Please select one" />
                    </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="asap">As soon as possible</SelectItem>
                      <SelectItem value="same">Schedule services at the same time</SelectItem>
                      <SelectItem value="different">Different days for my services</SelectItem>
                      <SelectItem value="contact">Contact my seller</SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Schedule services at the same time */}
                  {dateTimePreference === "same" && (
                  <div className="mt-6">
                    <h5 className="text-white mb-4">Schedule services at the same time</h5>
                    <div className="form-check mb-4">
                      <input
                        className="form-check-input mr-2"
                        type="checkbox"
                        id="scheduleAllSameTime"
                        style={{ accentColor: "#b388ff" }}
                      />
                      <label className="form-check-label text-white" htmlFor="scheduleAllSameTime">
                        I want my services scheduled at the same time, if possible
                      </label>
                    </div>
                    <hr className="my-4 border-white/20" />
                    <div className="flex flex-wrap gap-3">
                      <div className="w-full md:w-4/12">
                        <Label className="form-label text-white w-100" style={{ marginTop: "0.75rem" }}>All Services</Label>
                      </div>
                      <div className="w-full md:w-4/12">
                        <div className="input-group">
                          <Input
                            type="date"
                            id="customDate"
                            className="form-control bg-black/40 border-white/20 text-white cursor-pointer"
                            placeholder="YYYY-MM-DD"
                            style={{ paddingTop: "0.75rem", paddingBottom: "0.75rem", cursor: "pointer" }}
                            onClick={(e) => {
                              // Open date picker on click (requires user gesture)
                              const target = e.target as HTMLInputElement;
                              if (target && 'showPicker' in target && typeof target.showPicker === 'function') {
                                try {
                                  target.showPicker();
                                } catch (error) {
                                  // If showPicker fails, just focus the input
                                  target.focus();
                                }
                              } else {
                                // Focus the input if showPicker is not available
                                target.focus();
                              }
                            }}
                            onChange={async (e) => {
                              const dateStr = e.target.value;
                              if (dateStr) {
                                setSelectedDateStr(dateStr);
                                await loadDateTimeSlots(dateStr);
                              }
                            }}
                          />
                        </div>
                      </div>
                      <div className="w-full md:w-4/12">
                        <div className="input-group">
                          <Select 
                            value={selectedTimeSlot}
                            onValueChange={(value) => {
                              setSelectedTimeSlot(value);
                              if (selectedDateStr) {
                                setOrderItems((prev) =>
                                  prev.map((item) => ({
                                    ...item,
                                    date: `${selectedDateStr} - ${value}`,
                                  }))
                                );
                              }
                            }}
                          >
                            <SelectTrigger className="bg-black/40 border-white/20 text-white">
                              <SelectValue placeholder="Choose..." />
                            </SelectTrigger>
                            <SelectContent>
                              {timeSlots.length > 0 ? (
                                timeSlots.map((slot, idx) => (
                                  <SelectItem key={idx} value={`${slot.slotStart} - ${slot.slotEnd}`}>
                                    {slot.slotStart} - {slot.slotEnd}
                                  </SelectItem>
                                ))
                              ) : (
                                <div className="px-2 py-1.5 text-sm text-white/50">Select date first</div>
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                    <hr className="my-4 border-white/20" />
                    <div className="flex justify-end gap-3">
                      <button 
                        onClick={() => {
                          handleSaveDateSelection();
                          setDateTimeSameSaved(true);
                          setOpenAccordion("");
                        }}
                        className={`border-2 border-white text-white px-4 py-2 rounded-md hover:bg-white/10 flex items-center gap-2 transition-colors ${
                          dateTimeSameSaved ? "bg-green-400/30 border-green-400" : ""
                        }`}
                      >
                        <Check className="h-4 w-4" />
                        Save Selection
                      </button>
                    </div>
                  </div>
                  )}

                  {/* Different days for my services */}
                  {dateTimePreference === "different" && (
                  <div className="mt-8">
                    <h5 className="text-white mb-4">Different days for my services</h5>
                    {orderItems.length === 0 ? (
                      <p className="text-white/70">Please select services first</p>
                    ) : (
                      <div className="space-y-6">
                        {orderItems.map((item, itemIdx) => {
                          const serviceKey = `${item.category}-${item.serviceId}`;
                          const serviceDate = serviceDates[serviceKey]?.date || "";
                          const serviceTimeSlot = serviceDates[serviceKey]?.timeSlot || "";
                          const slotsForService = serviceTimeSlots[serviceKey] || [];

                          return (
                            <div key={itemIdx} className="flex flex-wrap gap-4 mb-6">
                              <div className="w-full md:w-6/12">
                                <div className="card-1 bg-black/40 border border-white/20 rounded-lg p-4">
                                  <h5 className="text-white mb-3 flex items-center gap-2">
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      width="24"
                                      height="24"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="#B08BC0"
                                      strokeWidth="1.5"
                                    >
                                      <path d="M2 12c0-3.771 0-5.657 1.172-6.828S6.229 4 10 4h4c3.771 0 5.657 0 6.828 1.172S22 8.229 22 12v2c0 3.771 0 5.657-1.172 6.828S17.771 22 14 22h-4c-3.771 0-5.657 0-6.828-1.172S2 17.771 2 14z" />
                                      <path strokeLinecap="round" d="M7 4V2.5M17 4V2.5" />
                                      <circle cx="16.5" cy="16.5" r="1.5" />
                                      <path strokeLinecap="round" d="M2.5 9h19" />
                                    </svg>
                                    &nbsp;&nbsp;{item.name}
                                  </h5>
                                  <Input
                                    type="date"
                                    className="form-control bg-black/40 border-white/20 text-white mb-4 cursor-pointer"
                                    style={{ paddingTop: "0.75rem", paddingBottom: "0.75rem", cursor: "pointer" }}
                                    value={serviceDate}
                                    onClick={(e) => {
                                      // Open date picker on click (requires user gesture)
                                      const target = e.target as HTMLInputElement;
                                      if (target && 'showPicker' in target && typeof target.showPicker === 'function') {
                                        try {
                                          target.showPicker();
                                        } catch (error) {
                                          // If showPicker fails, just focus the input
                                          target.focus();
                                        }
                                      } else {
                                        // Focus the input if showPicker is not available
                                        target.focus();
                                      }
                                    }}
                                    onChange={async (e) => {
                                      const dateStr = e.target.value;
                                      if (dateStr) {
                                        setServiceDates(prev => ({
                                          ...prev,
                                          [serviceKey]: { ...prev[serviceKey], date: dateStr, timeSlot: "" }
                                        }));
                                        // Load time slots for this date
                                        try {
                                          const data = await getDateTimeSlots({ date: dateStr });
                                          if (data.status && data.timeSlots) {
                                            setServiceTimeSlots(prev => ({
                                              ...prev,
                                              [serviceKey]: data.timeSlots || []
                                            }));
                                          }
                                        } catch (error) {
                                          console.error("Failed to load time slots", error);
                                        }
                                      }
                                    }}
                                  />
                                  {slotsForService.length > 0 && (
                                    <Select
                                      value={serviceTimeSlot}
                                      onValueChange={(value) => {
                                        setServiceDates(prev => ({
                                          ...prev,
                                          [serviceKey]: { ...prev[serviceKey], timeSlot: value }
                                        }));
                                        // Update order item with date and time
                                        setOrderItems(prev => prev.map((orderItem, idx) => 
                                          idx === itemIdx 
                                            ? { ...orderItem, date: `${serviceDate} - ${value}` }
                                            : orderItem
                                        ));
                                      }}
                                    >
                                      <SelectTrigger className="bg-black/40 border-white/20 text-white" style={{ paddingTop: "0.75rem", paddingBottom: "0.75rem" }}>
                                        <SelectValue placeholder="Select time slot" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {slotsForService.map((slot, idx) => (
                                          <SelectItem key={idx} value={`${slot.slotStart} - ${slot.slotEnd}`}>
                                            {slot.slotStart} - {slot.slotEnd}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <div className="flex justify-end gap-3 mt-6">
                      <button 
                        onClick={() => {
                          // Save all service dates and times
                          orderItems.forEach((item, idx) => {
                            const serviceKey = `${item.category}-${item.serviceId}`;
                            const serviceDate = serviceDates[serviceKey]?.date || "";
                            const serviceTimeSlot = serviceDates[serviceKey]?.timeSlot || "";
                            if (serviceDate && serviceTimeSlot) {
                              setOrderItems(prev => prev.map((orderItem, itemIdx) => 
                                itemIdx === idx 
                                  ? { ...orderItem, date: `${serviceDate} - ${serviceTimeSlot}` }
                                  : orderItem
                              ));
                            }
                          });
                          setDateTimeDifferentSaved(true);
                          setOpenAccordion("");
                        }}
                        className={`border-2 border-white text-white px-4 py-2 rounded-md hover:bg-white/10 flex items-center gap-2 transition-colors ${
                          dateTimeDifferentSaved ? "bg-green-400/30 border-green-400" : ""
                        }`}
                      >
                        <Check className="h-4 w-4" />
                        Save Selection
                      </button>
                    </div>
                  </div>
                  )}

                  {/* Contact my seller */}
                  {dateTimePreference === "contact" && (
                  <div className="mt-8">
                    <h5 className="text-white mb-4">Contact my seller</h5>
                    {sellerConfirmed ? (
                      <div className="mb-4">
                        <h6 className="text-white mb-4">Seller Details</h6>
                        <div className="border-l border-white/30 pl-3">
                          <p className="mb-1 text-white">{sellerName}</p>
                          <p className="mb-1 text-white">{sellerPhone}</p>
                          <p className="text-white">
                            {sellerNotes}{" "}
                            <button
                              type="button"
                              className="text-[#b388ff] text-sm font-semibold ml-2"
                              onClick={() => setSellerConfirmed(false)}
                            >
                              CHANGE
                            </button>
                          </p>
                        </div>
                      </div>
                    ) : (
                    <div className="form-section">
                      <div className="mb-4">
                        <Label htmlFor="seller" className="text-white/70 mb-2 block" style={{ marginTop: "0.75rem" }}>
                          Seller Name
                        </Label>
                        <Input
                          type="text"
                          id="seller"
                          value={sellerName}
                          onChange={(e) => setSellerName(e.target.value)}
                          className="bg-black/40 border-white/20 text-white"
                          style={{ paddingTop: "0.75rem", paddingBottom: "0.75rem" }}
                        />
                      </div>
                      <div className="mb-4">
                        <Label htmlFor="phone" className="text-white/70 mb-2 block" style={{ marginTop: "0.75rem" }}>
                          Phone Number
                        </Label>
                        <Input
                          type="tel"
                          id="phone"
                          value={sellerPhone}
                          onChange={(e) => setSellerPhone(e.target.value)}
                          className="bg-black/40 border-white/20 text-white"
                          style={{ paddingTop: "0.75rem", paddingBottom: "0.75rem" }}
                        />
                      </div>
                      <div className="mb-4">
                        <Label htmlFor="seller-notes" className="text-white/70 mb-2 block" style={{ marginTop: "0.75rem" }}>
                          Additional Notes
                        </Label>
                        <Input
                          type="text"
                          id="seller-notes"
                          value={sellerNotes}
                          onChange={(e) => setSellerNotes(e.target.value)}
                          placeholder="e.g. Call in the afternoon"
                          className="bg-black/40 border-white/20 text-white"
                          style={{ paddingTop: "0.75rem", paddingBottom: "0.75rem" }}
                        />
                      </div>
                      <div className="text-end">
                        <button
                          type="button"
                          className="save-btn bg-[#b388ff] hover:bg-[#b388ff]/80 text-white px-6 py-2 rounded-full font-semibold flex items-center gap-2 mx-auto md:mx-0"
                          onClick={() => {
                            if (!sellerName.trim() || !sellerPhone.trim()) {
                              alert("Please enter the seller name and phone number");
                              return;
                            }
                            setSellerConfirmed(true);
                          }}
                        >
                          <Check className="h-4 w-4" />
                          CONFIRM SELECTION
                        </button>
                      </div>
                    </div>
                    )}
                  </div>
                  )}
                </AccordionContent>
              </AccordionItem>

              {/* Payment */}
              <AccordionItem value="flush-collapseSeven" className="border-b border-white/20">
                <AccordionTrigger className="text-white hover:no-underline px-4 md:px-6 [&>svg]:hidden group">
                  <div className="flex items-center justify-between w-full pr-4">
                    <span>
                      Payment
                      {STRIPE_TEST_MODE ? (
                        <span className="ml-2 text-xs text-yellow-400 font-normal">TEST MODE</span>
                      ) : null}
                    </span>
                    <div className="flex items-center gap-2">
                      {isPaymentFilled() && (
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                      )}
                      <ChevronDown className="h-5 w-5 text-white/70 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 md:px-6 pb-4" style={{ backgroundColor: "#222023" }}>
                  {STRIPE_TEST_MODE ? (
                    <p className="text-yellow-400/90 text-sm mb-4">
                      Stripe test mode: use card 4242 4242 4242 4242, expiry 12/28, CVV 123.
                    </p>
                  ) : null}
                  {savedPaymentMethods.length > 0 && (
                    <div className="mb-5">
                      <h6 className="text-white mb-3">Saved cards</h6>
                      <div className="flex flex-wrap gap-2">
                        {savedPaymentMethods.map((method) => (
                          <button
                            key={method.id}
                            type="button"
                            className={`px-4 py-2 rounded-full border text-sm ${
                              selectedPaymentMethodId === method.id
                                ? "bg-[#AE8AC0] text-black border-[#AE8AC0]"
                                : "border-white/30 text-white"
                            }`}
                            onClick={() => setSelectedPaymentMethodId(method.id)}
                          >
                            {(method.card?.brand || "Card").toUpperCase()} •••• {method.card?.last4 || "****"}
                          </button>
                        ))}
                        <button
                          type="button"
                          className={`px-4 py-2 rounded-full border text-sm ${
                            !selectedPaymentMethodId ? "bg-[#AE8AC0] text-black border-[#AE8AC0]" : "border-white/30 text-white"
                          }`}
                          onClick={() => setSelectedPaymentMethodId("")}
                        >
                          New card
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="flex flex-wrap">
                    <div className="w-full md:w-6/12 mb-4">
                      <Label htmlFor="cardnumber" className="text-white/70 mb-2 block" style={{ marginTop: "0.75rem" }}>
                        Card Number*
                      </Label>
                      <Input
                        id="cardnumber"
                        type="text"
                        required
                        placeholder="1234 5678 9012 3456"
                        maxLength={19}
                        onChange={handleCardNumberChange}
                        onBlur={handleCardNumberBlur}
                        className={`bg-black/40 border-white/20 text-white ${cardNumberError ? "border-red-500" : ""}`}
                        style={{ paddingTop: "0.75rem", paddingBottom: "0.75rem" }}
                      />
                      {cardNumberError && (
                        <p className="text-red-500 text-sm mt-1">{cardNumberError}</p>
                      )}
                    </div>
                    <div className="w-full md:w-3/12 mb-4">
                      <Label htmlFor="expirydate" className="text-white/70 mb-2 block" style={{ marginTop: "0.75rem" }}>
                        Exp Date*
                      </Label>
                      <Input
                        type="text"
                        id="expirydate"
                        placeholder="MM/YY"
                        maxLength={5}
                        onChange={handleExpiryDateChange}
                        onBlur={handleExpiryDateBlur}
                        required
                        className={`bg-black/40 border-white/20 text-white ${expiryDateError ? "border-red-500" : ""}`}
                        style={{ paddingTop: "0.75rem", paddingBottom: "0.75rem" }}
                      />
                      {expiryDateError && (
                        <p className="text-red-500 text-sm mt-1">{expiryDateError}</p>
                      )}
                    </div>
                    <div className="w-full md:w-3/12 mb-4">
                      <Label htmlFor="cvv" className="text-white/70 mb-2 block" style={{ marginTop: "0.75rem" }}>
                        CVV*
                      </Label>
                      <Input
                        type="text"
                        id="cvv"
                        required
                        className="bg-black/40 border-white/20 text-white"
                        style={{ paddingTop: "0.75rem", paddingBottom: "0.75rem" }}
                      />
                    </div>
                    <div className="w-full md:w-6/12 mb-4">
                      <Label htmlFor="countryname" className="text-white/70 mb-2 block" style={{ marginTop: "0.75rem" }}>
                        Country
                      </Label>
                      <Select defaultValue="canada">
                        <SelectTrigger className="bg-black/40 border-white/20 text-white" style={{ paddingTop: "0.75rem", paddingBottom: "0.75rem" }}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="canada">Canada</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="w-full md:w-6/12 mb-4">
                      <Label htmlFor="postalcode" className="text-white/70 mb-2 block" style={{ marginTop: "0.75rem" }}>
                        Postal Code
                      </Label>
                      <Input
                        type="text"
                        name="postalcode"
                        id="postalcode"
                        required
                        className="bg-black/40 border-white/20 text-white"
                        style={{ paddingTop: "0.75rem", paddingBottom: "0.75rem" }}
                      />
                    </div>
                    <div className="w-full md:w-6/12 mb-4">
                      <Label htmlFor="holdername" className="text-white/70 mb-2 block" style={{ marginTop: "0.75rem" }}>
                        Card Holder Name*
                      </Label>
                      <Input
                        type="text"
                        name="holdername"
                        id="holdername"
                        required
                        className="bg-black/40 border-white/20 text-white"
                        style={{ paddingTop: "0.75rem", paddingBottom: "0.75rem" }}
                      />
                    </div>
                    <div className="w-full md:w-6/12 mb-4">
                      <Label htmlFor="cardnickname" className="text-white/70 mb-2 block" style={{ marginTop: "0.75rem" }}>
                        Nickname (optional)
                      </Label>
                      <Input
                        type="text"
                        id="cardnickname"
                        className="bg-black/40 border-white/20 text-white"
                        style={{ paddingTop: "0.75rem", paddingBottom: "0.75rem" }}
                      />
                    </div>
                    <div className="w-full md:w-6/12 mb-4">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="savecarddetails"
                          defaultChecked
                          className="h-4 w-4 rounded border border-white/40 bg-black/60"
                          style={{ accentColor: "#b388ff" }}
                        />
                        <Label htmlFor="savecarddetails" className="text-white/70">
                          Save card details
                        </Label>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap">
                    <div className="w-full md:w-6/12 pt-2">
                      <img src={cardImg} width="120" alt="Accepted cards" />
                    </div>
                  </div>
                  <div className="text-end mt-4">
                    {paymentSaveError ? (
                      <p className="text-red-400 text-sm mb-3">{paymentSaveError}</p>
                    ) : null}
                    {paymentSaved ? (
                      <p className="text-green-400 text-sm mb-3">Card saved</p>
                    ) : null}
                    <button
                      type="button"
                      onClick={handleSavePayment}
                      disabled={savingPayment}
                      className={`save-btn bg-[#b388ff] hover:bg-[#b388ff]/80 text-white px-6 py-2 rounded-full font-semibold flex items-center gap-2 mx-auto md:mx-0 ${
                        paymentSaved ? "bg-green-500 hover:bg-green-500" : ""
                      }`}
                    >
                      <Check className="h-4 w-4" />
                      {savingPayment ? "SAVING..." : paymentSaved ? "SAVED" : "SAVE"}
                    </button>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>

          {/* Right Sidebar - Order Summary (3 columns on desktop) */}
          <div className="w-full md:w-3/12 p-0" style={{ backgroundColor: "#463953" }}>
            <aside className="px-3 pt-3 pb-6">
              <div>
                <h4 className="text-white pt-8 mb-4">Your Order</h4>
                {(listingAddress || listingSize) && (
                  <div className="card mb-4 mt-4 shadow-none bg-black/40 border border-white/20 rounded-lg">
                    <div className="card-body p-3">
                      {listingAddress && (
                        <>
                          <p className="mb-0 text-white/70 text-sm">Listing Address</p>
                          <p className="text-sm text-white mb-2">{listingAddress}</p>
                        </>
                      )}
                      {listingSize && (
                        <>
                          <p className="mb-0 text-white/70 text-sm">Approximate Size</p>
                          <p className="text-sm text-white mb-0">{listingSize}</p>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Selected services grouped by category */}
              {Array.from(new Set(orderItems.map((item) => item.category))).map((categoryName) => {
                  const categoryItems = orderItems.filter(item => item.category === categoryName);
                  
                  return (
                    <div key={categoryName}>
                      <div className="price-section mb-4">
                        <h6 className="text-white mb-3 capitalize">{categoryName}</h6>
                        {categoryItems.map((item, idx) => (
                          <div key={idx} className="flex item justify-between mb-2">
                            <div className="text-white/70 text-sm">{item.name}</div>
                            <div className="flex items-center">
                              <span className="me-2 text-white text-sm">${item.price.toFixed(2)}</span>
                              <span 
                                onClick={() => removeOrderItem(item.category, item.name)}
                                className="remove-icon text-white/70 cursor-pointer hover:text-white"
                              >
                                &times;
                              </span>
                            </div>
                          </div>
                        ))}
                        {categoryItems.some(item => item.date) && (
                          <div className="mt-3">
                            <small className="text-white/70">Preferred Date</small>
                            <br />
                            <span className="text-orange-400 text-sm font-semibold">
                              {categoryItems.find(item => item.date)?.date || "To be selected"}
                            </span>
                          </div>
                        )}
                      </div>
                      <hr className="border-white/20 my-4" />
                    </div>
                  );
                })}

              {/* Total */}
              <div className="text-end total mb-4">
                <span className="text-white/70">EST. TOTAL</span>
                &nbsp;&nbsp;
                <span className="text-white font-bold text-lg">${calculateTotal().toFixed(2)}</span>
              </div>
              <div className="d-flex justify-content-end pb-3 mb-4">
                <span className="text-white/70 text-xs text-end">
                  Final price will be invoiced upon completed services
                </span>
              </div>
              <div className="mb-4 additional">
                <Textarea
                  rows={5}
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  placeholder="Additional notes about your order..."
                  className="bg-black/40 border-white/20 text-white placeholder:text-white/50"
                />
              </div>
              <label className="flex items-start gap-2 mb-4 text-sm text-white/80 cursor-pointer">
                <input
                  type="checkbox"
                  checked={priceConsent}
                  onChange={(e) => setPriceConsent(e.target.checked)}
                  className="mt-1 h-4 w-4 flex-shrink-0"
                  style={{ accentColor: "#b388ff" }}
                />
                <span>
                  I understand that the final price of my order may vary from the estimated price upon booking based on
                  services completed.
                </span>
              </label>
              <div className="mb-4">
                <button 
                  onClick={handleSubmitOrder}
                  disabled={submittingOrder || !priceConsent}
                  className="btn btn-custom w-full text-white px-6 py-3 rounded-full font-semibold disabled:opacity-50 hover:opacity-90 transition-opacity"
                  style={{ backgroundColor: "#302639" }}
                >
                  {submittingOrder ? "Submitting..." : "BOOK APPOINTMENT"}
                </button>
              </div>
            </aside>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="footer bg-black border-t border-white/10">
        <div className="container mx-auto px-4 py-3">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="text-left mb-3 md:mb-0">
              <img src={lightLogo} width="100" alt="Logo" className="mb-2" />
              <div className="copyright text-sm text-white/50 text-left">
                © 2025 Cotala Cross Media Inc. All Rights Reserved.
              </div>
            </div>
            <div className="chat-support flex items-center gap-2">
              <div className="status-dot w-2 h-2 bg-green-500 rounded-full"></div>
              <div className="text-sm font-medium text-white">CHAT SUPPORT</div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

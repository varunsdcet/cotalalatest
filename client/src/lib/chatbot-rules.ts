export type ChatIntent =
  | "start_booking"
  | "ask_pricing"
  | "recommend_package"
  | "show_recent_properties"
  | "show_recent_orders"
  | "reorder_service"
  | "account_help"
  | "ask_services"
  | "unknown";

export type ChatBookingStage =
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
  | "confirm";

export function detectChatIntent(text: string): ChatIntent {
  const t = text.toLowerCase();
  if (/last\s*order|my\s*last\s*order|my\s*orders|recent\s*orders|my\s*order/.test(t)) return "show_recent_orders";
  if (/recent|last\s*10|my\s*properties|my\s*listings/.test(t)) return "show_recent_properties";
  if (/reorder|book same|same package|again/.test(t)) return "reorder_service";
  if (/price|pricing|cost|quote/.test(t)) return "ask_pricing";
  if (/recommend|best option|package|compare/.test(t)) return "recommend_package";
  if (/book|booking|schedule|order|urgent|today|new booking|karni hai|krni hai|karna hai|book karni/.test(t))
    return "start_booking";
  if (/service|what do you offer|matterport|drone|floorplan|feature sheet/.test(t)) return "ask_services";
  if (/account|profile|email|phone|brokerage/.test(t)) return "account_help";
  return "unknown";
}

export function isGreetingInput(text: string): boolean {
  const t = text.toLowerCase().trim();
  return /^(hi|hello|hey|hii|helo|good morning|good afternoon|good evening|namaste|namaskar|salam|salaam|hal|haal|hal chaal|haal chaal|kaise ho|kya haal)\b/.test(
    t,
  );
}

export function getIncompleteStepHint(stage: ChatBookingStage, hasAddressContext: boolean): string {
  switch (stage) {
    case "address":
      return "Please share full property address with BC city (e.g., 123 Main St, Vancouver).";
    case "homesize":
      return "Please share numeric home size (e.g., 5000 sq ft).";
    case "lotsize":
      return "Please share numeric lot size (e.g., 8000 sq ft).";
    case "category":
      return "Please select category from the selection card (or type category number).";
    case "service":
      return "Please select service from the selection card (or type service number).";
    case "date":
      return "Please share preferred date in YYYY-MM-DD format.";
    case "time":
      return "Please select a time slot from available options.";
    case "useSavedCard":
      return 'Please type "yes" to use saved card or "no" for new card.';
    case "cardnumber":
      return "Please enter card number.";
    case "expirydate":
      return "Please enter expiry date in MM/YY.";
    case "cvv":
      return "Please enter CVV (3 or 4 digits).";
    case "holdername":
      return "Please enter card holder name.";
    case "postalcode":
      return "Please enter billing postal code.";
    case "notes":
      return "Please add notes, or type 'skip'.";
    case "confirm":
      return 'Please reply "yes" to submit, or "no" to cancel.';
    case "selectRecent":
      return "Please choose a valid property number from the list.";
    case "selectReorder":
      return "Please choose a valid order number from the list.";
    default:
      return hasAddressContext
        ? "Please continue with the pending booking step."
        : "Please start by sharing property address with BC city.";
  }
}

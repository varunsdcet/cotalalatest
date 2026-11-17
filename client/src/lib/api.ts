const API_ORIGIN = "https://appslure.app/cotalacustomer/api/";
const USE_API_PROXY = false;
const BASE_URL = import.meta.env.DEV && USE_API_PROXY ? "/cotala-api/" : API_ORIGIN;

export const STRIPE_TEST_MODE = false;
export const STRIPE_TEST_PUBLISHABLE_KEY =
  "pk_test_51N2urcSEGxiAYHo20hdV3ZfwgVG1SbNa83dWx2PaHVze2ka2wZS0P2mg5o9wgTvLFhwWLxjDEA7nB34YVRLRrpio00Ndi9mGbi";

// Local storage helpers (needed for user_id retrieval)
const TOKEN_KEY = "cotala_token";
const USER_ID_KEY = "cotala_user_id";
const USER_KEY = "cotala_user";

export function getUserIdFromStorage(): string | null {
  const direct = localStorage.getItem(USER_ID_KEY);
  if (direct) return direct;
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    const user = JSON.parse(raw) as {
      user_id?: string | number;
      id?: string | number;
      customerid?: string | number;
      agent?: string | number;
    };
    const id = user.user_id || user.id || user.customerid || user.agent;
    return id ? String(id) : null;
  } catch {
    return null;
  }
}

async function getJson<TResponse>(path: string, includeUserId: boolean = true): Promise<TResponse> {
  const headers: HeadersInit = {};
  
  // For GET requests that need user_id, convert to POST with user_id in body
  // (since GET requests cannot have a body)
  if (includeUserId) {
    const user_id = getUserIdFromStorage();
    if (user_id) {
      // Convert to POST with user_id in body
      const res = await fetch(`${BASE_URL}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ user_id }),
      });

      if (!res.ok) {
        throw new Error(`Request failed with status ${res.status}`);
      }

      return res.json() as Promise<TResponse>;
    }
  }

  // Regular GET request without user_id
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "GET",
    headers,
  });

  if (!res.ok) {
    throw new Error(`Request failed with status ${res.status}`);
  }

  return res.json() as Promise<TResponse>;
}

async function postJson<TResponse, TBody = unknown>(
  path: string,
  body: TBody,
  includeUserId: boolean = true
): Promise<TResponse> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };
  
  let requestBody = body;
  
  if (includeUserId) {
    const user_id = getUserIdFromStorage();
    if (user_id) {
      // Add user_id to request body
      requestBody = {
        ...(body as object),
        user_id,
      } as TBody;
    }
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(requestBody),
  });

  const text = await res.text();
  try {
    return JSON.parse(text) as TResponse;
  } catch {
    throw new Error(`Request failed with status ${res.status}`);
  }
}

// Types are based on the shapes you described; adjust if backend differs.
export interface LoginPayload {
  realtor_id: string;
  password: string;
}

export interface SignupPayload {
  region: string;
  realter_id: string;
  email: string;
  username: string;
  password: string;
}

export interface ForgotPasswordPayload {
  realter_id: string;
}

export interface ApiAuthResponse {
  status: boolean;
  msg?: string;
  token?: string;
  userdetails?: unknown;
  list?: unknown[];
}

export function loginCheckUser(body: LoginPayload) {
  // Backend path inferred from your description: "check-user"
  return postJson<ApiAuthResponse, LoginPayload>("verify/check-user", body, false);
}

export function getRegion() {
  // Region / country list should be fetched via GET
  // No token required - used on register/settings page for region selection
  return getJson<ApiAuthResponse>("get-region", false);
}

export function signupVerify(body: SignupPayload) {
  // "new-signup" endpoint
  return postJson<ApiAuthResponse, SignupPayload>("new-signup", body, false);
}

export function forgotPassword(body: ForgotPasswordPayload) {
  // "forget-password" endpoint
  return postJson<ApiAuthResponse, ForgotPasswordPayload>("forget-password", body, false);
}

// Local storage helpers (web replacement for AsyncStorage*)
export function saveAuthToStorage(token?: string, userdetails?: unknown, user_id?: string) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  }
  if (user_id) {
    localStorage.setItem(USER_ID_KEY, user_id);
  }
  if (userdetails) {
    localStorage.setItem(USER_KEY, JSON.stringify(userdetails));
    // Try to extract user_id from userdetails if not provided
    if (!user_id && userdetails) {
      try {
        const user = userdetails as any;
        const extractedUserId = user.user_id || user.id || user.customerid || user.agent;
        if (extractedUserId) {
          localStorage.setItem(USER_ID_KEY, String(extractedUserId));
        }
      } catch (e) {
        // Ignore errors
      }
    }
  }
}

export function clearAuthFromStorage() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_ID_KEY);
  localStorage.removeItem(USER_KEY);
}

export function hasAuthToken(): boolean {
  return !!getUserIdFromStorage();
}

// Order-related API interfaces
/** Dashboard `getMyListings` may return `url2` (broker logo); home persists it for feature-listing. */
export const COTALA_MY_LISTINGS_URL2_KEY = "cotala_my_listings_url2";

export interface MyListingsResponse {
  status: boolean;
  message?: string;
  imagepath?: string;
  /** Broker / office logo URL (same source as home-2 `setDynamicLogo`). */
  url2?: string | null;
  tours?: Array<{
    tourid: string | number;
    address: string;
    city: string;
    multipleimages?: string[];
    [key: string]: unknown;
  }>;
  upcomingservice?: UpcomingService[];
}

export interface PhotographerResponse {
  status: boolean;
  message?: string;
  list?: Array<{
    fname: string;
    lname: string;
    image: string;
    bio: string;
    total_years: number | string;
    multipleimages?: string[];
  }>;
}

export interface CategoryResponse {
  status: boolean;
  msg?: string;
  message?: string;
  list?: Array<{
    name: string;
    image: string;
  }>;
}

export interface SubCategoryNewPayload {
  category: string[];
  homesize: string;
}

export interface SubCategoryNewResponse {
  status: boolean;
  message?: string;
  list?: {
    [key: string]: Array<{
      id: string | number;
      name: string;
      is_selected?: string;
      addon?: Array<{
        id: string | number;
        name: string;
        is_selected?: string;
      }>;
    }>;
  };
}

export interface SubCategoryAddonPayload {
  category: string[];
  homesize: string;
}

export interface SubCategoryAddonResponse {
  status: boolean;
  message?: string;
  list?: Array<{
    id: string | number;
    name: string;
    type: string;
  }>;
}

export interface DateTimeSlotsPayload {
  date: string; // Format: YYYY-MM-DD
}

export interface DateTimeSlotsResponse {
  status: boolean;
  message?: string;
  timeSlots?: Array<{
    slotStart: string;
    slotEnd: string;
  }>;
}

export interface ServiceArrayItem {
  service: string | number;
  qty: number;
  rush: "yes" | "no";
  type: string;
  rush_option: string;
  name: string;
  totalamount: string | number;
  customer_preferred?: string; // "alltime", "seller", or date string
  customer_preferred_datestarttime?: string; // Format: "2018-06-19 16:18:32"
  customer_preferred_dateendtime?: string; // Format: "2018-06-19 16:18:32"
}

export interface TotalAmountCalculatePayload {
  servicearray: ServiceArrayItem[];
}

export interface TotalAmountCalculateResponse {
  status: boolean;
  message?: string;
  paymentgatewayamount?: number | string;
  totalamount?: number | string;
  servicearray?: Array<{
    service: string | number;
    qty: number;
    rush: string;
    type: string;
    rush_option: string;
    name: string;
    totalamount: string | number;
  }>;
}

export interface AddOrderPayload {
  address: string;
  amount: number;
  cardnumber: string;
  city: string;
  cvv: string;
  date: string;
  time: string;
  end_time: string;
  expirydate: string;
  holdername: string;
  homesize: string;
  is_same_date: boolean;
  lotsize: string;
  notes: string;
  photographer: string;
  savecarddetails: boolean;
  servicearray: ServiceArrayItem[];
  total: number;
  tour_id?: string | number;
}

export interface AddOrderResponse {
  status: boolean;
  message?: string;
  [key: string]: unknown;
}

// Order-related API functions
export function getMyListings() {
  // my-listings is a POST API
  return postJson<MyListingsResponse, Record<string, never>>("my-listings", {});
}

export function getPhotographer() {
  return getJson<PhotographerResponse>("photographer");
}

export function getCategory() {
  // Category API is GET without token
  return getJson<CategoryResponse>("catgeory", false);
}

export function getSubCategoryNew(body: SubCategoryNewPayload) {
  return postJson<SubCategoryNewResponse, SubCategoryNewPayload>("sub-catgeory-new", body);
}

export function getSubCategoryAddon(body: SubCategoryAddonPayload) {
  return postJson<SubCategoryAddonResponse, SubCategoryAddonPayload>("sub-catgeory-addon", body);
}

export function getDateTimeSlots(body: DateTimeSlotsPayload) {
  return postJson<DateTimeSlotsResponse, DateTimeSlotsPayload>("datetime-slots", body);
}

export function calculateTotalAmount(body: TotalAmountCalculatePayload) {
  return postJson<TotalAmountCalculateResponse, TotalAmountCalculatePayload>("total-amount-calculate", body);
}

export function addOrder(body: AddOrderPayload) {
  return postJson<AddOrderResponse, AddOrderPayload>("add-order", body);
}

// Profile API – agency is nested inside user_profile in response
export interface AgencyDetails {
  id?: number;
  code?: string;
  name?: string;
  phone?: string;
  address?: string;
  street?: string;
  city?: string;
  province?: string;
  postal?: string;
  email?: string;
  url?: string;
  [key: string]: unknown;
}

export interface UserProfile {
  id: number;
  status: string;
  username: string;
  name: string;
  salutation?: string;
  email: string;
  adminemail?: string;
  phone?: string;
  cell?: string;
  adminphone?: string;
  url?: string;
  joined?: string;
  unit?: string;
  street?: string;
  city?: string;
  province?: string;
  postal?: string;
  instagram?: string;
  twitter?: string;
  social?: string;
  shipping?: string;
  shippingnote?: string;
  pref_photos?: string;
  standardpackagefiltered?: Array<{
    id: number;
    name: string;
    qty?: string;
  }>;
  agencydetails?: AgencyDetails;
  [key: string]: unknown;
}

export interface GetProfileResponse {
  status: boolean;
  message?: string;
  user_profile?: UserProfile;
}

export function getProfile() {
  // user/get-profile is a POST API with user_id in body
  return postJson<GetProfileResponse, Record<string, never>>("user/get-profile", {});
}

/** Partial profile update — send only keys that changed (avoids unique-email validation on unchanged fields). */
export interface UpdateProfileResponse {
  status?: boolean;
  message?: string;
  msg?: string;
  errors?: Record<string, string[]>;
}

export function updateProfile(partialFields: Record<string, string>) {
  return postJson<UpdateProfileResponse, Record<string, string>>("profile/update", partialFields, true);
}

// My Orders API
export interface TourDetails {
  tourid: number;
  orderid: string;
  numpics: number;
  numpans: number;
  unit: string;
  address: string;
  city: string;
  postal: string;
  subarea: string;
  agent: string;
  customerid: number;
  listingagent: string;
  colisted: string;
  agent2: string;
  description: string;
  siteinfluences: string;
  complex: string;
  beds: string;
  baths: string;
  sqft: string;
  floors: string;
  style: string;
  type: string;
  highres: string;
  YouTube: string;
  video: string;
  videodownload: string;
  floorplan: string;
  floorplanorientation: string;
  floorplan3D: string;
  status: string;
  price: string;
  taxes: string;
  built: string;
  age: string;
  mls: string;
  lot: string;
  maint: string;
  music: string;
  photographer: string;
  videographer: string;
  measuretech: string;
  processed: string;
  created: string;
  size_as_serviced: string | null;
  inactivedate: string | null;
  sendtomls: string;
  MlsPhotoStatus: string;
  MlsFloorplanStatus: string;
  sentby: string;
  MlsPicks: string;
  MlsPicksSent: string;
  calPicks: string;
  notified: string;
  notesPhotographer: string;
  k: string;
}

export interface UpcomingService {
  id: number;
  invoice: string;
  po: string;
  customer: string;
  billto: string;
  billto2: string;
  billto3: string;
  billto4: string;
  status: string;
  split: string;
  sales: string;
  datecreated: string;
  datecompleted: string | null;
  datebilled: string | null;
  datelastemailed: string | null;
  timessent: number;
  datepaid: string | null;
  transactionID: string;
  subtotal: string;
  gst: string;
  pst: string;
  total: string;
  balance: string;
  notes: string;
  summary: string;
  recurring: string;
  k: string;
  schedule_date: string | null;
  bookdattimestamp: number;
  schedule_time: string | null;
  schedule_endtime: string | null;
  schedule_datetime?: string | null;
  is_same_date: string;
  technician: string | null;
  google_event_id: string | null;
  tourdetails: TourDetails;
}

export interface MyOrderResponse {
  status: boolean;
  upcomingservice?: UpcomingService[];
}

export interface MyOrderPayload {
  user_id: string;
}

export function getMyOrders(body: MyOrderPayload) {
  return postJson<MyOrderResponse, MyOrderPayload>("my-order", body, false);
}

// Order Details API
export interface ServiceDetails {
  id: number;
  name: string;
  frontendtitle: string;
  popup: string;
  code: string;
  makeshell: string;
  renews: string;
  sqft_min: string;
  sqft_max: string;
  timetocomplete: number;
  timetocomplete_1000sf: number | null;
  turnaround: string | null;
  description: string;
  defaultstatus: string;
  dept: string;
  type: string;
  category: string;
  display_category: string;
  calendartag: string | null;
  nullify: string | null;
  combo: string | null;
  internal: string;
  fulfillment: string | null;
  printaddons: string;
  pricingmodel: string;
  base: string;
  cpu: string;
  basecpu: string;
  ppu: string;
  tax: string;
  status: string;
  standard: string;
  premium: string;
  productimage: string;
}

export interface OrderServiceTourDetails {
  tourid: number;
  orderid: string;
  numpics: number;
  numpans: number;
  unit: string;
  address: string;
  city: string;
  postal: string;
  subarea: string;
  agent: string;
  customerid: number;
  listingagent: string;
  colisted: string;
  agent2: string;
  description: string;
  siteinfluences: string;
  complex: string | null;
  beds: string;
  baths: string;
  sqft: string;
  floors: string;
  style: string;
  type: string;
  highres: string;
  YouTube: string;
  video: string;
  videodownload: string;
  floorplan: string;
  floorplanorientation: string;
  floorplan3D: string;
  status: string;
  price: string;
  taxes: string;
  built: string;
  age: string;
  mls: string;
  lot: string;
  maint: string;
  music: string;
  photographer: string;
  videographer: string;
  measuretech: string;
  processed: string;
  created: string;
  size_as_serviced: string | null;
  inactivedate: string | null;
  sendtomls: string;
  MlsPhotoStatus: string;
  MlsFloorplanStatus: string;
  sentby: string;
  MlsPicks: string;
  MlsPicksSent: string;
  calPicks: string;
  notified: string;
  notesPhotographer: string;
  k: string;
}

export interface OrderService {
  id: number;
  orderid: number;
  tourid: string;
  printjobid: string;
  service: string;
  created: string;
  duedate: string | null;
  datecompleted: string;
  description: string;
  qty: string;
  notes: string;
  videofiles: string;
  status: string;
  version: string;
  rush: string;
  renews: string;
  technician: string;
  technician2: string;
  technician3: string;
  technician4: string;
  operator: string;
  sales: string;
  rate: string;
  price: string;
  gst: string;
  pst: string;
  total: string;
  cost: string;
  payment_deduct: number;
  card_point_log: string | null;
  payment_deduct_amount: string;
  rush_option: string | null;
  FloatingStart: string | null;
  google_start_date: string | null;
  google_end_date: string | null;
  customer_preferred: string | null;
  customer_preferred_datestarttime: string | null;
  customer_preferred_dateendtime: string | null;
  servicedetails: ServiceDetails;
  tourdetails: OrderServiceTourDetails;
  ui_status?: string;
}

export interface OrderDetailsData {
  id: number;
  invoice: string;
  po: string;
  customer: string;
  billto: string;
  billto2: string;
  billto3: string;
  billto4: string;
  status: string;
  split: string;
  sales: string;
  datecreated: string;
  datecompleted: string | null;
  datebilled: string | null;
  datelastemailed: string | null;
  timessent: number;
  datepaid: string | null;
  transactionID: string;
  subtotal: string;
  gst: string;
  pst: string;
  total: string;
  balance: string;
  notes: string;
  summary: string;
  recurring: string;
  k: string;
  schedule_date: string | null;
  bookdattimestamp: number;
  schedule_time: string | null;
  schedule_endtime: string | null;
  is_same_date: string | null;
  technician: string | null;
  google_event_id: string | null;
  mediashell: string;
}

export interface OrderPrintJob {
  id: number | string;
  prod?: string | number;
  description?: string;
  qty?: string | number;
  rate?: string | number;
  price?: string | number;
  gst?: string | number;
  pst?: string | number;
  status?: string;
  colour?: string;
  longedge?: string;
  shortedge?: string;
  stock?: string | number;
  needs_approval?: boolean;
  proof_url?: string;
  product_details?: {
    id?: number;
    name?: string;
    code?: string;
  };
}

export interface OrderPaymentRecord {
  id: number | string;
  orderid?: number | string;
  customer?: number | string;
  method?: string;
  cardnumber?: string;
  date?: string;
  amt?: string | number;
  depositto?: string;
  transactionID?: string;
  operator?: string;
  paymentlog?: string;
  forpayment?: number;
}

export interface OrderDetailsResponse {
  status: boolean;
  order: OrderDetailsData;
  orderservice: OrderService[];
  print_jobs?: OrderPrintJob[];
  payments?: OrderPaymentRecord[];
}

export interface OrderDetailsPayload {
  id: string | number;
  user_id: string;
}

export function getOrderDetails(body: OrderDetailsPayload) {
  return postJson<OrderDetailsResponse, OrderDetailsPayload>("order-details", body, false);
}

// Listing Details API
export interface ListingDetailsAgent {
  id: number;
  status: string;
  username: string;
  name: string;
  email: string;
  /** Sheet / tour branding from account (listing-details). */
  bgColour?: string;
  textColour?: string;
  /** Large headshot image URL (not the `headshot` yes/no flag). */
  coverimage?: string;
  headshot_url?: string;
  url?: string;
  [key: string]: unknown;
}

export interface ListingDetailsTour {
  tourid: number;
  orderid: string;
  numpics: number;
  numpans: number;
  address: string;
  city: string;
  postal: string;
  subarea: string;
  agent: string;
  mls: string;
  status: string;
  multipleimages?: string[];
  floorplanarray?: string[] | { pdf?: string; image1?: string; image2?: string; image3?: string; [key: string]: unknown };
  video?: string;
  videodownload?: string;
  YouTube?: string;
  virtual_tour?: string;
  [key: string]: unknown;
}

export interface ListingDetailsResponse {
  status: boolean;
  tour?: ListingDetailsTour;
  agent?: ListingDetailsAgent;
}

export interface ListingDetailsPayload {
  tourid: string | number;
  user_id: string;
}

export function getListingDetails(body: ListingDetailsPayload) {
  return postJson<ListingDetailsResponse, ListingDetailsPayload>("listing-details", body, false);
}

// Listing search by MLS or address (listingwithmlx2)
export interface ListingWithMlx2Payload {
  user_id: string;
  mls_or_address: string;
  page?: number;
}

export interface ListingWithMlx2Tour {
  tourid: number;
  orderid: string;
  numpics: number;
  address: string;
  city: string;
  mls: string;
  status: string;
  created?: string;
  multipleimages?: string[];
  [key: string]: unknown;
}

export interface ListingWithMlx2Agent {
  id: number;
  status: string;
  username: string;
  name: string;
  email: string;
  [key: string]: unknown;
}

export interface ListingWithMlx2Response {
  status: boolean;
  tours?: ListingWithMlx2Tour[];
  imagepath?: string;
  agent?: ListingWithMlx2Agent;
}

export function listingWithMlx2(body: ListingWithMlx2Payload) {
  return postJson<ListingWithMlx2Response, ListingWithMlx2Payload>("user/listingwithmlx2", body, false);
}

// Tour Statistics API
export interface TourStatsGraphData {
  labels: string[];
  data: string[];
}

export interface TourStatsResponse {
  status: boolean;
  onlinesince?: string;
  totalhits?: string;
  avgtotalhits?: string;
  bestday?: string;
  averageFirstWeek?: string;
  firstWeekViews?: string;
  weekly_graph?: TourStatsGraphData;
  monthly_graph?: TourStatsGraphData;
  three_month_graph?: TourStatsGraphData;
  six_month_graph?: TourStatsGraphData;
}

export interface TourStatsPayload {
  tourid: string | number;
  user_id: string;
}

export function getTourStats(body: TourStatsPayload) {
  return postJson<TourStatsResponse, TourStatsPayload>("user/my-tour-stats", body, false);
}

// User Home / Upcoming Services API
export interface UpcomingServiceTourDetails {
  tourid: number;
  address: string;
  city: string;
  unit?: string;
}

export interface UpcomingServiceItem {
  id: number;
  invoice: string;
  po: string;
  customer: string;
  billto: string;
  status: string;
  schedule_date: string;
  bookdattimestamp?: number;
  schedule_time: string;
  schedule_endtime: string;
  is_same_date: string | null;
  tourdetails: UpcomingServiceTourDetails;
  orderservice?: Array<{
    id: number;
    service: string;
    servicedetails?: {
      name: string;
      frontendtitle?: string;
    };
  }>;
  [key: string]: unknown;
}

export interface UserHomeResponse {
  status: boolean;
  upcomingservice?: UpcomingServiceItem[];
}

export interface UserHomePayload {
  device_id?: string;
  device_token?: string;
  device_type?: string;
  user_id: string;
}

export function getUserHome(body: UserHomePayload) {
  return postJson<UserHomeResponse, UserHomePayload>("user/home", body, false);
}

// Re-order API
export interface ReOrderPayload {
  orderid: string | number;
  user_id: string;
}

export interface ReOrderResponse {
  status: boolean;
  msg?: string;
  new_order_id?: string | number;
  data?: unknown;
}

export function reOrder(body: ReOrderPayload) {
  return postJson<ReOrderResponse, ReOrderPayload>("re-order", body, false);
}

/** Oversize Feature Sheet — `products.print` id (OFS). */
export const OVERSIZE_FEATURE_SHEET_PRINT_PRODUCT_ID = "19";

/** Row from `products.inventory` (stocks array in `product/print-options` response). */
export interface PrintInventoryStockRow {
  id: number;
  name: string;
  description: string;
  class?: string;
  status?: string;
  [key: string]: unknown;
}

/** Row from `products.print` (`productdetail` in API). */
export interface PrintProductRow {
  id: number;
  name: string;
  code: string;
  description: string;
  defaultstock: string;
  optionalstock: string;
  defaultcolour?: string;
  longedge?: string;
  shortedge?: string;
  [key: string]: unknown;
}

export interface PrintProductDetailsData {
  productdetail: PrintProductRow;
  stocks: PrintInventoryStockRow[];
  colours?: string[];
  default_stock?: string;
}

export interface PrintProductDetailsResponse {
  status: boolean;
  data?: PrintProductDetailsData;
  msg?: string;
}

/**
 * Print product + inventory stocks for checkout (matches `products.print` + `products.inventory`).
 * Request body: `{ user_id, prod: "19" }` — product id is fixed for oversize feature sheets.
 */
export function getPrintProductDetails() {
  return postJson<PrintProductDetailsResponse, { prod: string }>(
    "product/print-options",
    { prod: OVERSIZE_FEATURE_SHEET_PRINT_PRODUCT_ID },
    true
  );
}

export interface PlaceOversizePrintOrderBody {
  tour_id: string | number;
  prod?: string;
  stock_id?: number | null;
  stock_name?: string;
  quantity: string | number;
  amount: number;
  notes?: string;
}

export interface PlaceOversizePrintOrderResponse {
  status: boolean;
  msg?: string;
  message?: string;
  data?: {
    order_id?: number | string;
    printjob_id?: number | string;
  };
}

/** Places an oversize feature-sheet print job (`products.print` id 19). */
export function placeOversizePrintOrder(body: PlaceOversizePrintOrderBody) {
  return postJson<PlaceOversizePrintOrderResponse, PlaceOversizePrintOrderBody>(
    "product/print-order",
    { ...body, prod: body.prod ?? OVERSIZE_FEATURE_SHEET_PRINT_PRODUCT_ID },
    true
  );
}

export interface PortalApiResponse<T = unknown> {
  status: boolean;
  msg?: string;
  message?: string;
  data?: T;
  list?: unknown;
  pagination?: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
  };
}

export function getPortalDashboard() {
  return postJson<PortalApiResponse>("dashboard", {});
}

export function getOrderOptions(homesize: string | number) {
  return postJson<PortalApiResponse>("order/options", { homesize: String(homesize) });
}

export function createPortalOrder(body: Record<string, unknown>) {
  return postJson<PortalApiResponse>("order/addneworder", body);
}

export function getPortalOrders(
  params: {
    search?: string;
    status?: string;
    tab?: "all" | "completed" | "progress";
    page?: number;
    per_page?: number;
  } = {}
) {
  return postJson<PortalApiResponse>("orders", params);
}

export function getPortalOrderDetail(id: string | number) {
  return postJson<PortalApiResponse>("orders/detail", { id });
}

export function reportOrderProblem(body: {
  order_id: string | number;
  message: string;
  category?: string;
}) {
  return postJson<PortalApiResponse>("orders/report-problem", { ...body, id: body.order_id });
}

export function getPortalListingDetail(tourid: string | number) {
  return postJson<PortalApiResponse>("listings/detail", { tourid });
}

export function getPortalListings(
  params: { search?: string; status?: string; per_page?: number; page?: number } = {},
) {
  return postJson<PortalApiResponse>("listings/list", params);
}

export function getPortalProfile() {
  return postJson<PortalApiResponse>("profile/details", {});
}

export type AccountStatementOrder = {
  id: number;
  status: string;
  date: string;
  summary: string;
  total: number;
  balance: number;
};

export type AccountStatementLink = {
  year: number;
  url: string;
};

export type AccountStatementData = {
  years: number[];
  year: number;
  month?: number | null;
  statement_links: AccountStatementLink[];
  orders: AccountStatementOrder[];
  totals: {
    grand_total: number;
    balance: number;
  };
};

export function getPortalAccountStatement(params: { year: number; month?: number }) {
  return postJson<PortalApiResponse<AccountStatementData>>("profile/statement", {
    year: params.year,
    ...(params.month && params.month >= 1 && params.month <= 12 ? { month: params.month } : {}),
  });
}

export type MediaBrandFile = {
  filename?: string;
  url?: string;
  upload_field: string;
  delete_field: string;
  label: string;
  description?: string;
  preview_width?: number;
  preview_height?: number;
  full_resolution_url?: string;
};

export type MediaLayoutOption = {
  value: string;
  selected?: boolean;
  image_url?: string;
  preview_width?: number;
  label?: string;
};

export type MediaPreferencesData = {
  title?: string;
  style_and_colour?: {
    headerStyle?: string;
    header_style_options?: Array<{ value: string; label: string; selected?: boolean }>;
    bgColour?: string;
    textColour?: string;
    accentColour?: string;
    accentTextcolour?: string;
  };
  brand_files?: {
    base_url?: string;
    headshot_jpg?: MediaBrandFile;
    headshot_png?: MediaBrandFile;
    logo_svg?: MediaBrandFile;
    logo_svg_white?: MediaBrandFile;
    logo_svg_black?: MediaBrandFile;
    logo_png?: MediaBrandFile;
    [key: string]: MediaBrandFile | string | undefined;
  };
  contact_card?: {
    selected?: string;
    field?: string;
    layouts?: MediaLayoutOption[];
    custom_graphic?: MediaLayoutOption & {
      filename?: string;
      url?: string;
      upload_field?: string;
      delete_field?: string;
      radio_field?: string;
    };
  };
  video_intro?: {
    static?: MediaBrandFile;
    animated?: { field?: string; label?: string; value?: string };
  };
  submit?: { method?: string; label?: string; suggested_endpoint?: string };
};

export function getPortalMediaPreferences() {
  return postJson<PortalApiResponse<MediaPreferencesData>>("profile/media-preferences", {});
}

export async function savePortalMediaPreferences(formData: FormData) {
  const user_id = getUserIdFromStorage();
  if (user_id) formData.append("user_id", user_id);
  const res = await fetch(`${BASE_URL}profile/save`, { method: "POST", body: formData });
  const text = await res.text();
  try {
    return JSON.parse(text) as PortalApiResponse;
  } catch {
    throw new Error(`Request failed with status ${res.status}`);
  }
}

export type AmenityFilterOption = {
  label: string;
  value: string;
  endpoint?: string;
  payload?: { address?: string; complex?: string };
};

export type AmenityLookupRow = {
  tourid: number | string;
  download_url?: string;
  edit_url?: string;
  address?: string;
  complex?: string;
  date_shot?: string;
  customer?: string;
  photographer?: string;
  pics?: number;
  pans?: number;
  video?: string;
};

export type AmenityLookupData = {
  title?: string;
  filters?: { address?: string | null; complex?: string | null };
  columns?: string[];
  rows?: AmenityLookupRow[];
  pagination?: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
  };
  options?: {
    addresses_endpoint?: string;
    complexes_endpoint?: string;
  };
  empty_message?: string;
};

export function getAmenityComplexAddresses() {
  return postJson<PortalApiResponse<AmenityFilterOption[]>>("amenities/complex-addresses", {});
}

export function getAmenityComplexNames() {
  return postJson<PortalApiResponse<AmenityFilterOption[]>>("amenities/complex-names", {});
}

export function getAmenityLookup(params: {
  address?: string;
  complex?: string;
  page?: number;
  per_page?: number;
}) {
  return postJson<PortalApiResponse<AmenityLookupData>>("amenities/lookup", {
    address: params.address || "",
    complex: params.complex || "",
    page: params.page || 1,
    per_page: params.per_page || 30,
  });
}

export async function getCityList(): Promise<{ status?: boolean; data?: Array<{ name?: string; prov_state?: string }> }> {
  const res = await fetch(`${BASE_URL}citylist`);
  if (!res.ok) throw new Error(`citylist failed (${res.status})`);
  return res.json();
}

export async function getProvinceList(): Promise<{ status?: boolean; data?: string[] }> {
  const res = await fetch(`${BASE_URL}provincelist`);
  if (!res.ok) throw new Error(`provincelist failed (${res.status})`);
  return res.json();
}

export function savePortalProfile(fields: Record<string, unknown>) {
  return postJson<PortalApiResponse>("profile/save", fields);
}

export function getPreferenceMasterData() {
  return postJson<PortalApiResponse>("preferences/master-data", {});
}

export function savePortalPreferences(fields: Record<string, unknown>) {
  return postJson<PortalApiResponse>("preferences/save", fields);
}

export function changePortalPassword(current_password: string, password: string) {
  return postJson<PortalApiResponse>("profile/change-password", { current_password, password });
}

export function getDesignJobOptions(search = "") {
  return postJson<PortalApiResponse>("design-jobs/options", { search });
}

export function getProofDetail(id: string | number) {
  return postJson<PortalApiResponse>("proofs/detail", { id });
}

export function approveProof(id: string | number) {
  return postJson<PortalApiResponse>("proofs/approve", { id });
}

export function requestProofChanges(id: string | number, message: string) {
  return postJson<PortalApiResponse>("proofs/request-changes", { id, message });
}

export type PortalListing = {
  tourid: string | number;
  address?: string;
  city?: string;
  unit?: string;
  mls?: string;
  status?: string;
  cover_image?: string;
  full_address?: string;
  multipleimages?: string[];
  [key: string]: unknown;
};

export function listingImage(listing: PortalListing, fallback: string) {
  const photos = listing.multipleimages;
  if (Array.isArray(photos) && typeof photos[0] === "string" && photos[0].trim()) {
    return photos[0].trim();
  }
  if (listing.cover_image && String(listing.cover_image).trim()) {
    return String(listing.cover_image).trim();
  }
  return fallback;
}

export function getStripeConfig() {
  return postJson<PortalApiResponse>("payments/stripe/config", {});
}

export function saveStripeCustomer(stripe_customer_id: string) {
  return postJson<PortalApiResponse>("billing/stripe-customer/save", { stripe_customer_id });
}

export function getStripePaymentMethods() {
  return postJson<PortalApiResponse>("billing/payment-methods", {});
}

export function createStripeSetupIntent(fields: Record<string, unknown> = {}) {
  return postJson<PortalApiResponse>("billing/setup-intent", fields);
}

export function addStripePaymentMethod(
  payment_method_id: string,
  set_default = true,
  extra: Record<string, unknown> = {}
) {
  return postJson<PortalApiResponse>("billing/payment-methods/add", {
    payment_method_id,
    set_default,
    ...extra,
  });
}

export function setDefaultStripePaymentMethod(payment_method_id: string) {
  return postJson<PortalApiResponse>("billing/payment-methods/default", { payment_method_id });
}

export function deleteStripePaymentMethod(payment_method_id: string) {
  return postJson<PortalApiResponse>("billing/payment-methods/delete", { payment_method_id });
}

export function createStripePaymentIntent(order_id: string | number, amount?: number) {
  return postJson<PortalApiResponse>("payments/stripe/intent", {
    order_id,
    ...(amount ? { amount } : {}),
  });
}

export function confirmStripePayment(payment_intent_id: string) {
  return postJson<PortalApiResponse>("payments/stripe/confirm", { payment_intent_id });
}

export function autoChargeStripe(order_id: string | number, payment_method_id?: string, amount?: number) {
  return postJson<PortalApiResponse>("payments/stripe/auto-charge", {
    order_id,
    ...(payment_method_id ? { payment_method_id } : {}),
    ...(amount ? { amount } : {}),
  });
}

export function getPortalListingStats(tourid: string | number) {
  return postJson<PortalApiResponse>("listings/stats", { tourid });
}

export function getPortalListingMedia(tourid: string | number) {
  return postJson<PortalApiResponse>("listings/media", { tourid });
}


export function getDashboardScreen() {
  return postJson<PortalApiResponse>("dashboard/screen", {});
}

export type ListingScreenTab = "overview" | "photos" | "print" | "virtual" | "stats" | string;

export function getListingScreen(tourid: string | number, tab: ListingScreenTab = "overview") {
  return postJson<PortalApiResponse>("listings/screen", { tourid, tab });
}

export function submitPhotographerRating(body: { tourid: string | number; rating: number; review?: string }) {
  return postJson<PortalApiResponse>("listings/photographer-rating", { review: "", ...body });
}

export function getOrdersScreen(
  params: { tab?: "all" | "completed" | "progress"; search?: string; per_page?: number; page?: number } = {},
) {
  return postJson<PortalApiResponse>("orders/screen", params);
}

export type OrderChangeType = "schedule" | "address" | "services" | "contact" | "notes" | "other";

export function requestOrderChange(body: {
  id: string | number;
  change_type: OrderChangeType;
  message: string;
  preferred_date?: string;
  preferred_time?: string;
}) {
  return postJson<PortalApiResponse>("orders/request-change", body);
}

export function cancelPortalOrder(id: string | number, reason: string) {
  return postJson<PortalApiResponse>("orders/cancel", { id, reason });
}

export function getSettingsPreferences() {
  return postJson<PortalApiResponse>("settings/preferences/details", {});
}

export function saveSettingsPreferences(selected: Record<string, unknown>) {
  return postJson<PortalApiResponse>("settings/preferences/save", { selected });
}

export function getBrandingSettings() {
  return postJson<PortalApiResponse>("settings/branding/details", {});
}

export function updateBrandingSettings(selected: Record<string, unknown>) {
  return postJson<PortalApiResponse>("settings/branding/update", { selected });
}

export type BrandingAssetType =
  | "headshot"
  | "headshot_png"
  | "logo_png"
  | "logo_svg"
  | "logo_svg_white"
  | "logo_svg_black"
  | "custom_graphic"
  | "video_intro_static";

export async function uploadBrandingAsset(asset_type: BrandingAssetType, file: File) {
  const formData = new FormData();
  const user_id = getUserIdFromStorage();
  if (user_id) formData.append("user_id", user_id);
  formData.append("asset_type", asset_type);
  formData.append("file", file);
  const res = await fetch(`${BASE_URL}settings/branding/upload`, { method: "POST", body: formData });
  const text = await res.text();
  try {
    return JSON.parse(text) as PortalApiResponse;
  } catch {
    throw new Error(`Request failed with status ${res.status}`);
  }
}

export function getProofSendToPrintOptions(id: string | number) {
  return postJson<PortalApiResponse>("proofs/send-to-print/options", { id });
}

export function sendProofToPrint(body: {
  id: string | number;
  stock_type: string | number;
  quantity: number;
  shipping: string;
  address?: string;
  approval_accepted: boolean;
}) {
  return postJson<PortalApiResponse>("proofs/send-to-print", body);
}

export type BillingAddressInput = {
  address_id?: string;
  label?: string;
  name?: string;
  unit?: string;
  street?: string;
  city?: string;
  province?: string;
  postal?: string;
  country?: string;
  phone?: string;
  shipnotes?: string;
  is_default?: boolean;
};

export function getBillingScreen() {
  return postJson<PortalApiResponse>("billing/screen", {});
}

/** @deprecated Prefer getBillingScreen — kept as alias for older call sites */
export function getBillingAddresses() {
  return getBillingScreen();
}

export function saveBillingAddress(address: BillingAddressInput) {
  return postJson<PortalApiResponse>("billing/addresses/save", address);
}

export function setDefaultBillingAddress(address_id: string) {
  return postJson<PortalApiResponse>("billing/addresses/default", { address_id });
}

export function deleteBillingAddress(address_id: string) {
  return postJson<PortalApiResponse>("billing/addresses/delete", { address_id });
}

export function createPaymentMethodCheckout(set_default = true) {
  return postJson<PortalApiResponse<{ checkout_session_id?: string; checkout_url?: string }>>(
    "billing/payment-methods/checkout",
    { set_default },
  );
}

export function getCoRealtorList() {
  return postJson<PortalApiResponse & { list?: Array<{ name: string; username: string }> }>("get-realtor", {});
}

/* ── Booking engine APIs ─────────────────────────────────────────────── */

export type BookingCity = { city: string };
export type BookingTimePreference = { value: string; label: string; surcharge?: number };

export type BookingService = {
  id: string;
  name: string;
  code?: string;
  ppu?: string;
  printaddons?: string;
  sqft_min?: string | null;
  sqft_max?: string | null;
  timetocomplete?: string | null;
  timetocomplete_1000sf?: string | null;
};

export type BookingAddon = {
  code: string;
  name: string;
  sqft_min?: string | null;
  sqft_max?: string | null;
  timetocomplete?: string | null;
};

export type BookingCategoryKey = "photography" | "drafting" | "videography" | "drone" | string;

export type BookingCategory = {
  services: BookingService[];
  addons: BookingAddon[];
};

export type BookingPrintAddon = { id: string; name: string; code: string };
export type BookingDiscount = { code: string };

export type BookingBootstrapData = {
  cities?: BookingCity[];
  time_preferences?: BookingTimePreference[];
  preferred_time?: string;
  default_time?: string;
  requested_date?: string;
  time_format?: string;
  time_step_minutes?: number;
  next_api?: string;
};

export type BookingCatalogData = {
  categories?: Record<BookingCategoryKey, BookingCategory>;
  discounts?: BookingDiscount[];
  cities?: BookingCity[];
  printAddons?: BookingPrintAddon[];
  firstService?: boolean;
  customerPreferences?: Record<
    string,
    { note?: string; preferred_ids?: string[]; excluded_ids?: string[] }
  >;
};

export type BookingRouteLeg = {
  minutes?: number | null;
  km?: number | null;
  source?: string | null;
};

export type BookingAppointment = {
  service_id: number;
  category: string;
  staff_id: number;
  email?: string;
  start: string;
  duration_minutes: number;
  route?: {
    inbound?: BookingRouteLeg | null;
    outbound?: BookingRouteLeg | null;
    travel_minutes?: number | null;
    origin_type?: string | null;
  };
  same_city_vicinity?: boolean;
  idle_home_city?: boolean;
  home_premium?: boolean;
};

export type BookingRecommendation = {
  date: string;
  start: string;
  finish: string;
  pattern: string;
  score?: number;
  minutes_from_requested?: number;
  appointments: BookingAppointment[];
  incremental_drive_minutes?: number;
  team_rank?: number;
  total_staff_count?: number;
};

export type BookingStaff = {
  id: number;
  email?: string;
  name?: string;
  rating?: number;
  home_city?: string;
  video_capable?: boolean;
  skills?: Record<string, boolean>;
};

export type BookingServiceMeta = {
  id: number;
  category: string;
  minutes?: number;
  name?: string;
};

export type BookingRecommendationsData = {
  recommendations?: BookingRecommendation[];
  preference_status?: unknown[];
  preferred_unavailable?: unknown[];
  warnings?: string[];
  services?: BookingServiceMeta[];
  staff?: Record<string, BookingStaff>;
  customer_preferences?: unknown;
  critical?: boolean;
  status?: boolean;
  valid?: boolean;
};

export type BookingCommitData = {
  committed?: boolean;
  booking_id?: number;
  appointment_ids?: number[];
  message?: string;
};

export type BookingRequestBody = {
  unit?: string;
  street?: string;
  city?: string;
  size_sf?: number;
  date?: string;
  time?: string;
  service_ids?: number[];
  addons?: Record<string, string[]>;
  discounts?: Record<string, unknown> | string[];
  print?: Record<string, number | string>;
  instructions?: Record<string, string> | string;
  option?: {
    date: string;
    start: string;
    finish: string;
    pattern: string;
    appointments: Array<{
      service_id: number;
      category: string;
      staff_id: number;
      email?: string;
      start: string;
      duration_minutes: number;
    }>;
  };
  booking_received_via?: string;
};

export function getBookingBootstrap() {
  return getJson<PortalApiResponse<BookingBootstrapData>>("booking/bootstrap");
}

export function getBookingCatalog(size_sf: number) {
  return postJson<PortalApiResponse<BookingCatalogData>>("booking/catalog", { size_sf });
}

export function getBookingRecommendations(body: BookingRequestBody) {
  return postJson<PortalApiResponse<BookingRecommendationsData>>("booking/recommendations", body);
}

export function validateBookingOption(body: BookingRequestBody) {
  return postJson<PortalApiResponse<BookingRecommendationsData>>("booking/validate", body);
}

export function commitBooking(body: BookingRequestBody) {
  return postJson<PortalApiResponse<BookingCommitData>>("booking/commit", {
    booking_received_via: "Website",
    ...body,
  });
}

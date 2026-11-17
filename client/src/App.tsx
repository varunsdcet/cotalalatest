import { Switch, Route, Link, Redirect, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import NotFound from "@/pages/not-found";
import { useState, useEffect, lazy, Suspense } from "react";
import { 
  Menu,
  LogOut,
} from "lucide-react";
import logoNew from "@/pages/images/logo-new.svg";
import cotalaLogo from "@/pages/images/cotala-logo.png";
import { hasAuthToken, clearAuthFromStorage, getUserHome, getUserIdFromStorage, type UserHomeResponse } from "@/lib/api";

// Placeholder Components for Pages
import Login from "@/pages/auth/login";
import Register from "@/pages/auth/register";
import ForgotPassword from "@/pages/auth/forgot-password";
import Home from "@/pages/dashboard/home";
import Home2 from "@/pages/dashboard/home-2";
import NewOrder from "@/pages/orders/new-order";
import SellerFlow from "@/pages/orders/seller-flow";
import DifferentDayFlow from "@/pages/orders/different-day-flow";
import Listings from "@/pages/listings/index";
import ListingDetails from "@/pages/listings/listing-details";
import FeatureListingRedirect from "@/pages/listings/feature-listing-redirect";
import OversizeFeatureSheetsRedirect from "@/pages/listings/oversize-feature-sheets-redirect";
import FeatureSheetSelector from "@/pages/feature-sheet/index";
import FeatureValidate from "@/pages/feature-validate/index";
import OrderHistory from "@/pages/orders/history";
import OrderDetails from "@/pages/orders/order-details";
import OrderSuccess from "@/pages/orders/order-success";
import Profile from "@/pages/profile/index";
import Branding from "@/pages/profile/branding";
import AccountStatementPage from "@/pages/profile/account-statement-page";
import DesignJob from "@/pages/design-job/index";
import PostcardStudio from "@/pages/design-job/postcard-studio";
import ProofReview from "@/pages/proof-review/index";
import AiTool from "@/pages/ai-tool/index";
import AmenitiesLookupPage from "@/pages/amenities-lookup/index";
import BookingEnginePage from "@/pages/booking-engine/index";
import BookingThankYouPage from "@/pages/booking-engine/thank-you";
import { ChatWidget } from "@/components/chat/ChatWidget";

const FeatureSheetBuilderPage = lazy(() => import("@/pages/listings/feature-sheet-builder"));

function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(false);
  const [isUpcomingServicesOpen, setIsUpcomingServicesOpen] = useState(false);
  const [upcomingServices, setUpcomingServices] = useState<UserHomeResponse["upcomingservice"]>([]);
  const [loadingServices, setLoadingServices] = useState(false);

  useEffect(() => {
    // Allow existing footer "CHAT SUPPORT" blocks on any page
    // to open the global chat widget without editing each page.
    const handleChatSupportClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const hit = target.closest(".chat-support");
      if (hit) {
        window.dispatchEvent(new CustomEvent("cotala-open-chat"));
      }
    };

    document.addEventListener("click", handleChatSupportClick);
    return () => {
      document.removeEventListener("click", handleChatSupportClick);
    };
  }, []);

  const handleLogout = () => {
    clearAuthFromStorage();
    setLocation("/login");
  };

  const loadUpcomingServices = async () => {
    try {
      console.log("Loading upcoming services...");
      setLoadingServices(true);
      const user_id = getUserIdFromStorage();
      if (!user_id) {
        console.error("No user_id found");
        return;
      }

      console.log("Calling getUserHome with:", { user_id, device_id: "web", device_token: "web-token", device_type: "web" });
      const data = await getUserHome({
        user_id,
        device_id: "web",
        device_token: "web-token",
        device_type: "web",
      });

      console.log("API Response:", data);
      if (data.status && data.upcomingservice) {
        setUpcomingServices(data.upcomingservice);
      } else {
        setUpcomingServices([]);
      }
    } catch (error) {
      console.error("Failed to load upcoming services", error);
      setUpcomingServices([]);
    } finally {
      setLoadingServices(false);
    }
  };

  // Icon components for navigation
  const DashboardIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} width="24" height="24" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
      <path d="M4 4h6v8h-6z"></path>
      <path d="M4 16h6v4h-6z"></path>
      <path d="M14 12h6v8h-6z"></path>
      <path d="M14 4h6v4h-6z"></path>
    </svg>
  );

  const HomeIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} width="24" height="24" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
      <path d="M5 12l-2 0l9 -9l9 9l-2 0"></path>
      <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-7"></path>
      <path d="M9 21v-6a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v6"></path>
    </svg>
  );

  const DesignJobIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} width="24" height="24" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
      <path d="M3 4a1 1 0 0 1 1 -1h16a1 1 0 0 1 1 1v12a1 1 0 0 1 -1 1h-16a1 1 0 0 1 -1 -1v-12z"></path>
      <path d="M3 13h18"></path>
      <path d="M8 21h8"></path>
      <path d="M10 17l-.5 4"></path>
      <path d="M14 17l.5 4"></path>
    </svg>
  );

  const FeatureSheetIcon = ({ className }: { className?: string }) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      strokeWidth="1.5"
      stroke="currentColor"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M16 6h3a1 1 0 0 1 1 1v11a2 2 0 0 1 -4 0v-13a1 1 0 0 0 -1 -1h-10a1 1 0 0 0 -1 1v12a3 3 0 0 0 3 3h11" />
      <path d="M8 8h4" />
      <path d="M8 12h4" />
      <path d="M8 16h4" />
    </svg>
  );

  const AiToolIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} width="24" height="24" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
      <path d="M6 21l15 -15l-3 -3l-15 15l3 3"></path>
      <path d="M15 6l3 3"></path>
      <path d="M9 3a2 2 0 0 0 2 2a2 2 0 0 0 -2 2a2 2 0 0 0 -2 -2a2 2 0 0 0 2 -2"></path>
      <path d="M19 13a2 2 0 0 0 2 2a2 2 0 0 0 -2 2a2 2 0 0 0 -2 -2a2 2 0 0 0 2 -2"></path>
    </svg>
  );

  const CartIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} width="24" height="24" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
      <path d="M6 19m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"></path>
      <path d="M17 19m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"></path>
      <path d="M17 17h-11v-14h-2"></path>
      <path d="M6 5l14 1l-1 7h-13"></path>
    </svg>
  );

  const SettingsIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} width="24" height="24" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
      <path d="M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065z"></path>
      <path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0"></path>
    </svg>
  );

  const AmenitiesIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} width="24" height="24" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" />
      <path d="M21 21l-6 -6" />
    </svg>
  );

  const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: DashboardIcon },
    { name: 'Listings', href: '/listings', icon: HomeIcon },
    // { name: 'Design Job', href: '/design-job', icon: DesignJobIcon },
    // { name: 'Feature Sheet', href: '/feature-sheet', icon: FeatureSheetIcon },
    // { name: 'Ai Tool', href: '/ai-tool', icon: AiToolIcon },
    // { name: 'Amenities Lookup', href: '/amenities-lookup', icon: AmenitiesIcon },
    { name: 'My Orders', href: '/orders', icon: CartIcon },
    { name: 'My Account', href: '/profile', icon: SettingsIcon },
  ];

  const SidebarContent = () => (
    <div className="flex flex-col h-full text-sidebar-foreground" style={{ backgroundColor: '#0F1010' }}>
      {/* Logo - Full logo when expanded, CO stamp when collapsed */}
      <div className={`flex items-center pt-3 pb-3 mb-3 transition-all ${isLeftSidebarOpen ? 'px-4 justify-start' : 'px-2 justify-center'}`}>
        <Link href="/dashboard" className="flex items-center">
          {isLeftSidebarOpen ? (
            <img src={cotalaLogo} alt="Cotala" className="h-8 w-auto" />
          ) : (
            <img src={logoNew} alt="Cotala" className="h-10 w-10" />
          )}
        </Link>
      </div>
      
      {/* Navigation Icons */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2">
        <ul className="space-y-1">
          {navigation.map((item, index) => {
            const isActive = location === item.href;
            const IconComponent = item.icon;
            return (
              <li key={item.name} className={`sidebar-item ${index === 0 ? 'mt-3' : ''}`}>
                {isLeftSidebarOpen ? (
                  <Link href={item.href}>
                    <div
                      className={`
                        flex items-center gap-3 px-3 py-2.5 rounded-md cursor-pointer transition-colors
                        ${isActive 
                          ? 'text-white' 
                          : ''}
                      `}
                      style={isActive ? { backgroundColor: '#b284f6', color: '#fff' } : { color: '#939598' }}
                      onMouseEnter={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.backgroundColor = '#1a1a1a';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }
                      }}
                    >
                      <IconComponent className="h-5 w-5 flex-shrink-0" />
                      <span className="text-sm font-medium whitespace-nowrap">{item.name}</span>
                    </div>
                  </Link>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link href={item.href}>
                        <div
                          className={`
                            flex items-center justify-center w-12 h-12 rounded-md cursor-pointer transition-colors mx-auto
                            ${isActive 
                              ? 'text-white' 
                              : ''}
                          `}
                          style={isActive ? { backgroundColor: '#b284f6', color: '#fff' } : { color: '#939598' }}
                          onMouseEnter={(e) => {
                            if (!isActive) {
                              e.currentTarget.style.backgroundColor = '#1a1a1a';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!isActive) {
                              e.currentTarget.style.backgroundColor = 'transparent';
                            }
                          }}
                        >
                          <IconComponent className="h-6 w-6" />
                        </div>
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="ml-2" style={{ backgroundColor: '#0F1010', color: '#fff' }}>
                      {item.name}
                    </TooltipContent>
                  </Tooltip>
                )}
              </li>
            );
          })}
        </ul>
        
        </nav>

      {/* Logout Button */}
      <div className="px-2 pb-4">
        {isLeftSidebarOpen ? (
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-md cursor-pointer transition-colors w-full border-0 bg-transparent hover:text-sidebar-foreground"
            style={{ color: '#939598' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#1a1a1a';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <LogOut className="h-5 w-5 flex-shrink-0" style={{ color: '#939598' }} />
            <span className="text-sm font-medium whitespace-nowrap" style={{ color: '#939598' }}>Logout</span>
          </button>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleLogout}
                className="flex items-center justify-center w-12 h-12 rounded-md cursor-pointer transition-colors mx-auto hover:text-sidebar-foreground"
                style={{ color: '#939598' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#1a1a1a';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <LogOut className="h-6 w-6" style={{ color: '#939598' }} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="ml-2" style={{ backgroundColor: '#0F1010', color: '#fff' }}>
              Logout
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );

  const isFeatureListing =
    location === "/feature-listing" ||
    location === "/oversize-feature-sheets" ||
    location === "/feature-sheet-builder" ||
    location.startsWith("/design-job/postcard");

  return (
    <div className="min-h-screen bg-background">
      {/* Left Sidebar - Hidden on feature-listing page */}
      {!isFeatureListing && (
      <div className={`flex flex-col fixed inset-y-0 z-[80] transition-all duration-300 ${
        isLeftSidebarOpen ? 'w-64' : 'w-16'
      } ${isLeftSidebarOpen ? '' : ''}`}>
        <TooltipProvider delayDuration={0}>
          <SidebarContent />
        </TooltipProvider>
      </div>
      )}

      {/* Hamburger Menu Button - Hidden on feature-listing page */}
      {!isFeatureListing && (
      <button 
        className={`fixed z-[90] flex items-center justify-center text-white p-2 rounded-md transition-all hover:bg-white/10 ${
          isLeftSidebarOpen ? 'top-4 left-[280px]' : 'top-4 left-20'
        }`}
        onClick={() => setIsLeftSidebarOpen(!isLeftSidebarOpen)}
      >
        <Menu className="h-5 w-5" />
      </button>
      )}

      {/* New Service Appointment Button - Top Right (Mobile & Desktop) - Hide on new-appointment, listing-details and feature-listing pages */}
      {location !== "/dashboard" && location !== "/home" && location !== "/home-2" && location !== "/orders" && location !== "/new-appointment" && location !== "/listing-details" && location !== "/feature-listing" && location !== "/oversize-feature-sheets" && location !== "/feature-sheet-builder" && location !== "/proof-review" && !location.startsWith("/design-job/postcard") && (
        <Link 
          href="/new-appointment"
          className="fixed z-[90] flex items-center justify-center text-white rounded-full transition-all hover:opacity-90 top-4 right-4 md:right-28 border border-white shrink-0"
          style={{ backgroundColor: "#000000" }}
        >
          <span className="px-3 py-2.5 md:px-4 md:py-3 text-[10px] sm:text-xs md:text-sm font-bold whitespace-nowrap" style={{ letterSpacing: "0.5px" }}>
            NEW SERVICE APPOINTMENT
          </span>
        </Link>
      )}

      {/* Main Content - Full width (no sidebars) on feature-listing */}
      <div className={`flex flex-col flex-1 min-h-screen transition-all duration-300 ${isFeatureListing ? 'pl-0' : isLeftSidebarOpen ? 'pl-64' : 'pl-16'}`}>
        {/* Page Content - Full width, no padding for feature-listing */}
        <main className={`flex-1 w-full ${isFeatureListing ? '' : 'md:pr-20'}`}>
          {children}
        </main>
      </div>

      {/* Right Sidebar - Hidden on feature-listing page */}
      {!isFeatureListing && (
      <aside className="hidden md:flex md:w-20 md:flex-col md:fixed md:right-0 md:inset-y-0 z-[75] text-sidebar-foreground" style={{ backgroundColor: '#0F1010' }}>
        <TooltipProvider delayDuration={0}>
          <div className="flex flex-col h-full">
            {/* Top spacing */}
            {/* <div className="pt-3"></div> */}
            
            {/* Navigation Icons */}
            <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2">
              <ul className="space-y-2">
                {/* Summary Item */}
                <li className="notification-1 relative group">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div 
                        className="flex items-center justify-center w-12 h-12 rounded-md cursor-pointer transition-colors mx-auto"
                        style={{ color: '#939598' }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = '#1a1a1a';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#939598' }}>
                          <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                          <path d="M3 19v-14a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2z" />
                          <path d="M11 17h2" />
                          <path d="M9 12h6" />
                          <path d="M10 7h4" />
                        </svg>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="ml-2" style={{ backgroundColor: '#0F1010', color: '#fff' }}>
                      Summary
                    </TooltipContent>
                  </Tooltip>
                  <div className="hover-panel absolute left-full ml-4 top-0 w-64 bg-sidebar-accent border border-sidebar-border rounded-lg p-4 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                    <h6 className="mb-1 font-semibold">Summary</h6>
                    <p className="mb-0 text-sm text-sidebar-foreground/70">Quick overview of stats.</p>
                  </div>
                  <div className="border-b mt-2 w-full" style={{ borderColor: '#202226' }}></div>
                </li>

                {/* New Service Appointment Button */}
                <li className="mt-4">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link href="/new-appointment" className="block">
                        <div className="flex items-center justify-center w-12 h-12 rounded-md cursor-pointer transition-colors mx-auto" style={{ backgroundColor: "#b388ff" }}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                            <path d="M12 5v14" />
                            <path d="M5 12h14" />
                          </svg>
          </div>
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="ml-2" style={{ backgroundColor: '#0F1010', color: '#fff' }}>
                      New Service Appointment
                    </TooltipContent>
                  </Tooltip>
                </li>
              </ul>
            </nav>
          </div>
        </TooltipProvider>
      </aside>
      )}

      {/* Upcoming Services Dialog - Shared between left and right sidebars */}
      <Dialog 
        open={isUpcomingServicesOpen} 
        onOpenChange={(open) => {
          setIsUpcomingServicesOpen(open);
        }}
      >
        <DialogContent className="!left-[72px] !right-4 !-translate-x-0 !-translate-y-1/2 sm:!left-1/2 sm:!right-auto sm:!-translate-x-1/2 !w-auto sm:!w-full !max-w-sm sm:!max-w-2xl max-h-[90vh] sm:max-h-[80vh] overflow-y-auto bg-sidebar-accent border-sidebar-border text-sidebar-foreground p-4 sm:p-6">
          <DialogTitle className="sr-only">Upcoming Services</DialogTitle>
          <DialogDescription className="sr-only">Your upcoming scheduled services</DialogDescription>
          <aside className="upcoming-services-new">
            <div>
              <h5 className="mb-4 text-light font-semibold text-white text-lg sm:text-xl">Upcoming Services</h5>
              {loadingServices ? (
                <div className="text-center py-8 text-white/70">Loading upcoming services...</div>
              ) : upcomingServices && upcomingServices.length > 0 ? (
                <Accordion type="single" collapsible className="w-full" defaultValue={`item-${upcomingServices[0]?.id}`}>
                  {upcomingServices.map((service, index) => {
                    // Format address with unit numbers
                    const formatAddress = (unit: unknown, address: string, city?: string) => {
                      const parts: string[] = [];
                      if (unit && String(unit).trim() !== "") {
                        const unitStr = String(unit).trim();
                        const addressMatch = address.match(/^(\d+)/);
                        if (addressMatch) {
                          parts.push(`${unitStr}-${address}`);
                        } else {
                          parts.push(`${unitStr} ${address}`);
                        }
                      } else {
                        parts.push(address || "Address not available");
                      }
                      if (city && city.trim() !== "") {
                        parts.push(city.trim());
                      }
                      return parts.join(", ");
                    };
                    
                    const unit = service.tourdetails?.unit || "";
                    const address = service.tourdetails?.address || "Address not available";
                    const city = service.tourdetails?.city || "";
                    const fullAddress = formatAddress(unit, address, city);
                    
                    // Format schedule date from schedule_date
                    let formattedDate = "";
                    let scheduleTime = service.schedule_time || "";
                    let scheduleEndTime = service.schedule_endtime || "";
                    
                    try {
                      if (service.schedule_date) {
                        const scheduleDate = new Date(service.schedule_date);
                        if (!isNaN(scheduleDate.getTime())) {
                          const dayName = scheduleDate.toLocaleDateString('en-US', { weekday: 'long' });
                          const monthName = scheduleDate.toLocaleDateString('en-US', { month: 'long' });
                          const day = scheduleDate.getDate();
                          formattedDate = `${dayName}, ${monthName} ${day}`;
                        } else {
                          formattedDate = service.schedule_date;
                        }
                      } else if (service.bookdattimestamp) {
                        // Fallback to bookdattimestamp if schedule_date is not available
                        const scheduleDate = new Date(service.bookdattimestamp * 1000);
                        if (!isNaN(scheduleDate.getTime())) {
                          const dayName = scheduleDate.toLocaleDateString('en-US', { weekday: 'long' });
                          const monthName = scheduleDate.toLocaleDateString('en-US', { month: 'long' });
                          const day = scheduleDate.getDate();
                          formattedDate = `${dayName}, ${monthName} ${day}`;
                        }
                      }
                    } catch (e) {
                      formattedDate = service.schedule_date || "";
                    }
                    
                    // Get service names from orderservice array if available
                    const serviceNames = service.orderservice && service.orderservice.length > 0
                      ? service.orderservice.map(os => 
                          os.servicedetails?.frontendtitle || os.servicedetails?.name || "Service"
                        ).join(", ")
                      : "Services";

                    return (
                      <AccordionItem 
                        key={service.id} 
                        value={`item-${service.id}`} 
                        className="service-card border-b-0 mb-2 bg-sidebar rounded-lg overflow-hidden"
                      >
                        <AccordionTrigger 
                          className="w-full flex justify-between items-center px-3 py-3 hover:no-underline [&>svg]:text-white border-0"
                        >
                          <div
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setIsUpcomingServicesOpen(false);
                              setLocation(`/order-details?id=${service.id}`);
                            }}
                            className="text-left flex-1 min-w-0 cursor-pointer"
                          >
                            <div className="service-title font-semibold text-sm text-white break-words">{fullAddress}</div>
                            <div className="service-details text-xs text-sidebar-foreground/70 break-words">{serviceNames}</div>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="px-3 pb-3 pt-0">
                          <div className="text-xs space-y-2">
                            {service.orderservice && service.orderservice.length > 0 ? (
                              service.orderservice.map((os, osIndex) => (
                                <div key={os.id || osIndex}>
                                  {osIndex > 0 && <hr className="my-1 border-sidebar-border" />}
                                  <div className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-0">
                                    <span className="text-white break-words">
                                      {os.servicedetails?.frontendtitle || os.servicedetails?.name || "Service"}
                                    </span>
                                    <span className="text-sidebar-foreground/70 text-xs break-words sm:text-right">
                                      {formattedDate} - {scheduleTime}
                                      {scheduleEndTime && ` to ${scheduleEndTime}`}
                                    </span>
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-0">
                                <span className="text-white break-words">Service</span>
                                <span className="text-sidebar-foreground/70 text-xs break-words sm:text-right">
                                  {formattedDate} - {scheduleTime}
                                  {scheduleEndTime && ` to ${scheduleEndTime}`}
                                </span>
                              </div>
                            )}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              ) : (
                <div className="text-center py-8 text-white/70">No upcoming services</div>
              )}
              <Link 
                href="/new-appointment" 
                onClick={() => setIsUpcomingServicesOpen(false)}
                className="block mt-4 text-sm text-sidebar-accent-foreground cursor-pointer hover:underline new-appointment"
              >
                + New Listing Appointment
              </Link>
            </div>
          </aside>
        </DialogContent>
      </Dialog>

      {/* Popup chat — temporarily hidden for V1. */}
      {false && <ChatWidget />}
    </div>
  );
}

function NewOrderRedirect() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    const search = typeof window !== "undefined" ? window.location.search : "";
    setLocation(`/new-appointment${search}`);
  }, [setLocation]);

  return null;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();
  
  useEffect(() => {
    if (!hasAuthToken()) {
      setLocation("/login");
    }
  }, [setLocation]);

  if (!hasAuthToken()) {
    return null; // Will redirect, so return nothing
  }

  return <>{children}</>;
}

function Router() {
  const [location, setLocation] = useLocation();

  // Redirect root path based on auth status
  useEffect(() => {
    if (location === "/") {
      if (hasAuthToken()) {
        setLocation("/dashboard");
      } else {
        setLocation("/login");
      }
    }
  }, [location, setLocation]);

  return (
    <Switch>
      {/* Auth Routes */}
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/forgot-password" component={ForgotPassword} />

      <Route path="/design-job/postcard">
        {() => (
          <ProtectedRoute>
            <DashboardLayout>
              <PostcardStudio />
            </DashboardLayout>
          </ProtectedRoute>
        )}
      </Route>

      {/* Dashboard Routes - Protected and Wrapped in DashboardLayout */}
      <Route path="/:rest*">
        {(params) => (
          <ProtectedRoute>
          <DashboardLayout>
            <Switch>
                <Route path="/dashboard" component={Home2} />
                <Route path="/home" component={Home} />
              <Route path="/home-2" component={Home2} />
              <Route path="/new-appointment" component={NewOrder} />
              <Route path="/booking-engine" component={BookingEnginePage} />
              <Route path="/booking-thank-you" component={BookingThankYouPage} />
              <Route path="/new-order" component={NewOrderRedirect} />
              <Route path="/seller-flow" component={SellerFlow} />
              <Route path="/different-day-flow" component={DifferentDayFlow} />
              <Route path="/listings" component={Listings} />
              <Route path="/listing-details" component={ListingDetails} />
              <Route path="/feature-listing" component={FeatureListingRedirect} />
              <Route path="/oversize-feature-sheets" component={OversizeFeatureSheetsRedirect} />
              <Route path="/feature-sheet-builder">
                {() => (
                  <Suspense fallback={<div className="p-8 text-white/70">Loading editor…</div>}>
                    <FeatureSheetBuilderPage />
                  </Suspense>
                )}
              </Route>
              <Route path="/feature-sheet" component={FeatureSheetSelector} />
              <Route path="/feature-validate" component={FeatureValidate} />
              <Route path="/orders" component={OrderHistory} />
              <Route path="/order-details" component={OrderDetails} />
              <Route path="/order-success" component={OrderSuccess} />
              <Route path="/profile" component={Profile} />
              <Route path="/branding" component={Branding} />
              <Route path="/preferences"><Redirect to="/profile" /></Route>
              <Route path="/preferences-2"><Redirect to="/profile" /></Route>
              <Route path="/media-preferences"><Redirect to="/profile" /></Route>
              <Route path="/account-statement" component={AccountStatementPage} />
              <Route path="/design-job/postcard" component={PostcardStudio} />
              <Route path="/design-job" component={DesignJob} />
              <Route path="/proof-review" component={ProofReview} />
              <Route path="/ai-tool" component={AiTool} />
              <Route path="/amenities-lookup" component={AmenitiesLookupPage} />
              <Route component={NotFound} />
            </Switch>
          </DashboardLayout>
          </ProtectedRoute>
        )}
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

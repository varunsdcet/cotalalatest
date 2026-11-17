import { useEffect } from "react";
import { useLocation, Link } from "wouter";
import { CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function OrderSuccess() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    // Auto redirect to orders page after 5 seconds
    const timer = setTimeout(() => {
      setLocation("/orders");
    }, 5000);

    return () => clearTimeout(timer);
  }, [setLocation]);

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center">
      <div className="text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
        {/* Success Animation */}
        <div className="mb-8 flex justify-center">
          <div className="relative">
            <CheckCircle className="h-32 w-32 text-green-500 animate-in zoom-in duration-500" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-32 w-32 rounded-full bg-green-500/20 animate-ping" />
            </div>
          </div>
        </div>

        {/* Success Message */}
        <h1 className="text-4xl md:text-5xl font-bold mb-4 animate-in fade-in duration-700">
          Order Placed Successfully!
        </h1>
        <p className="text-white/70 text-lg mb-8 animate-in fade-in duration-1000">
          Your appointment has been confirmed. We'll send you a confirmation email shortly.
        </p>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center animate-in fade-in duration-1200">
          <Button
            onClick={() => setLocation("/orders")}
            className="bg-[#b388ff] hover:bg-[#b388ff]/80 text-white px-8 py-3 rounded-full font-semibold"
          >
            View Orders
          </Button>
          <Button
            onClick={() => setLocation("/new-appointment")}
            variant="outline"
            className="border-white/30 text-white hover:bg-white/10 px-8 py-3 rounded-full font-semibold"
          >
            Create New Order
          </Button>
        </div>

        <p className="text-white/50 text-sm mt-8">
          Redirecting to orders page in 5 seconds...
        </p>
      </div>
    </div>
  );
}



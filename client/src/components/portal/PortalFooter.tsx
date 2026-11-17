import lightLogo from "@/pages/images/logos/light-logo.svg";

export default function PortalFooter() {
  return (
    <footer className="footer bg-black border-t border-white/10">
      <div className="container mx-auto px-4 py-6">
        <div className="flex flex-col md:flex-row justify-between items-center">
          <div className="text-left mb-3 md:mb-0">
            <img src={lightLogo} width="100" alt="Logo" className="mb-2" />
            <div className="copyright text-sm text-white/50 text-left">
              © {new Date().getFullYear()} Cotala Cross Media Inc. All Rights Reserved.
            </div>
          </div>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("cotala-open-chat"))}
            className="chat-support flex items-center gap-2 hover:opacity-80 transition-opacity"
            aria-label="Open chat support"
          >
            <div className="status-dot w-2 h-2 bg-green-500 rounded-full" />
            <div className="text-sm font-medium">CHAT SUPPORT</div>
          </button>
        </div>
      </div>
    </footer>
  );
}

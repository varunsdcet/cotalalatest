import { Link } from "wouter";
import bgLogin from "@/pages/images/bg-login.jpeg";
import { useState } from "react";
import { forgotPassword } from "@/lib/api";

export default function ForgotPassword() {
  const [realtorId, setRealtorId] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const data = await forgotPassword({ realter_id: realtorId });
      if (data.status) {
        setMessage(data.msg || "Password reset instructions sent.");
      } else {
        setError(data.msg || "Unable to send password reset.");
      }
    } catch {
      setError("Unable to send password reset. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white relative overflow-y-auto lg:h-screen lg:overflow-hidden">
      {/* Page wrapper to mimic login/register layout */}
      <div className="w-full min-h-screen lg:h-full flex flex-col">
        <div className="flex flex-col lg:flex-row min-h-screen lg:h-full">
          {/* Left column with background image - visible on lg+ only */}
          <div
            className="relative hidden lg:block lg:flex-1 min-h-[300px]"
            style={{
              backgroundImage: `url(${bgLogin})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          />

          {/* Right column – forgot password card */}
          <div className="w-full lg:max-w-[520px] flex items-center justify-center bg-neutral-900">
            <div className="w-full max-w-md px-6 py-10">
              <h2 className="mb-3 text-2xl font-bold text-white">
                Forgot your password?
              </h2>
              <p className="mb-8 text-sm text-white/70">
                If you forgot your password, enter your Realtor ID and we will
                email you a new password.
              </p>

              {/* Form */}
              <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="space-y-1">
                  <label
                    htmlFor="realtorId"
                    className="block text-sm text-white"
                  >
                    Realtor ID
                  </label>
                  <input
                    id="realtorId"
                    type="email"
                    className="block w-full rounded-md border border-white/20 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-white focus:ring-1 focus:ring-white"
                    value={realtorId}
                    onChange={(e) => setRealtorId(e.target.value)}
                  />
                </div>

                {error && (
                  <p className="text-xs text-red-400">
                    {error}
                  </p>
                )}
                {message && (
                  <p className="text-xs text-emerald-400">
                    {message}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex w-full cursor-pointer items-center justify-center rounded-md px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-60"
                  style={{ backgroundColor: "#b388ff" }}
                >
                  {loading ? "Sending..." : "Send me a new Password"}
                </button>

                <Link href="/login">
                  <span className="inline-flex w-full cursor-pointer items-center justify-center rounded-md border border-white/30 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/5">
                    Back to Login
                  </span>
                </Link>
              </form>

              <div className="mt-6 space-y-3 text-center text-xs text-white/80">
                <div>
                  <a
                    href="#"
                    className="font-medium underline"
                    style={{ color: "#b388ff" }}
                  >
                    Why can&apos;t you just send me my old password?
                  </a>
                </div>
                <div>
                  <a
                    href="#"
                    className="font-medium underline"
                    style={{ color: "#b388ff" }}
                  >
                    I don&apos;t know my Realtor ID
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

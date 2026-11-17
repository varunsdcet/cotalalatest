import { Link, useLocation } from "wouter";
import registerBg from "@/pages/images/img1234.png";
import googleIcon from "@/pages/images/google-icon.svg";
import facebookIcon from "@/pages/images/facebook-icon.svg";
import supportImg from "@/pages/images/support.png";
import { useEffect, useState } from "react";
import { getRegion, saveAuthToStorage, signupVerify, hasAuthToken } from "@/lib/api";

export default function Register() {
  const [, navigate] = useLocation();

  // Redirect to dashboard if already logged in
  useEffect(() => {
    if (hasAuthToken()) {
      navigate("/dashboard");
    }
  }, [navigate]);
  const [regions, setRegions] = useState<any[]>([]);
  const [region, setRegion] = useState("");
  const [realtorId, setRealtorId] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadRegions = async () => {
      try {
        const data = await getRegion();
    

        if (data.status && Array.isArray(data.list)) {
          setRegions(data.list);
        }
      } catch {
        // silent fail for now
      }
    };
    loadRegions();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const payload = {
        region,
        realter_id: realtorId,
        email,
        username,
        password,
      };
      const data = await signupVerify(payload);
      if (data.status) {
        // Extract user_id from userdetails or response
        let user_id: string | undefined;
        if (data.userdetails) {
          const user = data.userdetails as any;
          user_id = user.user_id || user.id || user.customerid || user.agent;
        }
        saveAuthToStorage(data.token, data.userdetails, user_id);
        navigate("/dashboard");
      } else {
        setError(data.msg || "Registration failed");
      }
    } catch {
      setError("Unable to register. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white relative overflow-y-auto lg:h-screen lg:overflow-hidden">
      {/* Page wrapper to mimic login layout */}
      <div className="w-full min-h-screen lg:h-full flex flex-col">
        <div className="flex flex-col lg:flex-row min-h-screen lg:h-full">
          {/* Left column with background image - visible on lg+ only */}
          <div
            className="relative hidden lg:block lg:flex-1 min-h-[300px]"
            style={{
              backgroundImage: `url(${registerBg})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          />

          {/* Right column – register card */}
          <div className="w-full lg:max-w-[520px] flex items-center justify-center bg-neutral-900">
            <div className="w-full max-w-md px-6 py-10">
              <h2 className="mb-3 text-2xl font-bold text-white">
                Register Now
              </h2>
              <p className="mb-8 text-sm text-white/70">
                Please register with your details.
              </p>

              {/* Social buttons */}
              <div className="grid grid-cols-2 gap-2 mb-5">
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-1.5 w-full rounded-full border border-white/15 bg-white/5 px-3 py-2 text-xs font-medium text-white hover:bg-white/10 transition-colors"
                >
                  <img
                    src={googleIcon}
                    alt="Google"
                    className="h-3 w-3"
                  />
                  <span className="mr-1 flex-shrink-0 font-semibold">
                    Sign up with Google
                  </span>
                </button>
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-1.5 w-full rounded-full border border-white/15 bg-white/5 px-3 py-2 text-xs font-medium text-white hover:bg-white/10 transition-colors"
                >
                  <img
                    src={facebookIcon}
                    alt="Facebook"
                    className="h-3 w-3"
                  />
                  <span className="mr-1 flex-shrink-0 font-semibold">
                    Sign up with FB
                  </span>
                </button>
              </div>

              {/* Divider */}
              <div className="relative my-4 flex items-center justify-center">
                <span className="pointer-events-none absolute left-0 right-0 h-px bg-white" />
                <p className="relative z-10 mb-0 inline-block bg-neutral-900 px-3 text-xs text-white">
                  or sign up with
                </p>
              </div>

              {/* Form */}
              <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label
                      htmlFor="region"
                      className="block text-sm text-white"
                    >
                      Region
                    </label>
                    <select
                      id="region"
                      className="block w-full rounded-md border border-white/20 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-white focus:ring-1 focus:ring-white"
                      value={region}
                      onChange={(e) => setRegion(e.target.value)}
                    >
                      <option value="">Choose...</option>
                      {regions.map((item, idx) => {
                        // Extract region name - prioritize name field, then label, then fallback
                        const regionName = (item as any).name || (item as any).label || (item as any).region_name || String(item);
                        return (
                          <option key={idx} value={regionName}>
                            {regionName}
                        </option>
                        );
                      })}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label
                      htmlFor="realtorId"
                      className="block text-sm text-white"
                    >
                      Realtor ID
                    </label>
                    <input
                      id="realtorId"
                      type="text"
                      className="block w-full rounded-md border border-white/20 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-white focus:ring-1 focus:ring-white"
                      value={realtorId}
                      onChange={(e) => setRealtorId(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label
                      htmlFor="email"
                      className="block text-sm text-white"
                    >
                      Email
                    </label>
                    <input
                      id="email"
                      type="email"
                      className="block w-full rounded-md border border-white/20 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-white focus:ring-1 focus:ring-white"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label
                      htmlFor="username"
                      className="block text-sm text-white"
                    >
                      Username
                    </label>
                    <input
                      id="username"
                      type="text"
                      className="block w-full rounded-md border border-white/20 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-white focus:ring-1 focus:ring-white"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor="password"
                    className="block text-sm text-white"
                  >
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    className="block w-full rounded-md border border-white/20 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-white focus:ring-1 focus:ring-white"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>

                {error && (
                  <p className="text-xs text-red-400">
                    {error}
                  </p>
                )}

                <div className="mb-3 flex items-start gap-2">
                  <input
                    id="terms"
                    type="checkbox"
                    defaultChecked
                    className="mt-1 h-4 w-4 rounded border border-white/40 bg-black/60 focus:ring-0"
                    style={{ accentColor: "#b388ff" }}
                  />
                  <label
                    htmlFor="terms"
                    className="text-xs text-white/80"
                  >
                    By registering, you have read and agree to our
                    <a
                      href="#"
                      className="ml-1 underline"
                      style={{ color: "#b388ff" }}
                    >
                      Terms &amp; Conditions.
                    </a>
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex w-full items-center justify-center rounded-md px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-60"
                  style={{ backgroundColor: "#b388ff" }}
                >
                  {loading ? "Registering..." : "Register"}
                </button>
              </form>

              <div className="mt-4 flex items-center justify-center text-xs text-white/80">
                <span>Already have an account?</span>
                <Link href="/login">
                  <span
                    className="ml-1 font-medium underline cursor-pointer"
                    style={{ color: "#b388ff" }}
                  >
                    Login
                  </span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Support card - same as login */}
      <div className="customizer-btn-1">
        <div className="col-md-12">
          <div className="card border-radius support-card">
            <div className="card-body p-2 flex items-center gap-2">
              <img
                src={supportImg}
                alt="Support"
                className="rounded-circle"
                width={50}
                height={50}
              />
              <div>
                <h5 className="fw-semibold mb-0">604-514-9589&nbsp;</h5>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

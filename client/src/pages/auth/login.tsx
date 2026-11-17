import { Link, useLocation } from "wouter";
import bgLogin from "@/pages/images/bg-login.jpeg";
import googleIcon from "@/pages/images/google-icon.svg";
import facebookIcon from "@/pages/images/facebook-icon.svg";
import supportImg from "@/pages/images/support.png";
import { useState, useEffect } from "react";
import { loginCheckUser, saveAuthToStorage, hasAuthToken } from "@/lib/api";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

export default function Login() {
  const [, navigate] = useLocation();
  
  // Redirect to dashboard if already logged in
  useEffect(() => {
    if (hasAuthToken()) {
      navigate("/dashboard");
    }
  }, [navigate]);
  const [realtorId, setRealtorId] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailMessage, setEmailMessage] = useState<string | null>(null);
 
  // Contacts array
  const contacts = [
    { "contactName": "Akshat", "Email": "akshatrana47@gmail.com" }
  ];

  // Demo ZeptoMail API call function - sends to all contacts
  const sendDemoEmail = async () => {
    setEmailLoading(true);
    setEmailMessage(null);
    
    let successCount = 0;
    let failCount = 0;
    const totalContacts = contacts.length;

    // Array to track email sending status
    const emailStatus: Array<{ Email: string; ContactName: string; Status: boolean }> = [];

    try {
      // Send emails sequentially to avoid rate limiting
      for (let i = 0; i < contacts.length; i++) {
        const contact = contacts[i];
        const name = contact.contactName;
        const email = contact.Email;

        try {
          const response = await fetch("/zeptomail/v1.1/email", {
            method: "POST",
            headers: {
              "Accept": "application/json",
              "Content-Type": "application/json",
              "Authorization": "Zoho-enczapikey PHtE6r0EQLru3jZ78UdT7fK6FsP1MosvqOJnJVJG5Y0XAqJVG01Xr9l9lDKw+BoqAfBHF/Sant1stezK4L3RIWu7MGhLWmqyqK3sx/VYSPOZsbq6x00asV0dfkLeUIToddBv3CLfstvaNA=="
            },
            body: JSON.stringify({
              "from": { "address": "info@appsallure.com" },
              "to": [{ "email_address": { "address": email, "name": name } }],
              "subject": "Appsallure - Welcoming 2026",
              "htmlbody": `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Appsallure - Welcoming 2026</title></head><body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background-color:#f5f0f6;"><table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5f0f6;padding:20px 0;"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;border-radius:16px;max-width:600px;width:100%;box-shadow:0 4px 6px rgba(0,0,0,0.1);"><!-- Logo --><tr><td align="center" style="padding:25px 25px 15px 25px;"><img src="https://appsallure.com/emailtemplate/appsallure-logo.png" alt="Appsallure Logo" width="150" style="display:block;max-width:150px;height:auto;"></td></tr><!-- Greeting --><tr><td style="padding:0 25px 10px 25px;"><p style="margin:0;font-size:13px;color:#4a5568;line-height:1.4;text-align:left;">Dear <strong style="color:#1a1a1a;">${name}</strong>,</p></td></tr><!-- Welcome Text --><tr><td align="center" style="padding:10px 25px;"><p style="margin:0;font-family:Georgia,serif;font-size:24px;font-weight:700;color:#6b2d8f;font-style:italic;">Welcoming 2026</p></td></tr><!-- Main Heading --><tr><td align="center" style="padding:10px 25px 8px 25px;"><h1 style="margin:0;font-size:30px;font-weight:900;color:#1a1a1a;line-height:1.2;">Start the New Year with<br>a Smart Approach</h1></td></tr><!-- Subtitle --><tr><td align="center" style="padding:0 25px 12px 25px;"><p style="margin:0;font-size:18px;color:#333;font-weight:400;line-height:1.3;">Build a powerful app that scales with your vision</p></td></tr><!-- Solutions Section --><tr><td style="padding:20px 25px 20px 25px;"><p style="margin:0 0 15px 0;font-size:16px;color:#333;line-height:1.5;text-align:left;">As you plan your next big move, here's how Appsallure can help you build products that stand out:</p><!-- Mobile App Development --><table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:15px;"><tr><td style="padding-bottom:5px;"><p style="margin:0;font-size:15px;color:#1a1a1a;font-weight:700;line-height:1.4;">📱 Mobile App Development</p></td></tr><tr><td><p style="margin:0;font-size:14px;color:#555;line-height:1.5;text-align:left;">Custom-built iOS and Android apps engineered for speed, security, and seamless user experience.</p></td></tr></table><!-- Web Development --><table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:15px;"><tr><td style="padding-bottom:5px;"><p style="margin:0;font-size:15px;color:#1a1a1a;font-weight:700;line-height:1.4;">🌐 Web Development</p></td></tr><tr><td><p style="margin:0;font-size:14px;color:#555;line-height:1.5;text-align:left;">High-performance websites and platforms designed for scale, reliability, and business growth.</p></td></tr></table><!-- UI/UX Design Excellence --><table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:15px;"><tr><td style="padding-bottom:5px;"><p style="margin:0;font-size:15px;color:#1a1a1a;font-weight:700;line-height:1.4;">🎨 UI/UX Design Excellence</p></td></tr><tr><td><p style="margin:0;font-size:14px;color:#555;line-height:1.5;text-align:left;">Human-centered design systems that elevate engagement and convert users effortlessly.</p></td></tr></table><!-- AI & ML Solutions --><table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:15px;"><tr><td style="padding-bottom:5px;"><p style="margin:0;font-size:15px;color:#1a1a1a;font-weight:700;line-height:1.4;">🧠 AI & ML Solutions</p></td></tr><tr><td><p style="margin:0;font-size:14px;color:#555;line-height:1.5;text-align:left;">Smart features powered by automation, analytics, and intelligent decision-making.</p></td></tr></table><!-- Enterprise Tech & Consulting --><table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:15px;"><tr><td style="padding-bottom:5px;"><p style="margin:0;font-size:15px;color:#1a1a1a;font-weight:700;line-height:1.4;">🏢 Enterprise Tech & Consulting</p></td></tr><tr><td><p style="margin:0;font-size:14px;color:#555;line-height:1.5;text-align:left;">Full-stack development and strategic tech advisory for startups, SMEs, and global teams.</p></td></tr></table><!-- Digital Product Strategy --><table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:0;"><tr><td style="padding-bottom:5px;"><p style="margin:0;font-size:15px;color:#1a1a1a;font-weight:700;line-height:1.4;">🚀 Digital Product Strategy</p></td></tr><tr><td><p style="margin:0;font-size:14px;color:#555;line-height:1.5;text-align:left;">From idea validation to launch planning—we help you build with clarity and confidence.</p></td></tr></table></td></tr><!-- Offer --><tr><td align="center" style="padding:10px 25px 8px 25px;"><p style="margin:0;font-size:30px;font-weight:900;color:#6b2d8f;line-height:1.15;">Get 15% OFF + Free 30-min<br>Strategy Call</p></td></tr><!-- Details --><tr><td align="center" style="padding:6px 25px;"><p style="margin:0;font-size:16px;color:#333;">on all development packages</p></td></tr><!-- Code --><tr><td align="center" style="padding:5px 25px 10px 25px;"><p style="margin:0;font-size:17px;color:#333;">Use Code: <strong style="color:#1a1a1a;font-weight:700;">FUTURE2026</strong></p></td></tr><!-- CTA Button --><tr><td align="center" style="padding:8px 25px 12px 25px;"><a href="https://appsallure.com/contact" target="_blank" style="display:inline-block;background-color:#6b2d8f;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:6px;padding:11px 35px;margin:0;">Join Us →</a></td></tr><!-- Footer Divider --><tr><td style="padding:12px 25px 12px 25px;border-top:1px solid #e0e0e0;"><!-- Footer Greeting --><p style="margin:0 0 10px 0;font-size:13px;color:#4a5568;line-height:1.4;text-align:center;">Wishing you and your family a very 🙏 Happy and Prosperous New Year 2026.</p><!-- Signature --><p style="margin:8px 0 2px 0;font-size:12px;color:#4a5568;text-align:left;">Thank you, Warm regards,</p><p style="margin:4px 0 5px 0;font-size:12px;color:#1a1a1a;font-weight:600;text-align:left;"><strong>Akshat Rana</strong></p><p style="margin:5px 0 4px 0;font-size:11px;color:#6b7280;font-style:italic;text-align:left;">Appsallure - Leading Mobile App Development</p><p style="margin:4px 0 0 0;font-size:11px;color:#6b7280;text-align:left;"><a href="mailto:info@appsallure.com" style="color:#1e88e5;text-decoration:none;">info@appsallure.com</a> | <a href="tel:+12269357681" style="color:#1e88e5;text-decoration:none;">+1 (226) 935-7681</a></p></td></tr></table></td></tr></table></body></html>`
            })
          });
          
          const data = await response.json();
          console.log(`Email sent to ${name} (${email}):`, data);
          successCount++;
          
          // Track successful email
          emailStatus.push({
            Email: email,
            ContactName: name,
            Status: true
          });
          
          // Update progress message
          setEmailMessage(`Sending... ${i + 1}/${totalContacts} (${successCount} sent, ${failCount} failed)`);
          
          // Small delay to avoid rate limiting (100ms between emails)
          if (i < contacts.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } catch (error) {
          console.error(`Failed to send email to ${name} (${email}):`, error);
          failCount++;
          
          // Track failed email
          emailStatus.push({
            Email: email,
            ContactName: name,
            Status: false
          });
          
          setEmailMessage(`Sending... ${i + 1}/${totalContacts} (${successCount} sent, ${failCount} failed)`);
        }
      }
      
      // Generate Excel file with email status
      try {
        const worksheet = XLSX.utils.json_to_sheet(emailStatus);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Email Status");
        
        // Generate Excel file buffer
        const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
        const excelBlob = new Blob([excelBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        
        // Generate filename with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
        const fileName = `email-status-${timestamp}.xlsx`;
        
        // Download the file
        saveAs(excelBlob, fileName);
        console.log("Excel file generated and downloaded:", fileName);
      } catch (excelError) {
        console.error("Failed to generate Excel file:", excelError);
      }
      
      // Final message
      setEmailMessage(`Email sending completed! ${successCount} sent successfully, ${failCount} failed out of ${totalContacts} total. Excel file downloaded.`);
    } catch (error) {
      console.error("Email sending process error:", error);
      setEmailMessage(`Error: ${error instanceof Error ? error.message : "Failed to send emails. Please check console for details."}`);
    } finally {
      setEmailLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const payload = {
        email_or_id: realtorId,
        password,
      };
      const data = await loginCheckUser(payload);
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
        setError(data.msg || "Login failed");
      }
    } catch (err) {
      setError("Unable to login. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white relative overflow-y-auto lg:h-screen lg:overflow-hidden">
      {/* Page wrapper to mimic original layout */}
      <div className="w-full min-h-screen lg:h-full flex flex-col">
        <div className="flex flex-col lg:flex-row min-h-screen lg:h-full">
          {/* Left column with background image (bg-login.jpeg) - visible on lg+ only */}
          <div
            className="relative hidden lg:block lg:flex-1 min-h-[300px]"
            style={{
              backgroundImage: `url(${bgLogin})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          >
            {/* Optional faded login-bg.svg centered inside, like original commented image */}
          
          </div>

          {/* Right column – authentication card */}
          <div className="w-full lg:max-w-[480px] flex items-center justify-center bg-neutral-900">
            <div className="w-full max-w-md px-6 py-10">
              <h2 className="mb-3 text-2xl font-bold text-white">
                Welcome to cotala
              </h2>
              <p className="mb-8 text-sm text-white/70">
                To access agent tools please enter your{" "}
                <strong>realtor id</strong> and <strong>password</strong> below.
                Realtor id is the same one you use to log into paragon.
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
                    Sign in with Google
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
                    Sign in with FB
                  </span>
                  
                </button>
              </div>

              {/* Divider */}
              <div className="relative my-4 flex items-center justify-center">
                <span className="pointer-events-none absolute left-0 right-0 h-px bg-white" />
                <p className="relative z-10 mb-0 inline-block bg-neutral-900 px-3 text-xs text-white">
                  or sign in with
                </p>
              </div>

              {/* Form */}
              <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="space-y-1">
                  <label
                    htmlFor="realtorId"
                    className="block text-sm text-white"
                  >
                    Realtor ID/Email ID
                  </label>
                  <input
                    id="realtorId"
                    type="text"
                    inputMode="email"
                    autoComplete="username"
                    className="form-control text-white block w-full rounded-md border border-white/20 bg-black/40 px-3 py-2 text-sm outline-none focus:border-white focus:ring-1 focus:ring-white"
                    value={realtorId}
                    onChange={(e) => setRealtorId(e.target.value)}
                  />
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
                    className="form-control text-white block w-full rounded-md border border-white/20 bg-black/40 px-3 py-2 text-sm outline-none focus:border-white focus:ring-1 focus:ring-white"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>

                {error && (
                  <p className="text-xs text-red-400">
                    {error}
                  </p>
                )}

                <div className="mt-1 mb-3 flex items-center justify-end">
                  <Link href="/forgot-password">
                    <span
                      className="text-xs font-medium cursor-pointer"
                      style={{ color: "#b388ff" }}
                    >
                      Forgot Password ?
                    </span>
                  </Link>
                </div>

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
                    By signing in, you have read and agree to our
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
                  {loading ? "Logging in..." : "Login"}
                </button>
              </form>

              {/* Test Email Button */}
            

              <div className="mt-4 flex items-center justify-center text-xs text-white/80">
                <span>Don&apos;t have an account?</span>
                <Link href="/register">
                  <span
                    className="ml-1 font-medium underline cursor-pointer"
                    style={{ color: "#b388ff" }}
                  >
                    Register
                  </span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Support card (bottom-right, matching original template structure) */}
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

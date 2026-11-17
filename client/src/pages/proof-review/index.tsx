import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { approveProof, getProofDetail, requestProofChanges } from "@/lib/api";
import PortalFooter from "@/components/portal/PortalFooter";
import "./proof-review.css";

type ProofData = {
  id?: number | string;
  description?: string;
  status?: string;
  preview_url?: string;
  proof_url?: string;
  needs_approval?: boolean;
  product_details?: { name?: string } | null;
  tour?: { address?: string; city?: string; unit?: string };
};

function readCachedProof(id: string | null): ProofData | null {
  if (!id) return null;
  try {
    const raw = sessionStorage.getItem(`cotala_proof_${id}`);
    return raw ? (JSON.parse(raw) as ProofData) : null;
  } catch {
    return null;
  }
}

function isPdf(url: string) {
  const lower = url.toLowerCase();
  return lower.includes(".pdf") || lower.includes("proof.php");
}

export default function ProofReview() {
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const proofId = params.get("id");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [showChanges, setShowChanges] = useState(false);
  const [proof, setProof] = useState<ProofData | null>(() => readCachedProof(proofId));
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!proofId) {
        setError("Proof ID is required");
        setLoading(false);
        return;
      }
      const cached = readCachedProof(proofId);
      try {
        setLoading(true);
        const data = await getProofDetail(proofId);
        if (data.status && data.data) {
          setProof({ ...(cached || {}), ...(data.data as ProofData) });
        } else if (!cached) {
          setError(data.msg || "Proof not found");
        }
      } catch (err) {
        console.error(err);
        if (!cached) setError("Failed to load proof");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [proofId]);

  const goBack = () => {
    if (window.history.length > 1) window.history.back();
    else setLocation("/dashboard");
  };

  const handleApprove = async () => {
    if (!proofId) return;
    try {
      setSaving(true);
      setNotice(null);
      const data = await approveProof(proofId);
      if (data.status) {
        setProof((prev) => (prev ? { ...prev, status: "Approved", needs_approval: false } : prev));
        sessionStorage.removeItem(`cotala_proof_${proofId}`);
        setNotice(data.msg || "Proof approved");
        window.setTimeout(goBack, 1200);
      } else {
        setNotice(data.msg || "Unable to approve proof");
      }
    } catch (err) {
      console.error(err);
      setNotice("Unable to approve proof");
    } finally {
      setSaving(false);
    }
  };

  const handleRequestChanges = async () => {
    if (!proofId || !message.trim()) {
      setNotice("Please describe the changes you need");
      return;
    }
    try {
      setSaving(true);
      setNotice(null);
      const data = await requestProofChanges(proofId, message.trim());
      if (data.status) {
        setNotice(data.msg || "Change request submitted");
        setShowChanges(false);
        setMessage("");
        window.setTimeout(goBack, 1200);
      } else {
        setNotice(data.msg || "Unable to submit change request");
      }
    } catch (err) {
      console.error(err);
      setNotice("Unable to submit change request");
    } finally {
      setSaving(false);
    }
  };

  const title = proof?.product_details?.name || proof?.description || "Proof Review";
  const address =
    [proof?.tour?.unit, proof?.tour?.address, proof?.tour?.city].filter(Boolean).join(", ") ||
    (proof?.product_details?.name ? proof?.description : "") ||
    "";
  const preview = proof?.preview_url || proof?.proof_url || "";
  const status = String(proof?.status || "");
  const canReviewProof = /pending\s*approval|changes?\s*required/i.test(status);

  return (
    <div className="proof-review-page min-h-screen text-white">
      <div className="hero-section">
        {/* Order service CTA omitted from Proof Review for now. */}
        {false && <div className="top-button">
          <Link href="/new-appointment" className="custom-font">
            NEW SERVICE APPOINTMENT
          </Link>
        </div>}
        <div className="container mx-auto px-4">
          <h1 className="hero-title text-2xl md:text-3xl font-semibold">
            {loading && !proof ? "Loading..." : title}
          </h1>
          {address ? <p className="hero-desc-1 mt-2">{address}</p> : null}
        </div>
      </div>

      <div className="service-package">
        <div className="container mx-auto px-4 my-3">
          {error ? (
            <div className="text-red-400 py-8">{error}</div>
          ) : (
            <div className="order-card-1">
              <div className="order-top gap-3">
                <span className="proof-status">
                  {proofId ? `Proof #${proofId}` : ""}
                  {status ? ` · ${status}` : ""}
                </span>
                {canReviewProof && <div className="flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    className="btn-outline"
                    disabled={saving}
                    onClick={() => setShowChanges((v) => !v)}
                  >
                    REQUEST CHANGES
                  </button>
                  <button type="button" className="btn-main" disabled={saving} onClick={handleApprove}>
                    {saving ? "PLEASE WAIT..." : "APPROVE NOW"}
                  </button>
                </div>}
              </div>
              <div className="order-body p-4">
                {notice ? <div className="mb-4 text-sm text-[#b082f2]">{notice}</div> : null}
                {canReviewProof && showChanges && (
                  <div className="mb-4">
                    <textarea
                      className="proof-textarea"
                      placeholder="Tell us what you'd like changed..."
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn-main mt-3"
                      disabled={saving}
                      onClick={handleRequestChanges}
                    >
                      SUBMIT CHANGES
                    </button>
                  </div>
                )}
                {loading && !preview ? (
                  <div className="text-white/70 py-16 text-center">Loading proof...</div>
                ) : preview ? (
                  isPdf(preview) ? (
                    <embed src={preview} type="application/pdf" width="100%" height="1000px" />
                  ) : (
                    <img src={preview} alt="Proof preview" className="w-full rounded-lg" />
                  )
                ) : (
                  <div className="text-white/70 py-16 text-center">No proof file available yet.</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      <PortalFooter />
    </div>
  );
}

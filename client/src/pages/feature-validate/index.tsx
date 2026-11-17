import { useEffect, useState } from "react";
import { useLocation } from "wouter";

type MlsResponseTour = {
  address: string;
  city: string;
  postal_code: string;
  beds: string | number | null;
  baths: string | number | null;
  sqft: string | number | null;
  price: number | null;
  mls_number: string;
};

type MlsResponseAgent = {
  name: string;
  brokerage: string;
  email: string;
  phone: string;
  url: string;
};

type MlsResponse = {
  tour: MlsResponseTour;
  agent: MlsResponseAgent;
};

type ValidationScalar = string;
type ValidationObject = { pdf?: string | number | null; mls?: string | number | null };

type ValidationApiResponse = {
  pdf_extracted_data?: Record<string, unknown>;
  validation_result?: Record<string, ValidationScalar | ValidationObject>;
};

export default function FeatureValidate() {
  const [, setLocation] = useLocation();
  const [mlsResponse, setMlsResponse] = useState<MlsResponse | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ValidationApiResponse | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("cotala_feature_validation_mls_response");
      if (!stored) {
        setError("Listing data not found. Please start from the Feature Sheet page.");
        return;
      }
      const parsed = JSON.parse(stored) as MlsResponse;
      setMlsResponse(parsed);
    } catch (e) {
      console.error("Failed to read stored MLS response", e);
      setError("Failed to load listing data for validation.");
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) {
      setFile(null);
      return;
    }
    setFile(f);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mlsResponse) {
      setError("Listing data not loaded.");
      return;
    }
    if (!file) {
      setError("Please upload a PDF file.");
      return;
    }
    setError(null);
    setLoading(true);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("pdf_file", file);
      formData.append("mls_response", JSON.stringify(mlsResponse));

      const res = await fetch("https://goyoga.ai/validator/validate-listing", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        throw new Error(`Request failed with status ${res.status}`);
      }

      const data = (await res.json()) as ValidationApiResponse;
      setResult(data);
    } catch (err) {
      console.error("PDF validation failed", err);
      setError("Validation request failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const normalizeFieldValue = (v: string | number | null | undefined): string => {
    if (v === null || v === undefined) return "";
    return String(v).trim();
  };

  /** True when PDF and MLS values are considered equal for display (both empty = match). */
  const valuesMatch = (
    pdfVal: string | number | null | undefined,
    mlsVal: string | number | null | undefined,
    apiStatus: string,
  ): boolean => {
    const s = apiStatus.trim();
    if (s) {
      const u = s.toUpperCase();
      if (u === "MATCH" || u === "OK" || u === "PASS") return true;
      if (u === "MISMATCH" || u.includes("MISMATCH") || u === "FAIL" || u === "NO MATCH") return false;
    }
    const p = normalizeFieldValue(pdfVal);
    const m = normalizeFieldValue(mlsVal);
    if (p === "" && m === "") return true;
    return p === m;
  };

  const getMlsValueForField = (field: string, mls: MlsResponse | null): string | number | null => {
    if (!mls) return null;
    switch (field) {
      case "address":
        return mls.tour.address;
      case "city":
        return mls.tour.city;
      case "postal_code":
      case "postal":
        return mls.tour.postal_code;
      case "beds":
        return mls.tour.beds;
      case "baths":
        return mls.tour.baths;
      case "sqft":
        return mls.tour.sqft;
      case "price":
        return mls.tour.price;
      case "mls_number":
      case "mls":
        return mls.tour.mls_number;
      case "agent_name":
      case "name":
        return mls.agent.name;
      case "brokerage":
        return mls.agent.brokerage;
      case "email":
        return mls.agent.email;
      case "phone":
        return mls.agent.phone;
      case "website":
      case "url":
        return mls.agent.url;
      default:
        return null;
    }
  };

  const renderTableRows = () => {
    if (!result?.validation_result) return null;
    const rows: JSX.Element[] = [];
    const vr = result.validation_result;
    const pdfData = result.pdf_extracted_data || {};

    Object.entries(vr).forEach(([field, value]) => {
      let pdfVal: string | number | null = null;
      let mlsVal: string | number | null = null;
      let status: string = "";

      if (typeof value === "string") {
        status = value;
        pdfVal = (pdfData as Record<string, unknown>)?.[field] as string | number | null | undefined ?? null;
        mlsVal = getMlsValueForField(field, mlsResponse);
      } else if (value && typeof value === "object") {
        pdfVal = value.pdf ?? null;
        mlsVal = value.mls ?? null;
        status = "";
      }

      const matched = valuesMatch(pdfVal, mlsVal, status);
      const displayStatus =
        status.trim() ||
        (normalizeFieldValue(pdfVal) === "" && normalizeFieldValue(mlsVal) === ""
          ? "—"
          : matched
            ? "MATCH"
            : "MISMATCH");

      const mismatchRow = !matched;
      const cellMismatch = mismatchRow ? "text-red-400" : "text-slate-100";
      const statusClass = mismatchRow
        ? "text-red-300 font-semibold"
        : displayStatus === "MATCH"
          ? "text-emerald-400/90 font-medium"
          : "text-slate-300";

      rows.push(
        <tr
          key={field}
          className={
            mismatchRow
              ? "border-b border-red-900/50 bg-red-950/35"
              : "border-b border-slate-800/60"
          }
        >
          <td
            className={`px-3 py-2 text-xs capitalize ${mismatchRow ? "text-red-200" : "text-slate-100"}`}
          >
            {field.replace(/_/g, " ")}
          </td>
          <td className={`px-3 py-2 text-xs ${cellMismatch}`}>
            {pdfVal !== null && pdfVal !== undefined && pdfVal !== "" ? String(pdfVal) : "—"}
          </td>
          <td className={`px-3 py-2 text-xs ${cellMismatch}`}>
            {mlsVal !== null && mlsVal !== undefined && mlsVal !== "" ? String(mlsVal) : "—"}
          </td>
          <td className={`px-3 py-2 text-xs ${statusClass}`}>{displayStatus}</td>
        </tr>,
      );
    });

    return rows;
  };

  return (
    <div className="min-h-screen bg-[#060914] text-white">
      <div className="w-full bg-gradient-to-r from-[#101622] via-[#182544] to-[#101622] px-6 py-10 md:px-12">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-3xl md:text-4xl font-semibold mb-3">Validate Feature Sheet PDF</h1>
          <p className="text-sm md:text-base text-slate-300">
            Upload a finished feature sheet PDF and compare it against MLS data for this listing.
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 md:px-0 -mt-8 space-y-6 pb-10">
        <div className="bg-[#111827] border border-slate-700/70 rounded-2xl shadow-xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-[0.18em] mb-1">
                Listing MLS Data
              </p>
              {mlsResponse ? (
                <div className="text-xs text-slate-100 space-y-0.5">
                  <p className="font-semibold">
                    {mlsResponse.tour.address}, {mlsResponse.tour.city} {mlsResponse.tour.postal_code}
                  </p>
                  <p>
                    MLS: <span className="font-semibold">{mlsResponse.tour.mls_number || "—"}</span>
                  </p>
                  <p>
                    {mlsResponse.tour.beds || "—"} beds · {mlsResponse.tour.baths || "—"} baths ·{" "}
                    {mlsResponse.tour.sqft || "—"} sqft
                  </p>
                  <p className="text-slate-300">
                    {mlsResponse.agent.name} · {mlsResponse.agent.brokerage}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-slate-400">
                  No MLS data loaded. Go back to Feature Sheet and choose a listing.
                </p>
              )}
            </div>
            <button
              type="button"
              className="text-[11px] px-3 py-2 rounded-xl border border-slate-500 text-slate-200 hover:bg-slate-800"
              onClick={() => setLocation("/feature-sheet")}
            >
              Back to Feature Sheet
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-slate-200 mb-2">
                Upload Feature Sheet PDF
              </label>
              <input
                type="file"
                accept="application/pdf"
                onChange={handleFileChange}
                className="block w-full text-xs text-slate-200 file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-[#0E94B9] file:text-white hover:file:bg-[#0E94B9]/90"
              />
              <p className="mt-1 text-[11px] text-slate-400">
                Select the final exported PDF for this property.
              </p>
            </div>

            {error && (
              <div className="bg-red-900/40 border border-red-700/70 text-red-100 text-xs px-3 py-2 rounded-xl">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl text-xs font-semibold bg-[#0E94B9] text-white hover:bg-[#0E94B9]/90 disabled:opacity-60"
            >
              {loading ? "Validating..." : "Validate PDF"}
            </button>
          </form>
        </div>

        {result?.validation_result && (
          <div className="bg-[#020617] border border-slate-700/70 rounded-2xl shadow-xl p-5 overflow-x-auto">
            <h2 className="text-sm font-semibold mb-3">Validation Result</h2>
            <table className="min-w-full border border-slate-800/70 rounded-xl overflow-hidden text-left">
              <thead className="bg-slate-900/70">
                <tr>
                  <th className="px-3 py-2 text-[11px] font-semibold text-slate-300">Field</th>
                  <th className="px-3 py-2 text-[11px] font-semibold text-slate-300">PDF Value</th>
                  <th className="px-3 py-2 text-[11px] font-semibold text-slate-300">MLS Value</th>
                  <th className="px-3 py-2 text-[11px] font-semibold text-slate-300">Status</th>
                </tr>
              </thead>
              <tbody className="bg-slate-900/40">{renderTableRows()}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}


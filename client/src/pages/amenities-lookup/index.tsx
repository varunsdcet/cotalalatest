import { useCallback, useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  getAmenityComplexAddresses,
  getAmenityComplexNames,
  getAmenityLookup,
  type AmenityFilterOption,
  type AmenityLookupData,
  type AmenityLookupRow,
} from "@/lib/api";
import "./amenities-lookup.css";

const COLUMN_CLASS: Record<string, string> = {
  TourID: "amenities-col-tourid",
  Address: "amenities-col-address",
  Complex: "amenities-col-complex",
  "Date Shot": "amenities-col-date",
  Customer: "amenities-col-customer",
  Photographer: "amenities-col-photographer",
  "#Pics": "amenities-col-pics",
  "#Pans": "amenities-col-pans",
  Video: "amenities-col-video",
};

function renderCell(column: string, row: AmenityLookupRow, onTourClick: (tourId: string | number) => void) {
  switch (column) {
    case "TourID":
      return (
        <button
          type="button"
          className="amenities-link amenities-tour-btn"
          onClick={() => onTourClick(row.tourid)}
        >
          {row.tourid}
        </button>
      );
    case "Address":
      return row.address || "—";
    case "Complex":
      return row.complex || "";
    case "Date Shot":
      return row.date_shot || "—";
    case "Customer":
      return row.customer || "—";
    case "Photographer":
      return row.photographer || "—";
    case "#Pics":
      return row.pics ?? "—";
    case "#Pans":
      return row.pans ?? "—";
    case "Video":
      return row.video ? (
        <a href={row.video} target="_blank" rel="noopener noreferrer" className="amenities-link">
          {row.video}
        </a>
      ) : (
        ""
      );
    default:
      return "";
  }
}

export default function AmenitiesLookupPage() {
  const [, setLocation] = useLocation();
  const [addresses, setAddresses] = useState<AmenityFilterOption[]>([]);
  const [complexes, setComplexes] = useState<AmenityFilterOption[]>([]);
  const [selectedAddress, setSelectedAddress] = useState("");
  const [selectedComplex, setSelectedComplex] = useState("");
  const [lookup, setLookup] = useState<AmenityLookupData | null>(null);
  const [page, setPage] = useState(1);
  const [loadingLists, setLoadingLists] = useState(true);
  const [loadingRows, setLoadingRows] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runLookup = useCallback(
    async (nextAddress: string, nextComplex: string, nextPage: number) => {
      if (!nextAddress && !nextComplex) {
        setLookup(null);
        return;
      }
      try {
        setLoadingRows(true);
        setError(null);
        const res = await getAmenityLookup({
          address: nextAddress,
          complex: nextComplex,
          page: nextPage,
          per_page: 30,
        });
        if (!res.status || !res.data || Array.isArray(res.data)) {
          setError(res.msg || "Unable to load amenities lookup");
          setLookup(null);
          return;
        }
        setLookup(res.data);
        setPage(res.data.pagination?.current_page || nextPage);
      } catch (err) {
        console.error(err);
        setError("Unable to load amenities lookup");
        setLookup(null);
      } finally {
        setLoadingRows(false);
      }
    },
    [],
  );

  useEffect(() => {
    const loadLists = async () => {
      try {
        setLoadingLists(true);
        setError(null);
        const [addressRes, complexRes] = await Promise.allSettled([
          getAmenityComplexAddresses(),
          getAmenityComplexNames(),
        ]);

        let addressList: AmenityFilterOption[] = [];
        let complexList: AmenityFilterOption[] = [];
        let loadError: string | null = null;

        if (addressRes.status === "fulfilled") {
          const res = addressRes.value;
          addressList = Array.isArray(res.data) ? res.data : [];
          if (!res.status) loadError = res.msg || "Unable to load complex addresses";
        } else {
          console.error(addressRes.reason);
          loadError = "Unable to load complex addresses";
        }

        if (complexRes.status === "fulfilled") {
          const res = complexRes.value;
          complexList = Array.isArray(res.data) ? res.data : [];
          if (!res.status && !addressList.length) {
            loadError = res.msg || "Unable to load complex names";
          }
        } else {
          console.error(complexRes.reason);
          if (!addressList.length) loadError = "Unable to load complex names";
        }

        setAddresses(addressList);
        setComplexes(complexList);
        setError(loadError);
      } catch (err) {
        console.error(err);
        setError("Unable to load filter lists");
      } finally {
        setLoadingLists(false);
      }
    };
    void loadLists();
  }, []);

  const handleAddressChange = (value: string) => {
    setSelectedAddress(value);
    setSelectedComplex("");
    setPage(1);
    void runLookup(value, "", 1);
  };

  const handleComplexChange = (value: string) => {
    setSelectedComplex(value);
    setSelectedAddress("");
    setPage(1);
    void runLookup("", value, 1);
  };

  const handleTourClick = (tourId: string | number) => {
    setLocation(`/listing-details?id=${encodeURIComponent(String(tourId))}`);
  };

  const columns = lookup?.columns?.length
    ? lookup.columns
    : [
    "TourID",
    "Address",
    "Complex",
    "Date Shot",
    "Customer",
    "Photographer",
    "#Pics",
    "#Pans",
    "Video",
  ];
  const rows = Array.isArray(lookup?.rows) ? lookup.rows : [];
  const pagination = lookup?.pagination;
  const title = lookup?.title || "Amenities Lookup";

  return (
    <div className="amenities-page">
      <div className="amenities-header">
        <h1 className="amenities-title">{title}</h1>
        <div className="amenities-filters">
          <select
            className="amenities-select"
            value={selectedAddress}
            disabled={loadingLists}
            onChange={(e) => handleAddressChange(e.target.value)}
            aria-label="Select Complex Address"
          >
            <option value="">Select Complex Address</option>
            {addresses.map((item) => (
              <option key={`addr-${item.value}`} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <select
            className="amenities-select"
            value={selectedComplex}
            disabled={loadingLists}
            onChange={(e) => handleComplexChange(e.target.value)}
            aria-label="Select Complex Name"
          >
            <option value="">Select Complex Name</option>
            {complexes.map((item) => (
              <option key={`complex-${item.value}`} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loadingLists ? (
        <p className="amenities-loading">
          Loading filters… {addresses.length ? `(${addresses.length} addresses)` : ""}
          {complexes.length ? ` (${complexes.length} complexes)` : ""}
        </p>
      ) : null}
      {error ? <p className="amenities-error">{error}</p> : null}

      {!selectedAddress && !selectedComplex && !loadingLists ? (
        <p className="amenities-empty">Select a complex address or complex name to view tours.</p>
      ) : null}

      {loadingRows ? <p className="amenities-loading">Loading tours…</p> : null}

      {!loadingRows && (selectedAddress || selectedComplex) ? (
        <>
          <div className="amenities-table-wrap">
            <table className="amenities-table">
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th key={column} className={COLUMN_CLASS[column] || ""}>
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length} className="amenities-empty">
                      {lookup?.empty_message || "There are no tours on record for this lookup."}
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={String(row.tourid)}>
                      {columns.map((column) => (
                        <td key={`${row.tourid}-${column}`} className={COLUMN_CLASS[column] || ""}>
                          {renderCell(column, row, handleTourClick)}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {pagination && pagination.total > 0 ? (
            <div className="amenities-pagination">
              <span className="amenities-page-info">
                Page {pagination.current_page} of {pagination.last_page} ({pagination.total} tours)
              </span>
              {pagination.last_page > 1 ? (
                <>
                  <button
                    type="button"
                    className="amenities-page-btn"
                    disabled={pagination.current_page <= 1 || loadingRows}
                    onClick={() => void runLookup(selectedAddress, selectedComplex, pagination.current_page - 1)}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className="amenities-page-btn"
                    disabled={pagination.current_page >= pagination.last_page || loadingRows}
                    onClick={() => void runLookup(selectedAddress, selectedComplex, pagination.current_page + 1)}
                  >
                    Next
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import { downloadNodeAsJpeg, shareNodeAsJpeg, copyText, embedCodeFor } from "./kit-download";
import type { EditorGroup } from "./kit-design";
import { downloadCardAsset, cardShareAsset, storedDesignPreviewUrl } from "./kit-export";

export type KitBrand = {
  name: string;
  phone: string;
  brokerage: string;
  logo: string;
  headshot: string;
  bg: string;
  text: string;
  accent: string;
  email?: string;
  website?: string;
  /** Used for slideshow / reel AI voice */
  gender?: "male" | "female";
};

export type KitListing = {
  address: string;
  mls: string;
  price: string;
  beds: string;
  baths: string;
  sqft: string;
  lot?: string;
  description?: string;
  year?: string;
  tourUrl?: string;
};

type CardProps = {
  photo: string;
  extra?: string[];
  listing: KitListing;
  brand: KitBrand;
  onEdit?: () => void;
  downloadName: string;
  ribbon?: string;
  title?: string;
  chrome?: boolean;
  shareUrl?: string;
  edited?: boolean;
  tourId?: string;
  designGroup?: EditorGroup;
  designIndex?: number;
  designRevision?: number;
  headline?: string;
};

function KitPhoto({ src, className, style }: { src: string; className?: string; style?: CSSProperties }) {
  if (!src) return <div className={className} style={{ ...style, background: "#1a1a1a" }} />;
  return (
    <img
      src={src}
      alt=""
      crossOrigin="anonymous"
      className={className}
      style={style}
      onError={(e) => {
        e.currentTarget.style.display = "none";
      }}
    />
  );
}

function CardChrome({
  title,
  label,
  onEdit,
  onDownload,
  onShare,
  shareUrl,
  chrome = true,
  edited = false,
  children,
}: {
  title?: string;
  label: string;
  onEdit?: () => void;
  onDownload: () => Promise<void> | void;
  onShare?: () => Promise<void> | void;
  shareUrl?: string;
  chrome?: boolean;
  edited?: boolean;
  children: ReactNode;
}) {
  const [busy, setBusy] = useState<"dl" | "share" | "url" | "embed" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const run = async (kind: "dl" | "share" | "url" | "embed", fn: () => Promise<void> | void) => {
    setErr(null);
    setBusy(kind);
    try {
      await fn();
      if (kind === "url" || kind === "embed") setErr("Copied");
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Action failed");
    } finally {
      setBusy(null);
    }
  };
  if (!chrome) return <>{children}</>;
  const embed = shareUrl ? embedCodeFor(shareUrl, title || label, "image") : "";
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: "#111114",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 18px 40px rgba(0,0,0,0.35)",
      }}
    >
      <div
        className={`overflow-hidden bg-black ${onEdit ? "cursor-pointer" : ""}`}
        onClick={onEdit}
        onKeyDown={(e) => e.key === "Enter" && onEdit?.()}
        role={onEdit ? "button" : undefined}
        tabIndex={onEdit ? 0 : undefined}
      >
        {children}
      </div>
      <div className="px-3.5 py-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <p className="text-[15px] font-semibold mb-0 truncate">{title || label}</p>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#E8A13D] border border-[#E8A13D]/45 rounded-full px-2 py-0.5 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-[#E8A13D]" />
            {edited ? "Edited" : "Ready"}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {onEdit ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              className="text-[13px] font-semibold text-[#B082F2] hover:text-white bg-transparent border-0 p-0"
            >
              Edit
            </button>
          ) : null}
          {shareUrl ? (
            <button
              type="button"
              disabled={busy !== null}
              onClick={(e) => {
                e.stopPropagation();
                void run("url", () => copyText(shareUrl));
              }}
              className="text-[13px] font-semibold text-white/70 hover:text-white bg-transparent border-0 p-0 disabled:opacity-50"
            >
              {busy === "url" ? "…" : "Copy URL"}
            </button>
          ) : null}
          {embed ? (
            <button
              type="button"
              disabled={busy !== null}
              onClick={(e) => {
                e.stopPropagation();
                void run("embed", () => copyText(embed));
              }}
              className="text-[13px] font-semibold text-white/70 hover:text-white bg-transparent border-0 p-0 disabled:opacity-50"
            >
              {busy === "embed" ? "…" : "Copy embed"}
            </button>
          ) : null}
          {onShare ? (
            <button
              type="button"
              disabled={busy !== null}
              onClick={(e) => {
                e.stopPropagation();
                void run("share", onShare);
              }}
              className="text-[13px] font-semibold text-white/70 hover:text-white bg-transparent border-0 p-0 disabled:opacity-50"
            >
              {busy === "share" ? "…" : "Share"}
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy !== null}
            onClick={(e) => {
              e.stopPropagation();
              void run("dl", onDownload);
            }}
            className="text-[13px] font-semibold text-white/70 hover:text-white bg-transparent border-0 p-0 disabled:opacity-50"
          >
            {busy === "dl" ? "Saving…" : "Download"}
          </button>
        </div>
        {err ? <p className={`text-xs mt-1.5 mb-0 ${err === "Copied" ? "text-[#B082F2]" : "text-red-400"}`}>{err}</p> : null}
      </div>
    </div>
  );
}

function statsLine(listing: KitListing) {
  return [listing.beds && `${listing.beds} bd`, listing.baths && `${listing.baths} ba`, listing.sqft && `${listing.sqft} sf`]
    .filter(Boolean)
    .join(" · ");
}

function cardShare(opts: {
  node: HTMLElement | null;
  downloadName: string;
  listing: KitListing;
  tourId?: string;
  designGroup?: EditorGroup;
  designIndex?: number;
  headline?: string;
  brand: KitBrand;
}) {
  return cardShareAsset({
    node: opts.node,
    filename: opts.downloadName,
    title: opts.listing.address,
    tourId: opts.tourId,
    group: opts.designGroup,
    index: opts.designIndex,
    listing: opts.listing,
    brand: opts.brand,
    headline: opts.headline,
    fallbackShare: () => shareNodeAsJpeg(opts.node, opts.downloadName, opts.listing.address),
  });
}

function cardDownload(opts: {
  node: HTMLElement | null;
  downloadName: string;
  tourId?: string;
  designGroup?: EditorGroup;
  designIndex?: number;
  listing: KitListing;
  brand: KitBrand;
  headline?: string;
}) {
  return downloadCardAsset({
    node: opts.node,
    filename: opts.downloadName,
    tourId: opts.tourId,
    group: opts.designGroup,
    index: opts.designIndex,
    listing: opts.listing,
    brand: opts.brand,
    headline: opts.headline,
    fallbackDownload: () => downloadNodeAsJpeg(opts.node, opts.downloadName),
  });
}

function DesignPreview({
  tourId,
  group,
  index,
  listing,
  brand,
  headline,
  designRevision,
  width,
  height,
  children,
}: {
  tourId?: string;
  group?: EditorGroup;
  index?: number;
  listing: KitListing;
  brand: KitBrand;
  headline?: string;
  designRevision?: number;
  width: number;
  height: number;
  children: ReactNode;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!tourId || group == null) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    void storedDesignPreviewUrl(tourId, group, index ?? 0, listing, brand, headline).then((url) => {
      if (!cancelled) setPreview(url);
    });
    return () => {
      cancelled = true;
    };
  }, [tourId, group, index, listing, brand, headline, designRevision]);
  if (preview) {
    return (
      <img
        src={preview}
        alt=""
        className="w-full h-full object-cover"
        style={{ width, height }}
      />
    );
  }
  return <>{children}</>;
}

export function StoryCard({
  photo,
  listing,
  brand,
  onEdit,
  downloadName,
  ribbon = "JUST LISTED",
  title,
  chrome,
  edited,
  tourId,
  designGroup,
  designIndex,
  designRevision,
  headline,
}: CardProps) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <CardChrome
      title={title}
      chrome={chrome}
      edited={edited}
      shareUrl={photo}
      label="Story 9:16"
      onEdit={onEdit}
      onDownload={() =>
        cardDownload({
          node: ref.current,
          downloadName,
          tourId,
          designGroup,
          designIndex,
          listing,
          brand,
          headline,
        })
      }
      onShare={() =>
        cardShare({
          node: ref.current,
          downloadName,
          listing,
          tourId,
          designGroup,
          designIndex,
          headline,
          brand,
        })
      }
    >
      <div
        ref={ref}
        onClick={onEdit}
        className="relative overflow-hidden cursor-pointer"
        style={{
          width: 180,
          height: 320,
          background: `linear-gradient(165deg, ${brand.bg} 0%, #0a0a0c 55%)`,
          color: brand.text,
        }}
      >
        <DesignPreview
          tourId={tourId}
          group={designGroup}
          index={designIndex}
          listing={listing}
          brand={brand}
          headline={headline || ribbon}
          designRevision={designRevision}
          width={180}
          height={320}
        >
          <KitPhoto src={photo} className="absolute inset-0 w-full h-full object-cover" />
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.35) 38%, rgba(0,0,0,0.05) 62%, transparent 100%)",
            }}
          />
          <div
            className="absolute top-0 left-0 right-0 h-1"
            style={{ background: `linear-gradient(90deg, ${brand.accent}, transparent)` }}
          />
          <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
            {brand.logo ? (
              <img src={brand.logo} alt="" crossOrigin="anonymous" className="h-7 max-w-[72px] object-contain drop-shadow" />
            ) : (
              <span
                className="text-[9px] font-bold tracking-[0.2em] uppercase px-2 py-1 rounded-full"
                style={{ color: brand.accent, border: `1px solid ${brand.accent}55`, background: "rgba(0,0,0,0.45)" }}
              >
                {ribbon}
              </span>
            )}
            {brand.headshot ? (
              <img
                src={brand.headshot}
                alt=""
                crossOrigin="anonymous"
                className="w-9 h-9 rounded-full object-cover border-2 shadow-lg"
                style={{ borderColor: brand.accent }}
              />
            ) : null}
          </div>
          <div className="absolute bottom-0 left-0 right-0 p-3.5">
            <p className="text-[9px] uppercase tracking-[0.18em] mb-1.5 font-semibold" style={{ color: brand.accent }}>
              {ribbon}
            </p>
            <p className="text-[12px] font-bold leading-snug mb-1 text-white drop-shadow-sm">{listing.address}</p>
            {listing.price ? (
              <p className="text-[15px] font-extrabold mb-0 text-white tracking-tight">{listing.price}</p>
            ) : null}
            <p className="text-[10px] text-white/75 mb-0 mt-1.5">{statsLine(listing)}</p>
            {brand.name ? (
              <p className="text-[9px] text-white/55 mb-0 mt-2 uppercase tracking-wide">{brand.name}</p>
            ) : null}
          </div>
        </DesignPreview>
      </div>
    </CardChrome>
  );
}

export function SquareCard({
  photo,
  listing,
  brand,
  onEdit,
  downloadName,
  title,
  chrome,
  edited,
  tourId,
  designGroup,
  designIndex,
  designRevision,
  headline,
  ribbon = "JUST LISTED",
}: CardProps) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <CardChrome
      title={title}
      chrome={chrome}
      edited={edited}
      shareUrl={photo}
      label="Square 1:1"
      onEdit={onEdit}
      onDownload={() =>
        cardDownload({
          node: ref.current,
          downloadName,
          tourId,
          designGroup,
          designIndex,
          listing,
          brand,
          headline,
        })
      }
      onShare={() =>
        cardShare({
          node: ref.current,
          downloadName,
          listing,
          tourId,
          designGroup,
          designIndex,
          headline,
          brand,
        })
      }
    >
      <div
        ref={ref}
        onClick={onEdit}
        className="relative overflow-hidden cursor-pointer"
        style={{ width: 220, height: 220, background: brand.bg, color: brand.text }}
      >
        <DesignPreview
          tourId={tourId}
          group={designGroup}
          index={designIndex}
          listing={listing}
          brand={brand}
          headline={headline || ribbon}
          designRevision={designRevision}
          width={220}
          height={220}
        >
          <KitPhoto src={photo} className="absolute inset-0 w-full h-full object-cover" />
          <div
            className="absolute top-3 left-3 px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider"
            style={{ background: brand.bg, color: "#fff", border: `1px solid ${brand.accent}` }}
          >
            {ribbon}
          </div>
          <div
            className="absolute inset-x-0 bottom-0 p-3.5 pt-10"
            style={{ background: "linear-gradient(to top, rgba(0,0,0,0.88) 0%, transparent 100%)" }}
          >
            <p className="text-[11px] font-bold leading-tight mb-0 text-white">{listing.address}</p>
            {listing.price ? (
              <p className="text-sm font-extrabold mb-0 mt-1" style={{ color: brand.accent }}>
                {listing.price}
              </p>
            ) : null}
            <p className="text-[10px] text-white/70 mb-0 mt-1">{statsLine(listing)}</p>
          </div>
        </DesignPreview>
      </div>
    </CardChrome>
  );
}

export function LandscapeCard({
  photo,
  extra = [],
  listing,
  brand,
  onEdit,
  downloadName,
  title,
  chrome,
  edited,
  tourId,
  designGroup,
  designIndex,
  designRevision,
  headline,
  ribbon = "JUST LISTED",
}: CardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const side = extra[0];
  return (
    <CardChrome
      title={title}
      chrome={chrome}
      edited={edited}
      shareUrl={photo}
      label="Landscape 16:9"
      onEdit={onEdit}
      onDownload={() =>
        cardDownload({
          node: ref.current,
          downloadName,
          tourId,
          designGroup,
          designIndex,
          listing,
          brand,
          headline,
        })
      }
      onShare={() =>
        cardShare({
          node: ref.current,
          downloadName,
          listing,
          tourId,
          designGroup,
          designIndex,
          headline,
          brand,
        })
      }
    >
      <div
        ref={ref}
        onClick={onEdit}
        className="relative overflow-hidden cursor-pointer flex"
        style={{ width: 320, height: 180, background: brand.bg, color: brand.text }}
      >
        <DesignPreview
          tourId={tourId}
          group={designGroup}
          index={designIndex}
          listing={listing}
          brand={brand}
          headline={headline || ribbon}
          designRevision={designRevision}
          width={320}
          height={180}
        >
          <KitPhoto src={photo} className="h-full object-cover" style={{ width: side ? "62%" : "100%" }} />
          {side ? <KitPhoto src={side} className="h-full object-cover" style={{ width: "38%" }} /> : null}
          <div
            className="absolute top-0 left-0 bottom-0 w-1"
            style={{ background: brand.accent }}
          />
          <div
            className="absolute top-2 left-3 px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider text-white"
            style={{ background: brand.bg }}
          >
            {ribbon}
          </div>
          <div
            className="absolute inset-x-0 bottom-0 px-3 py-2.5 flex items-end justify-between gap-2"
            style={{ background: "linear-gradient(to top, rgba(0,0,0,0.82) 0%, transparent 100%)" }}
          >
            <div>
              <p className="text-[11px] font-bold leading-tight mb-0 text-white">{listing.address}</p>
              {listing.price ? <p className="text-xs font-extrabold mb-0 mt-0.5 text-white">{listing.price}</p> : null}
              <p className="text-[9px] text-white/65 mb-0 mt-0.5">{statsLine(listing)}</p>
            </div>
            <div className="text-right shrink-0">
              {brand.headshot ? (
                <img src={brand.headshot} alt="" crossOrigin="anonymous" className="w-8 h-8 rounded-full object-cover border border-white/30 ml-auto" />
              ) : null}
              <span className="text-[9px] font-medium block mt-1" style={{ color: brand.accent }}>
                {brand.name || "Cotala"}
              </span>
            </div>
          </div>
        </DesignPreview>
      </div>
    </CardChrome>
  );
}

export function PostcardFront({
  photos,
  listing,
  brand,
  onEdit,
  downloadName,
  title,
  chrome,
  ribbon = "JUST LISTED",
}: {
  photos: string[];
  listing: KitListing;
  brand: KitBrand;
  onEdit?: () => void;
  downloadName: string;
  title?: string;
  chrome?: boolean;
  ribbon?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const hero = photos[0] || "";
  const thumbs = [photos[1], photos[2]];
  const sold = /sold/i.test(ribbon);
  return (
    <CardChrome
      title={title}
      chrome={chrome}
      shareUrl={hero}
      label={'Postcard 8.5" × 5.5" · Front'}
      onEdit={onEdit}
      onDownload={() => downloadNodeAsJpeg(ref.current, downloadName)}
      onShare={() =>
        cardShare({
          node: ref.current,
          downloadName,
          listing,
          tourId,
          designGroup,
          designIndex,
          headline,
          brand,
        })
      }
    >
      <div
        ref={ref}
        role={onEdit ? "button" : undefined}
        tabIndex={onEdit ? 0 : undefined}
        onClick={onEdit}
        onKeyDown={(e) => e.key === "Enter" && onEdit?.()}
        className={`relative overflow-hidden bg-white ${onEdit ? "cursor-pointer" : ""}`}
        style={{ width: 468, height: 318 }}
      >
        <div className="flex h-full pointer-events-none">
          <div className="h-full flex flex-col" style={{ width: "63%" }}>
            <KitPhoto src={hero} className="w-full object-cover" style={{ height: "58%" }} />
            <div className="px-2.5 flex items-center" style={{ height: "12%", background: "#1e3a5f" }}>
              <p className="text-[10px] font-bold mb-0 tracking-wide text-white uppercase truncate">{listing.address}</p>
            </div>
            <div className="flex flex-1">
              {thumbs.map((src, i) => (
                <KitPhoto key={`pcf-${i}`} src={src || hero} className="h-full object-cover flex-1" />
              ))}
            </div>
          </div>
          <div className="flex-1 px-3 py-3.5 flex flex-col" style={{ color: "#111" }}>
            <p className="text-[16px] font-extrabold mb-1 tracking-tight" style={{ color: sold ? "#c62828" : "#1f8a4d" }}>
              {sold ? "JUST SOLD" : "JUST LISTED"}
            </p>
            <p className="text-[10px] font-semibold mb-1 leading-tight">Thinking of Buying or Selling?</p>
            <p className="text-[8px] mb-2 leading-snug text-black/50">Let me help you reach your goals in this changing market.</p>
            <p className="text-[7px] uppercase tracking-widest mb-0 text-black/40">Marketed by</p>
            <p className="text-[11px] font-semibold mb-0">{brand.name || "Your realtor"}</p>
            {brand.phone ? <p className="text-[8px] mb-0">{brand.phone}</p> : null}
            {brand.email ? <p className="text-[8px] mb-0 text-black/55">{brand.email}</p> : null}
            <div className="mt-auto">
              {brand.logo ? (
                <img src={brand.logo} alt="" crossOrigin="anonymous" className="h-7 max-w-[88px] object-contain" />
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </CardChrome>
  );
}

export function PostcardBack({
  photos,
  listing,
  brand,
  downloadName,
  title,
  chrome,
  onEdit,
  ribbon = "JUST LISTED",
}: {
  photos?: string[];
  listing: KitListing;
  brand: KitBrand;
  downloadName: string;
  title?: string;
  chrome?: boolean;
  onEdit?: () => void;
  ribbon?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const shots = photos?.length ? photos : [];
  const sold = /sold/i.test(ribbon);
  const qr = listing.tourUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(listing.tourUrl)}`
    : "";
  return (
    <CardChrome
      title={title}
      chrome={chrome}
      label={'Postcard 8.5" × 5.5" · Back'}
      onEdit={onEdit}
      onDownload={() => downloadNodeAsJpeg(ref.current, downloadName)}
      onShare={() =>
        cardShare({
          node: ref.current,
          downloadName,
          listing,
          tourId,
          designGroup,
          designIndex,
          headline,
          brand,
        })
      }
    >
      <div
        ref={ref}
        role={onEdit ? "button" : undefined}
        tabIndex={onEdit ? 0 : undefined}
        onClick={onEdit}
        onKeyDown={(e) => e.key === "Enter" && onEdit?.()}
        className={`flex bg-white overflow-hidden relative ${onEdit ? "cursor-pointer" : ""}`}
        style={{ width: 468, height: 318, color: "#111" }}
      >
        <div className="h-full flex flex-col pointer-events-none relative" style={{ width: "54%" }}>
          <KitPhoto src={shots[3] || shots[0] || ""} className="w-full object-cover" style={{ height: "60%" }} />
          {qr ? (
            <div className="absolute top-2 left-2 bg-white p-1 text-center" style={{ width: 52 }}>
              <img src={qr} alt="" className="w-full h-auto" />
              <p className="text-[5px] font-bold mb-0 tracking-wide">SCAN THE TOUR</p>
            </div>
          ) : null}
          <div className="flex flex-1">
            <KitPhoto src={shots[4] || shots[1] || ""} className="h-full object-cover flex-1" />
            <KitPhoto src={shots[5] || shots[2] || ""} className="h-full object-cover flex-1" />
          </div>
        </div>
        <div className="flex-1 p-3 flex flex-col pointer-events-none">
          <p className="text-[10px] font-bold mb-1 uppercase leading-tight">{listing.address}</p>
          <p className="text-[7px] uppercase tracking-wide mb-0 text-black/45">{sold ? "Sold for" : "Listed for"}</p>
          {listing.price ? <p className="text-[16px] font-extrabold mb-1">{listing.price}</p> : null}
          <p className="text-[8px] mb-1 text-black/70">{statsLine(listing)}</p>
          {listing.mls || listing.year ? (
            <p className="text-[7px] text-black/45 mb-1">
              {[listing.mls && `MLS® ${listing.mls}`, listing.year && `Year Built ${listing.year}`].filter(Boolean).join("  ·  ")}
            </p>
          ) : null}
          {listing.description ? (
            <p className="text-[7px] leading-snug mb-1 text-black/60 line-clamp-5">{listing.description}</p>
          ) : null}
          <div className="mt-auto flex items-center gap-2">
            {brand.headshot ? (
              <img src={brand.headshot} alt="" crossOrigin="anonymous" className="w-9 h-9 rounded-full object-cover" />
            ) : null}
            <div>
              <p className="text-[9px] font-semibold mb-0">{brand.name}</p>
              {brand.phone ? <p className="text-[7px] mb-0 text-black/60">{brand.phone}</p> : null}
              {brand.email ? <p className="text-[7px] mb-0 text-black/50">{brand.email}</p> : null}
            </div>
          </div>
        </div>
      </div>
    </CardChrome>
  );
}

export function PinterestCard({ photo, extra = [], listing, brand, onEdit, downloadName, title, chrome }: CardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const stack = [photo, extra[0], extra[1]].filter(Boolean);
  return (
    <CardChrome
      title={title}
      chrome={chrome}
      shareUrl={photo}
      label="Pinterest 1000×1500"
      onEdit={onEdit}
      onDownload={() => downloadNodeAsJpeg(ref.current, downloadName)}
      onShare={() =>
        cardShare({
          node: ref.current,
          downloadName,
          listing,
          tourId,
          designGroup,
          designIndex,
          headline,
          brand,
        })
      }
    >
      <div
        ref={ref}
        onClick={onEdit}
        className="relative overflow-hidden cursor-pointer"
        style={{ width: 200, height: 300, background: brand.bg, color: brand.text }}
      >
        {stack.length > 1 ? (
          <div className="flex flex-col h-full">
            <KitPhoto src={stack[0]} className="w-full object-cover" style={{ height: "58%" }} />
            <div className="flex flex-1">
              {stack.slice(1, 3).map((src, i) => (
                <KitPhoto key={`pin-${i}`} src={src} className="h-full object-cover flex-1" />
              ))}
            </div>
          </div>
        ) : (
          <KitPhoto src={photo} className="absolute inset-0 w-full h-full object-cover" />
        )}
        <div className="absolute inset-x-0 bottom-0 p-3" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.88), transparent)" }}>
          <p className="text-[10px] uppercase tracking-widest mb-1" style={{ color: brand.accent }}>
            Just listed
          </p>
          <p className="text-[12px] font-semibold leading-tight mb-0 text-white">{listing.address}</p>
          {listing.price ? <p className="text-sm font-bold mb-0 text-white">{listing.price}</p> : null}
        </div>
      </div>
    </CardChrome>
  );
}

export function FlyerCard({
  photo,
  extra = [],
  listing,
  brand,
  onEdit,
  downloadName,
  ribbon = "JUST LISTED",
  title,
  chrome,
}: CardProps) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <CardChrome
      title={title}
      chrome={chrome}
      shareUrl={photo}
      label={'Flyer 8.5" × 11"'}
      onEdit={onEdit}
      onDownload={() => downloadNodeAsJpeg(ref.current, downloadName)}
      onShare={() =>
        cardShare({
          node: ref.current,
          downloadName,
          listing,
          tourId,
          designGroup,
          designIndex,
          headline,
          brand,
        })
      }
    >
      <div
        ref={ref}
        onClick={onEdit}
        className="relative overflow-hidden cursor-pointer flex flex-col"
        style={{ width: 220, height: 286, background: "#111", color: "#fff" }}
      >
        <div className="px-3 py-2 flex items-center justify-between" style={{ background: brand.bg, color: brand.text }}>
          <span className="text-[10px] font-semibold tracking-widest" style={{ color: brand.accent }}>
            {ribbon}
          </span>
          {brand.logo ? (
            <img src={brand.logo} alt="" crossOrigin="anonymous" className="h-5 max-w-[70px] object-contain" />
          ) : null}
        </div>
        <KitPhoto src={photo} className="w-full object-cover" style={{ height: 128 }} />
        {extra[0] ? (
          <div className="flex" style={{ height: 44 }}>
            {extra.slice(0, 3).map((src, i) => (
              <KitPhoto key={`fly-${i}`} src={src} className="h-full object-cover flex-1" />
            ))}
          </div>
        ) : null}
        <div className="flex-1 px-3 py-2 flex flex-col justify-between" style={{ background: "#0b0b0b" }}>
          <div>
            <p className="text-[11px] font-semibold leading-tight mb-1">{listing.address}</p>
            {listing.price ? <p className="text-sm font-bold mb-1" style={{ color: brand.accent }}>{listing.price}</p> : null}
            <p className="text-[10px] text-white/70 mb-0">{statsLine(listing)}</p>
            {listing.mls ? <p className="text-[9px] text-white/40 mb-0 mt-1">MLS® {listing.mls}</p> : null}
          </div>
          <div className="flex items-center gap-2 mt-2">
            {brand.headshot ? (
              <img src={brand.headshot} alt="" crossOrigin="anonymous" className="w-8 h-8 rounded-full object-cover" />
            ) : null}
            <div>
              <p className="text-[10px] font-semibold mb-0">{brand.name}</p>
              {brand.phone ? <p className="text-[9px] text-white/60 mb-0">{brand.phone}</p> : null}
            </div>
          </div>
        </div>
      </div>
    </CardChrome>
  );
}

export function BrochureCard({
  photos,
  listing,
  brand,
  onEdit,
  downloadName,
  title,
  chrome,
}: {
  photos: string[];
  listing: KitListing;
  brand: KitBrand;
  onEdit?: () => void;
  downloadName: string;
  title?: string;
  chrome?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <CardChrome
      title={title}
      chrome={chrome}
      shareUrl={photos[0]}
      label="Brochure · bi-fold"
      onEdit={onEdit}
      onDownload={() => downloadNodeAsJpeg(ref.current, downloadName)}
      onShare={() =>
        cardShare({
          node: ref.current,
          downloadName,
          listing,
          tourId,
          designGroup,
          designIndex,
          headline,
          brand,
        })
      }
    >
      <div
        ref={ref}
        onClick={onEdit}
        className="relative overflow-hidden cursor-pointer flex"
        style={{ width: 340, height: 220, background: brand.bg, color: brand.text }}
      >
        <div className="relative" style={{ width: "52%" }}>
          <KitPhoto src={photos[0] || ""} className="w-full h-full object-cover" />
          <div className="absolute inset-x-0 bottom-0 p-2" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.8), transparent)" }}>
            <p className="text-[11px] font-semibold mb-0 text-white leading-tight">{listing.address}</p>
            {listing.price ? <p className="text-xs font-bold mb-0 text-white">{listing.price}</p> : null}
          </div>
        </div>
        <div className="flex-1 flex flex-col">
          <div className="flex flex-1">
            <KitPhoto src={photos[1] || photos[0] || ""} className="w-1/2 h-full object-cover" />
            <KitPhoto src={photos[2] || photos[0] || ""} className="w-1/2 h-full object-cover" />
          </div>
          <div className="p-2" style={{ background: brand.bg }}>
            <p className="text-[9px] uppercase tracking-widest mb-1" style={{ color: brand.accent }}>
              Just listed
            </p>
            <p className="text-[10px] mb-0 text-white/80">{statsLine(listing)}</p>
            <p className="text-[10px] font-semibold mb-0 mt-1">{brand.name}</p>
          </div>
        </div>
      </div>
    </CardChrome>
  );
}

export function EmailBannerCard({ photo, listing, brand, onEdit, downloadName, title, chrome }: CardProps) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <CardChrome
      title={title}
      chrome={chrome}
      shareUrl={photo}
      label="Email banner 16:9"
      onEdit={onEdit}
      onDownload={() => downloadNodeAsJpeg(ref.current, downloadName)}
      onShare={() =>
        cardShare({
          node: ref.current,
          downloadName,
          listing,
          tourId,
          designGroup,
          designIndex,
          headline,
          brand,
        })
      }
    >
      <div
        ref={ref}
        onClick={onEdit}
        className="relative overflow-hidden cursor-pointer"
        style={{ width: 360, height: 120, background: brand.bg, color: brand.text }}
      >
        <KitPhoto src={photo} className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0" style={{ background: "linear-gradient(90deg, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.2) 70%)" }} />
        <div className="absolute inset-0 p-3 flex flex-col justify-center">
          <p className="text-[9px] uppercase tracking-widest mb-1" style={{ color: brand.accent }}>
            Just listed
          </p>
          <p className="text-[12px] font-semibold leading-tight mb-0 text-white max-w-[70%]">{listing.address}</p>
          {listing.price ? <p className="text-sm font-bold mb-0 text-white">{listing.price}</p> : null}
        </div>
      </div>
    </CardChrome>
  );
}

export function PhotoPicker({
  photos,
  selected,
  title = "Replace with a listing photo",
  onPick,
  onClose,
}: {
  photos: string[];
  selected?: string;
  title?: string;
  onPick: (url: string) => void;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState("");
  return (
    <div className="fixed inset-0 z-[90] flex items-end md:items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.72)" }} onClick={onClose}>
      <div
        className="rounded-xl max-w-3xl w-full max-h-[80vh] overflow-hidden"
        style={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
          <h3 className="text-white text-base mb-0">{title}</h3>
          <button type="button" className="text-white/60 hover:text-white" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="p-4 overflow-y-auto max-h-[70vh]">
          {photos.length === 0 ? (
            <p className="text-white/50">No listing photos available to pick.</p>
          ) : (
            <>
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter #…"
                className="mb-3 w-full rounded px-3 py-2 text-sm text-white"
                style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.2)" }}
              />
              <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                {photos.map((url, idx) => {
                  const n = String(idx + 1);
                  if (filter && !n.includes(filter.trim())) return null;
                  const isOn = selected === url;
                  return (
                    <button
                      key={`${url}-${idx}`}
                      type="button"
                      className="relative border-0 p-0 rounded overflow-hidden aspect-square"
                      style={{ outline: isOn ? "2px solid #B082F2" : "none" }}
                      onClick={() => onPick(url)}
                    >
                      <img src={url} alt={`#${idx + 1}`} className="w-full h-full object-cover" />
                      <span className="absolute bottom-1 left-1 text-[10px] text-white px-1.5 py-0.5 rounded" style={{ background: "rgba(0,0,0,0.7)" }}>
                        #{idx + 1}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

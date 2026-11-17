import cotalaBlk from "@/pages/images/cotala-blk.png";

/** Footer logo in MLS panel — matches HTML mockup embedded image. */
export const COTALA_FOOTER_LOGO_SRC = cotalaBlk;

export const HEADING_FONT_OPTIONS = [
  { value: "'Playfair Display', serif", label: "Playfair Display (Elegant Serif)" },
  { value: "'Georgia', serif", label: "Georgia (Classic Serif)" },
  { value: "'Montserrat', sans-serif", label: "Montserrat (Modern Sans)" },
  { value: "'Oswald', sans-serif", label: "Oswald (Tall Sans)" },
] as const;

export const BODY_FONT_OPTIONS = [
  { value: "'Montserrat', sans-serif", label: "Montserrat (Clean Sans)" },
  { value: "'Lato', sans-serif", label: "Lato (Soft Sans)" },
  { value: "'Arial', sans-serif", label: "Arial (Standard Sans)" },
  { value: "'Helvetica Neue', sans-serif", label: "Helvetica Neue" },
] as const;

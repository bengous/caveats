/** Largest PDF the web UI uploads and the server accepts. */
export const MAX_PDF_BYTES = 20 * 1024 * 1024;
/** Pages a CV may have unless `--max-pages` says otherwise. */
export const DEFAULT_MAX_PAGES = 1;

// US Legal (8.5 x 14 in) is the largest paper a CV uses, A4 and US Letter fit inside it. The slack
// covers the 3 mm of bleed per side that print exports add.
const PAPER_SLACK_POINTS = 18;
export const MAX_PAGE_SHORT_SIDE_POINTS = 612 + PAPER_SLACK_POINTS;
export const MAX_PAGE_LONG_SIDE_POINTS = 1008 + PAPER_SLACK_POINTS;

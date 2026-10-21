import { type Bundle, link, pageOf } from "../api/fhir";

/**
 * Previous / next for a search Bundle. It only follows the links the API sends, so
 * filters and sorting stay exactly as they were.
 */
export const Pager = ({
  bundle,
  onGo,
  disabled = false,
}: {
  bundle: Bundle | undefined;
  onGo: (url: string) => void;
  disabled?: boolean;
}) => {
  const previous = link(bundle, "previous");
  const next = link(bundle, "next");
  return (
    <nav aria-label="Pages" style={{ display: "flex", gap: 6 }}>
      <button
        type="button"
        className="btn"
        disabled={disabled || !previous}
        onClick={() => previous && onGo(previous)}
      >
        Previous
      </button>
      <button
        type="button"
        className="btn"
        disabled={disabled || !next}
        onClick={() => next && onGo(next)}
      >
        Next
      </button>
    </nav>
  );
};

/** "Showing 11–20 of 23 patients", from the Bundle's total and its self link. */
export const pageSummary = (bundle: Bundle | undefined, count: number, noun: string): string => {
  if (!bundle) return "";
  const total = bundle.total ?? 0;
  if (total === 0) return `No ${noun}`;
  const page = pageOf(link(bundle, "self"));
  const first = (page - 1) * count + 1;
  const last = first + (bundle.entry?.filter((e) => e.search?.mode !== "include").length ?? 0) - 1;
  return `Showing ${first}–${last} of ${total} ${noun}`;
};

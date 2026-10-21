import { INTERPRETATION_LABEL, type Interpretation } from "../api/fhir";

/** The result of an observation, colored by interpretation. */
export const ResultChip = ({
  code,
  children,
  muted = false,
}: {
  code: Interpretation | undefined;
  children?: React.ReactNode;
  muted?: boolean;
}) => (
  <span className={`chip ${muted || !code ? "chip-none" : `chip-${code}`}`}>
    {children ?? (code ? INTERPRETATION_LABEL[code] : "—")}
  </span>
);

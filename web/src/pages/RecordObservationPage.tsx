import { type FormEvent, useCallback, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ApiError } from "../api/client";
import {
  type Bundle,
  entries,
  INTERPRETATION_LABEL,
  interpret,
  interpretationOf,
  mrn,
  type Observation,
  type Patient,
  patientName,
  VITAL_SIGNS,
} from "../api/fhir";
import { useAsync } from "../api/useAsync";
import { useApi } from "../auth/useAuth";
import "./RecordObservationPage.css";

/** "2026-10-21T08:30" for a datetime-local input, in the browser's time zone. */
const localNow = (): string => {
  const now = new Date();
  now.setSeconds(0, 0);
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

// Where a value sits on the bar: critical low 0-15 %, low 15-30 %, normal 30-70 %,
// high 70-85 %, critical high 85-100 %.
const markerPosition = (value: number, sign: (typeof VITAL_SIGNS)[number]): number => {
  const top = sign.criticalHigh ?? sign.max;
  const scale = (x: number, a: number, b: number, from: number, to: number) =>
    from + ((Math.min(Math.max(x, a), b) - a) / (b - a || 1)) * (to - from);
  if (value < sign.criticalLow) return scale(value, sign.min, sign.criticalLow, 2, 15);
  if (value < sign.low) return scale(value, sign.criticalLow, sign.low, 15, 30);
  if (value <= sign.high) return scale(value, sign.low, sign.high, 30, 70);
  if (value <= top) return scale(value, sign.high, top, 70, 85);
  return scale(value, top, sign.max, 85, 98);
};

// The API names the element at fault; these are the ones this form has a field for.
const FIELD_OF: Record<string, string> = {
  "Observation.subject": "patient",
  "Observation.subject.reference": "patient",
  "Observation.valueQuantity.value": "value",
  "Observation.effectiveDateTime": "effective",
  "Observation.status": "status",
};

export const RecordObservationPage = () => {
  const api = useApi();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [patientId, setPatientId] = useState(params.get("patient") ?? "");
  const [code, setCode] = useState(VITAL_SIGNS[0]!.code);
  const [value, setValue] = useState("");
  const [effective, setEffective] = useState(localNow);
  const [status, setStatus] = useState("final");
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  // Only active patients accept new observations.
  const loadPatients = useCallback(
    async () =>
      entries<Patient>(
        (await api<Bundle>("/fhir/Patient?active=true&_sort=family&_count=50")).data,
      ),
    [api],
  );
  const patients = useAsync("patients", loadPatients);

  const sign = VITAL_SIGNS.find((item) => item.code === code)!;
  const number = parseFloat(value);
  const empty = value.trim() === "" || Number.isNaN(number);
  const impossible = !empty && (number < sign.min || number > sign.max);
  const preview = empty || impossible ? undefined : interpret(number, sign);

  const fieldErrors: Record<string, string> = {};
  const otherErrors: string[] = [];
  for (const issue of error?.issues ?? []) {
    const field = issue.expression && FIELD_OF[issue.expression];
    if (field) fieldErrors[field] ??= issue.message;
    else otherErrors.push(issue.message);
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { data } = await api<Observation>("/fhir/Observation", {
        method: "POST",
        body: {
          resourceType: "Observation",
          status,
          category: [
            {
              coding: [
                {
                  system: "http://terminology.hl7.org/CodeSystem/observation-category",
                  code: "vital-signs",
                },
              ],
            },
          ],
          code: { coding: [{ system: "http://loinc.org", code, display: sign.name }] },
          subject: { reference: `Patient/${patientId}` },
          // The input has no time zone: the browser's is added by toISOString().
          effectiveDateTime: effective ? new Date(effective).toISOString() : undefined,
          // The unit is left to the server, which takes it from the LOINC code.
          valueQuantity: { value: empty ? undefined : number },
        },
      });
      const result = interpretationOf(data);
      navigate(`/patients/${patientId}`, {
        state: {
          saved: `${sign.name} ${data.valueQuantity?.value} ${data.valueQuantity?.unit ?? ""} saved${
            result ? ` · ${INTERPRETATION_LABEL[result]}` : ""
          }.`,
        },
      });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught : new ApiError(0, []));
    } finally {
      setBusy(false);
    }
  };

  const current = patients.data?.find((item) => item.id === patientId);

  return (
    <main className="page">
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <Link to="/">Patients</Link>
        {current && (
          <>
            <span aria-hidden="true">/</span>
            <Link to={`/patients/${current.id}`}>{patientName(current)}</Link>
          </>
        )}
        <span aria-hidden="true">/</span>
        <span>Record vital sign</span>
      </nav>
      <h1>Record a vital sign</h1>

      <div className="record">
        <form
          aria-label="New observation"
          className="card card-pad record-form"
          onSubmit={submit}
          noValidate
        >
          {(otherErrors.length > 0 || patients.error) && (
            <div role="alert" className="alert">
              {patients.error?.message ??
                (otherErrors.length === 1 ? otherErrors[0] : "The observation was not saved:")}
              {otherErrors.length > 1 && (
                <ul>
                  {otherErrors.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <label className="field">
            Patient
            <select
              value={patientId}
              onChange={(event) => setPatientId(event.target.value)}
              aria-invalid={Boolean(fieldErrors.patient)}
              required
            >
              <option value="" disabled>
                {patients.loading ? "Loading patients…" : "Choose a patient"}
              </option>
              {patients.data?.map((item) => (
                <option key={item.id} value={item.id}>
                  {patientName(item)} · {mrn(item)}
                </option>
              ))}
            </select>
            {fieldErrors.patient && <span className="field-error">{fieldErrors.patient}</span>}
          </label>

          <fieldset className="signs">
            <legend>Vital sign</legend>
            <div className="grid-auto" style={{ ["--min" as string]: "200px", gap: 12 }}>
              {VITAL_SIGNS.map((item) => (
                <button
                  key={item.code}
                  type="button"
                  className="sign"
                  aria-pressed={item.code === code}
                  onClick={() => {
                    setCode(item.code);
                    setValue("");
                  }}
                >
                  <span style={{ fontWeight: 600 }}>{item.name}</span>
                  <span className="muted" style={{ fontSize: 13 }}>
                    LOINC {item.code} · {item.unit}
                  </span>
                </button>
              ))}
            </div>
          </fieldset>

          <div className="grid-auto">
            <label className="field">
              Value
              <span className="unit-input">
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  aria-invalid={Boolean(fieldErrors.value) || impossible}
                  required
                />
                <span>{sign.unit}</span>
              </span>
              {fieldErrors.value && <span className="field-error">{fieldErrors.value}</span>}
            </label>
            <label className="field">
              Measured at
              <input
                type="datetime-local"
                value={effective}
                max={localNow()}
                onChange={(event) => setEffective(event.target.value)}
                aria-invalid={Boolean(fieldErrors.effective)}
                required
              />
              {fieldErrors.effective && (
                <span className="field-error">{fieldErrors.effective}</span>
              )}
            </label>
            <label className="field">
              Status
              <select value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="final">Final</option>
                <option value="preliminary">Preliminary</option>
                <option value="registered">Registered</option>
              </select>
              {fieldErrors.status && <span className="field-error">{fieldErrors.status}</span>}
            </label>
          </div>

          {impossible && (
            <p className="alert" style={{ margin: 0 }}>
              {value} {sign.unit} is not a possible {sign.name.toLowerCase()} ({sign.min}–{sign.max}
              ). The server would reject it.
            </p>
          )}

          <div className="record-actions">
            <Link to={patientId ? `/patients/${patientId}` : "/"} className="btn">
              Cancel
            </Link>
            <button type="submit" className="btn btn-primary" disabled={busy || !patientId}>
              {busy ? "Saving…" : "Save observation"}
            </button>
          </div>
        </form>

        <aside className="record-aside" aria-labelledby="preview">
          <section
            className="card card-pad"
            style={{ display: "flex", flexDirection: "column", gap: 16 }}
          >
            <h2 id="preview" style={{ fontSize: 16 }}>
              Result
            </h2>
            <div className={`result result-${preview ?? "none"}`} role="status">
              <span className="result-code">{preview ?? "—"}</span>
              <span className="result-label">
                {preview ? INTERPRETATION_LABEL[preview] : "Enter a value"}
              </span>
            </div>
            <div aria-hidden="true" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div className="scale">
                {preview && (
                  <span
                    className="scale-marker"
                    style={{ left: `${markerPosition(number, sign)}%` }}
                  />
                )}
              </div>
              <div
                className="muted"
                style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}
              >
                <span>Critical</span>
                <span>Normal</span>
                <span>Critical</span>
              </div>
            </div>
            <dl className="ranges">
              <dt>Normal range</dt>
              <dd className="mono">
                {sign.low}–{sign.high} {sign.unit}
              </dd>
              <dt>Critical below</dt>
              <dd className="mono">
                {sign.criticalLow} {sign.unit}
              </dd>
              <dt>Critical above</dt>
              <dd className="mono">
                {sign.criticalHigh === null ? "None" : `${sign.criticalHigh} ${sign.unit}`}
              </dd>
            </dl>
          </section>
          <p className="muted" style={{ margin: 0, padding: "0 4px", fontSize: 13 }}>
            The server sets the unit, the reference range and the result when it saves the
            observation. This preview uses the same ranges.
          </p>
        </aside>
      </div>
    </main>
  );
};

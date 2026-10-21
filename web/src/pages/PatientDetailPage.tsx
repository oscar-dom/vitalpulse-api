import { useCallback, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { ApiError } from "../api/client";
import {
  age,
  type Bundle,
  entries,
  formatDateTime,
  genderLabel,
  initials,
  interpretationOf,
  latestBySign,
  mrn,
  type Observation,
  observationCode,
  type Patient,
  patientName,
  statusLabel,
  vitalSign,
  VITAL_SIGNS,
  type VitalSign,
} from "../api/fhir";
import { useAsync } from "../api/useAsync";
import { useApi, useAuth } from "../auth/useAuth";
import { Pager, pageSummary } from "../components/Pager";
import { ResultChip } from "../components/ResultChip";
import "./PatientDetailPage.css";

const HISTORY_SIZE = 10;

const FILTERS = [
  { id: "all", label: "All", interpretation: null },
  { id: "out", label: "Out of range", interpretation: "L,H,LL,HH" },
  { id: "critical", label: "Critical", interpretation: "LL,HH" },
] as const;
type FilterId = (typeof FILTERS)[number]["id"];

const historyUrl = (patientId: string, filter: FilterId): string => {
  const query = new URLSearchParams({
    patient: patientId,
    _sort: "-date",
    _count: String(HISTORY_SIZE),
  });
  const interpretation = FILTERS.find((item) => item.id === filter)?.interpretation;
  if (interpretation) query.set("interpretation", interpretation);
  return `/fhir/Observation?${query.toString()}`;
};

/** Latest value of one vital sign, with its last few values as small bars. */
const VitalCard = ({ sign, history }: { sign: VitalSign; history: Observation[] }) => {
  const latest = history[0];
  const code = latest && interpretationOf(latest);
  const values = history
    .slice(0, 8)
    .reverse()
    .map((observation) => observation.valueQuantity?.value ?? 0);
  const top = Math.max(sign.criticalHigh ?? sign.max, ...values);

  return (
    <article className="card vital">
      <div className="vital-head">
        <h3>{sign.name}</h3>
        {latest && <ResultChip code={code} />}
      </div>
      {latest ? (
        <>
          <div className="vital-value">
            <span className="mono">{latest.valueQuantity?.value}</span>
            <span className="muted">{latest.valueQuantity?.unit ?? sign.unit}</span>
          </div>
          <div className="bars" aria-hidden="true">
            {values.map((value, index) => (
              <span
                key={index}
                className={index === values.length - 1 ? `bar bar-${code}` : "bar"}
                style={{ height: `${Math.max(6, Math.round((value / top) * 40))}px` }}
              />
            ))}
          </div>
          <div className="vital-foot muted">
            <span>
              Normal {sign.low}–{sign.high}
            </span>
            <span>{formatDateTime(latest.effectiveDateTime)}</span>
          </div>
        </>
      ) : (
        <p className="muted" style={{ margin: 0 }}>
          No results yet.
        </p>
      )}
    </article>
  );
};

export const PatientDetailPage = () => {
  const { id = "" } = useParams();
  const api = useApi();
  const { user } = useAuth();
  // Set by the record form after a save: what the server stored and how it judged it.
  const saved = (useLocation().state as { saved?: string } | null)?.saved;
  const [filter, setFilter] = useState<FilterId>("all");
  const [pageUrl, setPageUrl] = useState<string | null>(null);
  const [actionError, setActionError] = useState<ApiError | null>(null);
  // Bumped after a change, so both lists load again.
  const [refresh, setRefresh] = useState(0);

  const loadPatient = useCallback(async () => {
    const patient = (await api<Patient>(`/fhir/Patient/${id}`)).data;
    // Up to 50 recent observations give the latest value and a short trend per sign.
    const recent = (await api<Bundle>(`/fhir/Observation?patient=${id}&_sort=-date&_count=50`))
      .data;
    return { patient, recent: entries<Observation>(recent) };
  }, [api, id]);
  const summary = useAsync(`${id}#${refresh}`, loadPatient);

  const historyKey = pageUrl ?? historyUrl(id, filter);
  const loadHistory = useCallback(async () => {
    const bundle = (await api<Bundle>(historyKey)).data;
    // For a corrected observation, show what it said before (vread of the previous version).
    const previous = new Map<string, number | undefined>();
    await Promise.all(
      entries<Observation>(bundle)
        .filter((item) => ["amended", "corrected"].includes(item.status))
        .map(async (item) => {
          const version = Number(item.meta?.versionId ?? 1);
          if (version < 2) return;
          const before = await api<Observation>(
            `/fhir/Observation/${item.id}/_history/${version - 1}`,
          );
          previous.set(item.id!, before.data.valueQuantity?.value);
        }),
    );
    return { bundle, previous };
  }, [api, historyKey]);
  const history = useAsync(`${historyKey}#${refresh}`, loadHistory);

  const markAsError = async (observation: Observation) => {
    const sign = vitalSign(observationCode(observation));
    const ok = window.confirm(
      `Mark the ${sign?.name.toLowerCase() ?? "observation"} of ${formatDateTime(observation.effectiveDateTime)} as entered in error? It stays in the record, struck through.`,
    );
    if (!ok) return;
    setActionError(null);
    try {
      // A full replacement with the new status. If-Match makes the API refuse it
      // (412) if someone changed the observation since this page loaded it.
      const { meta: _meta, interpretation: _i, referenceRange: _r, ...rest } = observation;
      await api(`/fhir/Observation/${observation.id}`, {
        method: "PUT",
        body: { ...rest, status: "entered-in-error" },
        headers: { "If-Match": `W/"${observation.meta?.versionId ?? 1}"` },
      });
    } catch (caught) {
      const error = caught instanceof ApiError ? caught : new ApiError(0, []);
      setActionError(
        error.status === 412
          ? new ApiError(412, [
              {
                code: "conflict",
                message: "Someone changed this observation meanwhile. The list has been refreshed.",
              },
            ])
          : error,
      );
    }
    setRefresh((n) => n + 1);
  };

  if (summary.error) {
    return (
      <main className="page">
        <nav aria-label="Breadcrumb" className="breadcrumb">
          <Link to="/">Patients</Link>
        </nav>
        <p role="alert" className="alert">
          {summary.error.status === 410
            ? "This patient has been deleted."
            : summary.error.status === 404
              ? "This patient does not exist."
              : summary.error.message}
        </p>
      </main>
    );
  }

  const patient = summary.data?.patient;
  if (!patient) return <p className="empty">Loading patient…</p>;

  const recent = summary.data?.recent ?? [];
  const latest = latestBySign(recent);
  const rows = entries<Observation>(history.data?.bundle);
  const years = age(patient.birthDate);

  return (
    <main className="page">
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <Link to="/">Patients</Link>
        <span aria-hidden="true">/</span>
        <span>{patientName(patient)}</span>
      </nav>

      {saved && (
        <p role="status" className="notice">
          {saved}
        </p>
      )}

      <section aria-label="Patient" className="card card-pad patient-head">
        <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
          <div className="avatar" aria-hidden="true">
            {initials(patient)}
          </div>
          <div>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
              <h1 style={{ fontSize: 28 }}>{patientName(patient)}</h1>
              {patient.active ? (
                <span className="chip chip-N">
                  <span className="dot" aria-hidden="true" style={{ background: "#16A34A" }} />
                  Active
                </span>
              ) : (
                <span className="chip chip-none">Inactive</span>
              )}
            </div>
            <dl className="facts">
              <div>
                <dt>MRN</dt>
                <dd className="mono">{mrn(patient)}</dd>
              </div>
              <div>
                <dt>Gender</dt>
                <dd>{genderLabel(patient.gender)}</dd>
              </div>
              <div>
                <dt>Born</dt>
                <dd>
                  {patient.birthDate ?? "—"}
                  {years !== undefined && ` (${years} y)`}
                </dd>
              </div>
              <div>
                <dt>Version</dt>
                <dd>{patient.meta?.versionId}</dd>
              </div>
            </dl>
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          {user?.role === "admin" && (
            <Link to={`/patients/${id}/edit`} className="btn">
              Edit patient
            </Link>
          )}
          {patient.active && (
            <Link to={`/observations/new?patient=${id}`} className="btn btn-primary">
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M8 3v10M3 8h10" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
              </svg>
              Record vital sign
            </Link>
          )}
        </div>
      </section>

      <section
        aria-labelledby="latest"
        style={{ display: "flex", flexDirection: "column", gap: 12 }}
      >
        <h2 id="latest">Latest vital signs</h2>
        <div className="grid-auto" style={{ ["--min" as string]: "240px" }}>
          {VITAL_SIGNS.map((sign) => (
            <VitalCard
              key={sign.code}
              sign={sign}
              history={
                latest.has(sign.code)
                  ? recent.filter(
                      (item) =>
                        observationCode(item) === sign.code && item.status !== "entered-in-error",
                    )
                  : []
              }
            />
          ))}
        </div>
      </section>

      <section aria-labelledby="history" className="card" style={{ overflow: "hidden" }}>
        <div className="card-head">
          <h2 id="history">Observation history</h2>
          <div
            role="group"
            aria-label="Filter by result"
            style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
          >
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                className="pill"
                aria-pressed={filter === item.id}
                onClick={() => {
                  setFilter(item.id);
                  setPageUrl(null);
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        {(actionError ?? history.error) && (
          <p role="alert" className="alert" style={{ margin: 20 }}>
            {(actionError ?? history.error)!.message}
          </p>
        )}
        <div className="table-wrap">
          <table className="table" aria-busy={history.loading}>
            <thead>
              <tr>
                <th scope="col">Measured</th>
                <th scope="col">Vital sign</th>
                <th scope="col" style={{ textAlign: "right" }}>
                  Value
                </th>
                <th scope="col">Result</th>
                <th scope="col">Status</th>
                <th scope="col">Version</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((observation) => {
                const code = observationCode(observation);
                const sign = vitalSign(code);
                const inError = observation.status === "entered-in-error";
                const before = history.data?.previous.get(observation.id!);
                return (
                  <tr key={observation.id}>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {formatDateTime(observation.effectiveDateTime)}
                    </td>
                    <td>
                      {sign?.name ?? code}{" "}
                      <span className="mono muted" style={{ fontSize: 12 }}>
                        {code}
                      </span>
                    </td>
                    <td className={inError ? "num struck" : "num"}>
                      {observation.valueQuantity?.value}{" "}
                      <span className="muted" style={{ fontFamily: "var(--sans)", fontSize: 13 }}>
                        {observation.valueQuantity?.unit}
                      </span>
                    </td>
                    <td>
                      <ResultChip code={interpretationOf(observation)} muted={inError} />
                    </td>
                    <td>{statusLabel(observation.status)}</td>
                    <td className="muted" style={{ fontSize: 14 }}>
                      v{observation.meta?.versionId}
                      {before !== undefined && ` · was ${before}`}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {!inError && (
                        <button
                          type="button"
                          className="btn btn-small"
                          onClick={() => markAsError(observation)}
                        >
                          Mark as error
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!history.loading && rows.length === 0 && (
            <p className="empty">
              No observations{filter === "all" ? " yet" : " match this filter"}.
            </p>
          )}
        </div>
        <div className="card-foot">
          <span>
            {history.loading
              ? "Loading…"
              : `${pageSummary(history.data?.bundle, HISTORY_SIZE, "observations")} · newest first`}
          </span>
          <Pager bundle={history.data?.bundle} onGo={setPageUrl} disabled={history.loading} />
        </div>
      </section>
    </main>
  );
};

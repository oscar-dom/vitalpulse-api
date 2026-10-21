import { type FormEvent, useCallback, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  type Bundle,
  entries,
  genderLabel,
  interpretationOf,
  latestBySign,
  mrn,
  type Observation,
  type Patient,
  patientIdOf,
  patientName,
  VITAL_SIGNS,
} from "../api/fhir";
import { useAsync } from "../api/useAsync";
import { useApi, useAuth } from "../auth/useAuth";
import { Pager, pageSummary } from "../components/Pager";
import { ResultChip } from "../components/ResultChip";

const PAGE_SIZE = 10;

interface Filters {
  name: string;
  identifier: string;
  gender: string;
  active: string;
}

const firstPage = (filters: Filters): string => {
  const query = new URLSearchParams({ _count: String(PAGE_SIZE), _sort: "family" });
  if (filters.name.trim()) query.set("name", filters.name.trim());
  if (filters.identifier.trim()) query.set("identifier", filters.identifier.trim());
  if (filters.gender) query.set("gender", filters.gender);
  if (filters.active) query.set("active", filters.active);
  return `/fhir/Patient?${query.toString()}`;
};

/** Out-of-range latest results of a patient, worst first, or "All normal". */
const LatestResults = ({ observations }: { observations: Observation[] | undefined }) => {
  if (!observations) return <span className="muted">…</span>;
  const latest = latestBySign(observations);
  if (latest.size === 0) return <span className="muted">No results</span>;

  const flagged = VITAL_SIGNS.flatMap((sign) => {
    const observation = latest.get(sign.code);
    const code = observation && interpretationOf(observation);
    return observation && code && code !== "N" ? [{ sign, observation, code }] : [];
  });
  if (flagged.length === 0) return <ResultChip code="N">All normal</ResultChip>;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {flagged.map(({ sign, observation, code }) => (
        <ResultChip key={sign.code} code={code}>
          {sign.short} {observation.valueQuantity?.value} ·{" "}
          {code === "LL" || code === "HH" ? "Critical" : code === "L" ? "Low" : "High"}
        </ResultChip>
      ))}
    </div>
  );
};

export const PatientsPage = () => {
  const api = useApi();
  const { user } = useAuth();
  // Set after deleting a patient.
  const saved = (useLocation().state as { saved?: string } | null)?.saved;
  const [filters, setFilters] = useState<Filters>({
    name: "",
    identifier: "",
    gender: "",
    active: "true",
  });
  const [url, setUrl] = useState(() => firstPage(filters));

  const load = useCallback(async () => {
    const bundle = (await api<Bundle>(url)).data;
    // One search for the latest results of every patient on the page: a comma in
    // patient= means "any of these".
    const ids = entries<Patient>(bundle).map((patient) => patient.id!);
    const observations = new Map<string, Observation[]>(ids.map((id) => [id, []]));
    if (ids.length > 0) {
      const query = new URLSearchParams({ patient: ids.join(","), _sort: "-date", _count: "50" });
      const found = (await api<Bundle>(`/fhir/Observation?${query.toString()}`)).data;
      for (const observation of entries<Observation>(found)) {
        observations.get(patientIdOf(observation) ?? "")?.push(observation);
      }
    }
    return { bundle, observations };
  }, [api, url]);

  const { data, error, loading } = useAsync(url, load);
  const bundle = data?.bundle;
  const observations = loading ? undefined : data?.observations;

  const search = (event: FormEvent) => {
    event.preventDefault();
    setUrl(firstPage(filters));
  };

  const set = (key: keyof Filters) => (event: { target: { value: string } }) =>
    setFilters((current) => ({ ...current, [key]: event.target.value }));

  const patients = entries<Patient>(bundle);

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Patients</h1>
          <p className="muted" style={{ margin: "4px 0 0" }}>
            Search the patient catalog and open a record to see its vital signs.
          </p>
        </div>
        {user?.role === "admin" && (
          <Link to="/patients/new" className="btn btn-primary">
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M8 3v10M3 8h10" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
            </svg>
            New patient
          </Link>
        )}
      </div>

      {saved && (
        <p role="status" className="notice">
          {saved}
        </p>
      )}

      <form
        role="search"
        aria-label="Search patients"
        onSubmit={search}
        className="card"
        style={{
          padding: 20,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 16,
          alignItems: "end",
        }}
      >
        <label className="field">
          Name
          <input
            type="search"
            placeholder="Starts with…"
            value={filters.name}
            onChange={set("name")}
          />
        </label>
        <label className="field">
          Identifier (MRN)
          <input placeholder="MRN-0042" value={filters.identifier} onChange={set("identifier")} />
        </label>
        <label className="field">
          Gender
          <select value={filters.gender} onChange={set("gender")}>
            <option value="">Any</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="other">Other</option>
            <option value="unknown">Unknown</option>
          </select>
        </label>
        <label className="field">
          Status
          <select value={filters.active} onChange={set("active")}>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
            <option value="">Any</option>
          </select>
        </label>
        <button type="submit" className="btn btn-outline">
          Search
        </button>
      </form>

      {error && (
        <p role="alert" className="alert">
          {error.message}
        </p>
      )}

      <section
        aria-label="Results"
        className="card"
        style={{ overflow: "hidden" }}
        aria-busy={loading}
      >
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Identifier</th>
                <th scope="col">Gender</th>
                <th scope="col">Birth date</th>
                <th scope="col">Status</th>
                <th scope="col">Latest results</th>
                <th scope="col">
                  <span className="visually-hidden">Open</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {patients.map((patient) => (
                <tr key={patient.id}>
                  <td>
                    <Link to={`/patients/${patient.id}`} className="row-link">
                      {patientName(patient)}
                    </Link>
                  </td>
                  <td className="mono" style={{ fontSize: 13 }}>
                    {mrn(patient)}
                  </td>
                  <td>{genderLabel(patient.gender)}</td>
                  <td>{patient.birthDate ?? "—"}</td>
                  <td>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <span
                        className="dot"
                        aria-hidden="true"
                        style={{ background: patient.active ? "#16A34A" : "#9CA3AF" }}
                      />
                      {patient.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td>
                    <LatestResults observations={observations?.get(patient.id!)} />
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <Link
                      to={`/patients/${patient.id}`}
                      aria-label={`Open ${patientName(patient)}`}
                      className="btn btn-small"
                      style={{ border: 0 }}
                    >
                      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                        <path
                          d="M7 4l5 5-5 5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && patients.length === 0 && !error && (
            <p className="empty">No patients match this search.</p>
          )}
        </div>
        <div className="card-foot">
          <span>{loading ? "Loading…" : pageSummary(bundle, PAGE_SIZE, "patients")}</span>
          <Pager bundle={bundle} onGo={setUrl} disabled={loading} />
        </div>
      </section>
    </main>
  );
};

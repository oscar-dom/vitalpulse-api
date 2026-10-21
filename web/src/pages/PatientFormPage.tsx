import { type FormEvent, useCallback, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError } from "../api/client";
import { type Patient, patientName } from "../api/fhir";
import { useAsync } from "../api/useAsync";
import { useApi, useAuth } from "../auth/useAuth";

export const MRN_SYSTEM = "https://hospital.example.org/mrn";

interface Form {
  given: string;
  family: string;
  mrn: string;
  gender: string;
  birthDate: string;
  active: boolean;
}

const EMPTY: Form = { given: "", family: "", mrn: "", gender: "", birthDate: "", active: true };

const toForm = (patient: Patient): Form => {
  const name = patient.name?.find((item) => item.use === "official") ?? patient.name?.[0];
  return {
    given: name?.given?.join(" ") ?? "",
    family: name?.family ?? "",
    mrn: patient.identifier?.[0]?.value ?? "",
    gender: patient.gender ?? "",
    birthDate: patient.birthDate ?? "",
    active: patient.active ?? true,
  };
};

/**
 * The Patient to send. On edit it starts from the stored one, so identifiers and
 * names this form does not show are kept: a FHIR update replaces the whole resource.
 */
const toResource = (form: Form, existing?: Patient): Patient => {
  const given = form.given.split(/\s+/).filter(Boolean);
  const name = {
    use: "official" as const,
    ...(form.family.trim() && { family: form.family.trim() }),
    ...(given.length > 0 && { given }),
  };
  const { meta: _meta, ...base } = existing ?? { resourceType: "Patient" as const };
  return {
    ...base,
    resourceType: "Patient",
    identifier: [
      { system: existing?.identifier?.[0]?.system ?? MRN_SYSTEM, value: form.mrn.trim() },
      ...(existing?.identifier?.slice(1) ?? []),
    ],
    name: [name, ...(existing?.name?.filter((item) => item.use !== "official") ?? [])],
    active: form.active,
    ...(form.gender ? { gender: form.gender as Patient["gender"] } : { gender: undefined }),
    ...(form.birthDate ? { birthDate: form.birthDate } : { birthDate: undefined }),
  };
};

// Elements the API may point at, and the field of this form that shows them.
const fieldOf = (expression: string | undefined): keyof Form | "name" | undefined => {
  if (!expression) return undefined;
  if (expression.startsWith("Patient.identifier")) return "mrn";
  if (expression.startsWith("Patient.name"))
    return expression.endsWith("family") ? "family" : "name";
  if (expression === "Patient.gender") return "gender";
  if (expression === "Patient.birthDate") return "birthDate";
  return undefined;
};

const PatientForm = ({ existing }: { existing?: Patient }) => {
  const api = useApi();
  const navigate = useNavigate();
  const [form, setForm] = useState<Form>(() => (existing ? toForm(existing) : EMPTY));
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: keyof Form) => (event: { target: { value: string; checked?: boolean } }) =>
    setForm((current) => ({
      ...current,
      [key]: key === "active" ? Boolean(event.target.checked) : event.target.value,
    }));

  const fieldErrors: Partial<Record<keyof Form | "name", string>> = {};
  const otherErrors: string[] = [];
  for (const issue of error?.issues ?? []) {
    const field = fieldOf(issue.expression);
    if (field) fieldErrors[field] ??= issue.message;
    else otherErrors.push(issue.message);
  }

  const fail = (caught: unknown) => {
    const apiError = caught instanceof ApiError ? caught : new ApiError(0, []);
    setError(
      apiError.status === 412
        ? new ApiError(412, [
            {
              code: "conflict",
              message:
                "Someone else changed this patient while you were editing. Reload the page to see their version.",
            },
          ])
        : apiError,
    );
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = toResource(form, existing);
      const { data } = existing
        ? await api<Patient>(`/fhir/Patient/${existing.id}`, {
            method: "PUT",
            body,
            headers: { "If-Match": `W/"${existing.meta?.versionId ?? 1}"` },
          })
        : await api<Patient>("/fhir/Patient", { method: "POST", body });
      navigate(`/patients/${data.id}`, {
        state: { saved: existing ? "Patient updated." : "Patient created." },
      });
    } catch (caught) {
      fail(caught);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!existing) return;
    if (!window.confirm(`Delete ${patientName(existing)}? This cannot be undone from the app.`))
      return;
    setBusy(true);
    setError(null);
    try {
      await api(`/fhir/Patient/${existing.id}`, {
        method: "DELETE",
        headers: { "If-Match": `W/"${existing.meta?.versionId ?? 1}"` },
      });
      navigate("/", { state: { saved: `${patientName(existing)} deleted.` } });
    } catch (caught) {
      fail(caught);
    } finally {
      setBusy(false);
    }
  };

  const nameError = fieldErrors.name;

  return (
    <form
      className="card card-pad"
      onSubmit={save}
      noValidate
      style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 760 }}
    >
      {(otherErrors.length > 0 || nameError) && (
        <div role="alert" className="alert">
          {[nameError, ...otherErrors].filter(Boolean).join(" ")}
        </div>
      )}
      <div className="grid-auto">
        <label className="field">
          Given names
          <input
            value={form.given}
            onChange={set("given")}
            autoComplete="off"
            aria-invalid={Boolean(nameError)}
          />
        </label>
        <label className="field">
          Family name
          <input
            value={form.family}
            onChange={set("family")}
            autoComplete="off"
            aria-invalid={Boolean(fieldErrors.family ?? nameError)}
          />
          {fieldErrors.family && <span className="field-error">{fieldErrors.family}</span>}
        </label>
      </div>
      <div className="grid-auto">
        <label className="field">
          Medical record number
          <input
            value={form.mrn}
            onChange={set("mrn")}
            className="mono"
            aria-invalid={Boolean(fieldErrors.mrn)}
            required
          />
          {fieldErrors.mrn ? (
            <span className="field-error">{fieldErrors.mrn}</span>
          ) : (
            <span className="field-hint">Unique among living patients.</span>
          )}
        </label>
        <label className="field">
          Gender
          <select
            value={form.gender}
            onChange={set("gender")}
            aria-invalid={Boolean(fieldErrors.gender)}
          >
            <option value="">Not stated</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="other">Other</option>
            <option value="unknown">Unknown</option>
          </select>
        </label>
        <label className="field">
          Birth date
          <input
            type="date"
            value={form.birthDate}
            onChange={set("birthDate")}
            aria-invalid={Boolean(fieldErrors.birthDate)}
          />
          {fieldErrors.birthDate && <span className="field-error">{fieldErrors.birthDate}</span>}
        </label>
      </div>
      <label style={{ display: "flex", gap: 10, alignItems: "center", fontWeight: 600 }}>
        <input
          type="checkbox"
          checked={form.active}
          onChange={set("active")}
          style={{ width: 20, height: 20 }}
        />
        Active
        <span className="muted" style={{ fontWeight: 400 }}>
          Inactive patients keep their history but accept no new vital signs.
        </span>
      </label>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          justifyContent: "space-between",
          borderTop: "1px solid var(--line-soft)",
          paddingTop: 20,
        }}
      >
        <div>
          {existing && (
            <button
              type="button"
              className="btn"
              onClick={remove}
              disabled={busy}
              style={{ color: "var(--error-ink)" }}
            >
              Delete patient
            </button>
          )}
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <Link to={existing ? `/patients/${existing.id}` : "/"} className="btn">
            Cancel
          </Link>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Saving…" : existing ? "Save changes" : "Create patient"}
          </button>
        </div>
      </div>
    </form>
  );
};

/** New patient and Edit patient, for admins. */
export const PatientFormPage = () => {
  const { id } = useParams();
  const api = useApi();
  const { user } = useAuth();
  const load = useCallback(async () => (await api<Patient>(`/fhir/Patient/${id}`)).data, [api, id]);
  const existing = useAsync(id ?? null, load);

  const title = id ? "Edit patient" : "New patient";
  return (
    <main className="page">
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <Link to="/">Patients</Link>
        {existing.data && (
          <>
            <span aria-hidden="true">/</span>
            <Link to={`/patients/${id}`}>{patientName(existing.data)}</Link>
          </>
        )}
        <span aria-hidden="true">/</span>
        <span>{title}</span>
      </nav>
      <h1>{title}</h1>
      {user?.role !== "admin" ? (
        <p role="alert" className="alert">
          Only administrators can create or edit patients.
        </p>
      ) : existing.error ? (
        <p role="alert" className="alert">
          {existing.error.message}
        </p>
      ) : id && !existing.data ? (
        <p className="muted">Loading patient…</p>
      ) : (
        <PatientForm key={existing.data?.meta?.versionId} existing={existing.data} />
      )}
    </main>
  );
};

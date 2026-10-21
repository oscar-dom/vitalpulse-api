import { type FormEvent, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { ApiError } from "../api/client";
import { useAuth } from "../auth/useAuth";
import { Logo } from "../components/Layout";
import "./LoginPage.css";

type Mode = "signin" | "signup";

const Check = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
    <path
      d="M4 9.5l3 3 7-7"
      fill="none"
      stroke="#7DD3FC"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const LoginPage = () => {
  const { user, login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  const from = (location.state as { from?: string } | null)?.from ?? "/";
  if (user) return <Navigate to={from} replace />;

  const signUp = mode === "signup";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (signUp) await register(name, email, password);
      else await login(email, password);
      navigate(from, { replace: true });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught : new ApiError(0, []));
    } finally {
      setBusy(false);
    }
  };

  const fieldError = (element: string) => error?.forElement(element);

  return (
    <div className="login">
      <section className="login-brand" aria-label="About VitalPulse">
        <div className="brand" style={{ color: "#FFFFFF", fontSize: 20 }}>
          <Logo size={36} inverted />
          VitalPulse
        </div>
        <div className="login-pitch">
          <h1>Vital signs, read the same way every time.</h1>
          <p>
            Record heart rate, breathing, temperature and oxygen saturation. Every value is checked
            against its reference range on the server, so a high or critical result is never missed.
          </p>
          <ul>
            <li>
              <Check />
              HL7 FHIR R4 patients and observations
            </li>
            <li>
              <Check />
              Every correction kept as a new version
            </li>
          </ul>
        </div>
        <p className="login-note">Demo application. Not for clinical decisions.</p>
      </section>

      <section className="login-panel" aria-label="Account">
        <div className="login-box">
          <div role="tablist" aria-label="Account" className="tabs">
            {(["signin", "signup"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={mode === tab}
                onClick={() => {
                  setMode(tab);
                  setError(null);
                }}
              >
                {tab === "signin" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          <div>
            <h2 style={{ fontSize: 26 }}>{signUp ? "Create your account" : "Welcome back"}</h2>
            <p className="muted" style={{ margin: "4px 0 0" }}>
              {signUp
                ? "New accounts can record and read vital signs."
                : "Sign in to see your patients."}
            </p>
          </div>

          <form onSubmit={submit} className="stack" noValidate>
            {error && error.issues.every((issue) => !issue.expression) && (
              <p role="alert" className="alert">
                {error.message}
              </p>
            )}
            {signUp && (
              <label className="field">
                Full name
                <input
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  aria-invalid={Boolean(fieldError("name"))}
                  required
                />
                {fieldError("name") && <span className="field-error">{fieldError("name")}</span>}
              </label>
            )}
            <label className="field">
              Email
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                aria-invalid={Boolean(fieldError("email"))}
                required
              />
              {fieldError("email") && <span className="field-error">{fieldError("email")}</span>}
            </label>
            <label className="field">
              Password
              <input
                type="password"
                autoComplete={signUp ? "new-password" : "current-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-invalid={Boolean(fieldError("password"))}
                required
              />
              {fieldError("password") ? (
                <span className="field-error">{fieldError("password")}</span>
              ) : (
                signUp && <span className="field-hint">8 to 72 characters.</span>
              )}
            </label>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? "Please wait…" : signUp ? "Create account" : "Sign in"}
            </button>
          </form>

          <p className="muted" style={{ margin: 0, fontSize: 14 }}>
            {signUp
              ? "Patient management is for administrators; ask yours if you need it."
              : "Forgot your password? Ask an administrator to reset it."}
          </p>
        </div>
      </section>
    </div>
  );
};

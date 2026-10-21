import { Link, NavLink, Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/useAuth";

export const Logo = ({ size = 28, inverted = false }: { size?: number; inverted?: boolean }) => (
  <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
    <rect width="28" height="28" rx="7" fill={inverted ? "#FFFFFF" : "#0B5C86"} />
    <path
      d="M5 15h4l2.5-6 4 11 2.5-5H23"
      fill="none"
      stroke={inverted ? "#0B3B55" : "#FFFFFF"}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ROLE_LABEL = { admin: "Admin", clinician: "Clinician" } as const;

/** The signed-in frame: top bar and the current page. Sends guests to sign in. */
export const Layout = () => {
  const { user, checking, logout } = useAuth();
  const location = useLocation();

  if (checking) return <p className="empty">Checking your session…</p>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand">
            <Logo />
            VitalPulse
          </Link>
          <nav aria-label="Main" className="mainnav">
            <NavLink to="/" end>
              Patients
            </NavLink>
            <NavLink to="/observations/new">Record vital sign</NavLink>
          </nav>
          <div className="userbox">
            <div className="userbox-name">
              <div style={{ fontWeight: 600 }}>{user.name}</div>
              <div className="muted" style={{ fontSize: 13 }}>
                {ROLE_LABEL[user.role]}
              </div>
            </div>
            <button type="button" className="btn btn-small" onClick={logout}>
              Sign out
            </button>
          </div>
        </div>
      </header>
      <Outlet />
    </>
  );
};

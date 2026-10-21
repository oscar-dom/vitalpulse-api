import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { Layout } from "./components/Layout";
import { LoginPage } from "./pages/LoginPage";

const Placeholder = ({ title }: { title: string }) => (
  <main className="page">
    <h1>{title}</h1>
  </main>
);

export const AppRoutes = () => (
  <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route element={<Layout />}>
      <Route index element={<Placeholder title="Patients" />} />
      <Route path="observations/new" element={<Placeholder title="Record a vital sign" />} />
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
);

export const App = () => (
  <AuthProvider>
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  </AuthProvider>
);

import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { Layout } from "./components/Layout";
import { LoginPage } from "./pages/LoginPage";
import { PatientDetailPage } from "./pages/PatientDetailPage";
import { PatientFormPage } from "./pages/PatientFormPage";
import { PatientsPage } from "./pages/PatientsPage";
import { RecordObservationPage } from "./pages/RecordObservationPage";

export const AppRoutes = () => (
  <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route element={<Layout />}>
      <Route index element={<PatientsPage />} />
      <Route path="patients/new" element={<PatientFormPage />} />
      <Route path="patients/:id" element={<PatientDetailPage />} />
      <Route path="patients/:id/edit" element={<PatientFormPage />} />
      <Route path="observations/new" element={<RecordObservationPage />} />
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

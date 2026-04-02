import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppAuthProvider } from "./context/AppAuthContext";
import Layout from "./components/Layout";
import DashboardPage from "./pages/DashboardPage";
import WorkoutsPage from "./pages/WorkoutsPage";
import ActiveWorkoutPage from "./pages/ActiveWorkoutPage";
import StatsPage from "./pages/StatsPage";
import ProfilePage from "./pages/ProfilePage";

export default function App() {
  return (
    <AppAuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/workout" element={<ActiveWorkoutPage />} />
          <Route path="/" element={<Layout />}>
            <Route index element={<DashboardPage />} />
            <Route path="workouts" element={<WorkoutsPage />} />
            <Route path="stats" element={<StatsPage />} />
            <Route path="profile" element={<ProfilePage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AppAuthProvider>
  );
}

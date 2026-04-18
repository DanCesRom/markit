// src/pages/Root.tsx
import { Navigate } from "react-router-dom";
import { isLoggedIn, isOnboardingDone } from "../lib/auth";

export default function Root() {
  // Si ya completó onboarding y está logueado -> entra al app
  if (isOnboardingDone() && isLoggedIn()) return <Navigate to="/" replace />;

  // Si no hizo onboarding -> onboarding
  if (!isOnboardingDone()) return <Navigate to="/onboarding" replace />;

  // Si ya hizo onboarding pero no está logueado -> get-started
  return <Navigate to="/get-started" replace />;
}
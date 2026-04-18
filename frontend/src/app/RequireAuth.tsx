// src/app/RequireAuth.tsx
import { Navigate, Outlet } from "react-router-dom";
import { isLoggedIn, isOnboardingDone } from "../lib/auth";

export default function RequireAuth() {
  if (!isOnboardingDone()) {
    return <Navigate to="/splash" replace />;
  }

  if (!isLoggedIn()) {
    return <Navigate to="/get-started" replace />;
  }

  return <Outlet />;
}
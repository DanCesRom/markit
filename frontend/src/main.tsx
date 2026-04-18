import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { RouterProvider } from "react-router-dom";
import { router } from "./app/router";
import { resetForDemoIfEnabled } from "./lib/auth";
import "leaflet/dist/leaflet.css";


resetForDemoIfEnabled();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);
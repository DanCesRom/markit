// src/app/AnimatedOutlet.tsx
import { Outlet, useLocation } from "react-router-dom";
import { motion } from "framer-motion";

export default function AnimatedOutlet() {
  const location = useLocation();

  return (
    <div className="relative min-h-screen overflow-hidden">
      <motion.div
        key={location.pathname}
        initial={{ x: 80 }}
        animate={{ x: 0 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        className="absolute inset-0"
      >
        <Outlet />
      </motion.div>
    </div>
  );
}
import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { Toaster } from 'sonner';
import { useReducedMotion } from './state/sky.ts';
import Landing from './pages/Landing.tsx';

const Studio = lazy(() => import('./pages/Studio.tsx'));

export default function App() {
  const location = useLocation();
  const reduce = useReducedMotion();
  return (
    <>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={location.pathname}
          className="page"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0, transition: { duration: 0.24, ease: [0.23, 1, 0.32, 1] } }}
          exit={{ opacity: 0, transition: { duration: 0.12 } }}
        >
          <Suspense fallback={<div className="page-loading" />}>
            <Routes location={location}>
              <Route path="/" element={<Landing />} />
              <Route path="/studio" element={<Studio />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </motion.div>
      </AnimatePresence>
      <Toaster
        theme="dark"
        position="bottom-center"
        toastOptions={{ className: 'toast' }}
      />
    </>
  );
}

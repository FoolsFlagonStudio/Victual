import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import Landing from './pages/Landing';

const Legal = lazy(() => import('./pages/Legal'));
// Dev reference for checking tokens against the Figma. Only included in dev builds.
const StyleGuide = import.meta.env.DEV ? lazy(() => import('./pages/StyleGuide')) : null;

export default function App() {
  return (
    <Suspense fallback={null}>
      <Routes>
        <Route path="/" element={<Landing />} />
        {/* The app links to /privacy, /terms and /support; all four open the same page at their section. */}
        {['/privacy', '/terms', '/support', '/delete-account'].map((path) => (
          <Route key={path} path={path} element={<Legal />} />
        ))}
        {StyleGuide ? <Route path="/styleguide" element={<StyleGuide />} /> : null}
        <Route path="*" element={<Landing />} />
      </Routes>
    </Suspense>
  );
}

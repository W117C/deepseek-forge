import { lazy, Suspense, useEffect } from "react";
import { Outlet, Route, Routes, useLocation } from "react-router-dom";
import { Header } from "./components/Header";
import { Footer } from "./components/Footer";
import { Home } from "./pages/Home";
import { NotFound } from "./pages/NotFound";
import { AgentsPage, BundlesPage, ExplorePage, PluginsPage, SkillsPage } from "./pages/Listings";

const SearchPage = lazy(() => import("./pages/SearchPage").then((m) => ({ default: m.SearchPage })));
const AgentDetail = lazy(() => import("./pages/AgentDetail").then((m) => ({ default: m.AgentDetail })));
const BundleDetail = lazy(() => import("./pages/BundleDetail").then((m) => ({ default: m.BundleDetail })));
const PluginDetail = lazy(() => import("./pages/PluginDetail").then((m) => ({ default: m.PluginDetail })));
const SkillDetail = lazy(() => import("./pages/SkillDetail").then((m) => ({ default: m.SkillDetail })));
const PublishPage = lazy(() => import("./pages/Publish").then((m) => ({ default: m.PublishPage })));

function PageFallback() {
  return (
    <div className="forge-container" style={{ paddingTop: 40, paddingBottom: 96 }} aria-busy="true">
      <div className="skel skel-line" style={{ width: "22%", height: 10 }} />
      <div className="skel skel-line" style={{ width: "46%", height: 32, marginTop: 16 }} />
      <div className="skel skel-line" style={{ width: "64%", height: 14 }} />
      <div className="skel skel-line" style={{ width: "58%", height: 14 }} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginTop: 32 }}>
        {[0, 1, 2].map((i) => <div key={i} className="skel" style={{ height: 220, borderRadius: "var(--r-l)" }} />)}
      </div>
    </div>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [pathname]);
  return null;
}

function Shell() {
  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>
      <ScrollToTop />
      <Header />
      <div id="main">
        <Outlet />
      </div>
      <Footer />
    </>
  );
}

export default function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route element={<Shell />}>
          <Route path="/" element={<Home />} />
          <Route path="/explore" element={<ExplorePage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/agents" element={<AgentsPage />} />
          <Route path="/agents/:slug" element={<AgentDetail />} />
          <Route path="/bundles" element={<BundlesPage />} />
          <Route path="/bundles/:slug" element={<BundleDetail />} />
          <Route path="/plugins" element={<PluginsPage />} />
          <Route path="/plugins/:slug" element={<PluginDetail />} />
          <Route path="/skills" element={<SkillsPage />} />
          <Route path="/skills/:slug" element={<SkillDetail />} />
          <Route path="/publish" element={<PublishPage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

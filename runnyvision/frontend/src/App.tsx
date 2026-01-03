import { Link, Route, Routes, useLocation } from "react-router-dom";
import RunnerPage from "./pages/RunnerPage";
import WorkaholPage from "./pages/WorkaholPage";

function Header() {
  const location = useLocation();
  return (
    <header className="app-header">
      <div>
        <div className="badge">RunnyVision</div>
        <h1 style={{ margin: "6px 0 0", fontSize: "1.4rem" }}>Miles that feel real, routes that feel epic.</h1>
      </div>
      <nav className="nav-links">
        <Link className="nav-link" to="/runner" aria-current={location.pathname === "/runner" ? "page" : undefined}>
          Runner
        </Link>
        <Link
          className="nav-link"
          to="/workahol"
          aria-current={location.pathname === "/workahol" ? "page" : undefined}
        >
          default
        </Link>
      </nav>
    </header>
  );
}

export default function App() {
  return (
    <div className="app-shell">
      <Header />
      <Routes>
        <Route path="/" element={<RunnerPage />} />
        <Route path="/runner" element={<RunnerPage />} />
        <Route path="/workahol" element={<WorkaholPage />} />
      </Routes>
    </div>
  );
}

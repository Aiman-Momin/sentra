import { Routes, Route } from "react-router-dom";
import { LandingPage } from "./pages/LandingPage";
import { Shell } from "./components/Shell";
import { WalletCheckPage } from "./pages/WalletCheckPage";
import { MonitorPage } from "./pages/MonitorPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route
        path="/app"
        element={
          <Shell>
            <WalletCheckPage />
          </Shell>
        }
      />
      <Route
        path="/app/monitor"
        element={
          <Shell>
            <MonitorPage />
          </Shell>
        }
      />
    </Routes>
  );
}
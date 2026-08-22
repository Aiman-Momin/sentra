import { Routes, Route, Navigate } from "react-router-dom";
import { Shell } from "./components/Shell";
import { WalletCheckPage } from "./pages/WalletCheckPage";
import { MonitorPage } from "./pages/MonitorPage";

export default function App() {
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<WalletCheckPage />} />
        {/* old bookmarks/links to /transfer still land somewhere useful */}
        <Route path="/transfer" element={<Navigate to="/" replace />} />
        <Route path="/monitor" element={<MonitorPage />} />
      </Routes>
    </Shell>
  );
}

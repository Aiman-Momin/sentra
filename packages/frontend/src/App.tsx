import { Routes, Route } from "react-router-dom";
import { Shell } from "./components/Shell";
import { WalletCheckPage } from "./pages/WalletCheckPage";
import { TransferCheckPage } from "./pages/TransferCheckPage";
import { MonitorPage } from "./pages/MonitorPage";

export default function App() {
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<WalletCheckPage />} />
        <Route path="/transfer" element={<TransferCheckPage />} />
        <Route path="/monitor" element={<MonitorPage />} />
      </Routes>
    </Shell>
  );
}

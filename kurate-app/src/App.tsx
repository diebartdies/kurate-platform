import { BrowserRouter, Routes, Route } from "react-router-dom";
import SearchPage from "./pages/SearchPage";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<SearchPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/profesional/:id" element={<div className="p-8 text-center">Perfil del profesional — próximamente</div>} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

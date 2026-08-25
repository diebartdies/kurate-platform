import { useState, useEffect, useCallback } from "react";
import { Search, SlidersHorizontal, X, MapPin, Wrench, Tag } from "lucide-react";
import ProCard from "../components/ProCard";
import { searchProfessionals, getServices, getBrands } from "../lib/api";
import type { ProResult, ServiceTree, Suggestion } from "../types";

const AREAS = ["Hogar", "Oficina", "Industria", "Campo"];

export default function SearchPage() {
  const [area, setArea] = useState("");
  const [category, setCategory] = useState("");
  const [device, setDevice] = useState("");
  const [brand, setBrand] = useState("");
  const [provincia, setProvincia] = useState("");
  const [ciudad, setCiudad] = useState("");
  const [results, setResults] = useState<ProResult[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [serviceTree, setServiceTree] = useState<ServiceTree>({});
  const [categories, setCategories] = useState<string[]>([]);
  const [devices, setDevices] = useState<string[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    getServices().then((res) => {
      if (res.success) setServiceTree(res.data);
    });
  }, []);

  useEffect(() => {
    if (area && serviceTree[area]) {
      setCategories(Object.keys(serviceTree[area]));
      setCategory("");
      setDevice("");
      setBrand("");
    }
  }, [area, serviceTree]);

  useEffect(() => {
    if (area && category && serviceTree[area]?.[category]) {
      const devs = serviceTree[area][category].map((d) => d.device);
      setDevices([...new Set(devs)]);
      setDevice("");
      setBrand("");
    }
  }, [category, area, serviceTree]);

  useEffect(() => {
    if (area && category && device) {
      const path = `${area.toLowerCase()}/${category.toLowerCase().replace(/\s+/g, "-")}/${device.toLowerCase().replace(/\s+/g, "-")}`;
      getBrands(path).then((res) => {
        if (res.success) setBrands(res.data);
      });
    }
  }, [device, area, category]);

  const doSearch = useCallback(async () => {
    setLoading(true);
    const servicePath = area && category && device
      ? `${area.toLowerCase()}/${category.toLowerCase().replace(/\s+/g, "-")}/${device.toLowerCase().replace(/\s+/g, "-")}`
      : undefined;

    const res = await searchProfessionals({
      service: servicePath,
      brand: brand || undefined,
      provincia: provincia || undefined,
      ciudad: ciudad || undefined,
    });

    setResults(res.data || []);
    setSuggestions(res.suggestions || []);
    setLoading(false);
  }, [area, category, device, brand, provincia, ciudad]);

  useEffect(() => {
    if (area || provincia || device) {
      doSearch();
    }
  }, [area, category, device, brand, provincia, ciudad, doSearch]);

  return (
    <div className="min-h-screen bg-[#0f0f1a]">
      {/* Header */}
      <header className="bg-[#1a1a2e] border-b border-[rgba(184,146,46,0.3)] p-4 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto flex items-center gap-4">
          <h1 className="text-xl font-bold text-[#B8922E]">KuraTe</h1>
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#B8922E]/60" />
            <input
              type="text"
              placeholder="Buscar técnico..."
              className="w-full bg-[#0f0f1a] border border-[rgba(184,146,46,0.3)] rounded-xl pl-10 pr-4 py-2 text-sm text-[#e0e0e0] focus:outline-none focus:border-[#B8922E] transition-colors"
              value={provincia}
              onChange={(e) => setProvincia(e.target.value)}
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center justify-center w-11 h-11 hover:bg-[rgba(184,146,46,0.1)] rounded-xl transition-colors text-[#B8922E]"
          >
            <SlidersHorizontal className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom, 0px))' }}>
        {/* Area Tabs */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
          {AREAS.map((a) => (
            <button
              key={a}
              onClick={() => setArea(area === a ? "" : a)}
              className={`px-5 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
                area === a
                  ? "bg-[#B8922E] text-[#0f0f1a]"
                  : "bg-[#1a1a2e] text-[#e0e0e0] border border-[rgba(184,146,46,0.3)] hover:border-[#B8922E]"
              }`}
            >
              {a}
            </button>
          ))}
        </div>

        {/* Filters Panel */}
        {showFilters && (
          <div className="bg-[#1a1a2e] rounded-2xl p-4 mb-4 border border-[rgba(184,146,46,0.3)]">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold flex items-center gap-2 text-[#D9BC6A]">
                <SlidersHorizontal className="w-4 h-4" /> Filtros
              </h3>
              <button onClick={() => setShowFilters(false)} className="flex items-center justify-center w-11 h-11 hover:bg-[rgba(184,146,46,0.1)] rounded-xl text-[#D9BC6A]">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-[#D9BC6A] mb-1 block">Categoría</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full border border-[rgba(184,146,46,0.3)] rounded-xl px-3 py-2 text-sm bg-[#0f0f1a] text-[#e0e0e0]"
                >
                  <option value="">Todas</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-[#D9BC6A] mb-1 block">Equipo</label>
                <select
                  value={device}
                  onChange={(e) => setDevice(e.target.value)}
                  className="w-full border border-[rgba(184,146,46,0.3)] rounded-xl px-3 py-2 text-sm bg-[#0f0f1a] text-[#e0e0e0]"
                >
                  <option value="">Todos</option>
                  {devices.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-[#D9BC6A] mb-1 block">Marca</label>
                <select
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  className="w-full border border-[rgba(184,146,46,0.3)] rounded-xl px-3 py-2 text-sm bg-[#0f0f1a] text-[#e0e0e0]"
                >
                  <option value="">Todas</option>
                  {brands.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Quick Filters */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {category && (
            <span className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-full bg-[#B8922E]/15 text-[#B8922E]">
              <Wrench className="w-3.5 h-3.5" /> {category}
              <button onClick={() => setCategory("")} className="ml-1 flex items-center justify-center w-6 h-6 rounded-full hover:bg-[#B8922E]/20 transition-colors">
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {device && (
            <span className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-full bg-[#B8922E]/15 text-[#B8922E]">
              <Tag className="w-3.5 h-3.5" /> {device}
              <button onClick={() => setDevice("")} className="ml-1 flex items-center justify-center w-6 h-6 rounded-full hover:bg-[#B8922E]/20 transition-colors">
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {brand && (
            <span className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-full bg-[#B8922E]/15 text-[#B8922E]">
              <Tag className="w-3.5 h-3.5" /> {brand}
              <button onClick={() => setBrand("")} className="ml-1 flex items-center justify-center w-6 h-6 rounded-full hover:bg-[#B8922E]/20 transition-colors">
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {provincia && (
            <span className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-full bg-[#B8922E]/15 text-[#B8922E]">
              <MapPin className="w-3.5 h-3.5" /> {provincia}
              <button onClick={() => setProvincia("")} className="ml-1 flex items-center justify-center w-6 h-6 rounded-full hover:bg-[#B8922E]/20 transition-colors">
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
        </div>

        {/* Results */}
        {loading ? (
          <div className="text-center py-12 text-[#D9BC6A]">Buscando...</div>
        ) : results.length > 0 ? (
          <div className="grid gap-4">
            {results.map((r) => (
              <ProCard key={r.id} result={r} />
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-[rgba(15,15,26,0.5)]">
            {area || provincia
              ? "No se encontraron resultados. Intenta con otros filtros."
              : "Seleccioná un área o ubicación para comenzar."}
          </div>
        )}

        {/* Suggestions */}
        {suggestions.length > 0 && (
          <div className="mt-6 p-4 bg-white rounded-2xl border border-[rgba(15,15,26,0.1)]">
            <h4 className="text-sm font-medium mb-2 text-[rgba(15,15,26,0.7)]">Sugerencias:</h4>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => {
                    if (s.params.provincia !== undefined) setProvincia(s.params.provincia);
                    if (s.params.ciudad !== undefined) setCiudad(s.params.ciudad);
                  }}
                  className="text-xs px-4 py-2.5 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

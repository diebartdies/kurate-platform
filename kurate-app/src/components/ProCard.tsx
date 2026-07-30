import { Link } from "react-router-dom";
import { BadgeCheck, MapPin, Star } from "lucide-react";
import { deviceLabel } from "../lib/taxonomy";
import ContactIcons from "./ContactIcons";
import type { ProResult } from "../types";

interface ProCardProps {
  result: ProResult;
}

export default function ProCard({ result }: ProCardProps) {
  const p = result;
  return (
    <Link
      to={`/profesional/${p.id}`}
      className="group block bg-white border border-[rgba(15,15,26,0.1)] rounded-3xl p-5 hover:border-[#e94560]/40 hover:shadow-[0_20px_50px_-35px_rgba(20,33,30,0.5)] transition-all duration-300 select-none"
      aria-label={p.alias}
      data-pro-id={p.id}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="flex gap-4">
        {p.photo ? (
          <img
            src={p.photo}
            alt={p.alias}
            className="w-20 h-20 rounded-2xl object-cover shrink-0"
          />
        ) : (
          <div className="w-20 h-20 rounded-2xl bg-[#e94560]/10 shrink-0 flex items-center justify-center text-xl font-semibold text-[#e94560]">
            {p.alias?.[0]}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="font-semibold truncate">{p.alias}</h3>
            {!p.mustMatch && p.brandMatched && (
              <BadgeCheck className="w-4 h-4 text-[#e94560] shrink-0" />
            )}
          </div>
          <p className="text-sm text-[rgba(15,15,26,0.55)] truncate">{p.bio}</p>
          <div className="mt-2 flex items-center gap-4 text-xs text-[rgba(15,15,26,0.5)]">
            <span className="flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5" />
              {p.location || "Sin ubicación"}
            </span>
            {p.averageRating > 0 && (
              <span className="flex items-center gap-1">
                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                {p.averageRating.toFixed(1)}
              </span>
            )}
          </div>
        </div>
        {result.pct != null && (
          <div className="text-right shrink-0">
            <div className="text-2xl font-semibold text-[#e94560] tabular-nums">
              {result.pct}%
            </div>
            <div className="text-[10px] uppercase tracking-widest text-[rgba(15,15,26,0.4)]">
              afinidad
            </div>
          </div>
        )}
      </div>
      {result.brandMatched && (
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="text-[11px] px-2.5 py-1 rounded-full bg-[#e94560]/8 text-[#e94560]">
            Marca exacta
          </span>
        </div>
      )}
      {result.brandGeneric && !result.brandMatched && (
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="text-[11px] px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">
            Repara esa categoría
          </span>
        </div>
      )}
      <div className="mt-3 text-[11px] text-[rgba(15,15,26,0.4)] truncate">
        {p.services.slice(0, 5).map(deviceLabel).join(" · ")}
      </div>
      <ContactIcons phone={p.phone} email={p.email} alias={p.alias} />
    </Link>
  );
}

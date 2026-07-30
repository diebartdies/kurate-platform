import { Link } from "react-router-dom";
import { BadgeCheck } from "lucide-react";
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
      className="group block hogar-card"
      aria-label={p.alias}
      data-pro-id={p.id}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="treasure-img-container">
        {p.photo ? (
          <img
            src={p.photo}
            alt={p.alias}
            className="treasure-img"
            loading="lazy"
          />
        ) : (
          <div className="treasure-img flex items-center justify-center bg-[#1a1a2e]">
            <img src="/images/reparacion.png" alt="" className="w-16 h-16 opacity-30" />
          </div>
        )}
        <div className="treasure-caption">
          <span className="treasure-caption-alias">
            {p.alias}
            {!p.mustMatch && p.brandMatched && (
              <BadgeCheck className="w-4 h-4 text-[#B8922E] inline ml-1" />
            )}
          </span>
          {p.location && (
            <span className="treasure-caption-location">{p.location}</span>
          )}
          {p.averageRating > 0 && (
            <span className="treasure-caption-specialty">
              ★ {p.averageRating.toFixed(1)}
            </span>
          )}
        </div>
      </div>
      <div className="p-3">
        <div className="flex items-center gap-2 mb-2">
          {result.pct != null && (
            <span className="text-sm font-bold text-[#B8922E]">
              {result.pct}% afinidad
            </span>
          )}
          {result.brandMatched && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#B8922E]/15 text-[#B8922E]">
              Marca exacta
            </span>
          )}
          {result.brandGeneric && !result.brandMatched && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-900/30 text-amber-400">
              Repara categoría
            </span>
          )}
        </div>
        <ContactIcons
          phone={p.phone}
          email={p.email}
          alias={p.alias}
          hasWhatsApp={true}
        />
      </div>
    </Link>
  );
}

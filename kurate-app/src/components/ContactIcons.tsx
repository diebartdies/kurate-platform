import { useState, useCallback } from "react";
import { Phone, MessageCircle, Mail, Copy, Check } from "lucide-react";

interface ContactIconsProps {
  phone?: string | null;
  email?: string;
  alias: string;
}

export default function ContactIcons({ phone, email, alias }: ContactIconsProps) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const handleReveal = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setRevealed(true);
  }, []);

  const handleCopy = useCallback((text: string, type: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    });
  }, []);

  if (!phone && !email) return null;

  const whatsappNumber = phone?.replace(/[^0-9]/g, "");

  return (
    <div className="mt-3 flex items-center gap-2" onClick={(e) => e.preventDefault()}>
      {!revealed ? (
        <button
          onClick={handleReveal}
          className="text-[11px] px-3 py-1.5 rounded-full bg-[#0f0f1a]/5 hover:bg-[#0f0f1a]/10 text-[rgba(15,15,26,0.6)] transition-colors font-medium"
        >
          Ver contacto
        </button>
      ) : (
        <div className="flex items-center gap-1.5">
          {phone && (
            <>
              <a
                href={`tel:${phone}`}
                title={`Llamar a ${alias}`}
                className="p-1.5 rounded-lg hover:bg-green-50 text-green-600 transition-colors"
              >
                <Phone className="w-3.5 h-3.5" />
              </a>
              {copied !== "phone" ? (
                <button
                  onClick={(e) => handleCopy(phone, "phone", e)}
                  title="Copiar teléfono"
                  className="p-1.5 rounded-lg hover:bg-green-50 text-green-600/60 transition-colors"
                >
                  <Copy className="w-3 h-3" />
                </button>
              ) : (
                <span className="p-1.5 text-green-600">
                  <Check className="w-3 h-3" />
                </span>
              )}
              {whatsappNumber && (
                <a
                  href={`https://wa.me/${whatsappNumber}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`WhatsApp ${alias}`}
                  className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-600 transition-colors"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                </a>
              )}
            </>
          )}
          {email && (
            <>
              <a
                href={`mailto:${email}?subject=Consulta desde KuraTe`}
                title={`Email ${alias}`}
                className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-600 transition-colors"
              >
                <Mail className="w-3.5 h-3.5" />
              </a>
              {copied !== "email" ? (
                <button
                  onClick={(e) => handleCopy(email, "email", e)}
                  title="Copiar email"
                  className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-600/60 transition-colors"
                >
                  <Copy className="w-3 h-3" />
                </button>
              ) : (
                <span className="p-1.5 text-blue-600">
                  <Check className="w-3 h-3" />
                </span>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

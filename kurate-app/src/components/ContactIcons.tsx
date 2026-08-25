import { useState, useCallback } from "react";
import { Phone, MessageCircle, Mail, Copy, Check } from "lucide-react";

interface ContactIconsProps {
  phone?: string | null;
  email?: string;
  alias: string;
  hasWhatsApp?: boolean;
}

export default function ContactIcons({ phone, email, alias, hasWhatsApp = true }: ContactIconsProps) {
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
          className="flex items-center gap-2 text-xs px-4 py-2.5 rounded-full bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 transition-colors font-medium"
        >
          {hasWhatsApp && whatsappNumber && (
            <MessageCircle className="w-4 h-4" />
          )}
          Ver contacto
        </button>
      ) : (
        <div className="flex items-center gap-1">
          {phone && hasWhatsApp && whatsappNumber && (
            <>
              <a
                href={`https://wa.me/${whatsappNumber}`}
                target="_blank"
                rel="noopener noreferrer"
                title={`WhatsApp ${alias}`}
                className="flex items-center justify-center w-11 h-11 rounded-xl hover:bg-emerald-50 text-emerald-600 transition-colors"
              >
                <MessageCircle className="w-5 h-5" />
              </a>
              {copied !== "phone" ? (
                <button
                  onClick={(e) => handleCopy(whatsappNumber, "phone", e)}
                  title="Copiar WhatsApp"
                  className="flex items-center justify-center w-11 h-11 rounded-xl hover:bg-emerald-50 text-emerald-600/60 transition-colors"
                >
                  <Copy className="w-4 h-4" />
                </button>
              ) : (
                <span className="flex items-center justify-center w-11 h-11 text-emerald-600">
                  <Check className="w-4 h-4" />
                </span>
              )}
            </>
          )}
          {phone && (
            <a
              href={`tel:${phone}`}
              title={`Llamar a ${alias}`}
              className="flex items-center justify-center w-11 h-11 rounded-xl hover:bg-green-50 text-green-600 transition-colors"
            >
              <Phone className="w-5 h-5" />
            </a>
          )}
          {email && (
            <>
              <a
                href={`mailto:${email}?subject=Consulta desde KuraTe`}
                title={`Email ${alias}`}
                className="flex items-center justify-center w-11 h-11 rounded-xl hover:bg-blue-50 text-blue-600 transition-colors"
              >
                <Mail className="w-5 h-5" />
              </a>
              {copied !== "email" ? (
                <button
                  onClick={(e) => handleCopy(email, "email", e)}
                  title="Copiar email"
                  className="flex items-center justify-center w-11 h-11 rounded-xl hover:bg-blue-50 text-blue-600/60 transition-colors"
                >
                  <Copy className="w-4 h-4" />
                </button>
              ) : (
                <span className="flex items-center justify-center w-11 h-11 text-blue-600">
                  <Check className="w-4 h-4" />
                </span>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

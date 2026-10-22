const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');

const OUT_DIR = path.resolve(__dirname, '..', 'investor_materials');
const OUT_FILE = path.join(OUT_DIR, 'KuraTe_brochure.pdf');

const GOLD = '#B8922E';
const GOLD_LIGHT = '#D9BC6A';
const GOLD_DARK = '#7A5A14';
const GOLD_DEEP = '#4A3810';
const INK = '#1A1A1A';
const PAPER = '#FBF9F4';
const MUTED = '#6B6257';
const WHITE = '#FFFFFF';

const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>KuraTe — Brochure comercial</title>
<style>
  @page { size: A4; margin: 0; }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  html, body {
    font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .page {
    position: relative;
    width: 210mm;
    height: 297mm;
    overflow: hidden;
    page-break-after: always;
    break-after: page;
  }
  .page:last-child { page-break-after: auto; break-after: auto; }

  .cover {
    background:
      radial-gradient(120% 80% at 80% 8%, rgba(217,188,106,0.16) 0%, rgba(13,13,13,0) 58%),
      radial-gradient(90% 70% at 8% 96%, rgba(184,146,46,0.14) 0%, rgba(13,13,13,0) 60%),
      linear-gradient(160deg, #16130C 0%, #0D0D0D 52%, #08080A 100%);
    color: #F5F5F5;
    padding: 26mm 20mm 18mm;
    display: flex;
    flex-direction: column;
  }

  .inner {
    background: ${PAPER};
    color: ${INK};
    padding: 22mm 18mm 16mm;
    display: flex;
    flex-direction: column;
  }

  .wordmark {
    font-size: 30pt;
    font-weight: 800;
    letter-spacing: -0.5pt;
    line-height: 1;
    background: linear-gradient(120deg, ${GOLD_LIGHT} 0%, ${GOLD} 46%, ${GOLD_DARK} 100%);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    color: ${GOLD};
  }
  .wordmark.light { -webkit-text-fill-color: ${GOLD_LIGHT}; background: none; color: ${GOLD_LIGHT}; }

  .brandbar { display: flex; align-items: center; gap: 4mm; }
  .branddot {
    width: 4mm; height: 4mm; border-radius: 50%;
    background: ${GOLD};
    box-shadow: 0 0 0 1.2mm rgba(184,146,46,0.22);
  }

  .eyebrow {
    font-size: 8pt;
    letter-spacing: 2.4pt;
    text-transform: uppercase;
    font-weight: 700;
    color: ${GOLD_DARK};
  }
  .cover .eyebrow { color: ${GOLD_LIGHT}; }

  h1 { font-size: 30pt; line-height: 1.12; font-weight: 800; letter-spacing: -0.6pt; }
  h2 { font-size: 19pt; line-height: 1.18; font-weight: 800; letter-spacing: -0.3pt; }
  h3 { font-size: 11pt; font-weight: 700; }

  .lead { font-size: 11.5pt; line-height: 1.6; color: #D9D6CF; }
  .inner .lead { color: ${MUTED}; }

  .rule { height: 0.7mm; width: 22mm; background: ${GOLD}; border-radius: 1mm; }
  .cover .rule { background: ${GOLD_LIGHT}; }

  .cover-mid { margin-top: auto; }

  .tagline {
    font-size: 15pt; line-height: 1.45; font-weight: 600;
    color: ${WHITE}; max-width: 145mm;
  }
  .tagline em { font-style: normal; color: ${GOLD_LIGHT}; }

  .cover-foot {
    margin-top: 14mm; padding-top: 6mm;
    border-top: 0.3mm solid rgba(217,188,106,0.28);
    display: flex; justify-content: space-between; align-items: flex-end; gap: 8mm;
  }
  .cover-foot .k { font-size: 7.5pt; letter-spacing: 1.6pt; text-transform: uppercase; color: #8E8778; }
  .cover-foot .v { font-size: 10pt; font-weight: 600; color: ${WHITE}; margin-top: 1.5mm; }

  .head { margin-bottom: 9mm; }
  .head h2 { margin-top: 3.5mm; }

  .cols { display: flex; gap: 9mm; }
  .col { flex: 1; min-width: 0; }

  .card {
    background: ${WHITE};
    border: 0.25mm solid #E6DFD0;
    border-left: 1.1mm solid ${GOLD};
    border-radius: 1.6mm;
    padding: 5.5mm 5.5mm;
  }
  .card h3 { color: ${GOLD_DEEP}; margin-bottom: 2mm; }
  .card p { font-size: 9pt; line-height: 1.55; color: ${MUTED}; }

  .stack { display: flex; flex-direction: column; gap: 4.5mm; }

  .numlist { display: flex; flex-direction: column; gap: 5mm; }
  .numrow { display: flex; gap: 4.5mm; align-items: flex-start; }
  .num {
    flex: 0 0 auto;
    width: 9mm; height: 9mm; border-radius: 50%;
    background: linear-gradient(145deg, ${GOLD_LIGHT}, ${GOLD} 55%, ${GOLD_DARK});
    color: ${WHITE}; font-size: 10.5pt; font-weight: 800;
    display: flex; align-items: center; justify-content: center;
  }
  .numrow h3 { margin-bottom: 1.2mm; }
  .numrow p { font-size: 9pt; line-height: 1.5; color: ${MUTED}; }

  .quote {
    background: linear-gradient(145deg, #16130C, #0D0D0D);
    color: #E8E5DE;
    border-radius: 2.4mm;
    padding: 8mm 7mm;
  }
  .quote .q {
    font-family: "Consolas", "Courier New", monospace;
    font-size: 10pt; line-height: 1.5; color: ${GOLD_LIGHT};
    background: rgba(217,188,106,0.07);
    border-left: 0.9mm solid ${GOLD};
    padding: 3.5mm 4mm; border-radius: 0 1.4mm 1.4mm 0;
  }
  .quote p.cap { font-size: 8.5pt; color: #8E8778; margin-top: 4mm; line-height: 1.5; }

  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 2.8mm 3mm; font-size: 8.8pt; }
  thead th {
    background: #16130C; color: ${GOLD_LIGHT};
    font-size: 7.6pt; letter-spacing: 1.4pt; text-transform: uppercase; font-weight: 700;
  }
  tbody tr { border-bottom: 0.2mm solid #E6DFD0; }
  tbody tr:nth-child(even) { background: #F5F1E8; }
  td { color: ${INK}; }
  td.m { color: ${MUTED}; }
  .tablewrap { border-radius: 1.6mm; overflow: hidden; border: 0.25mm solid #E6DFD0; }

  .badges { display: flex; flex-wrap: wrap; gap: 3mm; margin-top: 3mm; }
  .badge {
    font-size: 8.4pt; font-weight: 600; color: ${GOLD_DEEP};
    background: #F3EAD3; border: 0.25mm solid #E0D2AC;
    border-radius: 20mm; padding: 1.6mm 4.5mm;
  }

  ul.ticks { list-style: none; }
  ul.ticks li {
    position: relative; padding-left: 6.5mm; margin-bottom: 2.8mm;
    font-size: 9.2pt; line-height: 1.5; color: ${INK};
  }
  ul.ticks li::before {
    content: ""; position: absolute; left: 0; top: 1.5mm;
    width: 3.2mm; height: 3.2mm; border-radius: 50%;
    background: ${GOLD};
  }

  .split { display: flex; gap: 8mm; }
  .panel {
    flex: 1; min-width: 0;
    border: 0.25mm solid #E6DFD0; border-radius: 2mm;
    padding: 6mm 5.5mm; background: ${WHITE};
  }
  .panel.alt { background: #F5F1E8; border-color: #E0D2AC; }
  .panel h3 {
    color: ${GOLD_DEEP}; font-size: 12pt; margin-bottom: 1.5mm;
    padding-bottom: 2.5mm; border-bottom: 0.5mm solid ${GOLD};
  }
  .panel ul.ticks li { font-size: 9pt; margin-bottom: 2.4mm; }
  .panel ul.ticks li::before { background: ${GOLD_DARK}; }

  .cta {
    background: linear-gradient(145deg, ${GOLD} 0%, ${GOLD_DARK} 100%);
    color: ${WHITE};
    border-radius: 2.4mm;
    padding: 9mm 8mm;
    text-align: center;
  }
  .cta .big { font-size: 17pt; font-weight: 800; letter-spacing: -0.2pt; }
  .cta .url {
    font-size: 13pt; font-weight: 700; margin-top: 3.5mm;
    text-decoration: none; color: ${WHITE};
  }
  .cta .mail { font-size: 9.5pt; margin-top: 1.5mm; color: #F3EAD3; }
  .cta .fine { font-size: 7.6pt; margin-top: 4mm; color: #EFE3C4; }

  .foot {
    position: absolute; left: 18mm; right: 18mm; bottom: 9mm;
    display: flex; justify-content: space-between; align-items: center;
    font-size: 7.4pt; color: #A49B8B;
    border-top: 0.2mm solid #E6DFD0; padding-top: 3mm;
  }
  .foot .brandmark { font-weight: 800; color: ${GOLD_DARK}; letter-spacing: -0.2pt; }
  .spacer { flex: 1; }
</style>
</head>
<body>

<section class="page cover">
  <div class="brandbar">
    <div class="branddot"></div>
    <div class="wordmark light">KuraTe</div>
  </div>

  <div class="cover-mid">
    <div class="eyebrow" style="margin-bottom:6mm">Marketplace de servicios profesionales</div>
    <h1 style="max-width:150mm">El motor de confianza para servicios profesionales</h1>
    <div class="rule" style="margin:8mm 0 7mm"></div>
    <p class="lead" style="max-width:132mm">
      Contanos qu&eacute; necesit&aacute;s y te encontramos al profesional ideal.
      Verificaci&oacute;n, b&uacute;squeda inteligente por necesidad y contacto protegido,
      en toda la Argentina. No es un simple listado: es el sistema que conecta
      cada pedido con la persona correcta.
    </p>

    <div class="tagline" style="margin-top:10mm">
      &ldquo;heladera Gafa no enfr&iacute;a,<br>zona Villa Urquiza&rdquo;
      <br><em>&rarr; un técnico verificado, a metros.</em>
    </div>
  </div>

  <div class="cover-foot">
    <div>
      <div class="k">Sitio web</div>
      <div class="v">kurate.drsrv.net.ar</div>
    </div>
    <div style="text-align:right">
      <div class="k">Contacto</div>
      <div class="v">admin@drsrv.net.ar</div>
    </div>
  </div>
</section>

<section class="page inner">
  <div class="head">
    <div class="eyebrow">Qu&eacute; es</div>
    <h2>Un sistema operativo completo para conectar clientes con profesionales</h2>
    <div class="rule" style="margin-top:5mm"></div>
  </div>

  <p class="lead" style="max-width:160mm;margin-bottom:7mm">
    KuraTe resuelve el problema real del rubro: la desconfianza. Cada profesional
    pasa por verificaci&oacute;n, cada contacto est&aacute; protegido, cada b&uacute;squeda
    se responde por necesidad real y no por palabras sueltas.
  </p>

  <div class="stack">
    <div class="card">
      <h3>B&uacute;squeda por necesidad, no por palabra clave</h3>
      <p>El usuario describe el problema en lenguaje natural. El motor entiende la
      intenci&oacute;n, resuelve sin&oacute;nimos, detecta la zona y ordena por relevancia real.</p>
    </div>
    <div class="card">
      <h3>Profesionales verificados</h3>
      <p>Identidad validada, historial de actividad y datos de contacto verificados.
      Un nivel de calidad visible en cada tarjeta del directorio.</p>
    </div>
    <div class="card">
      <h3>Contacto protegido</h3>
      <p>Los n&uacute;meros de WhatsApp y tel&eacute;fono nunca se exponen en el c&oacute;digo de la
      p&aacute;gina: se entregan a trav&eacute;s de un redirect controlado por el servidor.</p>
    </div>
    <div class="card">
      <h3>Trazabilidad real</h3>
      <p>Registro de actividad server-side: cada acci&oacute;n sensible queda auditada,
      y los cambios cr&iacute;ticos devuelven el perfil a estado pendiente de re-verificaci&oacute;n.</p>
    </div>
  </div>

  <div class="foot"><span class="brandmark">KuraTe</span><span class="spacer"></span><span>02</span></div>
</section>

<section class="page inner">
  <div class="head">
    <div class="eyebrow">C&oacute;mo funciona</div>
    <h2>Cuatro pasos, del problema a la soluci&oacute;n</h2>
    <div class="rule" style="margin-top:5mm"></div>
  </div>

  <div class="numlist" style="margin-bottom:8mm">
    <div class="numrow">
      <div class="num">1</div>
      <div>
        <h3>El cliente describe lo que necesita</h3>
        <p>Texto libre, con la zona donde ocurre. No hace falta saber el nombre t&eacute;cnico
        del problema ni el modelo del aparato.</p>
      </div>
    </div>
    <div class="numrow">
      <div class="num">2</div>
      <div>
        <h3>El motor interpreta la necesidad</h3>
        <p>Taxonom&iacute;a de servicios, extracci&oacute;n de palabras clave, sin&oacute;nimos
        (&ldquo;heladera&rdquo; &rarr; &ldquo;refrigerador&rdquo; / &ldquo;frigider&rdquo;) y filtrado por ubicaci&oacute;n.</p>
      </div>
    </div>
    <div class="numrow">
      <div class="num">3</div>
      <div>
        <h3>Se ordenan los profesionales por relevancia</h3>
        <p>Scoring ponderado: servicio specialization, descripci&oacute;n, ubicaci&oacute;n exacta,
        reputaci&oacute;n y disponibilidad actual.</p>
      </div>
    </div>
    <div class="numrow">
      <div class="num">4</div>
      <div>
        <h3>Contacto directo y seguro</h3>
        <p>El cliente accede al perfil p&uacute;blico del profesional y escribe por
        WhatsApp o Telegram. El n&uacute;mero real nunca estuvo expuesto.</p>
      </div>
    </div>
  </div>

  <div class="quote">
    <div class="q">"el lavarropas no prende, es de 2018 y necesito a alguien hoy"</div>
    <p class="cap">Una sola frase. El motor detecta electrodom&eacute;stico, modelo, antig&uuml;edad
    y urgencia, y devuelve los t&eacute;cnicos de la zona con disponibilidad activa.</p>
  </div>

  <div class="foot"><span class="brandmark">KuraTe</span><span class="spacer"></span><span>03</span></div>
</section>

<section class="page inner">
  <div class="head">
    <div class="eyebrow">Dos p&uacute;blicos</div>
    <h2>Un lado para el cliente, otro para el profesional</h2>
    <div class="rule" style="margin-top:5mm"></div>
  </div>

  <div class="split" style="margin-bottom:8mm">
    <div class="panel">
      <h3>Para quien contrata</h3>
      <ul class="ticks">
        <li>Encuentra t&eacute;cnicos por zona real, no por zona declarada</li>
        <li>Compara specialties, marcas y disponibilidad</li>
        <li>Sabe qui&eacute;n est&aacute; disponible en este momento</li>
        <li>Contacto directo sin intermediarios ni comisiones invisibles</li>
        <li>Perfiles p&uacute;blicos indexables para compartir y verificar</li>
      </ul>
    </div>
    <div class="panel alt">
      <h3>Para el profesional</h3>
      <ul class="ticks">
        <li>Registro gratuito, sin costo de entrada</li>
        <li>Perfil p&uacute;blico propio con SEO por zona</li>
        <li>Especialidades, marcas y &aacute;reas de cobertura configurables</li>
        <li>Contacto por WhatsApp y Telegram, n&uacute;mero protegido</li>
        <li>Nivel de calidad visible seg&uacute;n actividad y verificaci&oacute;n</li>
      </ul>
    </div>
  </div>

  <h3 style="margin-bottom:3mm;color:${GOLD_DEEP}">Directorio de t&eacute;cnicos de hogar y oficina</h3>
  <p class="lead" style="font-size:9.6pt;margin-bottom:5mm">
    Filtros por &aacute;rea (hogar, oficina, PyME, industria), acci&oacute;n a realizar,
    categor&iacute;a, disponibilidad, servicio y marca. Cada t&eacute;cnico declara
    qu&eacute; sabe hacer, d&oacute;nde trabaja y cu&aacute;ndo est&aacute; disponible.
  </p>

  <div class="badges">
    <span class="badge">Heladeras y freezers</span>
    <span class="badge">Lavadoras y secadoras</span>
    <span class="badge">L&iacute;nea blanca</span>
    <span class="badge">Climatizaci&oacute;n</span>
    <span class="badge">Electricidad</span>
    <span class="badge">Gas y calderas</span>
    <span class="badge">Carpinter&iacute;a</span>
    <span class="badge">Pintura</span>
    <span class="badge">Plomer&iacute;a</span>
    <span class="badge">Piletas</span>
    <span class="badge">Tanques y bombas</span>
    <span class="badge">Jardiner&iacute;a</span>
  </div>

  <div class="foot"><span class="brandmark">KuraTe</span><span class="spacer"></span><span>04</span></div>
</section>

<section class="page inner">
  <div class="head">
    <div class="eyebrow">Confianza</div>
    <h2>Seguridad y trazabilidad, no promesas</h2>
    <div class="rule" style="margin-top:5mm"></div>
  </div>

  <div class="split" style="margin-bottom:7mm">
    <div class="col">
      <ul class="ticks">
        <li><b>Contact shield</b> &mdash; WhatsApp y tel&eacute;fono se entregan por redirect
        de API, nunca en el HTML</li>
        <li><b>Panel de administraci&oacute;n restringido</b> &mdash; acceso solo desde redes privadas,
        con registro de actividad</li>
        <li><b>Rate limiting</b> &mdash; l&iacute;mites por IP en API y autenticaci&oacute;n</li>
        <li><b>Registro de visitas</b> &mdash; cada sesi&oacute;n an&oacute;nima queda auditada</li>
        <li><b>Re-verificaci&oacute;n</b> &mdash; los cambios sensibles reinician la aprobaci&oacute;n</li>
      </ul>
    </div>
    <div class="col">
      <div class="quote" style="height:100%;display:flex;flex-direction:column;justify-content:center">
        <div class="q" style="border-left-color:${GOLD_LIGHT}">JWT httpOnly<br>Helmet CSP<br>bcrypt<br>rate-limit</div>
        <p class="cap">Pr&aacute;cticas est&aacute;ndar de un producto real, no de una demo.</p>
      </div>
    </div>
  </div>

  <h3 style="margin-bottom:3mm;color:${GOLD_DEEP}">Presencia org&aacute;nica por ubicaci&oacute;n</h3>
  <div class="tablewrap">
    <table>
      <thead>
        <tr><th style="width:34%">Capa</th><th>Qu&eacute; aporta</th></tr>
      </thead>
      <tbody>
        <tr><td><b>URLs por zona</b></td><td class="m">Provincia, ciudad y barrio en la propia direcci&oacute;n</td></tr>
        <tr><td><b>Perfil p&uacute;blico</b></td><td class="m">P&aacute;gina indexable por profesional, lista para compartir</td></tr>
        <tr><td><b>Sitemap din&aacute;mico</b></td><td class="m">Generado desde la base de datos, siempre al d&iacute;a</td></tr>
        <tr><td><b>OpenGraph</b></td><td class="m">Vista previa rica al compartir en WhatsApp y redes</td></tr>
      </tbody>
    </table>
  </div>

  <div class="foot"><span class="brandmark">KuraTe</span><span class="spacer"></span><span>05</span></div>
</section>

<section class="page inner">
  <div class="head">
    <div class="eyebrow">Modelo de negocio</div>
    <h2>Empieza gratis, crece con tus clientes</h2>
    <div class="rule" style="margin-top:5mm"></div>
  </div>

  <div class="numlist" style="margin-bottom:8mm">
    <div class="numrow">
      <div class="num">1</div>
      <div>
        <h3>Registro gratuito</h3>
        <p>El profesional se da de alta sin costo y ya aparece en el directorio de su zona.</p>
      </div>
    </div>
    <div class="numrow">
      <div class="num">2</div>
      <div>
        <h3>Per&iacute;odo de evaluaci&oacute;n</h3>
        <p>Mes de prueba para medir la demanda real de la zona antes de decidir.</p>
      </div>
    </div>
    <div class="numrow">
      <div class="num">3</div>
      <div>
        <h3>Visibilidad destacada</h3>
        <p>Posiciones preferentes y publicidad curada dentro de cada &aacute;rea y zona.</p>
      </div>
    </div>
    <div class="numrow">
      <div class="num">4</div>
      <div>
        <h3>Motor reutilizable</h3>
        <p>La plataforma es white-label: el mismo motor sirve para servicios t&eacute;cnicos,
        profesionales liberales, est&eacute;tica, educaci&oacute;n, salud o real estate.</p>
      </div>
    </div>
  </div>

  <div class="cta">
    <div class="k eyebrow" style="color:#F3EAD3">Empez&aacute; hoy</div>
    <div class="big" style="margin-top:3mm">Registrate como profesional</div>
    <div class="url">kurate.drsrv.net.ar</div>
    <div class="mail">admin@drsrv.net.ar</div>
    <div class="fine">Alta gratuita &middot; Perfil p&uacute;blico con SEO por zona &middot; Contacto protegido</div>
  </div>

  <div class="foot"><span class="brandmark">KuraTe</span><span class="spacer"></span><span>06</span></div>
</section>

</body>
</html>`;

const PREVIEW_DIR = path.join(OUT_DIR, 'preview');

async function auditOverflow(page) {
  const report = await page.evaluate(() => {
    const MM = 96 / 25.4;
    const out = [];
    document.querySelectorAll('.page').forEach((sec, i) => {
      const box = sec.getBoundingClientRect();
      const issues = [];

      if (sec.scrollHeight > sec.clientHeight + 1) {
        issues.push(`scrollHeight ${sec.scrollHeight} > ${(sec.clientHeight / MM).toFixed(1)}mm`);
      }
      if (sec.scrollWidth > sec.clientWidth + 1) {
        issues.push(`scrollWidth ${sec.scrollWidth} > ${(sec.clientWidth / MM).toFixed(1)}mm`);
      }

      sec.querySelectorAll('*').forEach((el) => {
        if (el.classList.contains('foot')) return;
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return;
        const bottom = r.bottom - box.bottom;
        const right = r.right - box.right;
        if (bottom > 1.5) {
          issues.push(`${el.tagName}.${el.className || '-'} overflows bottom by ${(bottom / MM).toFixed(1)}mm`);
        }
        if (right > 1.5) {
          issues.push(`${el.tagName}.${el.className || '-'} overflows right by ${(right / MM).toFixed(1)}mm`);
        }
      });

      const foot = sec.querySelector('.foot');
      if (foot) {
        const fr = foot.getBoundingClientRect();
        const first = sec.querySelector('.head, .cover-mid');
        if (first && first.getBoundingClientRect().bottom > fr.top - 4) {
          issues.push('content collides with footer');
        }
      }

      out.push({ page: i + 1, issues: [...new Set(issues)] });
    });
    return out;
  });

  let clean = true;
  for (const r of report) {
    if (r.issues.length) {
      clean = false;
      console.log(`PAGE ${r.page}  ${r.issues.length} issue(s)`);
      r.issues.slice(0, 8).forEach((s) => console.log(`   - ${s}`));
    } else {
      console.log(`PAGE ${r.page}  ok`);
    }
  }
  return clean;
}

async function main() {
  const preview = process.argv.includes('--preview');
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=none']
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.evaluateHandle('document.fonts.ready');

    const clean = await auditOverflow(page);
    if (!clean) console.log('LAYOUT: overflow detected');

    if (preview) {
      fs.mkdirSync(PREVIEW_DIR, { recursive: true });
      const sections = await page.$$('.page');
      for (let i = 0; i < sections.length; i++) {
        const out = path.join(PREVIEW_DIR, `page-${String(i + 1).padStart(2, '0')}.png`);
        await sections[i].screenshot({ path: out });
        console.log(`PNG ${out}`);
      }
    }

    await page.pdf({
      path: OUT_FILE,
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 }
    });

    const sizeKb = Math.round(fs.statSync(OUT_FILE).size / 1024);
    console.log(`OK  ${OUT_FILE}  (${sizeKb} KB)`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('FAIL', err.message);
  process.exit(1);
});
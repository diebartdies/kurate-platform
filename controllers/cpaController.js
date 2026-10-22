/**
 * Proxy to Correo Argentino's public CPA web service so the app can auto-fill
 * Código Postal (CPA) from an address without shipping the (huge) national
 * street dictionary. If Correo is unreachable the lookup simply fails and the
 * field stays editable.
 *
 * The lookup itself lives in utils/cpaLookup.js so the same code can be reused
 * server-side (auto-completing the CP when publishing an aviso) without an
 * HTTP loopback call. This controller only maps the result to the response.
 *
 * Reference: https://www.correoargentino.com.ar/formularios/cpa
 */

const { lookupCpa, normalize, stripStreetType, PROVINCE_TO_LETTER } = require('../utils/cpaLookup');

exports.lookup = async (req, res) => {
  try {
    const { province, city, street, number } = req.body || {};
    if (!PROVINCE_TO_LETTER[normalize(province)]) {
      return res.status(400).json({ success: false, error: 'Provincia no reconocida' });
    }
    if (!stripStreetType(street)) {
      return res.status(400).json({ success: false, error: 'Falta la calle' });
    }
    if (!/^[0-9]{1,10}$/.test(String(number || '').trim())) {
      return res.status(400).json({ success: false, error: 'La altura debe ser numérica' });
    }

    const cpa = await lookupCpa({ province, city, street, number });
    if (!cpa) {
      return res.status(200).json({ success: false, error: 'No se encontró el CPA para esa dirección', source: 'correo' });
    }
    res.json({ success: true, cpa, source: 'correo' });
  } catch (err) {
    res.status(502).json({ success: false, error: 'Servicio de CPA no disponible' });
  }
};

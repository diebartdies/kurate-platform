const cityCoordinates = {
  // CABA barrios
  'Agronomía': { lat: -34.5928, lng: -58.4972 },
  'Almagro': { lat: -34.6025, lng: -58.4372 },
  'Balvanera': { lat: -34.6069, lng: -58.3956 },
  'Barracas': { lat: -34.6500, lng: -58.3833 },
  'Belgrano': { lat: -34.5613, lng: -58.4556 },
  'Boedo': { lat: -34.6203, lng: -58.4428 },
  'Caballito': { lat: -34.6119, lng: -58.4542 },
  'Chacarita': { lat: -34.5878, lng: -58.4531 },
  'Coghlan': { lat: -34.5886, lng: -58.4736 },
  'Colegiales': { lat: -34.5739, lng: -58.4472 },
  'Constitución': { lat: -34.6333, lng: -58.3833 },
  'Flores': { lat: -34.6256, lng: -58.4669 },
  'Floresta': { lat: -34.6311, lng: -58.4744 },
  'La Boca': { lat: -34.6333, lng: -58.3500 },
  'Liniers': { lat: -34.6139, lng: -58.5128 },
  'Mataderos': { lat: -34.6528, lng: -58.5139 },
  'Monserrat': { lat: -34.6167, lng: -58.3833 },
  'Monte Castro': { lat: -34.6328, lng: -58.4611 },
  'Núñez': { lat: -34.5378, lng: -58.4628 },
  'Palermo': { lat: -34.5789, lng: -58.4274 },
  'Parque Avellaneda': { lat: -34.6444, lng: -58.4611 },
  'Parque Chacabuco': { lat: -34.6328, lng: -58.4389 },
  'Parque Chas': { lat: -34.5928, lng: -58.4728 },
  'Parque Patricios': { lat: -34.6333, lng: -58.4000 },
  'Puerto Madero': { lat: -34.6167, lng: -58.3633 },
  'Recoleta': { lat: -34.5886, lng: -58.3906 },
  'Retiro': { lat: -34.5894, lng: -58.3767 },
  'San Cristóbal': { lat: -34.6297, lng: -58.3875 },
  'San Nicolás': { lat: -34.6050, lng: -58.3764 },
  'San Telmo': { lat: -34.6267, lng: -58.3714 },
  'Vélez Sarsfield': { lat: -34.6233, lng: -58.4508 },
  'Versalles': { lat: -34.5633, lng: -58.5167 },
  'Villa Crespo': { lat: -34.5989, lng: -58.4472 },
  'Villa Devoto': { lat: -34.6013, lng: -58.5172 },
  'Villa General Mitre': { lat: -34.6039, lng: -58.4936 },
  'Villa Lugano': { lat: -34.6569, lng: -58.4756 },
  'Villa Luro': { lat: -34.6267, lng: -58.5039 },
  'Villa Ortúzar': { lat: -34.5928, lng: -58.4656 },
  'Villa Pueyrredón': { lat: -34.5981, lng: -58.4925 },
  'Villa Real': { lat: -34.5617, lng: -58.4789 },
  'Villa Riachuelo': { lat: -34.6728, lng: -58.4472 },
  'Villa Santa Rita': { lat: -34.6039, lng: -58.4833 },
  'Villa Soldati': { lat: -34.6692, lng: -58.4556 },
  'Villa Urquiza': { lat: -34.5949, lng: -58.4853 },
  'Villa del Parque': { lat: -34.6026, lng: -58.5257 },
  // Buenos Aires province (near CABA)
  'Vicente López': { lat: -34.5256, lng: -58.4789 },
  'San Isidro': { lat: -34.4722, lng: -58.5100 },
  'San Martín': { lat: -34.5736, lng: -58.5325 },
  'Tres de Febrero': { lat: -34.5989, lng: -58.5444 },
  'Morón': { lat: -34.6533, lng: -58.6189 },
  'Hurlingham': { lat: -34.6333, lng: -58.6333 },
  'Ituzaingó': { lat: -34.6611, lng: -58.6689 },
  'Merlo': { lat: -34.6667, lng: -58.7333 },
  'Lomas de Zamora': { lat: -34.7500, lng: -58.4000 },
  'Quilmes': { lat: -34.7167, lng: -58.2833 },
  'Avellaneda': { lat: -34.6628, lng: -58.3653 },
  'Lanús': { lat: -34.6972, lng: -58.3922 },
  'Florencio Varela': { lat: -34.7917, lng: -58.2778 },
  'Almirante Brown': { lat: -34.7917, lng: -58.3778 },
  'La Matanza': { lat: -34.6833, lng: -58.5833 },
  'San Miguel': { lat: -34.5400, lng: -58.7100 },
  'Malvinas Argentinas': { lat: -34.5333, lng: -58.7000 },
  'José C. Paz': { lat: -34.5167, lng: -58.7500 },
  'Moreno': { lat: -34.6500, lng: -58.7833 },
  'General Rodríguez': { lat: -34.6167, lng: -58.9333 },
  'Pilar': { lat: -34.4500, lng: -58.9167 },
  'Escobar': { lat: -34.3500, lng: -58.7500 },
  'Tigre': { lat: -34.4167, lng: -58.5833 },
  'San Fernando': { lat: -34.4333, lng: -58.5500 },
  'Luján': { lat: -34.5667, lng: -59.1000 },
  'Mercedes': { lat: -34.6500, lng: -59.4333 },
  'Chascomús': { lat: -35.5667, lng: -58.0167 },
  'Cañuelas': { lat: -35.0500, lng: -58.7333 },
  'Esteban Echeverría': { lat: -34.8167, lng: -58.4667 },
  'Ezeiza': { lat: -34.8500, lng: -58.5167 },
  'San Antonio de Areco': { lat: -34.2667, lng: -59.5000 },
  'Chivilcoy': { lat: -34.9000, lng: -60.0333 },
  // Generic CABA fallback
  'Buenos Aires': { lat: -34.6037, lng: -58.3816 },
  'Ciudad Autónoma de Buenos Aires': { lat: -34.6037, lng: -58.3816 },
  'CABA': { lat: -34.6037, lng: -58.3816 }
};

function getCityCoordinates(city) {
  if (!city) return null;
  const exact = cityCoordinates[city];
  if (exact) return exact;
  const key = Object.keys(cityCoordinates).find(
    k => k.toLowerCase() === city.toLowerCase()
  );
  return key ? cityCoordinates[key] : null;
}

function assignGpsToLocation(location) {
  if (!location || location.lat || !location.city) return location;
  const coords = getCityCoordinates(location.city);
  if (!coords) return location;
  const offsetLat = (Math.random() - 0.5) * 0.005;
  const offsetLng = (Math.random() - 0.5) * 0.005;
  location.lat = coords.lat + offsetLat;
  location.lng = coords.lng + offsetLng;
  return location;
}

module.exports = { cityCoordinates, getCityCoordinates, assignGpsToLocation };

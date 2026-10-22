/*
 * KuraTe - test de carga de la búsqueda pública (Gatling, JS DSL).
 *
 * Objetivo: verificar que los índices de `users` cortan la consulta.
 * El punto critico es /hogar/professionals, que antes del trabajo de
 * servicePaths usaba un regex anclado parcial y terminaba en collscan.
 * Con servicePaths la query es igualdad y deberia usar el indice.
 *
 * Correr (desde perf/gatling):
 *   npm install
 *   npx gatling run
 *
 * Sin instalar nada se puede correr el equivalente crude con el script Node
 * scripts/bench-search.js, que ya esta en el repo.
 */
import { scenario, exec, pause, constantUsersPerSec, rampUsersPerSec, atOnceUsers } from '@gatling/core';
import { http, check, status } from '@gatling/http';

const BASE = __ENV.BASE_URL || 'https://kurate.drsrv.net.ar';
const RAMP = __ENV.RAMP_USERS || 20;
const DURATION = __ENV.RAMP_DURATION || 30;

// Paths del arbol canonico. La mayoria son profundidad 3 (area/categoria/
// dispositivo): es el camino caliente que ahora resuelve por igualdad.
const AREAS = ['hogar', 'oficina', 'casa-campo', 'industria'];
const CATEGORIAS = [
  'hogar/linea-blanca',
  'hogar/linea-marron',
  'hogar/aire-acondicionado',
  'oficina/linea-blanca',
  'industria/linea-blanca'
];
const DISPOSITIVOS = [
  'hogar/linea-blanca/heladera',
  'hogar/linea-blanca/lavarropas',
  'hogar/linea-marron/smart-tv',
  'hogar/aire-acondicionado/airesplit',
  'oficina/linea-blanca/photocopier'
];
const PROFESIONES = ['gasista', 'electricista', 'plomero', 'electricista', 'pintor'];
const PROVINCIAS = ['CABA', 'Buenos Aires', 'Cordoba', 'Santa Fe', 'Mendoza'];

/** Query de busqueda, con los parametros que usa la UI. */
function searchQuery({ area, categoria, dispositivo, profession, matriculado, provincia, page }) {
  const q = [];
  if (area) q.push('area=' + encodeURIComponent(area));
  if (categoria) q.push('service=' + encodeURIComponent(categoria));
  if (dispositivo) q.push('service=' + encodeURIComponent(dispositivo));
  if (profession) q.push('profession=' + encodeURIComponent(profession));
  if (matriculado) q.push('matriculado=1');
  if (provincia) q.push('province=' + encodeURIComponent(provincia));
  if (page) q.push('page=' + page);
  return '/api/v1/hogar/professionals?' + q.join('&');
}

function aleatorio(lista) {
  return lista[Math.floor(Math.random() * lista.length)];
}

const httpProtocol = http
  .baseUrl(BASE)
  .acceptHeader('application/json')
  .header('Accept-Language', 'es-AR');

const chequeoOk = check(null, { 'responde 200': status().is(200) });
const chequeoJson = check(null, {
  'responde 200': status().is(200),
  'devuelve success': (r) => !!(r.body && r.body.success)
});

// --- Escenario 1: navegacion del arbol de servicios (el camino caliente) ---
const escNavegacion = scenario('Navegacion del arbol de servicios')
  .exec(
    http('GET area', searchQuery({ area: aleatorio(AREAS) })).check(chequeoJson)
  )
  .pause(500, 1500)
  .exec(
    http('GET categoria', searchQuery({ area: 'hogar', categoria: aleatorio(CATEGORIAS) })).check(chequeoJson)
  )
  .pause(500, 1500)
  .exec(
    http('GET dispositivo', searchQuery({ area: 'hogar', dispositivo: aleatorio(DISPOSITIVOS) })).check(chequeoJson)
  )
  .pause(500, 1500);

// --- Escenario 2: busqueda con filtro de matricula (indices compuestos) ---
const escMatricula = scenario('Busqueda por profesion y matricula')
  .exec(
    http('GET profesion', searchQuery({ area: 'hogar', profession: aleatorio(PROFESIONES) })).check(chequeoJson)
  )
  .pause(500, 1200)
  .exec(
    http('GET solo matriculados', searchQuery({ area: 'hogar', matriculado: true })).check(chequeoJson)
  )
  .pause(500, 1200)
  .exec(
    http('GET profesion + matriculado', searchQuery({
      area: 'hogar', profession: aleatorio(PROFESIONES), matriculado: true
    })).check(chequeoJson)
  )
  .pause(500, 1200);

// --- Escenario 3: filtros geograficos y paginado ---
const escGeo = scenario('Filtro geografico y paginado')
  .exec(
    http('GET por provincia', searchQuery({ area: 'hogar', provincia: aleatorio(PROVINCIAS) })).check(chequeoJson)
  )
  .pause(400, 1200)
  .exec(
    http('GET pagina 2', searchQuery({ area: 'hogar', page: 2 })).check(chequeoJson)
  )
  .pause(400, 1200);

export const setup = () => {
  // El analisis del indice se lee de la respuesta de explain de Mongo, no de
  // aqui. Este script solo genera carga; para el explain usar:
  //   node scripts/bench-search.js --explain
  return {};
};

export default function () {
  setUp(
    // Rampa hasta RAMP usuarios y sostenimiento, para ver donde se rompe.
    rampUsersPerSec(RAMP / 60).to(RAMP).during(DURATION).then(
      constantUsersPerSec(RAMP / 60).during(DURATION)
    ),
    escNavegacion,
    escMatricula,
    escGeo
  ).protocols(httpProtocol);
}

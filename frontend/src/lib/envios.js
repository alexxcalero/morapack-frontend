// Utilidades para trabajar con envíos y sus rutas

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "https://1inf54-981-5e.inf.pucp.edu.pe";

// Parser para fechas ISO sin timezone (viene en UTC+7, convertir a hora correcta)
function parseISOAsUTC(s) {
    if (!s) return null;
    const t = String(s).trim();
    // Detectar formato ISO: 2025-01-02T08:01:00
    const m = t.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/);
    if (!m) return null;
    const [, y, mo, day, hh, mm, ss] = m.map(x => parseInt(x, 10));
    // El backend envía en UTC+7, restar 7 horas para obtener UTC
    const utcMillis = Date.UTC(y, mo - 1, day, hh - 7, mm, ss);
    return new Date(utcMillis);
}

// Parser para fechas del backend en formato "yyyy-MM-dd HH:mm:ss±offset"
function parseBackendTime(s) {
    if (!s) return null;
    const t = String(s).trim();
    const m = t.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})(?:Z)?([+\-]?\d+)?$/);
    if (!m) {
        const d = new Date(t);
        return isNaN(d.getTime()) ? null : d;
    }
    const [, datePart, timePart, offStr] = m;
    const off = offStr ? parseInt(offStr, 10) : 0;
    const [y, mo, day] = datePart.split("-").map(x => parseInt(x, 10));
    const [hh, mm, ss] = timePart.split(":").map(x => parseInt(x, 10));
    const utcMillis = Date.UTC(y, mo - 1, day, hh - off, mm, ss);
    return new Date(utcMillis);
}

// Parser para fechas del planificador "yyyy-MM-dd HH:mm (UTC±hh:mm)"
function parsePlanificadorTime(s) {
    if (!s || typeof s !== "string") return null;
    const t = s.trim();
    const m = t.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}):(\d{2})(?:\s*\(UTC([+\-]\d{2}):(\d{2})\))?$/);
    if (!m) {
        const d = new Date(t.replace(/\s*\(UTC[^\)]+\)\s*$/, ""));
        return isNaN(d.getTime()) ? null : d;
    }
    const [, datePart, hhStr, mmStr, offHStr = "+00", offMStr = "00"] = m;
    const [y, mo, day] = datePart.split("-").map(x => parseInt(x, 10));
    const hh = parseInt(hhStr, 10), mm = parseInt(mmStr, 10);
    const offH = parseInt(offHStr, 10), offM = parseInt(offMStr, 10);
    const sign = offH >= 0 ? 1 : -1;
    const offsetMinutes = Math.abs(offH) * 60 + (offM || 0);
    const totalOffsetMs = sign * offsetMinutes * 60 * 1000;
    const localUtcMs = Date.UTC(y, mo - 1, day, hh, mm, 0);
    const utcMillis = localUtcMs - totalOffsetMs;
    return new Date(utcMillis);
}

/**
 * Obtiene los detalles completos de un envío incluyendo todas sus rutas
 * Un envío puede tener múltiples "partes asignadas", cada una con su propia ruta de vuelos
 * @param {number} envioId - ID del envío a consultar
 * @returns {Promise<Object>} Objeto con información del envío y sus rutas
 */
export async function obtenerRutasEnvio(envioId) {
    try {
        const response = await fetch(`${API_BASE}/api/envios/obtenerPorId/${envioId}`);

        if (!response.ok) {
            console.error(`Error al obtener envío ${envioId}:`, response.status);
            return null;
        }

        const envio = await response.json();

        if (!envio) {
            console.warn(`No se encontró el envío ${envioId}`);
            return null;
        }

        // Procesar las rutas de cada parte asignada
        const rutas = [];

        if (Array.isArray(envio.parteAsignadas)) {
            for (const parte of envio.parteAsignadas) {
                // Solo mostrar rutas de partes NO entregadas
                if (parte.entregado) continue;
                if (Array.isArray(parte.vuelosRuta) && parte.vuelosRuta.length > 0) {
                    // Ordenar los vuelos por orden
                    const vuelosOrdenados = parte.vuelosRuta
                        .sort((a, b) => (a.orden || 0) - (b.orden || 0))
                        .map(vr => vr.planDeVuelo)
                        .filter(Boolean);

                    rutas.push({
                        parteId: parte.id,
                        cantidad: parte.cantidad,
                        aeropuertoOrigen: parte.aeropuertoOrigen,
                        llegadaFinal: parte.llegadaFinal,
                        entregado: parte.entregado || false,
                        vuelos: vuelosOrdenados,
                        numVuelos: vuelosOrdenados.length
                    });
                }
            }
        }

        return {
            envioId: envio.id,
            idEnvioPorAeropuerto: envio.idEnvioPorAeropuerto,
            numProductos: envio.numProductos,
            cliente: envio.cliente,
            fechaIngreso: envio.fechaIngreso,
            aeropuertoOrigen: envio.aeropuertoOrigen,
            aeropuertoDestino: envio.aeropuertoDestino,
            rutas,
            totalPartes: rutas.length,
            totalVuelos: rutas.reduce((sum, r) => sum + r.numVuelos, 0),
            envioCompleto: envio.parteAsignadas && envio.parteAsignadas.length > 0
        };
    } catch (error) {
        console.error('Error al obtener rutas del envío:', error);
        return null;
    }
}

/**
 * Convierte una ruta de envío en una lista de segmentos para visualizar en el mapa
 * @param {Object} ruta - Objeto de ruta de obtenerRutasEnvio
 * @returns {Array} Array de segmentos con coordenadas y metadatos
 */
export function convertirRutaASegmentos(ruta) {
    if (!ruta || !Array.isArray(ruta.vuelos)) {
        return [];
    }

    const segmentos = [];

    for (let i = 0; i < ruta.vuelos.length; i++) {
        const vuelo = ruta.vuelos[i];

        if (!vuelo.ciudadOrigen || !vuelo.ciudadDestino) {
            continue;
        }

        segmentos.push({
            vueloId: vuelo.id,
            orden: i + 1,
            origen: {
                id: vuelo.ciudadOrigen?.id || vuelo.ciudadOrigen,
                lat: vuelo.ciudadOrigen?.latitud || vuelo.latitudOrigen,
                lon: vuelo.ciudadOrigen?.longitud || vuelo.longitudOrigen
            },
            destino: {
                id: vuelo.ciudadDestino?.id || vuelo.ciudadDestino,
                lat: vuelo.ciudadDestino?.latitud || vuelo.latitudDestino,
                lon: vuelo.ciudadDestino?.longitud || vuelo.longitudDestino
            },
            horaSalida: vuelo.horaSalida,
            horaLlegada: vuelo.horaLlegada
        });
    }

    return segmentos;
}

/**
 * Obtiene un resumen legible de la ruta de un envío
 * @param {Object} rutaEnvio - Objeto retornado por obtenerRutasEnvio
 * @returns {string} Descripción de la ruta
 */
export function obtenerDescripcionRuta(rutaEnvio) {
    if (!rutaEnvio || !rutaEnvio.rutas || rutaEnvio.rutas.length === 0) {
        return 'Sin ruta asignada';
    }

    if (rutaEnvio.totalPartes === 1) {
        const ruta = rutaEnvio.rutas[0];
        if (ruta.numVuelos === 1) {
            return `Ruta directa (1 vuelo)`;
        }
        return `Ruta con ${ruta.numVuelos} conexiones`;
    }

    return `Envío dividido en ${rutaEnvio.totalPartes} partes, ${rutaEnvio.totalVuelos} vuelos totales`;
}

/**
 * Obtiene todos los envíos que aún no han sido entregados
 * @returns {Promise<Array>} Array de envíos pendientes con información básica
 */
export async function obtenerEnviosPendientes() {
    try {
        const response = await fetch(`${API_BASE}/api/envios/obtenerTodos`);

        if (!response.ok) {
            console.error('Error al obtener envíos:', response.status);
            return [];
        }

        const text = await response.text();

        // Intentar parsear con manejo de circularidad
        let envios;
        try {
            envios = JSON.parse(text);
        } catch (parseError) {
            console.error('Error parseando JSON de envíos (posible circularidad):', parseError.message);
            console.log('Primeros 500 chars:', text.substring(0, 500));
            return [];
        }

        if (!Array.isArray(envios)) {
            console.warn('Respuesta no es array:', typeof envios);
            return [];
        }

        // Filtrar envíos pendientes:
        // - SOLO con partes asignadas y no todas entregadas → MOSTRAR
        // - Sin partes asignadas (esperando planificación) → NO MOSTRAR
        // - Todas las partes entregadas → NO MOSTRAR
        const pendientes = envios.filter(envio => {
            // Si no tiene partes asignadas, NO mostrar (esperando planificación)
            if (!Array.isArray(envio.parteAsignadas) || envio.parteAsignadas.length === 0) {
                return false;
            }

            // Si tiene partes, verificar si al menos una no ha sido entregada
            const tienePartePendiente = envio.parteAsignadas.some(parte => !parte.entregado);

            return tienePartePendiente;
        });

        // Mapear a formato enriquecido para el catálogo
        return pendientes.map(envio => {
            const partes = Array.isArray(envio.parteAsignadas) ? envio.parteAsignadas : [];
            const partesNoEntregadas = partes.filter(p => !p.entregado);

            const totalProductos = envio.numProductos || 0;
            const productosAsignados = partes.reduce((sum, p) => sum + (p.cantidad || 0), 0);

            const totalVuelos = partes.reduce((sum, p) => sum + (p.vuelosRuta?.length || 0), 0);

            // Resolver aeropuerto origen/destino si no vienen en el tope
            let aeropuertoOrigen = envio.aeropuertoOrigen;
            let aeropuertoDestino = envio.aeropuertoDestino;

            const primeraParte = partesNoEntregadas[0] || partes[0];
            if (!aeropuertoOrigen) {
                aeropuertoOrigen = primeraParte?.aeropuertoOrigen || null;
                // fallback adicional: del primer vuelo
                const vr0 = primeraParte?.vuelosRuta?.[0];
                const v0 = vr0?.planDeVuelo || vr0;
                if (!aeropuertoOrigen && v0?.ciudadOrigen) aeropuertoOrigen = v0.ciudadOrigen;
            }
            if (!aeropuertoDestino) {
                // intentar del último vuelo de la primera parte
                const vuelosRuta = primeraParte?.vuelosRuta || [];
                const lastVr = vuelosRuta.length > 0 ? vuelosRuta[vuelosRuta.length - 1] : null;
                const vLast = lastVr?.planDeVuelo || lastVr;
                if (vLast?.ciudadDestino) aeropuertoDestino = vLast.ciudadDestino;
            }

            // Construir lista simplificada de vuelos de la(s) ruta(s)
            const vuelosInfo = [];
            for (const parte of partesNoEntregadas.length > 0 ? partesNoEntregadas : partes) {
                const lista = Array.isArray(parte.vuelosRuta) ? parte.vuelosRuta.slice() : [];
                lista.sort((a, b) => (a.orden || 0) - (b.orden || 0));
                for (const vr of lista) {
                    const v = vr?.planDeVuelo || vr;
                    if (!v) continue;

                    // Parsear las fechas del REST API
                    // El backend REST API envía: "2025-01-02T08:01:00" 
                    // El WebSocket envía formato diferente que ya se parsea correctamente
                    // Restar 7 horas para igualar al formato del WebSocket
                    const horaSalidaRaw = v.horaSalida || v.horaOrigen;
                    const horaLlegadaRaw = v.horaLlegada || v.horaDestino;

                    let horaSalida = null;
                    let horaLlegada = null;

                    if (horaSalidaRaw) {
                        const date = new Date(horaSalidaRaw);
                        if (!isNaN(date.getTime())) {
                            // Restar 7 horas para compensar la diferencia entre REST API y WebSocket
                            horaSalida = new Date(date.getTime() - 7 * 60 * 60 * 1000);
                        }
                    }

                    if (horaLlegadaRaw) {
                        const date = new Date(horaLlegadaRaw);
                        if (!isNaN(date.getTime())) {
                            // Restar 7 horas para compensar la diferencia entre REST API y WebSocket
                            horaLlegada = new Date(date.getTime() - 7 * 60 * 60 * 1000);
                        }
                    } vuelosInfo.push({
                        id: v.id,
                        ciudadOrigen: v.ciudadOrigen || null,
                        ciudadDestino: v.ciudadDestino || null,
                        horaSalida,
                        horaLlegada
                    });
                }
            }

            return {
                id: envio.id,
                idEnvioPorAeropuerto: envio.idEnvioPorAeropuerto,
                numProductos: totalProductos,
                productosAsignados,
                cliente: envio.cliente,
                aeropuertoOrigen,
                aeropuertoDestino,
                totalPartes: partes.length,
                totalVuelos,
                fechaIngreso: envio.fechaIngreso,
                // datos auxiliares para el catálogo
                vuelosInfo
            };
        });
    } catch (error) {
        console.error('Error al obtener envíos pendientes:', error);
        return [];
    }
}

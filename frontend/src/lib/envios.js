// Utilidades para trabajar con envíos y sus rutas

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "https://1inf54-981-5e.inf.pucp.edu.pe";

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

        const envios = await response.json();

        if (!Array.isArray(envios)) {
            return [];
        }

        // Filtrar solo envíos que tienen partes asignadas y que no todas están entregadas
        const pendientes = envios.filter(envio => {
            if (!Array.isArray(envio.parteAsignadas) || envio.parteAsignadas.length === 0) {
                return false; // No tiene rutas asignadas
            }

            // Verificar si al menos una parte no ha sido entregada
            const tienePartePendiente = envio.parteAsignadas.some(parte => !parte.entregado);

            return tienePartePendiente;
        });

        // Mapear a formato simple para el catálogo
        return pendientes.map(envio => {
            const totalProductos = envio.numProductos || 0;
            const productosAsignados = envio.parteAsignadas
                ? envio.parteAsignadas.reduce((sum, p) => sum + (p.cantidad || 0), 0)
                : 0;

            const totalVuelos = envio.parteAsignadas
                ? envio.parteAsignadas.reduce((sum, p) => sum + (p.vuelosRuta?.length || 0), 0)
                : 0;

            return {
                id: envio.id,
                idEnvioPorAeropuerto: envio.idEnvioPorAeropuerto,
                numProductos: totalProductos,
                productosAsignados,
                cliente: envio.cliente,
                aeropuertoOrigen: envio.aeropuertoOrigen,
                aeropuertoDestino: envio.aeropuertoDestino,
                totalPartes: envio.parteAsignadas.length,
                totalVuelos,
                fechaIngreso: envio.fechaIngreso
            };
        });
    } catch (error) {
        console.error('Error al obtener envíos pendientes:', error);
        return [];
    }
}

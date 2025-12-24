// BACKEND_SERVICE_METHODS.java
// Métodos que debes agregar a tu AeropuertoService

package com.morapack.service;

import com.morapack.model.Aeropuerto;
import com.morapack.repository.AeropuertoRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

/**
 * Métodos adicionales para AeropuertoService
 * Estos métodos deben ser agregados a tu clase AeropuertoService existente
 */
@Service
public class AeropuertoService {

    private static final Logger logger = LoggerFactory.getLogger(AeropuertoService.class);

    @Autowired
    private AeropuertoRepository aeropuertoRepository;

    /**
     * Disminuye la capacidad ocupada de un aeropuerto cuando un vuelo despega.
     *
     * @param aeropuertoId ID del aeropuerto
     * @param cantidad Cantidad a disminuir (debe ser positiva)
     * @return true si se actualizó correctamente, false en caso contrario
     */
    @Transactional
    public boolean disminuirCapacidadOcupada(Integer aeropuertoId, Integer cantidad) {
        try {
            if (aeropuertoId == null || cantidad == null || cantidad <= 0) {
                logger.warn("⚠️ Parámetros inválidos para disminuir capacidad: aeropuertoId={}, cantidad={}",
                    aeropuertoId, cantidad);
                return false;
            }

            Optional<Aeropuerto> aeropuertoOpt = aeropuertoRepository.findById(aeropuertoId);

            if (aeropuertoOpt.isEmpty()) {
                logger.warn("⚠️ Aeropuerto no encontrado: {}", aeropuertoId);
                return false;
            }

            Aeropuerto aeropuerto = aeropuertoOpt.get();
            Integer capacidadActual = aeropuerto.getCapacidadOcupada() != null
                ? aeropuerto.getCapacidadOcupada()
                : 0;

            // Calcular nueva capacidad (no puede ser negativa)
            Integer nuevaCapacidad = Math.max(0, capacidadActual - cantidad);

            // Actualizar capacidad ocupada
            aeropuerto.setCapacidadOcupada(nuevaCapacidad);
            aeropuertoRepository.save(aeropuerto);

            logger.info("✅ Capacidad disminuida en aeropuerto {}: {} -> {} (-{})",
                aeropuertoId, capacidadActual, nuevaCapacidad, cantidad);

            return true;

        } catch (Exception e) {
            logger.error("❌ Error al disminuir capacidad del aeropuerto {}: {}",
                aeropuertoId, e.getMessage(), e);
            return false;
        }
    }

    /**
     * Aumenta la capacidad ocupada de un aeropuerto cuando un vuelo aterriza.
     *
     * @param aeropuertoId ID del aeropuerto
     * @param cantidad Cantidad a aumentar (debe ser positiva)
     * @return true si se actualizó correctamente, false en caso contrario
     */
    @Transactional
    public boolean aumentarCapacidadOcupada(Integer aeropuertoId, Integer cantidad) {
        try {
            if (aeropuertoId == null || cantidad == null || cantidad <= 0) {
                logger.warn("⚠️ Parámetros inválidos para aumentar capacidad: aeropuertoId={}, cantidad={}",
                    aeropuertoId, cantidad);
                return false;
            }

            Optional<Aeropuerto> aeropuertoOpt = aeropuertoRepository.findById(aeropuertoId);

            if (aeropuertoOpt.isEmpty()) {
                logger.warn("⚠️ Aeropuerto no encontrado: {}", aeropuertoId);
                return false;
            }

            Aeropuerto aeropuerto = aeropuertoOpt.get();
            Integer capacidadActual = aeropuerto.getCapacidadOcupada() != null
                ? aeropuerto.getCapacidadOcupada()
                : 0;

            // Calcular nueva capacidad
            Integer nuevaCapacidad = capacidadActual + cantidad;

            // Opcional: Validar que no exceda la capacidad máxima (si aplica)
            Integer capacidadMaxima = aeropuerto.getCapacidadMaxima();
            if (capacidadMaxima != null && capacidadMaxima > 0 && nuevaCapacidad > capacidadMaxima) {
                logger.warn("⚠️ La capacidad ocupada excedería la máxima en aeropuerto {}: {} > {}",
                    aeropuertoId, nuevaCapacidad, capacidadMaxima);
                // Puedes decidir si limitar a la máxima o permitir el exceso
                // nuevaCapacidad = capacidadMaxima;
            }

            // Actualizar capacidad ocupada
            aeropuerto.setCapacidadOcupada(nuevaCapacidad);
            aeropuertoRepository.save(aeropuerto);

            logger.info("✅ Capacidad aumentada en aeropuerto {}: {} -> {} (+{})",
                aeropuertoId, capacidadActual, nuevaCapacidad, cantidad);

            return true;

        } catch (Exception e) {
            logger.error("❌ Error al aumentar capacidad del aeropuerto {}: {}",
                aeropuertoId, e.getMessage(), e);
            return false;
        }
    }
}

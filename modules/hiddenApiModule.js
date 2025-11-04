const incidenciasModule = require('./incidenciasModule');
const sedesModule = require('./sedesModule');
const tecnicosModule = require('./tecnicosModule');

/**
 * Crea una incidencia a través de la API interna.
 * @param {object} data - Los datos para la nueva incidencia.
 * @returns {Promise<object>} La incidencia creada.
 */
async function crearIncidencia(data) {
    if (!data.sedeNombre) {
        throw new Error('El campo sedeNombre es requerido para crear la incidencia.');
    }

    // 1. Buscar la sede por su nombre
    const sedes = await sedesModule.getSedes();
    const sedeEncontrada = sedes.find(s => s.nombre.toLowerCase() === data.sedeNombre.toLowerCase());

    if (!sedeEncontrada) {
        throw new Error(`No se encontró ninguna sede con el nombre "${data.sedeNombre}".`);
    }

    // Aquí podríamos añadir lógica específica para esta API,
    // como valores por defecto, validaciones especiales, etc.
    
    const incidenciaData = {
        titulo: data.titulo || 'Incidencia (API Interna)',
        descripcion: data.descripcion || '',
        sedeId: sedeEncontrada.id, // Usamos el ID de la sede encontrada
        prioridad: data.prioridad || 'baja',
        duracionEstimadaHoras: data.duracionEstimadaHoras || 1,
    };

    return await incidenciasModule.agregarIncidencia(incidenciaData);
}

/**
 * Obtiene todos los técnicos a través de la API interna.
 * @returns {Promise<Array<object>>} La lista de técnicos.
 */
async function obtenerTecnicos() {
    return await tecnicosModule.getTecnicos();
}

/**
 * Obtiene los técnicos filtrados por una sede específica.
 * @param {string} sedeId - El ID de la sede.
 * @returns {Promise<Array<object>>} La lista de técnicos de esa sede.
 */
async function obtenerTecnicosPorSede(sedeId) {
    if (!sedeId) {
        throw new Error('Se requiere un ID de sede.');
    }
    const todosLosTecnicos = await tecnicosModule.getTecnicos();
    return todosLosTecnicos.filter(tecnico => tecnico.sedeId === sedeId);
}

module.exports = {
    crearIncidencia,
    obtenerTecnicos,
    obtenerTecnicosPorSede,
};
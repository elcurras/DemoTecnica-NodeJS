function getEventosFromIncidencias(incidencias) {
    // Transforma una lista de incidencias en eventos de calendario
    const eventosDeIncidencias = incidencias
        .filter(inc => inc.estado === 'asignada' && inc.fechaInicio && inc.tecnicoId)
        .map(inc => {
            const desde = new Date(inc.fechaInicio);
            const duracionMs = (parseFloat(inc.duracionEstimadaHoras) || parseFloat(inc.duracionHoras) || 1) * 3600 * 1000;
            const hasta = new Date(desde.getTime() + duracionMs);

            return {
                id: inc.id, // Usamos el ID de la incidencia
                titulo: inc.titulo,
                sedeId: inc.sedeId,
                tecnicoId: inc.tecnicoId,
                desde: desde.toISOString(),
                hasta: hasta.toISOString(),
                incidenciaId: inc.id // Referencia a sí misma
            };
        });

    // Podríamos combinarlo con otros eventos de calendario.json si fuera necesario,
    // pero por ahora, nos centramos en las incidencias.
    return eventosDeIncidencias;
}

module.exports = { getEventosFromIncidencias };
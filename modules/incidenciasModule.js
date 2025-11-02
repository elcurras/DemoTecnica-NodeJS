const fs = require('fs').promises;
const path = require('path');
const tecnicosModule = require('./tecnicosModule');
const calendarioModule = require('./calendarioModule');

const archivoJson = path.join(__dirname, '..', 'Datos', 'incidencias.json');

function makeId() {
    return 'inc_' + Date.now().toString(36);
}

async function ensureFile() {
    const dir = path.dirname(archivoJson);
    await fs.mkdir(dir, { recursive: true });
    try {
        await fs.access(archivoJson);
    } catch {
        await fs.writeFile(archivoJson, JSON.stringify({ incidencias: [] }, null, 2));
    }
}

async function getIncidencias() {
    await ensureFile();
    const data = await fs.readFile(archivoJson, 'utf8');
    const json = JSON.parse(data);
    const incidencias = json.incidencias || [];

    // --- Lógica de migración ---
    // Actualiza las incidencias existentes a la nueva estructura una sola vez.
    let needsSave = false;
    const migratedIncidencias = incidencias.map(inc => {
        if (inc.duracionEstimadaHoras === undefined) {
            needsSave = true;
            return {
                ...inc,
                estado: 'pendiente', // Poner todas como pendientes
                tecnicoId: null,
                fechaInicio: null,
                duracionEstimadaHoras: inc.duracionHoras || 1, // Usar duración antigua o 1h por defecto
                fechaLimite: null, // Sin fecha límite por defecto
                updatedAt: new Date().toISOString()
            };
        }
        return inc;
    });

    if (needsSave) await fs.writeFile(archivoJson, JSON.stringify({ incidencias: migratedIncidencias }, null, 2));
    return migratedIncidencias;
}

async function agregarIncidencia(inc) {
    if (!inc.titulo || !inc.sedeId) throw new Error('Faltan datos requeridos');
    
    const incidencias = await getIncidencias();
    const nueva = {
        id: makeId(),
        titulo: inc.titulo,
        descripcion: inc.descripcion || '',
        sedeId: inc.sedeId,
        tecnicoId: null,
        estado: 'pendiente',
        prioridad: inc.prioridad || 'media',
        fechaInicio: null,
        duracionEstimadaHoras: parseFloat(inc.duracionEstimadaHoras) || 1,
        fechaLimite: inc.fechaLimite || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    
    incidencias.push(nueva);
    await fs.writeFile(archivoJson, JSON.stringify({ incidencias }, null, 2));
    return nueva;
}

async function asignarIncidencia(id, { tecnicoId, fechaInicio }) {
    const incidencias = await getIncidencias();
    const index = incidencias.findIndex(i => i.id === id);
    if (index === -1) throw new Error('Incidencia no encontrada');
    
    incidencias[index] = {
        ...incidencias[index],
        tecnicoId,
        fechaInicio,
        estado: 'asignada',
        updatedAt: new Date().toISOString()
    };
    
    await fs.writeFile(archivoJson, JSON.stringify({ incidencias }, null, 2));
    return incidencias[index];
}

async function cancelarIncidencia(id) {
    const incidencias = await getIncidencias();
    const index = incidencias.findIndex(i => i.id === id);
    if (index === -1) throw new Error('Incidencia no encontrada');
    
    incidencias[index] = {
        ...incidencias[index],
        estado: 'cancelada',
        updatedAt: new Date().toISOString()
    };
    
    await fs.writeFile(archivoJson, JSON.stringify({ incidencias }, null, 2));
    return incidencias[index];
}

async function programarIncidencia(id, { fechaInicio }) {
    if (!fechaInicio) throw new Error('Se requiere una fecha de inicio');
    const incidencias = await getIncidencias();
    const index = incidencias.findIndex(i => i.id === id);
    if (index === -1) throw new Error('Incidencia no encontrada');

    if (incidencias[index].estado !== 'pendiente' && incidencias[index].estado !== 'abierta') {
        throw new Error('Solo se pueden programar incidencias pendientes o abiertas.');
    }
    
    incidencias[index] = {
        ...incidencias[index],
        fechaInicio,
        estado: 'programada',
        updatedAt: new Date().toISOString()
    };
    
    await fs.writeFile(archivoJson, JSON.stringify({ incidencias }, null, 2));
    return incidencias[index];
}

async function desasignarIncidencia(id) {
    const incidencias = await getIncidencias();
    const index = incidencias.findIndex(i => i.id === id);
    if (index === -1) throw new Error('Incidencia no encontrada');

    if (incidencias[index].estado !== 'asignada') {
        throw new Error('Solo se pueden desasignar incidencias que están asignadas.');
    }
    
    incidencias[index] = {
        ...incidencias[index],
        tecnicoId: null,
        fechaInicio: null,
        estado: 'pendiente',
        updatedAt: new Date().toISOString()
    };
    
    await fs.writeFile(archivoJson, JSON.stringify({ incidencias }, null, 2));
    return incidencias[index];
}

async function autoAsignarIncidencias(sedeId, fecha) {
    const fechaObj = new Date(fecha);
    const jornadaInicio = 8; // 8:00 AM
    const jornadaFin = 18;   // 6:00 PM

    // 1. Obtener datos necesarios
    const todasIncidencias = await getIncidencias();
    const todosTecnicos = await tecnicosModule.getTecnicos();
    const todosEventos = calendarioModule.getEventosFromIncidencias(todasIncidencias);

    // 2. Filtrar datos para la sede y fecha
    const incidenciasPendientes = todasIncidencias.filter(inc =>
        inc.sedeId === sedeId &&
        (inc.estado === 'pendiente' || inc.estado === 'programada' && !inc.tecnicoId)
    ).sort((a, b) => { // Priorizar por 'alta' y luego por fecha de creación
        const priorityMap = { alta: 3, media: 2, baja: 1 };
        const priorityA = priorityMap[a.prioridad] || 0;
        const priorityB = priorityMap[b.prioridad] || 0;
        if (priorityA !== priorityB) return priorityB - priorityA;
        return new Date(a.createdAt) - new Date(b.createdAt);
    });

    const tecnicosSede = todosTecnicos.filter(t => t.sedeId === sedeId && t.activo !== false);

    // 3. Construir mapa de disponibilidad de técnicos
    const disponibilidadTecnicos = {};
    tecnicosSede.forEach(tec => {
        disponibilidadTecnicos[tec.id] = []; // Array de huecos ocupados [inicio, fin]
    });

    const diaInicio = new Date(fechaObj.setHours(0, 0, 0, 0));
    const diaFin = new Date(fechaObj.setHours(23, 59, 59, 999));

    todosEventos.forEach(ev => {
        if (disponibilidadTecnicos[ev.tecnicoId]) {
            const evDesde = new Date(ev.desde);
            const evHasta = new Date(ev.hasta);
            if (evDesde < diaFin && evHasta > diaInicio) {
                disponibilidadTecnicos[ev.tecnicoId].push({ inicio: evDesde, fin: evHasta });
            }
        }
    });

    // 4. Algoritmo de asignación
    const asignadas = [];
    const noAsignadas = [];
    let lastTecnicoIndex = 0;

    for (const inc of incidenciasPendientes) {
        let asignada = false;
        const duracionHoras = inc.duracionEstimadaHoras || 1;

        // Búsqueda rotativa de técnico (Round Robin)
        for (let i = 0; i < tecnicosSede.length; i++) {
            const tecIndex = (lastTecnicoIndex + i) % tecnicosSede.length;
            const tecnico = tecnicosSede[tecIndex];
            const huecosOcupados = disponibilidadTecnicos[tecnico.id].sort((a, b) => a.inicio - b.inicio);

            let proximoHuecoLibre = new Date(fechaObj.setHours(jornadaInicio, 0, 0, 0));

            for (const hueco of huecosOcupados) {
                if (proximoHuecoLibre.getTime() + duracionHoras * 3600000 <= hueco.inicio.getTime()) {
                    break; // Encontramos hueco antes del siguiente evento
                }
                proximoHuecoLibre = hueco.fin; // El próximo hueco libre empieza cuando acaba este
            }

            const finCitaPropuesta = new Date(proximoHuecoLibre.getTime() + duracionHoras * 3600000);
            if (finCitaPropuesta.getHours() <= jornadaFin) {
                const incidenciaAsignada = await asignarIncidencia(inc.id, { tecnicoId: tecnico.id, fechaInicio: proximoHuecoLibre.toISOString() });
                asignadas.push(incidenciaAsignada);
                disponibilidadTecnicos[tecnico.id].push({ inicio: proximoHuecoLibre, fin: finCitaPropuesta });
                lastTecnicoIndex = (tecIndex + 1) % tecnicosSede.length; // Siguiente técnico para la próxima incidencia
                asignada = true;
                break; // Pasamos a la siguiente incidencia
            }
        }
        if (!asignada) noAsignadas.push(inc);
    }

    return { asignadas, noAsignadas };
}

// Exportar funciones
module.exports = { getIncidencias, agregarIncidencia, asignarIncidencia, cancelarIncidencia, programarIncidencia, autoAsignarIncidencias, desasignarIncidencia };
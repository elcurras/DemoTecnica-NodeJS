const fs = require('fs').promises;
const path = require('path');

const archivoJson = path.join(__dirname, '..', 'Datos', 'sedes.json');

function makeId() {
    return 's_' + Date.now().toString(36);
}

async function ensureFile() {
    const dir = path.dirname(archivoJson);
    await fs.mkdir(dir, { recursive: true });
    try {
        await fs.access(archivoJson);
    } catch {
        const inicial = { sedes: [] };
        await fs.writeFile(archivoJson, JSON.stringify(inicial, null, 2), 'utf8');
    }
}

async function getSedes() {
    await ensureFile();
    const data = await fs.readFile(archivoJson, 'utf8');
    const json = JSON.parse(data);
    return json.sedes || [];
}

async function actualizarSede(id, updates) {
    const sedes = await getSedes();
    const index = sedes.findIndex(s => s.id === id);
    if (index === -1) throw new Error('Sede no encontrada');

    sedes[index] = {
        ...sedes[index],
        ...updates,
        updatedAt: new Date().toISOString()
    };

    await fs.writeFile(archivoJson, JSON.stringify({ sedes }, null, 2));
    return sedes[index];
}

async function agregarSede(sede) {
    if (!sede.nombre) throw new Error('Sede debe tener nombre');
    
    const sedes = await getSedes();
    const nueva = {
        id: makeId(),
        nombre: sede.nombre,
        direccion: sede.direccion || '',
        tecnicos: [],
        capacidad: {
            lun: parseInt(sede.capacidad?.lun) || 8,
            mar: parseInt(sede.capacidad?.mar) || 8,
            mie: parseInt(sede.capacidad?.mie) || 8,
            jue: parseInt(sede.capacidad?.jue) || 8,
            vie: parseInt(sede.capacidad?.vie) || 8
        },
        activa: true,
        createdAt: new Date().toISOString(),
        notas: sede.notas || ''
    };
    
    sedes.push(nueva);
    await fs.writeFile(archivoJson, JSON.stringify({ sedes }, null, 2));
    return nueva;
}

module.exports = { getSedes, agregarSede, actualizarSede };
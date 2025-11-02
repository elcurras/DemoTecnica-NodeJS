const fs = require('fs').promises;
const path = require('path');

const archivoJson = path.join(__dirname, '..', 'Datos', 'tecnicos.json');

function makeId() {
    return 't_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1000);
}

async function ensureFile() {
    const dir = path.dirname(archivoJson);
    await fs.mkdir(dir, { recursive: true });
    try {
        await fs.access(archivoJson);
    } catch {
        const inicial = { tecnicos: [] };
        await fs.writeFile(archivoJson, JSON.stringify(inicial, null, 2), 'utf8');
    }
}

async function readAll() {
    await ensureFile();
    const txt = await fs.readFile(archivoJson, 'utf8');
    let json;
    try {
        json = JSON.parse(txt);
    } catch {
        json = { tecnicos: [] };
    }
    // normalizar estructura
    if (!Array.isArray(json.tecnicos)) {
        if (Array.isArray(json)) json = { tecnicos: json };
        else json.tecnicos = [];
    }
    // asignar ids/activo si faltan y marcar que debemos reescribir
    let changed = false;
    json.tecnicos = json.tecnicos.map(t => {
        const clone = Object.assign({}, t);
        if (!clone.id) { clone.id = makeId(); changed = true; }
        if (typeof clone.activo !== 'boolean') { clone.activo = true; changed = true; }
        if (!clone.createdAt) { clone.createdAt = new Date().toISOString(); changed = true; }
        return clone;
    });
    if (changed) {
        await writeAll(json.tecnicos);
    }
    return json;
}

async function writeAll(tecnicosArray) {
    const json = { tecnicos: tecnicosArray || [] };
    await fs.writeFile(archivoJson, JSON.stringify(json, null, 2), 'utf8');
}

async function getTecnicos() {
    const json = await readAll();
    return json.tecnicos;
}

async function agregarTecnico(tecnico) {
    if (!tecnico || !tecnico.nombre) {
        throw new Error('Técnico debe tener nombre');
    }
    const json = await readAll();
    const nuevo = Object.assign({
        id: makeId(),
        activo: true,
        horario: tecnico.horario || '',
        sedeId: tecnico.sedeId || null,
        createdAt: new Date().toISOString()
    }, tecnico);
    json.tecnicos.push(nuevo);
    await writeAll(json.tecnicos);
    return nuevo;
}

async function eliminarTecnico(id) {
    const json = await readAll();
    const before = json.tecnicos.length;
    json.tecnicos = json.tecnicos.filter(t => t.id !== id);
    if (json.tecnicos.length === before) throw new Error('Técnico no encontrado');
    await writeAll(json.tecnicos);
    return { id };
}

async function bajaTecnico(id) {
    const json = await readAll();
    let found = false;
    json.tecnicos = json.tecnicos.map(t => {
        if (t.id === id) {
            found = true;
            return Object.assign({}, t, { activo: false, updatedAt: new Date().toISOString() });
        }
        return t;
    });
    if (!found) throw new Error('Técnico no encontrado');
    await writeAll(json.tecnicos);
    return { id, activo: false };
}

async function reactivarTecnico(id) {
    const json = await readAll();
    let found = false;
    json.tecnicos = json.tecnicos.map(t => {
        if (t.id === id) {
            found = true;
            return Object.assign({}, t, { activo: true, updatedAt: new Date().toISOString() });
        }
        return t;
    });
    if (!found) throw new Error('Técnico no encontrado');
    await writeAll(json.tecnicos);
    return { id, activo: true };
}

module.exports = { getTecnicos, agregarTecnico, eliminarTecnico, bajaTecnico, reactivarTecnico };
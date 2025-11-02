const express = require('express');
const fileUpload = require('express-fileupload');
const tecnicosModule = require('./modules/tecnicosModule');
const sedesModule = require('./modules/sedesModule');
const incidenciasModule = require('./modules/incidenciasModule');
const calendarioModule = require('./modules/calendarioModule');
const path = require('path');
const fs = require('fs').promises;
const app = express();
const port = 3000;

app.use(express.json());
app.use(fileUpload());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.get('/tecnicos', async (req, res) => {
    const tecnicos = await tecnicosModule.getTecnicos();
    res.json(tecnicos);
});

app.post('/tecnicos', async (req, res) => {
    await tecnicosModule.agregarTecnico(req.body);
    res.status(201).send();
});

// Rutas para sedes, incidencias y calendario
app.get('/sedes', async (req, res) => {
    try {
        const sedes = await sedesModule.getSedes();
        return res.json(sedes);
    } catch (error) {
        console.error('Error al obtener sedes:', error);
        return res.status(500).json({ error: "Error al obtener las sedes" });
    }
});

app.post('/sedes', async (req, res) => {
    await sedesModule.agregarSede(req.body);
    res.status(201).send();
});

app.get('/incidencias', async (req, res) => {
    try {
        const incidencias = await incidenciasModule.getIncidencias();
        console.log('GET /incidencias response:', incidencias); // Add logging
        return res.json(incidencias);
    } catch (err) {
        console.error('GET /incidencias ERROR:', err);
        return res.status(500).json({ error: 'Error al obtener incidencias' });
    }
});

app.post('/incidencias', async (req, res) => {
    try {
        const result = await incidenciasModule.agregarIncidencia(req.body);
        return res.json(result);
    } catch (err) {
        console.error('POST /incidencias ERROR:', err);
        return res.status(500).json({ error: err.message });
    }
});

app.post('/incidencias/:id/asignar', async (req, res) => {
    try {
        const result = await incidenciasModule.asignarIncidencia(req.params.id, req.body);
        return res.json(result);
    } catch (err) {
        console.error('POST /incidencias/:id/asignar ERROR:', err);
        return res.status(500).json({ error: err.message });
    }
});

app.post('/incidencias/:id/programar', async (req, res) => {
    try {
        const result = await incidenciasModule.programarIncidencia(req.params.id, req.body);
        return res.json(result);
    } catch (err) {
        console.error('POST /incidencias/:id/programar ERROR:', err);
        return res.status(500).json({ error: err.message });
    }
});

app.post('/incidencias/:id/desasignar', async (req, res) => {
    try {
        const result = await incidenciasModule.desasignarIncidencia(req.params.id);
        return res.json(result);
    } catch (err) {
        console.error('POST /incidencias/:id/desasignar ERROR:', err);
        return res.status(500).json({ error: err.message });
    }
});

app.post('/incidencias/:id/cancelar', async (req, res) => {
    try {
        const result = await incidenciasModule.cancelarIncidencia(req.params.id);
        return res.json(result);
    } catch (err) {
        console.error('POST /incidencias/:id/cancelar ERROR:', err);
        return res.status(500).json({ error: err.message });
    }
});

app.post('/incidencias/auto-asignar', async (req, res) => {
    try {
        const { sedeId, fecha } = req.body;
        if (!sedeId || !fecha) return res.status(400).json({ error: 'Se requiere sedeId y fecha' });
        const result = await incidenciasModule.autoAsignarIncidencias(sedeId, fecha);
        return res.json(result);
    } catch (err) {
        console.error('POST /incidencias/auto-asignar ERROR:', err);
        return res.status(500).json({ error: err.message });
    }
});

app.get('/calendario', async (req, res) => {
  try {
    const incidencias = await incidenciasModule.getIncidencias();
    const eventos = calendarioModule.getEventosFromIncidencias(incidencias);
    return res.json(eventos || []);
  } catch (err) {
    console.error('GET /calendario ERROR:', err);
    return res.status(500).json({ error: 'Error al obtener calendario', detail: err.message });
  }
});

// Eliminar técnico
app.delete('/tecnicos/:id', async (req, res) => {
    try {
        const result = await tecnicosModule.eliminarTecnico(req.params.id);
        return res.json(result);
    } catch (err) {
        console.error('DELETE /tecnicos/:id', err);
        return res.status(500).json({ error: 'Error al eliminar técnico' });
    }
});

// Dar de baja (inactivar)
app.patch('/tecnicos/:id/baja', async (req, res) => {
    const id = req.params.id;
    console.log('PATCH /tecnicos/:id/baja request, id=', id);
    try {
        const result = await tecnicosModule.bajaTecnico(id);
        console.log('Baja realizada:', result);
        return res.json(result);
    } catch (err) {
        console.error('PATCH /tecnicos/:id/baja ERROR:', err);
        return res.status(500).json({ error: 'Error al dar de baja técnico', detail: err.message });
    }
});

// Reactivar
app.patch('/tecnicos/:id/reactivar', async (req, res) => {
    try {
        const result = await tecnicosModule.reactivarTecnico(req.params.id);
        return res.json(result);
    } catch (err) {
        console.error('PATCH /tecnicos/:id/reactivar', err);
        return res.status(500).json({ error: 'Error al reactivar técnico' });
    }
});

// Actualizar sede
app.patch('/sedes/:id', async (req, res) => {
    try {
        const result = await sedesModule.actualizarSede(req.params.id, req.body);
        return res.json(result);
    } catch (err) {
        console.error('PATCH /sedes/:id error:', err);
        return res.status(500).json({ error: err.message });
    }
});

// --- Rutas de Import/Export por Módulo ---

const modules = {
    tecnicos: {
        get: tecnicosModule.getTecnicos,
        file: 'tecnicos.json'
    },
    sedes: {
        get: sedesModule.getSedes,
        file: 'sedes.json'
    },
    incidencias: {
        get: incidenciasModule.getIncidencias,
        file: 'incidencias.json'
    }
};

app.get('/api/export/:module', async (req, res) => {
    const moduleName = req.params.module;
    const moduleConfig = modules[moduleName];
    if (!moduleConfig) return res.status(404).json({ error: 'Módulo no encontrado' });

    try {
        const data = await moduleConfig.get();
        const exportData = { [moduleName]: data };

        res.setHeader('Content-Disposition', `attachment; filename=${moduleName}.json`);
        res.setHeader('Content-Type', 'application/json');
        res.send(JSON.stringify(exportData, null, 2));
    } catch (error) {
        console.error(`GET /api/export/${moduleName} ERROR:`, error);
        res.status(500).json({ error: `Error al exportar ${moduleName}` });
    }
});

app.post('/api/import/:module', async (req, res) => {
    const moduleName = req.params.module;
    const moduleConfig = modules[moduleName];
    if (!moduleConfig) return res.status(404).json({ error: 'Módulo no encontrado' });

    if (!req.files || !req.files.importFile) {
        return res.status(400).json({ error: 'No se ha subido ningún archivo.' });
    }

    try {
        const importFile = req.files.importFile;
        const data = JSON.parse(importFile.data.toString('utf8'));

        if (!data[moduleName] || !Array.isArray(data[moduleName])) {
            return res.status(400).json({ error: `El archivo no tiene el formato esperado. Debe contener una clave "${moduleName}".` });
        }

        await fs.writeFile(path.join(__dirname, 'Datos', moduleConfig.file), JSON.stringify(data, null, 2));
        res.json({ message: `Datos de ${moduleName} importados correctamente.` });
    } catch (error) {
        console.error(`POST /api/import/${moduleName} ERROR:`, error);
        res.status(500).json({ error: `Error al procesar el archivo de ${moduleName}.` });
    }
});

app.get('/api/backup', async (req, res) => {
    try {
        const tecnicos = await tecnicosModule.getTecnicos();
        const sedes = await sedesModule.getSedes();
        const incidencias = await incidenciasModule.getIncidencias();

        const backupData = { tecnicos, sedes, incidencias };

        res.setHeader('Content-Disposition', 'attachment; filename=backup.json');
        res.setHeader('Content-Type', 'application/json');
        res.send(JSON.stringify(backupData, null, 2));
    } catch (error) {
        console.error('GET /api/backup ERROR:', error);
        res.status(500).json({ error: 'Error al generar la copia de seguridad' });
    }
});

app.post('/api/clean-data', async (req, res) => {
    try {
        const emptyTecnicos = { tecnicos: [] };
        const emptySedes = { sedes: [] };
        const emptyIncidencias = { incidencias: [] };

        await fs.writeFile(path.join(__dirname, 'Datos', 'tecnicos.json'), JSON.stringify(emptyTecnicos, null, 2));
        await fs.writeFile(path.join(__dirname, 'Datos', 'sedes.json'), JSON.stringify(emptySedes, null, 2));
        await fs.writeFile(path.join(__dirname, 'Datos', 'incidencias.json'), JSON.stringify(emptyIncidencias, null, 2));

        res.json({ message: 'Todos los datos han sido eliminados.' });
    } catch (error) {
        console.error('POST /api/clean-data ERROR:', error);
        res.status(500).json({ error: 'Error al limpiar los datos.' });
    }
});

app.post('/api/restore-backup', async (req, res) => {
    if (!req.files || !req.files.backupFile) {
        return res.status(400).json({ error: 'No se ha subido ningún archivo de backup.' });
    }

    const backupFile = req.files.backupFile;

    try {
        const data = JSON.parse(backupFile.data.toString('utf8'));

        // Validar que el JSON tiene la estructura esperada
        if (!data.tecnicos || !data.sedes || !data.incidencias) {
            return res.status(400).json({ error: 'El archivo de backup no tiene el formato esperado.' });
        }

        // Sobrescribir los archivos de datos
        await fs.writeFile(path.join(__dirname, 'Datos', 'tecnicos.json'), JSON.stringify({ tecnicos: data.tecnicos }, null, 2));
        await fs.writeFile(path.join(__dirname, 'Datos', 'sedes.json'), JSON.stringify({ sedes: data.sedes }, null, 2));
        await fs.writeFile(path.join(__dirname, 'Datos', 'incidencias.json'), JSON.stringify({ incidencias: data.incidencias }, null, 2));

        res.json({ message: 'Copia de seguridad restaurada correctamente.' });
    } catch (error) {
        console.error('POST /api/restore-backup ERROR:', error);
        res.status(500).json({ error: 'Error al procesar el archivo de backup.' });
    }
});

app.listen(port, () => {
    console.log(`Servidor escuchando en http://localhost:${port}`);
});
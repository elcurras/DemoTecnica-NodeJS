const express = require('express');
const router = express.Router();
const hiddenApiModule = require('../modules/hiddenApiModule');

// --- Endpoint para crear una incidencia ---
// POST /hidden/api/incidencias
router.post('/incidencias', async (req, res) => {
    try {
        // req.body contendrá los datos enviados en el POST
        const nuevaIncidencia = await hiddenApiModule.crearIncidencia(req.body);
        res.status(201).json(nuevaIncidencia);
    } catch (error) {
        console.error('ERROR en POST /hidden/api/incidencias:', error.message);
        // Usamos 400 para errores de cliente (ej. datos faltantes)
        res.status(400).json({ error: error.message });
    }
});

// --- Endpoint para obtener técnicos por sede ---
// GET /hidden/api/tecnicos/sede/:sedeId
router.get('/tecnicos/sede/:sedeId', async (req, res) => {
    try {
        const { sedeId } = req.params;
        const tecnicos = await hiddenApiModule.obtenerTecnicosPorSede(sedeId);
        res.status(200).json(tecnicos);
    } catch (error) {
        console.error(`ERROR en GET /hidden/api/tecnicos/sede/${req.params.sedeId}:`, error.message);
        // Si el error es por falta de ID, es un 400. Si no, un 500.
        res.status(error.message.includes('requiere un ID') ? 400 : 500).json({ error: error.message });
    }
});

// --- Endpoint para obtener todos los técnicos ---
// GET /hidden/api/tecnicos
router.get('/tecnicos', async (req, res) => {
    try {
        const tecnicos = await hiddenApiModule.obtenerTecnicos();
        res.status(200).json(tecnicos);
    } catch (error) {
        console.error('ERROR en GET /hidden/api/tecnicos:', error.message);
        res.status(500).json({ error: 'Error interno al obtener los técnicos.' });
    }
});

module.exports = router;
// Initialize cache variables first
let _sedesCache = [];
let _tecnicosCache = [];
let _eventosCache = [];
let _calCurrent = new Date();
let _selectedDay = null;

let _incidenciasCache = [];

const CAL_HOUR_START = 8;
const CAL_HOUR_END = 18;

// Helper functions
function formatLocalDateKey(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function escapeHtml(str) {
    if (typeof str !== 'string') return str || '';
    return str.replace(/[&<>"']/g, s => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[s]));
}

function startOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

// Global variables for drag and drop
let isDragging = false;
let draggedEventBlock = null;
let dragOffsetX = 0; // Offset of the mouse click within the event block
let originalLeftPct = 0;
let originalWidthPct = 0;
let currentIncidenciaId = null;
let originalTecnicoId = null;
let originalFechaInicio = null; // ISO string

// Render functions
function renderTecnicosFromCache() {
    const listContainer = document.getElementById('tecnicosList');
    const contador = document.getElementById('contador');
    if (!listContainer) return;

    const filterSede = document.getElementById('filterSede')?.value || 'all';
    const sortBy = document.getElementById('sortBy')?.value || 'nombre_asc';

    let items = _tecnicosCache.slice();
    if (filterSede !== 'all') {
        items = items.filter(t => (t.sedeId || null) === filterSede);
    }

    items.sort((a, b) => {
        const an = (a.nombre || '').toString().toLowerCase();
        const bn = (b.nombre || '').toString().toLowerCase();
        if (sortBy === 'nombre_asc') return an.localeCompare(bn);
        if (sortBy === 'nombre_desc') return bn.localeCompare(an);
        return 0;
    });

    const sedeMap = _sedesCache.reduce((acc, s) => { acc[s.id] = s.nombre; return acc; }, {});

    listContainer.innerHTML = items.map(tecnico => {
        const activo = tecnico.activo !== false;
        const sedeNombre = tecnico.sedeId ? (sedeMap[tecnico.sedeId] || tecnico.sedeId) : '-';
        return `
        <div class="tecnico-item ${activo ? '' : 'disabled'}" data-id="${tecnico.id}">
            <div>
                <strong>Nombre:</strong> ${escapeHtml(tecnico.nombre)}<br>
                <strong>Horario:</strong> ${escapeHtml(tecnico.horario || '')}<br>
                <small><strong>Sede:</strong> ${escapeHtml(sedeNombre)}</small>
            </div>
            <div style="margin-top:8px">
                ${activo ? `<button data-action="baja" data-id="${tecnico.id}">Dar de baja</button>` 
                        : `<button data-action="reactivar" data-id="${tecnico.id}">Reactivar</button>`}
                <button data-action="eliminar" data-id="${tecnico.id}" 
                        style="margin-left:8px;background:var(--danger)">Eliminar</button>
            </div>
        </div>`;
    }).join('');

    contador && (contador.textContent = `${items.length} técnico(s)`);
}

function renderIncidenciasList() {
    const listContainer = document.getElementById('incidenciasList');
    const contador = document.getElementById('contadorInc');
    if (!listContainer) return;

    console.log('Rendering incidencias:', _incidenciasCache);

    const filterEstado = document.getElementById('filterIncEstado')?.value || 'all';
    const filterSede = document.getElementById('filterIncSede')?.value || 'all';

    // Filter out invalid entries
    let items = _incidenciasCache.filter(inc => 
        inc && inc.id && inc.titulo // ensure required fields exist
    );
    
    // Apply filters
    if (filterEstado !== 'all') {
        items = items.filter(i => {
            // handle both 'abierta' and 'pendiente' states
            if (filterEstado === 'pendiente') {
                return !i.estado || i.estado === 'pendiente' || i.estado === 'abierta';
            }
            return i.estado === filterEstado;
        });
    }
    
    if (filterSede !== 'all') {
        items = items.filter(i => i.sedeId === filterSede);
    }

    // Sort by date desc and priority
    items.sort((a, b) => {
        // Priority first: alta > media > baja
        const priorityMap = { alta: 3, media: 2, baja: 1 };
        const priorityDiff = (priorityMap[b.prioridad] || 0) - (priorityMap[a.prioridad] || 0);
        if (priorityDiff !== 0) return priorityDiff;
        
        // Then by date
        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });

    // Maps for labels
    const sedeMap = _sedesCache.reduce((acc, s) => { acc[s.id] = s.nombre; return acc; }, {});
    const tecMap = _tecnicosCache.reduce((acc, t) => { acc[t.id] = t.nombre; return acc; }, {});

    // Render list
    listContainer.innerHTML = items.length ? items.map(inc => `
        <div class="incidencia-item ${inc.prioridad || ''} ${inc.estado === 'cancelada' ? 'cancelada' : ''}" 
             data-id="${inc.id}">
            <div>
                <strong>${escapeHtml(inc.titulo)}</strong>
                <span class="badge ${inc.estado || 'pendiente'}">${inc.estado || 'pendiente'}</span>
            </div>
            ${inc.descripcion ? `<p style="margin:8px 0">${escapeHtml(inc.descripcion)}</p>` : ''}
            <div class="incidencia-meta">
                <span>Sede: ${escapeHtml(sedeMap[inc.sedeId] || 'No asignada')}</span>
            </div>
            ${inc.estado === 'asignada' && inc.tecnicoId && inc.fechaInicio ? `
                <div class="incidencia-asignacion">
                    <span><strong>Técnico:</strong> ${escapeHtml(tecMap[inc.tecnicoId] || inc.tecnicoId)}</span>
                    <span><strong>Cita:</strong> ${new Date(inc.fechaInicio).toLocaleString()}</span>
                </div>
            ` : ''}
            ${inc.estado === 'programada' && inc.fechaInicio ? `
                <div class="incidencia-asignacion">
                    <span><strong>Cita Programada:</strong> ${new Date(inc.fechaInicio).toLocaleString()}</span>
                </div>
            ` : ''}
            ${(!inc.estado || inc.estado === 'pendiente' || inc.estado === 'abierta') ? `
                <div class="incidencia-actions">
                    <button onclick="asignarIncidencia('${inc.id}')">Asignar Técnico</button>
                    <button onclick="programarIncidencia('${inc.id}')" class="secondary">Programar</button>
                    <button onclick="cancelarIncidencia('${inc.id}')" 
                            style="background:var(--danger)">Cancelar</button>
                </div>
            ` : ''}
            ${(inc.estado === 'programada') ? `
                <div class="incidencia-actions">
                    <button onclick="asignarIncidencia('${inc.id}')">Asignar Técnico</button>
                </div>
            ` : ''}
        </div>
    `).join('') : '<div style="color:var(--muted);text-align:center;padding:24px;">No hay incidencias</div>';

    contador && (contador.textContent = `${items.length} incidencia(s)`);
}

// Data loading functions
async function cargarTecnicos() {
    try {
        const response = await fetch('/tecnicos');
        if (!response.ok) {
            const err = await safeParseJSON(response);
            console.error('GET /tecnicos error:', response.status, err);
            document.getElementById('tecnicosList').innerText = 'Error al cargar técnicos';
            return;
        }
        const tecnicos = await response.json();
        _tecnicosCache = tecnicos || [];
        renderTecnicosFromCache();
    } catch (error) {
        console.error('Error:', error);
        document.getElementById('tecnicosList').innerText = 'Error de red';
    }
}

async function cargarSedes() {
    try {
        const response = await fetch('/sedes');
        if (!response.ok) {
            console.error('Error al cargar sedes', response.status);
            return;
        }
        const sedes = await response.json();
        _sedesCache = sedes || [];
        actualizarSelectsSedes();
    } catch (error) {
        console.error('Error al cargar sedes:', error);
    }
}

async function cargarIncidencias() {
    try {
        console.log('Loading incidencias...'); // Add debug
        const response = await fetch('/incidencias');
        if (!response.ok) {
            console.error('Error al cargar incidencias:', response.status);
            return;
        }
        const data = await response.json();
        console.log('Loaded incidencias:', data); // Add debug
        _incidenciasCache = data || [];
        renderIncidenciasList();
    } catch (error) {
        console.error('Error:', error);
        document.getElementById('incidenciasList').innerText = 'Error al cargar incidencias';
    }
}

// Helper to get the current selected day (from _selectedDay)
function getSelectedDay() {
    return _selectedDay;
}

// Function to update incident position (new or existing)
async function updateIncidentPosition(incidenciaId, newTecnicoId, newFechaInicio) {
    try {
        const response = await fetch(`/incidencias/${incidenciaId}/asignar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tecnicoId: newTecnicoId, fechaInicio: newFechaInicio.toISOString() })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Error al reasignar incidencia');
        }

        // Refresh incidencias and calendar
        await cargarIncidencias(); // This will update _incidenciasCache
        await loadEventos(); // This will update _eventosCache
        renderDayTimeline(getSelectedDay()); // Re-render the current day's timeline
        alert('Incidencia reasignada con éxito.');
    } catch (error) {
        console.error('Error reasignando incidencia:', error);
        alert(error.message || 'Error al reasignar incidencia.');
        // Revert visual position if update fails
        if (draggedEventBlock) {
            draggedEventBlock.style.left = `${originalLeftPct}%`;
            draggedEventBlock.style.width = `${originalWidthPct}%`;
            // If technician changed, move it back to original row
            if (originalTecnicoId && originalTecnicoId !== newTecnicoId) {
                const originalContainer = document.querySelector(`.tr-row[data-tecnico="${originalTecnicoId}"] .tr-cells`);
                if (originalContainer) {
                    originalContainer.appendChild(draggedEventBlock);
                }
            }
        }
    }
}

// normalize/load eventos (acepta {desde,hasta} o {fechaInicio,duracionHoras})
async function loadEventos() {
  try {
    const res = await fetch('/calendario');
    if (!res.ok) { _eventosCache = []; return; }
    const ev = await res.json();
    // El backend ahora devuelve los eventos normalizados con 'desde' y 'hasta'
    _eventosCache = (ev || []).map(e => {
      return Object.assign({}, e, {
        desde: e.desde ? new Date(e.desde) : null,
        hasta: e.hasta ? new Date(e.hasta) : null
      });
    });
  } catch (err) {
    console.error('Error cargando eventos:', err);
    _eventosCache = [];
  }
}

// renderDayTimeline corregida/alineada
async function renderDayTimeline(date) {
  const dayLabel = document.getElementById('dayLabel');
  const header = document.getElementById('timelineHeader');
  const rows = document.getElementById('timelineRows');
  if (!header || !rows || !dayLabel) return;

  // proteger en caso de llamarse sin fecha
  if (!date) {
    dayLabel.textContent = 'Seleccione un día';
    header.innerHTML = '';
    rows.innerHTML = '';
    return;
  }
  
  const selectedSede = document.getElementById('calSede')?.value || 'all';
  dayLabel.textContent = date.toLocaleDateString();

  // total unidades horizontales (horas) -> CAL_HOUR_END es hora final (ej. 18) exclusiva
  const totalUnits = Math.max(1, CAL_HOUR_END - CAL_HOUR_START);

  // header como grid con exactamente totalUnits columnas
  header.innerHTML = '';
  header.style.display = 'grid';
  header.style.gridTemplateColumns = `repeat(${totalUnits}, 1fr)`;
  header.style.gap = '0';
  for (let h = CAL_HOUR_START; h < CAL_HOUR_END; h++) {
    const hcell = document.createElement('div');
    hcell.className = 'th-cell';
    hcell.textContent = `${String(h).padStart(2,'0')}:00`;
    header.appendChild(hcell);
  }

  // técnicos filtrados
  let techs = _tecnicosCache.slice();
  if (selectedSede !== 'all') techs = techs.filter(t => t.sedeId === selectedSede);
  techs.sort((a,b) => (a.nombre||'').localeCompare(b.nombre||''));

  // Agrupar técnicos por sede
  const techsBySede = techs.reduce((acc, tec) => {
      const sedeId = tec.sedeId || 'sin_sede';
      if (!acc[sedeId]) acc[sedeId] = [];
      acc[sedeId].push(tec);
      return acc;
  }, {});

  const sedeMap = _sedesCache.reduce((acc, s) => { acc[s.id] = s.nombre; return acc; }, {});
  sedeMap['sin_sede'] = 'Sin Sede Asignada';

  // Definimos un ancho fijo para las etiquetas de los técnicos.
  const labelWidth = 180; // Ancho en píxeles para la columna de nombres.

  let html = '';
  const sedeIds = Object.keys(techsBySede).sort((a, b) => (sedeMap[a] || '').localeCompare(sedeMap[b] || ''));

  for (const sedeId of sedeIds) {
      // Añadir encabezado de sede si hay más de una sede visible
      if (sedeIds.length > 1) {
          html += `<div class="timeline-sede-header" style="padding-left: ${labelWidth}px;">${escapeHtml(sedeMap[sedeId])}</div>`;
      }
      techsBySede[sedeId].forEach(t => {
          html += `<div class="tr-row" data-tecnico="${t.id}">
              <div class="tr-label">${escapeHtml(t.nombre)}</div>
              <div class="tr-cells" data-tecnico="${t.id}"></div>
          </div>`;
      });
  }
  rows.innerHTML = html;
  
  // Aplicamos el mismo desplazamiento a la cabecera para que se alinee con las filas.
  header.style.paddingLeft = `${labelWidth}px`;
  header.style.boxSizing = 'border-box';

  // Usamos CSS Grid para alinear las etiquetas y las celdas de eventos.
  document.querySelectorAll('.tr-row').forEach(row => {
    row.style.display = 'grid';
    row.style.gridTemplateColumns = `${labelWidth}px 1fr`;
  });

  // Añadimos la posición relativa a las celdas para que los eventos se posicionen correctamente.
  document.querySelectorAll('.tr-cells').forEach(cell => {
    cell.style.position = 'relative';
    
    // Calculamos el ancho de cada columna de hora y lo pasamos al CSS.
    const colsPercent = 100 / totalUnits;
    cell.style.setProperty('--col-percent', `${colsPercent}%`);
  });

  // marcador "ahora" (si es hoy) — header necesita incluir labelWidth en el left
  const today = new Date();
  const isToday = date.getFullYear() === today.getFullYear() &&
              date.getMonth() === today.getMonth() &&
              date.getDate() === today.getDate();
  document.querySelectorAll('.now-marker').forEach(n => n.remove());
  if (isToday) {
    const nowHours = today.getHours() + today.getMinutes()/60;
    if (nowHours >= CAL_HOUR_START && nowHours <= CAL_HOUR_END) {
      const leftPctNow = ((nowHours - CAL_HOUR_START) / totalUnits) * 100;
      // marker en header -> considerar labelWidth
      const headerMarker = document.createElement('div');
      headerMarker.className = 'now-marker';
      headerMarker.style.left = `calc(${leftPctNow}% + ${labelWidth}px)`;
      header.appendChild(headerMarker);
      // marker en cada fila (sin offset)
      document.querySelectorAll('.tr-cells').forEach(c => {
        const m = document.createElement('div');
        m.className = 'now-marker';
        m.style.left = `${leftPctNow}%`;
        c.appendChild(m);
      });
    }
  }

  const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0,0,0);
  const dayEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23,59,59);

  const eventsOfDay = _eventosCache.filter(ev => {
    if (!ev.desde || !ev.hasta) return false;
    if (ev.desde > dayEnd || ev.hasta < dayStart) return false;
    if (selectedSede !== 'all' && ev.sedeId && ev.sedeId !== selectedSede) return false;
    return true;
  });

  // colocar eventos: calcular left/width usando totalUnits consistente
  eventsOfDay.forEach(ev => {
    const evTec = ev.tecnicoId;
    const container = document.querySelector(`.tr-row[data-tecnico="${evTec}"] .tr-cells`);
    if (!container) return;
    const evStart = ev.desde < dayStart ? dayStart : ev.desde;
    const evEnd = ev.hasta > dayEnd ? dayEnd : ev.hasta;
    const startHours = evStart.getHours() + evStart.getMinutes()/60;
    const endHours = evEnd.getHours() + evEnd.getMinutes()/60;
    const leftPct = Math.max(0, ((startHours - CAL_HOUR_START) / totalUnits) * 100);
    const widthPct = Math.max(0.5, ((endHours - startHours) / totalUnits) * 100);

    const block = document.createElement('div');
    block.className = 'event-block';
    block.style.left = `${leftPct}%`;
    block.style.width = `${widthPct}%`;
    block.title = ev.titulo || (ev.incidenciaId ? `Inc ${ev.incidenciaId}` : 'Evento');
    block.textContent = ev.titulo || '';

    // Add data attributes for dragging
    block.dataset.incidenciaId = ev.incidenciaId || ev.id;
    block.dataset.tecnicoId = ev.tecnicoId;
    block.dataset.fechaInicio = ev.desde.toISOString();

    // Add mousedown listener for dragging
    block.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return; // Only left click
        e.stopPropagation(); // Prevent parent elements from also handling mousedown

        isDragging = true;
        draggedEventBlock = e.target;
        draggedEventBlock.dataset.dragReady = 'true'; // Mark as ready to drag
        currentIncidenciaId = draggedEventBlock.dataset.incidenciaId;
        originalTecnicoId = draggedEventBlock.dataset.tecnicoId;
        originalFechaInicio = draggedEventBlock.dataset.fechaInicio;
        dragOffsetX = e.clientX - draggedEventBlock.getBoundingClientRect().left;
        originalLeftPct = parseFloat(draggedEventBlock.style.left);
        originalWidthPct = parseFloat(draggedEventBlock.style.width);
    });
    container.appendChild(block);
  });

  // Close event menu if clicking elsewhere
  document.body.addEventListener('click', (e) => {
      if (!e.target.closest('.event-block') && !e.target.closest('.event-menu')) {
          document.querySelectorAll('.event-menu').forEach(menu => menu.remove());
      }
  }, { once: false, capture: true });
}

// Global mouse move and up handlers for drag and drop
document.addEventListener('mousemove', (e) => {
    if (!isDragging || !draggedEventBlock || !draggedEventBlock.dataset.dragReady) return;

    // Start visual drag only after moving a few pixels
    if (!draggedEventBlock.classList.contains('dragging')) {
        draggedEventBlock.classList.add('dragging');
        document.body.style.cursor = 'grabbing';
        // Close any open menus when drag starts
        document.querySelectorAll('.event-menu').forEach(menu => menu.remove());
    }

    e.preventDefault(); // Prevent text selection etc.

    // Find the potential new parent row
    const currentParent = draggedEventBlock.parentElement;
    const parentRect = currentParent.getBoundingClientRect();
    
    // Calculate new left position relative to the parent, accounting for the initial click offset
    // We calculate relative to the *original* parent during the drag.
    // The change of parent happens only on mouseup.
    let newLeftPx = e.clientX - parentRect.left - dragOffsetX;

    // Constrain within parent bounds
    newLeftPx = Math.max(0, Math.min(newLeftPx, parentRect.width - draggedEventBlock.offsetWidth));

    const newLeftPct = (newLeftPx / parentRect.width) * 100;
    
    // Actualizar la posición visual del bloque mientras se arrastra
    draggedEventBlock.style.left = `${newLeftPct}%`;

    // Visual feedback for potential new technician row
    document.querySelectorAll('.tr-cells.drag-over').forEach(el => el.classList.remove('drag-over'));
    const targetCell = document.elementFromPoint(e.clientX, e.clientY)?.closest('.tr-cells');

    if (targetCell) {
        targetCell.classList.add('drag-over');
    }
});

document.addEventListener('mouseup', (e) => {
    if (!isDragging || !draggedEventBlock) return;

    const wasDragging = draggedEventBlock.classList.contains('dragging');
    const incidenciaId = currentIncidenciaId;

    // Reset dragging state
    isDragging = false;
    document.body.style.cursor = ''; // Reset cursor
    document.querySelectorAll('.tr-cells.drag-over').forEach(el => el.classList.remove('drag-over'));
    draggedEventBlock.classList.remove('dragging');
    delete draggedEventBlock.dataset.dragReady;

    // If it was NOT a real drag (just a click), show the menu
    if (!wasDragging) {
        // Close any other open menus
        document.querySelectorAll('.event-menu').forEach(menu => menu.remove());
        showEventMenu(draggedEventBlock, incidenciaId);
        draggedEventBlock = null; // Clear reference
        return;
    }


    const oldTecnicoId = originalTecnicoId;
    const oldFechaInicio = originalFechaInicio; // ISO string

    // Determine new technician and time
    const targetCell = document.elementFromPoint(e.clientX, e.clientY)?.closest('.tr-cells');
    let newTecnicoId = targetCell?.dataset.tecnico;

    const selectedDay = getSelectedDay();
    if (!selectedDay) {
        console.error('No day selected for timeline.');
        // Revert visual position
        draggedEventBlock.style.left = `${originalLeftPct}%`;
        draggedEventBlock.style.width = `${originalWidthPct}%`;
        // Reset global drag variables
        draggedEventBlock = null; currentIncidenciaId = null; originalTecnicoId = null; originalFechaInicio = null;
        return;
    }

    // Calculate new start time
    const parentRect = targetCell ? targetCell.getBoundingClientRect() : draggedEventBlock.parentElement.getBoundingClientRect();
    const finalLeftPx = draggedEventBlock.getBoundingClientRect().left - parentRect.left; // Position relative to new parent
    const finalLeftPct = (finalLeftPx / parentRect.width) * 100;

    const totalUnits = CAL_HOUR_END - CAL_HOUR_START;
    const hoursOffset = (finalLeftPct / 100) * totalUnits;
    const newStartHours = CAL_HOUR_START + hoursOffset;

    const newFechaInicio = new Date(selectedDay);
    // Snap to nearest 15-minute interval
    newFechaInicio.setHours(Math.floor(newStartHours), Math.round((newStartHours % 1) * 60 / 15) * 15, 0, 0);

    // If dropped outside a valid technician row, or if the technician is invalid, revert
    if (!newTecnicoId) {
        alert('Incidencia debe ser asignada a un técnico válido.');
        // Revert visual position and technician
        draggedEventBlock.style.left = `${originalLeftPct}%`;
        draggedEventBlock.style.width = `${originalWidthPct}%`;
        const originalContainer = document.querySelector(`.tr-row[data-tecnico="${oldTecnicoId}"] .tr-cells`);
        if (originalContainer && draggedEventBlock.parentElement !== originalContainer) {
            originalContainer.appendChild(draggedEventBlock);
        }
        // Reset global drag variables
        draggedEventBlock = null; currentIncidenciaId = null; originalTecnicoId = null; originalFechaInicio = null;
        return;
    }

    // Compare newFechaInicio with oldFechaInicio (ignoring seconds/ms for comparison)
    const newTimeStr = newFechaInicio.toISOString().slice(0, 16);
    const oldTimeStr = new Date(oldFechaInicio).toISOString().slice(0, 16);

    if (newTecnicoId !== oldTecnicoId || newTimeStr !== oldTimeStr) {
        // If the technician has changed, physically move the DOM element before updating.
        // This provides instant visual feedback before the full re-render.
        if (newTecnicoId !== oldTecnicoId && targetCell && draggedEventBlock.parentElement !== targetCell) {
            targetCell.appendChild(draggedEventBlock);
        }
        updateIncidentPosition(incidenciaId, newTecnicoId, newFechaInicio);
    } else {
        // No change, revert to original visual position (if any visual drift occurred)
        draggedEventBlock.style.left = `${originalLeftPct}%`;
        draggedEventBlock.style.width = `${originalWidthPct}%`;
    }

    // Reset global drag variables
    draggedEventBlock = null; currentIncidenciaId = null; originalTecnicoId = null; originalFechaInicio = null;
});

// Initialize everything when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Load data and initialize calendar
    Promise.all([cargarSedes(), cargarTecnicos()])
        .then(() => {
            cargarIncidencias();
            initCalendar();
        })
        .catch(err => {
            console.error('Error inicializando datos:', err);
        });

    // Tab switching logic
    const tabs = document.querySelectorAll('.tab-button');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            
            const tabId = tab.getAttribute('data-tab');
            document.getElementById(`${tabId}-tab`).classList.add('active');
        });
    });

    // Botón para mostrar/ocultar el calendario mensual (configurado una sola vez)
    const toggleBtn = document.getElementById('toggleCalendar');
    const monthContainer = document.getElementById('monthCalendar');
    toggleBtn?.addEventListener('click', () => {
        // Si está colapsado, lo expandimos y reseteamos la vista de día.
        if (monthContainer.classList.contains('collapsed')) {
            monthContainer.classList.remove('collapsed');
            selectDay(null); // Limpia la selección y el timeline
        } else {
            // Si está visible, simplemente lo colapsamos (acción de 'Ocultar').
            monthContainer.classList.add('collapsed');
        }
    });

    const form = document.getElementById('tecnicoForm');
    form?.addEventListener('submit', async (e) => {
        e.preventDefault();

        const tecnico = {
            nombre: document.getElementById('nombre')?.value,
            horario: document.getElementById('horario')?.value,
            sedeId: document.getElementById('sedeId')?.value || null
        };

        try {
            const response = await fetch('/tecnicos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(tecnico)
            });

            if (!response.ok) {
                const err = await safeParseJSON(response);
                console.error('Error al agregar técnico:', err || response.status);
                alert(err?.error || 'Error al agregar técnico');
                return;
            }

            form.reset();
            cargarTecnicos();
        } catch (error) {
            console.error('Error:', error);
            alert('Error de red');
        }
    });

    // controles de filtro/orden
    const filterSede = document.getElementById('filterSede');
    const sortBy = document.getElementById('sortBy');
    filterSede?.addEventListener('change', renderTecnicosFromCache);
    sortBy?.addEventListener('change', renderTecnicosFromCache);

    // Listener para ordenar sedes
    document.getElementById('sortSedes')?.addEventListener('change', renderSedesList);

    // delegación de eventos en la lista (botones)
    const listContainer = document.getElementById('tecnicosList');
    listContainer?.addEventListener('click', async (ev) => {
        const btn = ev.target.closest('button[data-action]');
        if (!btn) return;
        const id = btn.dataset.id;
        const action = btn.dataset.action;
        try {
            if (action === 'eliminar') {
                if (!confirm('Eliminar técnico permanentemente?')) return;
                await fetch('/tecnicos/' + id, { method: 'DELETE' });
            } else if (action === 'baja') {
                await fetch(`/tecnicos/${id}/baja`, { method: 'PATCH' });
            } else if (action === 'reactivar') {
                await fetch(`/tecnicos/${id}/reactivar`, { method: 'PATCH' });
            }
            cargarTecnicos();
        } catch (err) {
            console.error('Action error', err);
            alert('Error en la acción');
        }
    });

    document.getElementById('sedeForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const sede = {
            nombre: document.getElementById('nombreSede')?.value,
            direccion: document.getElementById('direccionSede')?.value,
            capacidad: {
                lun: document.getElementById('cap_lun')?.value,
                mar: document.getElementById('cap_mar')?.value,
                mie: document.getElementById('cap_mie')?.value,
                jue: document.getElementById('cap_jue')?.value,
                vie: document.getElementById('cap_vie')?.value
            },
            notas: document.getElementById('notasSede')?.value
        };

        try {
            const response = await fetch('/sedes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(sede)
            });

            if (!response.ok) {
                const err = await safeParseJSON(response);
                alert(err?.error || 'Error al agregar sede');
                return;
            }

            document.getElementById('sedeForm').reset();
            await cargarSedes();
            renderSedesList();
        } catch (error) {
            console.error('Error:', error);
            alert('Error de red');
        }
    });

    function renderSedesList() {
        const listContainer = document.getElementById('sedesList');
        const contador = document.getElementById('contadorSedes');
        if (!listContainer) return;

        const sortBy = document.getElementById('sortSedes')?.value || 'nombre_asc';
        
        let items = _sedesCache.slice().sort((a, b) => {
            if (sortBy === 'nombre_asc') return a.nombre.localeCompare(b.nombre);
            if (sortBy === 'nombre_desc') return b.nombre.localeCompare(a.nombre);
            return 0;
        });

        listContainer.innerHTML = items.map(sede => `
            <div class="sede-item" data-id="${sede.id}">
                <div>
                    <strong>Nombre:</strong> ${escapeHtml(sede.nombre)}<br>
                    <strong>Dirección:</strong> ${escapeHtml(sede.direccion || '')}<br>
                    ${sede.notas ? `<small><strong>Notas:</strong> ${escapeHtml(sede.notas)}</small><br>` : ''}
                </div>
                <div class="capacity-table">
                    <div class="day-capacity">
                        <span>Lun</span>
                        <input type="number" 
                               value="${sede.capacidad?.lun || 8}" 
                               min="0" max="24"
                               data-day="lun"
                               onchange="updateCapacidad('${sede.id}', this)">
                    </div>
                    <div class="day-capacity">
                        <span>Mar</span>
                        <input type="number" 
                               value="${sede.capacidad?.mar || 8}" 
                               min="0" max="24"
                               data-day="mar"
                               onchange="updateCapacidad('${sede.id}', this)">
                    </div>
                    <div class="day-capacity">
                        <span>Mié</span>
                        <input type="number" 
                               value="${sede.capacidad?.mie || 8}" 
                               min="0" max="24"
                               data-day="mie"
                               onchange="updateCapacidad('${sede.id}', this)">
                    </div>
                    <div class="day-capacity">
                        <span>Jue</span>
                        <input type="number" 
                               value="${sede.capacidad?.jue || 8}" 
                               min="0" max="24"
                               data-day="jue"
                               onchange="updateCapacidad('${sede.id}', this)">
                    </div>
                    <div class="day-capacity">
                        <span>Vie</span>
                        <input type="number" 
                               value="${sede.capacidad?.vie || 8}" 
                               min="0" max="24"
                               data-day="vie"
                               onchange="updateCapacidad('${sede.id}', this)">
                    </div>
                </div>
                <div style="margin-top:8px">
                    <button data-action="eliminar" data-id="${sede.id}" 
                            style="background:var(--danger)">Eliminar</button>
                </div>
            </div>
        `).join('');

        contador && (contador.textContent = `${items.length} sede(s)`);
    }

    // Modifica la función cargarSedes para llamar a renderSedesList
    async function cargarSedes() {
        try {
            const response = await fetch('/sedes');
            if (!response.ok) {
                console.error('Error al cargar sedes', response.status);
                return;
            }
            const sedes = await response.json();
            _sedesCache = sedes || [];
            
            // Actualizar selects de técnicos
            actualizarSelectsSedes();
            // Renderizar lista de sedes si estamos en esa tab
            renderSedesList();
        } catch (error) {
            console.error('Error al cargar sedes:', error);
        }
    }

    function actualizarSelectsSedes() {
        const sedeSelect = document.getElementById('sedeId');
        const filterSede = document.getElementById('filterSede');
        const filterIncSede = document.getElementById('filterIncSede');
        const sedeIncId = document.getElementById('sedeIncId');  // Add this selector
        
        // Clear all dynamic options from all selectors
        [sedeSelect, filterSede, filterIncSede, sedeIncId].forEach(select => {
            if (!select) return;
            const keepValue = select.getAttribute('data-keep-empty') === 'true' ? '' : 'all';
            select.querySelectorAll(`option:not([value="${keepValue}"])`).forEach(o => o.remove());
        });

        // Add options to all selectors
        _sedesCache.forEach(sede => {
            const sedes = [
                { elem: sedeSelect, empty: '' },
                { elem: filterSede, empty: 'all' },
                { elem: filterIncSede, empty: 'all' },
                { elem: sedeIncId, empty: '' }
            ];

            sedes.forEach(({elem, empty}) => {
                if (!elem) return;
                const opt = document.createElement('option');
                opt.value = sede.id;
                opt.textContent = sede.nombre;
                elem.appendChild(opt);
            });
        });
    }


    // inicializar calendario desde DOMContentLoaded (añadir llamadas en tu listener)
    async function initCalendar() {
      // llenar selector de sedes (usa _sedesCache)
      const calSede = document.getElementById('calSede');
      const btnAutoAsignar = document.getElementById('btnAutoAsignar');

      if (calSede) {
        // limpiar opciones dinámicas
        calSede.querySelectorAll('option:not([value="all"])').forEach(o => o.remove());
        
        const sedesOrdenadas = [..._sedesCache].sort((a, b) => a.nombre.localeCompare(b.nombre));
        sedesOrdenadas.forEach(s => {
          const opt = document.createElement('option');
          opt.value = s.id;
          opt.textContent = s.nombre;
          calSede.appendChild(opt);
        });
        calSede.addEventListener('change', () => {
          if (btnAutoAsignar) {
            btnAutoAsignar.disabled = calSede.value === 'all';
          }
          renderMonthCalendar(_calCurrent);
          // evitar llamar renderDayTimeline con _selectedDay nulo
          if (_selectedDay) renderDayTimeline(_selectedDay);
        });
      }

      document.getElementById('prevMonth')?.addEventListener('click', () => {
        // Siempre operar sobre el día 1 para evitar saltos de mes
        _calCurrent = new Date(_calCurrent.getFullYear(), _calCurrent.getMonth() - 1, 1);
        renderMonthCalendar(_calCurrent);
      });
      document.getElementById('nextMonth')?.addEventListener('click', () => {
        // Siempre operar sobre el día 1 para evitar saltos de mes
        _calCurrent = new Date(_calCurrent.getFullYear(), _calCurrent.getMonth() + 1, 1);
        renderMonthCalendar(_calCurrent);
      });
      await loadEventos();
      renderMonthCalendar(_calCurrent);
    }

    // Botón de auto-asignación
    document.getElementById('btnAutoAsignar')?.addEventListener('click', async () => {
        const sedeId = document.getElementById('calSede').value;
        const fecha = getSelectedDay();

        if (sedeId === 'all') {
            return alert('Por favor, selecciona una sede específica para la auto-asignación.');
        }
        if (!fecha) {
            return alert('Por favor, selecciona un día en el calendario para realizar la asignación.');
        }

        if (!confirm(`¿Deseas auto-asignar las incidencias pendientes para la sede seleccionada en la fecha ${fecha.toLocaleDateString()}?`)) {
            return;
        }

        try {
            const response = await fetch('/incidencias/auto-asignar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sedeId, fecha: fecha.toISOString() })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Error en la auto-asignación');
            
            alert(`Proceso finalizado.\nAsignadas: ${result.asignadas.length}\nNo asignadas: ${result.noAsignadas.length}`);
            await Promise.all([cargarIncidencias(), loadEventos()]);
            renderDayTimeline(fecha);
        } catch (error) {
            alert(`Error: ${error.message}`);
        }
    });

    function startOfMonth(date) {
      return new Date(date.getFullYear(), date.getMonth(), 1);
    }
    function endOfMonth(date) {
      return new Date(date.getFullYear(), date.getMonth() + 1, 0);
    }

    // helper: fecha en formato local YYYY-MM-DD (evita toISOString/timezone)
    function formatLocalDateKey(d) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }

    function renderMonthCalendar(dateObj) {
      const monthContainer = document.getElementById('monthCalendar');
      const label = document.getElementById('calMonthLabel');
      if (!monthContainer || !label) return;

      const year = dateObj.getFullYear();
      const month = dateObj.getMonth();
      label.textContent = dateObj.toLocaleString('default', { month: 'long', year: 'numeric' });

      monthContainer.innerHTML = '';

      const first = startOfMonth(dateObj);
      const last = endOfMonth(dateObj);

      const startWeekday = first.getDay();
      const weekDays = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
      const headerRow = document.createElement('div');
      headerRow.className = 'mc-row mc-weekdays';
      headerRow.innerHTML = weekDays.map(d => `<div class="mc-cell mc-weekday">${d}</div>`).join('');
      monthContainer.appendChild(headerRow);

      let cells = [];
      for (let i = 0; i < startWeekday; i++) cells.push(null);

      for (let d = 1; d <= last.getDate(); d++) {
        const dt = new Date(year, month, d); // local date
        cells.push(dt);
      }
      while (cells.length % 7 !== 0) cells.push(null);

      for (let r = 0; r < cells.length; r += 7) {
        const row = document.createElement('div');
        row.className = 'mc-row';
        const week = cells.slice(r, r + 7);
        row.innerHTML = week.map(day => {
          if (!day) return `<div class="mc-cell mc-empty"></div>`;
          const isoLocal = formatLocalDateKey(day); // local key
          const selectedSede = document.getElementById('calSede')?.value || 'all';
          const eventsCount = _eventosCache.filter(ev => {
            if (!ev.desde) return false;
            const evDateKey = formatLocalDateKey(ev.desde);
            if (evDateKey !== isoLocal) return false;
            if (selectedSede !== 'all' && ev.sedeId && ev.sedeId !== selectedSede) return false;
            return true;
          }).length;
          return `<div class="mc-cell mc-day" data-date="${isoLocal}">
                    <div class="mc-day-num">${day.getDate()}</div>
                    ${eventsCount ? `<div class="mc-badge">${eventsCount}</div>` : ''}
                  </div>`;
        }).join('');
        monthContainer.appendChild(row);
      }

      monthContainer.querySelectorAll('.mc-day').forEach(el => {
        el.addEventListener('click', () => {
          const iso = el.dataset.date; // YYYY-MM-DD local
          const [y, m, d] = iso.split('-').map(Number);
          selectDay(new Date(y, m - 1, d)); // create local date
        });
      });
    }

    function selectDay(date) {
      _selectedDay = date;
      const monthContainer = document.getElementById('monthCalendar');
      const toggleBtn = document.getElementById('toggleCalendar');

      // Si no hay fecha, expandimos calendario y limpiamos timeline
      if (!date) {
        monthContainer?.classList.remove('collapsed');
        toggleBtn && (toggleBtn.style.display = 'none');
        renderDayTimeline(null); // Limpia el timeline
        return;
      }


      // highlight selected cell
      document.querySelectorAll('.mc-day.selected').forEach(e => e.classList.remove('selected'));
      const isoLocal = formatLocalDateKey(date);
      const cell = document.querySelector(`.mc-day[data-date="${isoLocal}"]`);
      cell && cell.classList.add('selected');

      // render timeline
      renderDayTimeline(date);

      // Colapsar calendario y mostrar botón
      monthContainer?.classList.add('collapsed');
      toggleBtn && (toggleBtn.style.display = 'inline-flex');
      toggleBtn && (toggleBtn.textContent = 'Mostrar Calendario');
    }

    document.getElementById('incidenciaForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const incidencia = {
            titulo: document.getElementById('tituloInc')?.value,
            descripcion: document.getElementById('descripcionInc')?.value,
            sedeId: document.getElementById('sedeIncId')?.value,
            prioridad: document.getElementById('prioridadInc')?.value,
            duracionEstimadaHoras: document.getElementById('duracionInc')?.value,
            fechaLimite: document.getElementById('fechaLimiteInc')?.value || null
        };

        try {
            const response = await fetch('/incidencias', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(incidencia)
            });

            if (!response.ok) {
                const err = await response.json();
                alert(err?.error || 'Error al crear incidencia');
                return;
            }

            document.getElementById('incidenciaForm').reset();
            await cargarIncidencias();
        } catch (error) {
            console.error('Error:', error);
            alert('Error de red');
        }
    });

    // --- Lógica para Importar/Exportar por Módulo ---

    // Botones de exportación
    document.querySelectorAll('.export-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const module = e.target.dataset.module;
            if (module) {
                window.location.href = `/api/export/${module}`;
            }
        });
    });

    // Formularios de importación
    document.querySelectorAll('.import-form').forEach(form => {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const module = e.target.dataset.module;
            const fileInput = e.target.querySelector('input[type="file"]');
            const file = fileInput.files[0];

            if (!file) {
                return alert('Por favor, selecciona un archivo.');
            }

            if (!confirm(`¿Estás seguro de que quieres importar los datos de ${module}? Se sobrescribirán los datos actuales de este módulo.`)) {
                return;
            }

            const formData = new FormData();
            formData.append('importFile', file);

            try {
                const response = await fetch(`/api/import/${module}`, { method: 'POST', body: formData });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || 'Error en la importación');
                alert(result.message + ' La aplicación se recargará.');
                window.location.reload();
            } catch (error) {
                alert(`Error al importar: ${error.message}`);
            }
        });
    });

    // --- Lógica para Backup y Limpieza ---
    const btnBackup = document.getElementById('btnBackup');
    btnBackup?.addEventListener('click', () => {
        // Este endpoint proporciona un archivo de backup completo
        window.location.href = '/api/backup';
    });

    const btnCleanData = document.getElementById('btnCleanData');
    btnCleanData?.addEventListener('click', async () => {
        if (!confirm('¿Estás SEGURO de que quieres eliminar TODOS los datos de la aplicación? Esta acción es IRREVERSIBLE.')) {
            return;
        }
        if (!confirm('ÚLTIMA ADVERTENCIA: Todos los técnicos, sedes e incidencias serán eliminados permanentemente. ¿Continuar?')) {
            return;
        }

        try {
            const response = await fetch('/api/clean-data', { method: 'POST' });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Error en la limpieza');
            
            alert(result.message + ' La aplicación se recargará.');
            window.location.reload();
        } catch (error) {
            alert(`Error al limpiar los datos: ${error.message}`);
        }
    });

    const restoreBackupForm = document.getElementById('restoreBackupForm');
    restoreBackupForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fileInput = document.getElementById('backupFile');
        const file = fileInput.files[0];

        if (!file) {
            return alert('Por favor, selecciona un archivo de backup.');
        }

        if (!confirm('¿Estás seguro de que quieres restaurar esta copia de seguridad? Se sobrescribirán TODOS los datos actuales.')) {
            return;
        }

        const formData = new FormData();
        formData.append('backupFile', file);

        try {
            const response = await fetch('/api/restore-backup', { method: 'POST', body: formData });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Error en la restauración');
            
            alert(result.message + ' La aplicación se recargará.');
            window.location.reload();
        } catch (error) {
            alert(`Error al restaurar la copia de seguridad: ${error.message}`);
        }
    });
});

function safeParseJSON(response) {
    try { return response.json(); } catch { return null; }
}

// Add this function to handle capacity updates
async function updateCapacidad(sedeId, input) {
    const day = input.dataset.day;
    const value = parseInt(input.value) || 8;
    
    try {
        const sede = _sedesCache.find(s => s.id === sedeId);
        if (!sede) throw new Error('Sede no encontrada');

        const response = await fetch(`/sedes/${sedeId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                capacidad: {
                    ...sede.capacidad,
                    [day]: value
                }
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Error al actualizar capacidad');
        }

        // Update cache and re-render
        const updatedSede = await response.json();
        const index = _sedesCache.findIndex(s => s.id === sedeId);
        if (index !== -1) {
            _sedesCache[index] = updatedSede;
            renderSedesList();
        }
    } catch (error) {
        console.error('Error updating capacidad:', error);
        alert(error.message || 'Error al actualizar capacidad');
    }
}

async function programarIncidencia(id) {
    const inc = _incidenciasCache.find(i => i.id === id);
    if (!inc) return;

    // Create dialog
    const dialog = document.createElement('div');
    dialog.className = 'modal-dialog';
    dialog.innerHTML = `
        <div class="modal-content">
            <h3>Programar Cita</h3>
            <p>Establece una fecha y hora para la incidencia. Podrás asignar un técnico más tarde.</p>
            <div class="form-group">
                <label>Fecha y hora de la cita:</label>
                <input type="datetime-local" id="fechaProgramar" required>
            </div>
            <div class="modal-actions">
                <button id="btnProgramarConfirm">Programar</button>
                <button id="btnProgramarCancel" class="secondary">Cancelar</button>
            </div>
        </div>
    `;

    // Add dialog styles if not present
    if (!document.querySelector('#modalStyles')) {
        const style = document.createElement('style');
        style.id = 'modalStyles';
        style.textContent = `
            .modal-dialog { 
                position: fixed; z-index: 100; top: 0; left: 0; right: 0; bottom: 0;
                background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center;
            }
            .modal-content {
                background: var(--surface); padding: 24px; border-radius: 12px;
                box-shadow: 0 8px 32px rgba(0,0,0,0.4); width: 90%; max-width: 400px;
            }
            .modal-actions { display: flex; gap: 8px; margin-top: 24px; }
            .secondary { background: transparent; border: 1px solid var(--border); }
        `;
        document.head.appendChild(style);
    }

    document.body.appendChild(dialog);

    // Set default date/time (next hour)
    const defaultDate = new Date();
    defaultDate.setHours(defaultDate.getHours() + 1, 0, 0, 0);
    document.getElementById('fechaProgramar').value = defaultDate.toISOString().slice(0,16);

    // Handle actions
    return new Promise((resolve, reject) => {
        document.getElementById('btnProgramarConfirm').onclick = async () => {
            const fechaInicio = document.getElementById('fechaProgramar').value;
            if (!fechaInicio) {
                alert('Debes seleccionar una fecha y hora.');
                return;
            }
            
            try {
                const response = await fetch(`/incidencias/${id}/programar`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fechaInicio })
                });

                if (!response.ok) {
                    const err = await response.json();
                    throw new Error(err.error || 'Error al programar la incidencia');
                }

                dialog.remove();
                await cargarIncidencias();
                resolve();
            } catch (error) {
                alert(error.message);
                reject(error);
            }
        };

        document.getElementById('btnProgramarCancel').onclick = () => {
            dialog.remove();
            resolve();
        };
    });
}

function showEventMenu(eventBlock, incidenciaId) {
    const menu = document.createElement('div');
    menu.className = 'event-menu';
    menu.innerHTML = `<button data-action="desasignar">Desasignar</button>`;
    
    document.body.appendChild(menu);

    const blockRect = eventBlock.getBoundingClientRect();
    menu.style.left = `${blockRect.left}px`;
    menu.style.top = `${blockRect.bottom + 4}px`;

    menu.querySelector('button[data-action="desasignar"]').addEventListener('click', async () => {
        menu.remove();
        await desasignarIncidenciaCalendario(incidenciaId);
    });
}

async function desasignarIncidenciaCalendario(id) {
    if (!confirm('¿Seguro que deseas desasignar esta incidencia? Volverá al estado "pendiente".')) {
        return;
    }

    try {
        const response = await fetch(`/incidencias/${id}/desasignar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Error al desasignar la incidencia');
        }

        // Refresh data and UI
        await Promise.all([
            cargarIncidencias(),
            loadEventos()
        ]);
        
        // Re-render the timeline for the currently selected day
        const selectedDay = getSelectedDay();
        if (selectedDay) {
            renderDayTimeline(selectedDay);
        }

    } catch (error) {
        alert(`Error: ${error.message}`);
    }
}

// Add these functions for incidencia actions
async function cancelarIncidencia(id) {
    if (!confirm('¿Seguro que deseas cancelar esta incidencia?')) return;
    
    try {
        const response = await fetch(`/incidencias/${id}/cancelar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Error al cancelar incidencia');
        }

        // Refresh incidencias after cancellation
        await cargarIncidencias();
    } catch (error) {
        console.error('Error:', error);
        alert(error.message || 'Error al cancelar incidencia');
    }
}

async function asignarIncidencia(id) {
    // Get current incidencia
    const inc = _incidenciasCache.find(i => i.id === id);
    if (!inc) return;

    // Group active technicians by sede
    const tecnicosActivos = _tecnicosCache.filter(t => t.activo !== false);
    if (!tecnicosActivos.length) {
        alert('No hay técnicos activos en el sistema.');
        return;
    }

    const tecnicosPorSede = tecnicosActivos.reduce((acc, tec) => {
        const sedeId = tec.sedeId || 'sin_sede';
        if (!acc[sedeId]) acc[sedeId] = [];
        acc[sedeId].push(tec);
        return acc;
    }, {});

    const sedeMap = _sedesCache.reduce((acc, s) => { acc[s.id] = s.nombre; return acc; }, {});
    sedeMap['sin_sede'] = 'Sin Sede Asignada';

    const sedeIncidencia = inc.sedeId || 'sin_sede';

    // Generate HTML for select options, prioritizing the incident's sede
    let optionsHtml = '';
    if (tecnicosPorSede[sedeIncidencia]) {
        optionsHtml += `<optgroup label="${escapeHtml(sedeMap[sedeIncidencia])} (Sede de la incidencia)">
            ${tecnicosPorSede[sedeIncidencia].map(t => `<option value="${t.id}">${escapeHtml(t.nombre)}</option>`).join('')}
        </optgroup>`;
    }
    for (const sedeId in tecnicosPorSede) {
        if (sedeId !== sedeIncidencia) {
            optionsHtml += `<optgroup label="${escapeHtml(sedeMap[sedeId])}">
                ${tecnicosPorSede[sedeId].map(t => `<option value="${t.id}">${escapeHtml(t.nombre)}</option>`).join('')}
            </optgroup>`;
        }
    }

    // Create assignment dialog
    const dialog = document.createElement('div');
    dialog.className = 'modal-dialog';
    dialog.innerHTML = `
        <div class="modal-content">
            <h3>Asignar Técnico a Incidencia</h3>
            <div class="form-group">
                <label>Técnico:</label>
                <select id="tecnicoAsignar">
                    ${optionsHtml}
                </select>
            </div>
            <div class="form-group">
                <label>Fecha y hora:</label>
                <input type="datetime-local" id="fechaAsignar" required>
            </div>
            <div class="modal-actions">
                <button id="btnAsignarConfirm">Asignar</button>
                <button id="btnAsignarCancel" class="secondary">Cancelar</button>
            </div>
        </div>
    `;

    // Add dialog styles if not present
    if (!document.querySelector('#modalStyles')) {
        const style = document.createElement('style');
        style.id = 'modalStyles';
        style.textContent = `
            .modal-dialog { 
                position: fixed; z-index: 100; top: 0; left: 0; right: 0; bottom: 0;
                background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center;
            }
            .modal-content {
                background: var(--surface); padding: 24px; border-radius: 12px;
                box-shadow: 0 8px 32px rgba(0,0,0,0.4); width: 90%; max-width: 400px;
            }
            .modal-actions { display: flex; gap: 8px; margin-top: 24px; }
            .secondary { background: transparent; border: 1px solid var(--border); }
        `;
        document.head.appendChild(style);
    }

    // Add to document
    document.body.appendChild(dialog);

    // Set default date/time (next hour)
    const fechaInput = document.getElementById('fechaAsignar');
    if (inc.fechaInicio) {
        // If already scheduled, use that date
        fechaInput.value = new Date(inc.fechaInicio).toISOString().slice(0,16);
    } else {
        const defaultDate = new Date();
        defaultDate.setHours(defaultDate.getHours() + 1, 0, 0, 0);
        fechaInput.value = defaultDate.toISOString().slice(0,16);
    }

    // Handle actions
    return new Promise((resolve, reject) => {
        document.getElementById('btnAsignarConfirm').onclick = async () => {
            const tecnicoId = document.getElementById('tecnicoAsignar').value;
            const fechaInicio = document.getElementById('fechaAsignar').value;
            
            try {
                const response = await fetch(`/incidencias/${id}/asignar`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tecnicoId, fechaInicio })
                });

                if (!response.ok) {
                    const err = await response.json();
                    throw new Error(err.error || 'Error al asignar incidencia');
                }

                dialog.remove();
                await cargarIncidencias();
                resolve();
            } catch (error) {
                console.error('Error:', error);
                alert(error.message || 'Error al asignar incidencia');
                reject(error);
            }
        };

        document.getElementById('btnAsignarCancel').onclick = () => {
            dialog.remove();
            resolve();
        };
    });
}

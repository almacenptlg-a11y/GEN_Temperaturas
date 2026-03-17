// =========================================================================
// SCRIPT.JS - CONTROL DE TEMPERATURAS (OPTIMIZADO: RENDIMIENTO Y SEGURIDAD)
// =========================================================================

const API_URL = "https://script.google.com/macros/s/AKfycbw9DjZJw8DelWMQQKvUxGhjHs1Ka0sWZPyHBu4lYwMg-2L-avGrzWNEoZOMXT8x9g3c/exec"; 
const TODOS_LOS_TURNOS = ['07:30', '09:30', '11:30', '13:30', '15:30', '17:30'];

// 1. ESTADO CENTRALIZADO DE LA APLICACIÓN
const AppState = {
    user: null,
    isSessionVerified: false,
    camaras: [],
    revisionData: [],
    configRev: { mes: null, anio: null, usaHumedad: false },
    cambiosCart: {},
    modoEdicion: false
};

// ==========================================
// 2. SEGURIDAD Y GESTIÓN DE SESIÓN
// ==========================================

window.addEventListener('message', (event) => {
    const { type, user, theme } = event.data || {};
    
    if (type === 'THEME_UPDATE') {
        document.documentElement.classList.toggle('dark', theme === 'dark');
    }

    if (type === 'SESSION_SYNC' && user) {
        document.documentElement.classList.toggle('dark', theme === 'dark');
        
        // SEGURIDAD: Validar si el usuario cambió respecto a la caché
        const isNewUser = !AppState.user || AppState.user.usuario !== user.usuario;
        
        AppState.user = user;
        AppState.isSessionVerified = true;
        sessionStorage.setItem('moduloUser', JSON.stringify(user));
        
        actualizarUIUsuario();

        // Si es un usuario nuevo o las cámaras no han cargado, recargar catálogo
        if (isNewUser || AppState.camaras.length === 0) cargarCamaras();
    }
});

document.addEventListener('DOMContentLoaded', () => {
    configurarFechaInicial();
    
    const savedUser = sessionStorage.getItem('moduloUser');
    if (savedUser) {
        AppState.user = JSON.parse(savedUser);
        actualizarUIUsuario();
        cargarCamaras(); 
    }
    
    window.parent.postMessage({ type: 'MODULO_LISTO' }, '*');
    
    setTimeout(() => {
        if (!AppState.isSessionVerified) {
            document.getElementById('txt-usuario-activo').innerHTML = '<i class="ph ph-warning text-red-500"></i> Esperando autorización...';
            document.getElementById('btn-guardar-lectura').disabled = true;
        }
    }, 4000);
});

function actualizarUIUsuario() {
    if(!AppState.user) return;
    document.getElementById('txt-usuario-activo').innerHTML = `<i class="ph ph-user-check"></i> ${AppState.user.nombre} | ${AppState.user.area}`;
}

function configurarFechaInicial() {
    const hoy = new Date();
    hoy.setHours(hoy.getHours() - 5); 
    document.getElementById('val-fecha').value = hoy.toISOString().split('T')[0]; 
}

// ==========================================
// 3. CONEXIÓN API (CORE)
// ==========================================
async function apiFetch(payload) {
    try {
        const response = await fetch(API_URL, { method: 'POST', body: JSON.stringify(payload) });
        return await response.json();
    } catch (error) { throw new Error("Fallo de red"); }
}

async function cargarCamaras() {
    if(!AppState.user) return;
    const select = document.getElementById('camara-select');
    
    try {
        const res = await apiFetch({ action: 'getCamarasConfig', userEmail: AppState.user.usuario, userRol: AppState.user.rol, userArea: AppState.user.area });
        if (res.status === 'success') {
            AppState.camaras = res.data;
            select.innerHTML = '<option value="">Seleccione una cámara...</option>' + 
                               AppState.camaras.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');
            
            select.disabled = false;
            select.classList.replace('bg-gray-50', 'bg-white');
            select.classList.remove('cursor-not-allowed', 'dark:bg-gray-700');
            select.classList.add('dark:bg-gray-800');
            
            const btn = document.getElementById('btn-guardar-lectura');
            btn.classList.replace('bg-gray-400', 'bg-blue-600');
            btn.classList.replace('dark:bg-gray-600', 'hover:bg-blue-700');
            btn.classList.remove('cursor-not-allowed');
            btn.innerHTML = '<i class="ph ph-floppy-disk text-2xl"></i> Registrar Lectura';
        }
    } catch (e) { select.innerHTML = '<option value="">Error de conexión</option>'; }
}

// ==========================================
// 4. REGISTRO DIARIO Y TRIGGERS (VISTA 1)
// ==========================================

document.getElementById('camara-select').addEventListener('change', manejarCambioCamara);
document.getElementById('val-fecha').addEventListener('change', verificarTurnosDisponibles); 

function manejarCambioCamara(e) {
    const camara = AppState.camaras.find(c => c.id == e.target.value);
    const ui = {
        boxHum: document.getElementById('box-humedad'),
        banner: document.getElementById('banner-limites'),
        valHum: document.getElementById('val-humedad')
    };
    
    if (!camara) {
        ui.banner.classList.add('hidden'); ui.boxHum.classList.add('hidden');
        ui.valHum.removeAttribute('required');
        verificarTurnosDisponibles(); 
        return;
    }

    ui.banner.classList.remove('hidden');
    document.getElementById('txt-limites-temp').innerHTML = `<i class="ph ph-thermometer-simple text-blue-600"></i> Temp: ${camara.minTemp}°C a ${camara.maxTemp}°C`;

    if (camara.minHr && camara.maxHr) {
        ui.boxHum.classList.remove('hidden');
        ui.valHum.setAttribute('required', 'true');
        const minH = camara.minHr <= 1 ? camara.minHr * 100 : camara.minHr;
        const maxH = camara.maxHr <= 1 ? camara.maxHr * 100 : camara.maxHr;
        document.getElementById('txt-limites-hr').innerHTML = `<i class="ph ph-drop text-blue-600"></i> HR: ${minH}% a ${maxH}%`;
    } else {
        ui.boxHum.classList.add('hidden');
        ui.valHum.removeAttribute('required');
        document.getElementById('txt-limites-hr').innerHTML = '';
    }
    
    verificarTurnosDisponibles();
    evaluarParametrosEnVivo();
}

async function verificarTurnosDisponibles() {
    const idCamara = document.getElementById('camara-select').value;
    const fecha = document.getElementById('val-fecha').value;
    const container = document.getElementById('turnos-container');
    document.getElementById('turno-seleccionado').value = ''; 

    if (!idCamara || fecha.length !== 10) {
        container.innerHTML = '<div class="col-span-3 md:col-span-6 text-sm text-gray-500 py-3 text-center bg-gray-50 dark:bg-gray-800 rounded-xl border border-dashed dark:border-gray-600">Seleccione cámara y fecha...</div>';
        return;
    }
    
    container.innerHTML = '<div class="col-span-3 md:col-span-6 text-sm text-blue-600 font-bold py-4 text-center bg-blue-50 dark:bg-blue-900/30 rounded-lg"><i class="ph ph-spinner animate-spin text-xl inline-block mr-2"></i> Consultando turnos...</div>';

    try {
        const res = await apiFetch({ action: 'getTurnosRegistrados', idCamara, fecha: fecha.split('-').reverse().join('/') });
        if (res.status === 'success') {
            container.innerHTML = '';
            let disp = 0;
            TODOS_LOS_TURNOS.forEach(turno => {
                const btn = document.createElement('button');
                btn.type = 'button';
                const ocupado = res.data.includes(turno);
                
                btn.className = ocupado 
                    ? "py-3 rounded-xl border bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed flex flex-col items-center opacity-70"
                    : "turno-btn py-3 rounded-xl border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 hover:border-blue-400 hover:bg-blue-50 transition-all flex flex-col items-center cursor-pointer shadow-sm";
                
                btn.innerHTML = ocupado ? `<i class="ph ph-check-square-offset text-2xl"></i><span class="font-bold text-sm">${turno}</span>` 
                                        : `<i class="ph ph-clock text-2xl"></i><span class="font-bold text-sm">${turno}</span>`;
                btn.disabled = ocupado;
                if(!ocupado) { btn.onclick = () => seleccionarBotonTurno(turno, btn); disp++; }
                container.appendChild(btn);
            });
            if (disp === 0) container.innerHTML = '<div class="col-span-3 md:col-span-6 text-center text-amber-700 font-bold bg-amber-50 p-4 rounded-lg">⚠️ Turnos completados.</div>';
        }
    } catch (e) { container.innerHTML = '<div class="col-span-3 md:col-span-6 text-center text-red-600 font-bold bg-red-50 p-3 rounded-lg">Error de red.</div>'; }
}

function seleccionarBotonTurno(turno, btnActivado) {
    document.getElementById('turno-seleccionado').value = turno;
    document.querySelectorAll('.turno-btn').forEach(b => {
        b.className = "turno-btn py-3 rounded-xl border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:border-blue-400 transition-all flex flex-col items-center cursor-pointer shadow-sm";
        b.querySelector('i').className = 'ph ph-clock text-2xl';
    });
    btnActivado.className = "turno-btn py-3 rounded-xl border-2 border-blue-600 bg-blue-50 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 shadow-md scale-[1.02] flex flex-col items-center cursor-pointer";
    btnActivado.querySelector('i').className = 'ph ph-check-circle-fill text-2xl text-blue-600 dark:text-blue-400';
}

document.getElementById('val-temp').addEventListener('input', evaluarParametrosEnVivo);
document.getElementById('val-humedad').addEventListener('input', evaluarParametrosEnVivo);

function evaluarParametrosEnVivo() {
    const camara = AppState.camaras.find(c => c.id == document.getElementById('camara-select').value);
    const panel = document.getElementById('panel-estado');
    const tempVal = document.getElementById('val-temp').value;
    const humVal = document.getElementById('val-humedad').value;
    const inputInc = document.getElementById('val-incidencia');
    
    if (!camara || tempVal === '') return panel.classList.add('hidden');

    const temp = parseFloat(tempVal);
    const hum = humVal ? parseFloat(humVal) : null;

    const tOk = temp >= camara.minTemp && temp <= camara.maxTemp;
    let hOk = true;
    if (camara.minHr && hum !== null) {
        const mH = camara.minHr <= 1 ? camara.minHr * 100 : camara.minHr;
        const xH = camara.maxHr <= 1 ? camara.maxHr * 100 : camara.maxHr;
        hOk = hum >= mH && hum <= xH;
    }

    panel.classList.remove('hidden');
    if (tOk && hOk) {
        panel.className = 'rounded-xl p-4 border flex items-start gap-4 bg-green-50 dark:bg-green-900/30 border-green-200';
        document.getElementById('icono-estado').innerHTML = '<i class="ph ph-check-circle text-4xl text-green-600"></i>';
        document.getElementById('titulo-estado').innerHTML = '<span class="text-green-800 dark:text-green-400 font-bold">RANGO OK</span>';
        document.getElementById('desc-estado').innerHTML = '<span class="text-green-700 dark:text-green-500 text-sm">Proceda a registrar.</span>';
        inputInc.removeAttribute('required'); 
    } else {
        panel.className = 'rounded-xl p-4 border flex items-start gap-4 bg-red-50 dark:bg-red-900/30 border-red-300 animate-pulse';
        document.getElementById('icono-estado').innerHTML = '<i class="ph ph-warning-octagon text-4xl text-red-600"></i>';
        document.getElementById('titulo-estado').innerHTML = '<span class="text-red-800 dark:text-red-400 font-bold">⚠️ DESVIACIÓN DETECTADA</span>';
        document.getElementById('desc-estado').innerHTML = '<span class="text-red-700 dark:text-red-500 text-sm">Describa medida correctiva (Obligatorio).</span>';
        inputInc.setAttribute('required', 'true'); 
    }
}

// GUARDAR REGISTRO
document.getElementById('form-lectura-camara').addEventListener('submit', async (e) => {
    e.preventDefault();
    if(!AppState.isSessionVerified) return alert("Sesión no validada.");
    
    const turnoElegido = document.getElementById('turno-seleccionado').value;
    if (!turnoElegido) return alert("Seleccione un turno.");

    const btn = document.getElementById('btn-guardar-lectura');
    btn.disabled = true; btn.innerHTML = '<i class="ph ph-spinner animate-spin text-xl"></i> Guardando...';

    const payload = {
        action: 'registrarLecturaCamara',
        idCamara: document.getElementById('camara-select').value,
        fecha: document.getElementById('val-fecha').value.split('-').reverse().join('/'),
        turno: turnoElegido,
        temperatura: document.getElementById('val-temp').value,
        humedad: document.getElementById('val-humedad').value,
        incidencia: document.getElementById('val-incidencia').value,
        userName: AppState.user.nombre 
    };

    try {
        const res = await apiFetch(payload);
        if (res.status === 'success') {
            btn.innerHTML = '<i class="ph ph-check-circle text-xl"></i> ¡Exito!';
            setTimeout(() => {
                document.getElementById('form-lectura-camara').reset();
                configurarFechaInicial(); 
                document.getElementById('panel-estado').classList.add('hidden');
                verificarTurnosDisponibles();
                btn.disabled = false; btn.innerHTML = '<i class="ph ph-floppy-disk text-2xl"></i> Registrar Lectura';
            }, 1500);
        } else throw new Error(res.message);
    } catch (e) { alert('Error: ' + e.message); btn.disabled = false; btn.innerHTML = '<i class="ph ph-floppy-disk text-2xl"></i> Registrar'; }
});


// ==========================================
// 5. NAVEGACIÓN Y DASHBOARD JEFATURA
// ==========================================
document.getElementById('tab-registro').addEventListener('click', () => switchTab('registro'));
document.getElementById('tab-revision').addEventListener('click', () => switchTab('revision'));
document.getElementById('tab-dashboard').addEventListener('click', () => switchTab('dashboard')); // NUEVO

function switchTab(tab) {
    const vReg = document.getElementById('vista-registro'), 
          vRev = document.getElementById('vista-revision'),
          vDash = document.getElementById('vista-dashboard'); // NUEVO
          
    const tReg = document.getElementById('tab-registro'), 
          tRev = document.getElementById('tab-revision'),
          tDash = document.getElementById('tab-dashboard'); // NUEVO

    const actClass = ['border-blue-600','text-blue-600','dark:text-blue-400'];
    const inactClass = ['border-transparent','text-gray-500','dark:text-gray-400'];

    // Ocultar todas las vistas y limpiar estilos
    [vReg, vRev, vDash].forEach(v => { v.classList.replace('block', 'hidden'); v.classList.replace('flex', 'hidden'); });
    [tReg, tRev, tDash].forEach(t => { t.classList.add(...inactClass); t.classList.remove(...actClass); });

    // Mostrar vista seleccionada
    if (tab === 'registro') {
        vReg.classList.replace('hidden', 'block'); 
        tReg.classList.add(...actClass); tReg.classList.remove(...inactClass);
    } else if (tab === 'revision') {
        vRev.classList.replace('hidden', 'flex'); 
        tRev.classList.add(...actClass); tRev.classList.remove(...inactClass);
        const revC = document.getElementById('rev-camara');
        if (revC.options.length <= 1 && AppState.camaras.length > 0) {
            revC.innerHTML = '<option value="">Seleccione...</option>' + AppState.camaras.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');
            const hoy = new Date();
            document.getElementById('rev-mes').value = hoy.getMonth() + 1;
            document.getElementById('rev-anio').value = hoy.getFullYear();
        }
    } else if (tab === 'dashboard') {
        vDash.classList.replace('hidden', 'flex'); 
        tDash.classList.add(...actClass); tDash.classList.remove(...inactClass);
        // Setear fecha por defecto si está vacío
        if(!document.getElementById('dash-mes').value) {
            const hoy = new Date();
            document.getElementById('dash-mes').value = hoy.getMonth() + 1;
            document.getElementById('dash-anio').value = hoy.getFullYear();
        }
    }
}

document.getElementById('rev-camara').addEventListener('change', (e) => {
    const c = AppState.camaras.find(c => c.id == e.target.value);
    const tools = document.getElementById('rev-herramientas');
    if (!c) return tools.classList.add('hidden');
    
    document.getElementById('rev-txt-temp').innerHTML = `<i class="ph ph-thermometer-simple text-blue-600 dark:text-blue-400"></i> ${c.minTemp}°C a ${c.maxTemp}°C`;
    document.getElementById('rev-txt-hr').innerHTML = (c.minHr) ? `<i class="ph ph-drop text-blue-600 dark:text-blue-400"></i> ${(c.minHr<=1?c.minHr*100:c.minHr)}% a ${(c.maxHr<=1?c.maxHr*100:c.maxHr)}%` : '';
    tools.classList.remove('hidden'); tools.classList.add('flex');
});

document.getElementById('btn-generar-reporte').addEventListener('click', async () => {
    const idC = document.getElementById('rev-camara').value;
    const m = document.getElementById('rev-mes').value;
    const a = document.getElementById('rev-anio').value;
    
    if (!idC) return alert("Seleccione cámara.");
    ['btn-descargar-pdf', 'btn-imprimir'].forEach(id => document.getElementById(id).classList.add('hidden'));

    const cSel = AppState.camaras.find(c => c.id == idC);
    AppState.configRev = { mes: parseInt(m), anio: parseInt(a), usaHumedad: !!cSel.minHr };

    const btn = document.getElementById('btn-generar-reporte');
    const origHTML = btn.innerHTML;
    btn.disabled = true; btn.innerHTML = '<i class="ph ph-spinner animate-spin text-xl"></i>';
    
    document.getElementById('tabla-container').classList.add('hidden');
    const msg = document.getElementById('tabla-mensaje');
    msg.classList.remove('hidden'); msg.innerHTML = '<i class="ph ph-spinner animate-spin text-4xl text-blue-500"></i><br>Procesando Matriz...';

    try {
        if (Object.keys(AppState.cambiosCart).length > 0) { AppState.cambiosCart = {}; actualizarPanelMasivo(); }
        const res = await apiFetch({ action: 'getRegistrosRevision', idCamara: idC, mes: m, anio: a });
        
        if (res.status === 'success') {
            AppState.revisionData = res.data; 
            if (AppState.revisionData.length === 0 && !AppState.modoEdicion) {
                msg.innerHTML = '<i class="ph ph-folder-open text-5xl text-gray-400"></i><br>Sin registros.';
            } else {
                msg.classList.add('hidden');
                document.getElementById('tabla-container').classList.remove('hidden');
                dibujarMatrizUI();
                ['btn-descargar-pdf', 'btn-imprimir'].forEach(id => document.getElementById(id).classList.remove('hidden'));
            }
        } else throw new Error(res.message);
    } catch (e) { msg.innerHTML = 'Error de red.'; } 
    finally { btn.disabled = false; btn.innerHTML = origHTML; }
});

// ==========================================
// 6. MOTOR DE MATRIZ Y EDICIÓN MASIVA (CON FIX DARK MODE)
// ==========================================
document.getElementById('btn-toggle-edicion').addEventListener('click', () => {
    const rols = ['JEFE', 'ADMINISTRADOR', 'SUPERVISOR'];
    if (!AppState.user || !rols.includes(AppState.user.rol.toUpperCase())) return alert("Permisos insuficientes.");
    
    if (Object.keys(AppState.cambiosCart).length > 0) {
        if(!confirm("Tienes cambios sin guardar. Se perderán. ¿Continuar?")) return;
        AppState.cambiosCart = {}; actualizarPanelMasivo();
    }
    
    AppState.modoEdicion = !AppState.modoEdicion;
    const btn = document.getElementById('btn-toggle-edicion');
    
    btn.classList.toggle('bg-blue-600', AppState.modoEdicion); btn.classList.toggle('bg-white', !AppState.modoEdicion);
    btn.classList.toggle('text-white', AppState.modoEdicion); btn.classList.toggle('text-gray-800', !AppState.modoEdicion);
    document.getElementById('txt-btn-edicion').innerText = AppState.modoEdicion ? "Cerrar Edición" : "Activar Edición";
    
    if (AppState.revisionData.length > 0 || AppState.configRev.mes) dibujarMatrizUI();
});

function dibujarMatrizUI() {
    const data = AppState.revisionData, { anio, mes, usaHumedad } = AppState.configRev;
    const diasEnMes = new Date(anio, mes, 0).getDate();
    
    // CORRECCIÓN DARK MODE: Cabeceras 
    let head = `<tr><th rowspan="2" class="sticky top-0 left-0 z-30 px-4 py-3 bg-blue-50 dark:bg-blue-900/60 text-blue-800 dark:text-blue-200 w-16 text-center border-b border-r border-gray-200 dark:border-gray-700 shadow-sm">DÍA</th>`;
    TODOS_LOS_TURNOS.forEach(t => head += `<th colspan="${usaHumedad?2:1}" class="sticky top-0 z-20 px-4 py-2 text-center border-b border-r border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 shadow-sm">${t}</th>`);
    head += '</tr>';
    
    if (usaHumedad) {
        head += `<tr>`; 
        TODOS_LOS_TURNOS.forEach(() => { 
            head += `<th class="sticky top-[36px] z-20 px-2 py-1 text-center text-[11px] font-bold border-b border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 text-gray-500 dark:text-gray-400">°C</th>
                     <th class="sticky top-[36px] z-20 px-2 py-1 text-center text-[11px] font-bold border-b border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 text-blue-600 dark:text-blue-400">%HR</th>`; 
        }); 
        head += '</tr>';
    }
    document.getElementById('tabla-head').innerHTML = head;

    let body = '';
    const roles = ['JEFE', 'ADMINISTRADOR', 'SUPERVISOR'];
    const puedeEditar = AppState.user && roles.includes(AppState.user.rol.toUpperCase());
    const feriados = ['01/01', '01/05', '07/06', '29/06', '23/07', '28/07', '29/07','06/08', '30/08', '08/10', '01/11', '08/12', '09/12', '25/12'];
    const diasA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

    for (let d = 1; d <= diasEnMes; d++) {
        const fDate = new Date(anio, mes - 1, d); 
        const inactivo = (fDate.getDay() === 0 || fDate.getDay() === 6) || feriados.includes(`${d.toString().padStart(2, '0')}/${mes.toString().padStart(2, '0')}`);

        // CORRECCIÓN DARK MODE: Filas y Columnas base
        const trClass = inactivo ? 'bg-gray-100 dark:bg-gray-800/40 opacity-90' : 'hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors';
        const tdDiaClass = `sticky left-0 z-10 px-4 py-2 text-center border-r border-b border-gray-200 dark:border-gray-700 shadow-sm ${inactivo ? 'bg-gray-200 dark:bg-gray-800/80' : 'bg-gray-50 dark:bg-gray-800'}`;
        const colorAbrev = inactivo ? 'text-gray-400 dark:text-gray-500' : 'text-gray-500 dark:text-gray-400';
        const colorNum = inactivo ? 'text-gray-500 dark:text-gray-500' : 'text-gray-900 dark:text-gray-200';

        body += `<tr class="${trClass}">
                 <td class="${tdDiaClass}"><span class="block text-[10px] uppercase font-bold ${colorAbrev}">${diasA[fDate.getDay()]}</span><span class="font-bold ${colorNum}">${d}</span></td>`;
        
        TODOS_LOS_TURNOS.forEach(t => {
            const reg = data.find(r => r.dia === d && r.turno === t);
            const fechaStr = `${d.toString().padStart(2, '0')}/${mes.toString().padStart(2, '0')}/${anio}`;
            const cClassBase = "px-2 py-2 text-center border-r border-b border-gray-200 dark:border-gray-700 min-w-[70px]";

            if (reg) {
                const desv = reg.estado === 'DESVIACION';
                const bg = desv ? 'bg-red-50 dark:bg-red-900/20' : '';
                const obs = desv ? `<span class="block text-[9px] text-red-500 dark:text-red-400 font-bold mt-1 cursor-help" title="Obs: ${reg.incidencia}">Ver Obs</span>` : '';
                
                body += `<td class="${cClassBase} ${bg}">${crearInput(reg.temp, fechaStr, t, 'temp', puedeEditar, desv)} ${obs}</td>`;
                if(usaHumedad) body += `<td class="${cClassBase} ${bg}">${crearInput(reg.humedad||'', fechaStr, t, 'hum', puedeEditar, desv)}</td>`;
            } else {
                const bg = inactivo ? 'bg-gray-100/50 dark:bg-gray-800/30' : '';
                body += `<td class="${cClassBase} ${bg}">${crearInput('', fechaStr, t, 'temp', puedeEditar, false)}</td>`;
                if(usaHumedad) body += `<td class="${cClassBase} ${bg}">${crearInput('', fechaStr, t, 'hum', puedeEditar, false)}</td>`;
            }
        });
        body += '</tr>';
    }
    document.getElementById('tabla-body').innerHTML = body;
}

function crearInput(v, f, t, tipo, puedeEditar, desv) {
    if (!AppState.modoEdicion || !puedeEditar) {
        // CORRECCIÓN DARK MODE: Textos estáticos
        let style = v === '' ? 'text-gray-300 dark:text-gray-600' : (desv ? 'text-red-600 dark:text-red-400 font-bold' : 'text-gray-800 dark:text-gray-300 font-semibold');
        if(tipo === 'hum' && v !== '') style = 'text-blue-600 dark:text-blue-400 font-medium';
        return `<span class="text-sm ${style}">${v === '' ? '-' : v + (tipo === 'temp' ? '°' : '%')}</span>`;
    }
    // CORRECCIÓN DARK MODE: Inputs
    return `<input type="number" step="0.1" value="${v}" data-old="${v}" data-fecha="${f}" data-turno="${t}" data-tipo="${tipo}" placeholder="${tipo === 'temp' ? '°' : '%'}" class="w-full bg-transparent text-center focus:bg-blue-50 dark:focus:bg-blue-900/40 focus:ring-2 dark:focus:ring-blue-500 rounded font-bold text-sm text-gray-900 dark:text-gray-100 placeholder-gray-300 dark:placeholder-gray-600 transition-colors outline-none" onblur="validarEdicionUI(this)">`;
}

// Edición y Validaciones
async function validarEdicionUI(input) {
    const nv = input.value.trim(), ov = input.getAttribute('data-old').trim(), f = input.dataset.fecha, t = input.dataset.turno, tp = input.dataset.tipo, key = `${f}_${t}`;
    const cv = (AppState.cambiosCart[key] && AppState.cambiosCart[key][tp] !== undefined) ? AppState.cambiosCart[key][tp] : ov;
    if (nv === cv) return;

    const camara = AppState.camaras.find(c => c.id == document.getElementById('rev-camara').value);
    let isDesv = false, inc = "";

    if (nv !== '') {
        const num = parseFloat(nv);
        if (tp === 'temp' && (num < camara.minTemp || num > camara.maxTemp)) isDesv = true;
        if (tp === 'hum' && camara.minHr) {
             const mH = camara.minHr <= 1 ? camara.minHr * 100 : camara.minHr, xH = camara.maxHr <= 1 ? camara.maxHr * 100 : camara.maxHr;
             if (num < mH || num > xH) isDesv = true;
        }
    }

    if (isDesv || (ov !== '' && nv !== ov)) {
        inc = prompt(isDesv ? "Valores Fuera de Rango (HACCP). Ingrese medida correctiva:" : (nv===""?"Eliminación de registro. Motivo:":"Modificación Histórica. Motivo:"));
        if (!inc || !inc.trim()) return input.value = cv; // Revert
    }

    if (!AppState.cambiosCart[key]) {
        const tr = input.closest('tr');
        const iT = tr.querySelector(`input[data-fecha="${f}"][data-turno="${t}"][data-tipo="temp"]`);
        const iH = tr.querySelector(`input[data-fecha="${f}"][data-turno="${t}"][data-tipo="hum"]`);
        AppState.cambiosCart[key] = { fecha: f, turno: t, temp: iT?iT.getAttribute('data-old'):'', hum: iH?iH.getAttribute('data-old'):'', incidencia: '' };
    }
    AppState.cambiosCart[key][tp] = nv;
    if (inc) AppState.cambiosCart[key].incidencia = inc;

    // Colores de Edición Pendiente adaptados al Dark Mode
    input.classList.toggle('bg-yellow-100', input.value !== ov);
    input.classList.toggle('dark:bg-yellow-900/40', input.value !== ov);
    input.classList.toggle('text-yellow-900', input.value !== ov);
    input.classList.toggle('dark:text-yellow-300', input.value !== ov);
    
    actualizarPanelMasivo();
}

function actualizarPanelMasivo() {
    const count = Object.keys(AppState.cambiosCart).length;
    const btn = document.getElementById('btn-ejecutar-masivo');
    btn.classList.toggle('hidden', count === 0); btn.classList.toggle('flex', count > 0);
    document.getElementById('txt-btn-guardar-masivo').innerText = `Guardar (${count})`;
}

async function guardarCambiosMasivos() {
    const arr = Object.values(AppState.cambiosCart);
    if (arr.length === 0) return;
    for (let c of arr) if (c.temp === '' && c.hum !== '') return alert(`Falta Temp día ${c.fecha}`);

    const btn = document.getElementById('btn-ejecutar-masivo'), orig = btn.innerHTML;
    btn.disabled = true; btn.innerHTML = '<i class="ph ph-spinner animate-spin"></i> Guardando...';

    try {
        const res = await apiFetch({ action: 'guardarLecturasMasivas', idCamara: document.getElementById('rev-camara').value, userName: AppState.user.nombre, cambios: arr });
        if (res.status === 'success') {
            AppState.cambiosCart = {}; actualizarPanelMasivo();
            document.getElementById('btn-toggle-edicion').click(); document.getElementById('btn-generar-reporte').click(); 
        } else alert("Error: " + res.message);
    } catch (e) { alert("Error de red."); } finally { btn.disabled = false; btn.innerHTML = orig; }
}

// ==========================================
// 7. MOTOR DE IMPRESIÓN Y PDF
// ==========================================
function generarMoldeHACCP() {
    if(AppState.revisionData.length === 0) return false;
    if(AppState.modoEdicion) document.getElementById('btn-toggle-edicion').click(); 

    const camaraText = document.getElementById('rev-camara').options[document.getElementById('rev-camara').selectedIndex].text;
    const cName = camaraText.toLowerCase();
    const mesText = document.getElementById('rev-mes').options[document.getElementById('rev-mes').selectedIndex].text;
    const anioText = document.getElementById('rev-anio').value;
    const { anio, mes, usaHumedad } = AppState.configRev; 

    let formatCode = 'LGA-BPM-SAF01', version = '04', tituloMain = 'MANUAL DE BUENAS PRÁCTICAS DE MANUFACTURA', tituloSub = 'REGISTRO DE CONTROL DE TEMPERATURA DE CAMARAS';
    if (cName.includes('desposte')) { formatCode = 'LGA-BPM-SAF02'; } 
    else if (cName.includes('maduración') || cName.includes('maduracion')) { formatCode = 'LGA-BPM-F10'; version = '14'; } 
    else if (cName.includes('empaque') || cName.includes('enfriamiento')) { formatCode = 'LGA-BPM-SAF03'; version = '14'; } 
    else if (cName.includes('pt') || cName.includes('congelación') || cName.includes('tunel')) {
        formatCode = 'LGA-HACCP-F01'; version = '07'; tituloMain = 'PLAN HCCP';
        tituloSub = cName.includes('congelación')||cName.includes('tunel') ? 'REGISTRO DE CONTROL PCC: ALMACENAMIENTO CONGELADO' : (cName.includes('pt') ? 'REGISTRO DE CONTROL PCC: ALMACENAMIENTO REFRIGERADO' : 'REGISTRO DE CONTROL PCC');
    }

    document.getElementById('print-titulo-main').innerText = tituloMain;
    document.getElementById('print-titulo-sub').innerText = tituloSub;
    document.getElementById('print-version').innerText = version;
    document.getElementById('print-fecha-rev').innerText = '08/2025'; 
    document.getElementById('print-codigo').innerText = formatCode;
    document.getElementById('print-camara-nombre').innerText = camaraText;
    document.getElementById('print-mes-nombre').innerText = `${mesText} ${anioText}`;
    document.getElementById('print-responsable').innerText = AppState.user.nombre; 

    let headH = `<tr><th rowspan="2" class="border border-black p-1 w-20">Fecha</th>`;
    TODOS_LOS_TURNOS.forEach(t => headH += `<th colspan="${usaHumedad ? 2 : 1}" class="border border-black p-1">${t} ${usaHumedad ? '' : 'h'}</th>`);
    headH += `</tr>`;
    if(usaHumedad) { headH += `<tr>`; TODOS_LOS_TURNOS.forEach(() => headH += `<th class="border border-black p-1">°C</th><th class="border border-black p-1">%H</th>`); headH += `</tr>`; }
    document.getElementById('print-head-datos').innerHTML = headH;

    let bodyH = '', bodyInc = '';
    const feriados = ['01/01', '01/05', '07/06', '29/06', '23/07', '28/07', '29/07','06/08', '30/08', '08/10', '01/11', '08/12', '09/12', '25/12'];
    const diasA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    
    for (let d = 1; d <= new Date(anio, mes, 0).getDate(); d++) {
        const fechaFila = new Date(anio, mes - 1, d); 
        const inactivo = (fechaFila.getDay() === 0 || fechaFila.getDay() === 6) || feriados.includes(`${d.toString().padStart(2, '0')}/${mes.toString().padStart(2, '0')}`);

        if(inactivo) continue; 

        bodyH += `<tr><td class="border border-black p-1 font-bold">${diasA[fechaFila.getDay()]} ${d.toString().padStart(2, '0')}</td>`; 
        
        TODOS_LOS_TURNOS.forEach(t => {
            const reg = AppState.revisionData.find(r => r.dia === d && r.turno === t);
            if (reg) {
                bodyH += `<td class="border border-black p-1">${reg.temp===''?'-':reg.temp}</td>`;
                if(usaHumedad) bodyH += `<td class="border border-black p-1">${reg.humedad===''?'-':reg.humedad}</td>`;
                if (reg.incidencia && reg.incidencia.trim()) bodyInc += `<tr><td class="border border-black p-1 text-center font-bold">${d.toString().padStart(2, '0')}/${mes.toString().padStart(2, '0')}/${anio} - ${t}</td><td class="border border-black p-1 px-2">${reg.incidencia}</td><td class="border border-black p-1"></td></tr>`;
            } else {
                bodyH += `<td class="border border-black p-1">-</td>`;
                if(usaHumedad) bodyH += `<td class="border border-black p-1">-</td>`;
            }
        });
        bodyH += `</tr>`;
    }
    
    if (bodyInc === '') bodyInc = `<tr><td class="border border-black p-2 text-center">-</td><td class="border border-black p-2 text-center text-gray-500 italic">Sin incidencias</td><td class="border border-black p-2"></td></tr>`;
    document.getElementById('print-body-datos').innerHTML = bodyH;
    document.getElementById('print-body-incidencias').innerHTML = bodyInc;
    return true; 
}

function prepararImpresion() { if(generarMoldeHACCP()) setTimeout(() => window.print(), 400); }

function generarPDF() {
    if(!generarMoldeHACCP()) return;
    const btn = document.getElementById('btn-descargar-pdf'), orig = btn.innerHTML;
    btn.disabled = true; btn.innerHTML = '<i class="ph ph-spinner animate-spin"></i>';

    const el = document.getElementById('formato-oficial-impresion');
    el.classList.remove('hidden'); el.style.display = 'block';

    const cT = document.getElementById('rev-camara').options[document.getElementById('rev-camara').selectedIndex].text;
    const mT = document.getElementById('rev-mes').options[document.getElementById('rev-mes').selectedIndex].text;
    
    html2pdf().set({
        margin: 0.3, filename: `Reporte_${cT.replace(/\s+/g, '_')}_${mT}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, letterRendering: true, windowWidth: 1000 },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' } 
    }).from(el).save().then(() => {
        el.classList.add('hidden'); el.style.display = 'none';
        btn.disabled = false; btn.innerHTML = orig;
    });
}

// ==========================================
// 8. DASHBOARD ANALÍTICO (BI Y CHART.JS)
// ==========================================
let chartIncidenciasInst = null;
let chartTurnosInst = null;

document.getElementById('btn-generar-dashboard').addEventListener('click', async () => {
    const mes = document.getElementById('dash-mes').value;
    const anio = document.getElementById('dash-anio').value;
    
    const btn = document.getElementById('btn-generar-dashboard');
    const origHTML = btn.innerHTML;
    btn.disabled = true; 
    btn.innerHTML = '<i class="ph ph-spinner animate-spin text-lg"></i>';

    try {
        // Solicitamos al backend TODO el consolidado del mes
        const res = await apiFetch({ action: 'getDashboardData', mes: mes, anio: anio });
        
        if (res.status === 'success') {
            renderizarDashboardGraficos(res.data);
        } else {
            alert("Error: " + res.message);
        }
    } catch (e) {
        alert("Fallo de red al generar el Dashboard.");
    } finally {
        btn.disabled = false; 
        btn.innerHTML = origHTML;
    }
});

function renderizarDashboardGraficos(registros) {
    let totalLecturas = registros.length;
    let totalDesviaciones = 0;
    let conteoCamaras = {};
    let conteoTurnos = {};

    // 1. Procesar Data
    registros.forEach(r => {
        if (r.estado === 'DESVIACION') {
            totalDesviaciones++;
            // Sumar al conteo de la cámara
            conteoCamaras[r.camaraNombre] = (conteoCamaras[r.camaraNombre] || 0) + 1;
            // Sumar al conteo del turno
            conteoTurnos[r.turno] = (conteoTurnos[r.turno] || 0) + 1;
        }
    });

    // 2. Actualizar Tarjetas KPI
    let porcentajeOk = totalLecturas > 0 ? (((totalLecturas - totalDesviaciones) / totalLecturas) * 100).toFixed(1) : 0;
    document.getElementById('kpi-cumplimiento').innerText = totalLecturas > 0 ? `${porcentajeOk}% OK` : 'Sin datos';
    document.getElementById('kpi-incidencias').innerText = totalDesviaciones;
    
    let camaraPico = "-";
    let maxDesv = 0;
    for (const [camara, count] of Object.entries(conteoCamaras)) {
        if (count > maxDesv) { maxDesv = count; camaraPico = camara; }
    }
    document.getElementById('kpi-critica').innerText = camaraPico;

    // Colores para Dark Mode y Light Mode
    const isDark = document.documentElement.classList.contains('dark');
    const textColor = isDark ? '#e2e8f0' : '#475569';
    const gridColor = isDark ? '#334155' : '#e2e8f0';

    // 3. Gráfico de Barras: Cámaras más críticas
    const ctxCamaras = document.getElementById('chartIncidencias').getContext('2d');
    if (chartIncidenciasInst) chartIncidenciasInst.destroy();
    
    chartIncidenciasInst = new Chart(ctxCamaras, {
        type: 'bar',
        data: {
            labels: Object.keys(conteoCamaras),
            datasets: [{
                label: 'N° de Desviaciones HACCP',
                data: Object.values(conteoCamaras),
                backgroundColor: 'rgba(239, 68, 68, 0.7)',
                borderColor: 'rgb(239, 68, 68)',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: { 
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { labels: { color: textColor } } },
            scales: {
                y: { ticks: { color: textColor, stepSize: 1 }, grid: { color: gridColor } },
                x: { ticks: { color: textColor }, grid: { display: false } }
            }
        }
    });

    // 4. Gráfico de Dona: Alertas por Turnos
    const ctxTurnos = document.getElementById('chartTurnos').getContext('2d');
    if (chartTurnosInst) chartTurnosInst.destroy();

    chartTurnosInst = new Chart(ctxTurnos, {
        type: 'doughnut',
        data: {
            labels: Object.keys(conteoTurnos),
            datasets: [{
                data: Object.values(conteoTurnos),
                backgroundColor: ['#3b82f6', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6', '#64748b'],
                borderWidth: isDark ? 0 : 2
            }]
        },
        options: { 
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'right', labels: { color: textColor } } }
        }
    });
}

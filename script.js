// script.js (Módulo Temperaturas - Optimizado Mobile & Sticky)

const API_URL = "https://script.google.com/macros/s/AKfycbw9DjZJw8DelWMQQKvUxGhjHs1Ka0sWZPyHBu4lYwMg-2L-avGrzWNEoZOMXT8x9g3c/exec"; 
const TODOS_LOS_TURNOS = ['07:30', '09:30', '11:30', '13:30', '15:30', '17:30'];
let currentUser = null;
let camarasDisponibles = [];
let cambiosPendientes = {};

// Nuevas variables de estado para la vista Revisión
let ultimaDataRevision = []; 
let configRevisionActual = {}; 
let modoEdicionActivo = false;


// ==========================================
// 1. GESTIÓN DE SESIÓN Y TEMA 
// ==========================================
window.addEventListener('message', function(event) {
    const data = event.data;
    if (data && data.type === 'SESSION_SYNC') {
        const usuarioGenApps = data.user;
        sessionStorage.setItem('moduloUser', JSON.stringify(usuarioGenApps));
        if (data.theme === 'dark') document.documentElement.classList.add('dark');
        else document.documentElement.classList.remove('dark');
        iniciarModuloConUsuario(usuarioGenApps);
    }
    if (data && data.type === 'THEME_UPDATE') {
        if (data.theme === 'dark') document.documentElement.classList.add('dark');
        else document.documentElement.classList.remove('dark');
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const savedUser = sessionStorage.getItem('moduloUser');
    if (savedUser) {
        iniciarModuloConUsuario(JSON.parse(savedUser));
    } else {
        window.parent.postMessage({ type: 'MODULO_LISTO' }, '*');
        setTimeout(() => {
            if (!sessionStorage.getItem('moduloUser')) {
                const uiUsuario = document.getElementById('txt-usuario-activo');
                if(uiUsuario) uiUsuario.innerHTML = '<i class="ph ph-warning text-red-500"></i> Error: Sesión no sincronizada';
            }
        }, 3000);
    }
});

function configurarFechaInicial() {
    const hoy = new Date();
    hoy.setHours(hoy.getHours() - 5); 
    const inputFecha = document.getElementById('val-fecha');
    if (inputFecha) inputFecha.value = hoy.toISOString().split('T')[0]; 
}

function iniciarModuloConUsuario(usuario) {
    currentUser = usuario;
    const nombreDisplay = document.getElementById('txt-usuario-activo');
    if (nombreDisplay) nombreDisplay.innerHTML = `<i class="ph ph-user-check"></i> Operador: ${usuario.nombre} | ${usuario.area}`;
    configurarFechaInicial();
    cargarCamaras();
}

// ==========================================
// 2. COMUNICACIÓN API Y CARGA
// ==========================================
async function apiFetch(payload) {
    try {
        const response = await fetch(API_URL, { method: 'POST', body: JSON.stringify(payload) });
        return await response.json();
    } catch (error) {
        throw new Error("Fallo la comunicación con el servidor");
    }
}

async function cargarCamaras() {
    const select = document.getElementById('camara-select');
    select.innerHTML = '<option value="">Descargando cámaras...</option>';
    try {
        const payload = { action: 'getCamarasConfig', userEmail: currentUser.usuario, userRol: currentUser.rol, userArea: currentUser.area };
        const response = await apiFetch(payload);
        if (response.status === 'success') {
            camarasDisponibles = response.data;
            llenarSelectCamaras(camarasDisponibles);
            select.disabled = false;
            select.classList.remove('cursor-not-allowed', 'bg-gray-50', 'dark:bg-gray-700');
            select.classList.add('bg-white', 'dark:bg-gray-800');
            const btnGuardar = document.getElementById('btn-guardar-lectura');
            if (btnGuardar) {
                btnGuardar.disabled = false;
                btnGuardar.classList.remove('bg-gray-400', 'dark:bg-gray-600', 'cursor-not-allowed');
                btnGuardar.classList.add('bg-blue-600', 'hover:bg-blue-700');
                btnGuardar.innerHTML = '<i class="ph ph-floppy-disk text-2xl"></i> Registrar Lectura';
            }
        }
    } catch (error) {
        select.innerHTML = '<option value="">Error de conexión</option>';
    }
}

function llenarSelectCamaras(camaras) {
    const select = document.getElementById('camara-select');
    select.innerHTML = '<option value="">Seleccione una cámara...</option>';
    camaras.forEach(c => select.innerHTML += `<option value="${c.id}">${c.nombre}</option>`);
}

// ==========================================
// 3. REGISTRO DIARIO (VISTA 1)
// ==========================================
function formatearFecha(fechaInput) {
    if (!fechaInput || fechaInput.length !== 10) return null;
    const [y, m, d] = fechaInput.split('-');
    return `${d}/${m}/${y}`;
}

async function verificarTurnosDisponibles() {
    const idCamara = document.getElementById('camara-select').value;
    const inputFecha = document.getElementById('val-fecha').value;
    const turnosContainer = document.getElementById('turnos-container');
    const inputOcultoTurno = document.getElementById('turno-seleccionado');
    inputOcultoTurno.value = ''; 

    if (!idCamara || inputFecha.length !== 10) {
        turnosContainer.innerHTML = '<div class="col-span-3 md:col-span-6 text-sm text-gray-500 py-3 text-center bg-gray-50 dark:bg-gray-800 rounded-xl border border-dashed dark:border-gray-600">Seleccione cámara y fecha primero...</div>';
        return;
    }

    turnosContainer.innerHTML = '<div class="col-span-3 md:col-span-6 text-sm text-blue-600 font-bold py-4 text-center bg-blue-50 dark:bg-blue-900/30 rounded-lg"><i class="ph ph-spinner animate-spin text-xl inline-block mr-2"></i> Consultando turnos...</div>';

    try {
        const response = await apiFetch({ action: 'getTurnosRegistrados', idCamara: idCamara, fecha: formatearFecha(inputFecha) });
        if (response.status === 'success') {
            let disponibles = 0;
            turnosContainer.innerHTML = '';
            TODOS_LOS_TURNOS.forEach(turno => {
                const btn = document.createElement('button');
                btn.type = 'button';
                if (response.data.includes(turno)) {
                    btn.className = "py-3 rounded-xl border bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed flex flex-col items-center justify-center gap-1 opacity-70";
                    btn.innerHTML = `<i class="ph ph-check-square-offset text-2xl"></i><span class="font-bold text-sm">${turno}</span>`;
                    btn.disabled = true;
                } else {
                    btn.className = "turno-btn py-3 rounded-xl border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 hover:border-blue-400 hover:bg-blue-50 transition-all flex flex-col items-center cursor-pointer shadow-sm";
                    btn.innerHTML = `<i class="ph ph-clock text-2xl"></i><span class="font-bold text-sm">${turno}</span>`;
                    btn.onclick = () => seleccionarBotonTurno(turno, btn);
                    disponibles++;
                }
                turnosContainer.appendChild(btn);
            });
            if (disponibles === 0) turnosContainer.innerHTML = '<div class="col-span-3 md:col-span-6 text-center text-amber-700 font-bold bg-amber-50 p-4 rounded-lg">⚠️ Todos los turnos han sido completados.</div>';
        }
    } catch (e) {
        turnosContainer.innerHTML = '<div class="col-span-3 md:col-span-6 text-center text-red-600 font-bold bg-red-50 p-3 rounded-lg">Error de red.</div>';
    }
}

function seleccionarBotonTurno(turno, btnActivado) {
    document.getElementById('turno-seleccionado').value = turno;
    document.querySelectorAll('.turno-btn').forEach(b => {
        b.className = "turno-btn py-3 rounded-xl border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/40 transition-all flex flex-col items-center cursor-pointer shadow-sm";
        b.querySelector('i').className = 'ph ph-clock text-2xl';
    });
    btnActivado.className = "turno-btn py-3 rounded-xl border-2 border-blue-600 bg-blue-50 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 shadow-md scale-[1.02] flex flex-col items-center cursor-pointer";
    btnActivado.querySelector('i').className = 'ph ph-check-circle-fill text-2xl text-blue-600 dark:text-blue-400';
}

function evaluarParametrosEnVivo() {
    const idCamara = document.getElementById('camara-select').value;
    const camara = camarasDisponibles.find(c => c.id.toString() === idCamara.toString());
    const panelEstado = document.getElementById('panel-estado');
    const inputTemp = document.getElementById('val-temp').value;
    const inputHum = document.getElementById('val-humedad').value;
    const textareaIncidencia = document.getElementById('val-incidencia');
    
    if (!camara || inputTemp === '') {
        panelEstado.classList.add('hidden');
        textareaIncidencia.removeAttribute('required');
        return;
    }

    const temp = parseFloat(inputTemp);
    let esTempOk = (temp >= camara.minTemp && temp <= camara.maxTemp);
    let esHumOk = true; 

    if (camara.minHr !== null && camara.maxHr !== null && camara.maxHr > 0 && inputHum !== '') {
        const hum = parseFloat(inputHum);
        let minH = camara.minHr <= 1 ? camara.minHr * 100 : camara.minHr;
        let maxH = camara.maxHr <= 1 ? camara.maxHr * 100 : camara.maxHr;
        esHumOk = (hum >= minH && hum <= maxH);
    }

    panelEstado.classList.remove('hidden');
    if (esTempOk && esHumOk) {
        panelEstado.className = 'rounded-xl p-4 border flex items-start gap-4 bg-green-50 dark:bg-green-900/30 border-green-200';
        document.getElementById('icono-estado').innerHTML = '<i class="ph ph-check-circle text-4xl text-green-600"></i>';
        document.getElementById('titulo-estado').innerHTML = '<span class="text-green-800 dark:text-green-400 font-bold">RANGO OK</span>';
        document.getElementById('desc-estado').innerHTML = '<span class="text-green-700 dark:text-green-500 text-sm">Proceda a registrar.</span>';
        textareaIncidencia.removeAttribute('required'); 
    } else {
        panelEstado.className = 'rounded-xl p-4 border flex items-start gap-4 bg-red-50 dark:bg-red-900/30 border-red-300 animate-pulse';
        document.getElementById('icono-estado').innerHTML = '<i class="ph ph-warning-octagon text-4xl text-red-600"></i>';
        document.getElementById('titulo-estado').innerHTML = '<span class="text-red-800 dark:text-red-400 font-bold">⚠️ DESVIACIÓN DETECTADA</span>';
        document.getElementById('desc-estado').innerHTML = '<span class="text-red-700 dark:text-red-500 text-sm">Describa la medida correctiva (Obligatorio).</span>';
        textareaIncidencia.setAttribute('required', 'true'); 
    }
}

document.getElementById('val-temp').addEventListener('input', evaluarParametrosEnVivo);
document.getElementById('val-humedad').addEventListener('input', evaluarParametrosEnVivo);

document.getElementById('camara-select').addEventListener('change', (e) => {
    const camara = camarasDisponibles.find(c => c.id.toString() === e.target.value.toString());
    const boxHumedad = document.getElementById('box-humedad');
    const banner = document.getElementById('banner-limites');
    
    if (!camara) {
        banner.classList.add('hidden'); boxHumedad.classList.add('hidden');
        document.getElementById('val-humedad').removeAttribute('required');
        verificarTurnosDisponibles(); 
        return;
    }
    banner.classList.remove('hidden');
    document.getElementById('txt-limites-temp').innerHTML = `<i class="ph ph-thermometer-simple text-blue-600"></i> <strong>Temp:</strong> ${camara.minTemp}°C a ${camara.maxTemp}°C`;

    if (camara.minHr !== null && camara.maxHr !== null && camara.maxHr > 0) {
        boxHumedad.classList.remove('hidden');
        document.getElementById('val-humedad').setAttribute('required', 'true');
        let minH = camara.minHr <= 1 ? camara.minHr * 100 : camara.minHr;
        let maxH = camara.maxHr <= 1 ? camara.maxHr * 100 : camara.maxHr;
        document.getElementById('txt-limites-hr').innerHTML = `<i class="ph ph-drop text-blue-600"></i> <strong>HR:</strong> ${minH}% a ${maxH}%`;
    } else {
        boxHumedad.classList.add('hidden');
        document.getElementById('val-humedad').removeAttribute('required');
        document.getElementById('txt-limites-hr').innerHTML = '';
    }
    verificarTurnosDisponibles();
    evaluarParametrosEnVivo();
});

document.getElementById('form-lectura-camara').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btn-guardar-lectura');
    const turnoElegido = document.getElementById('turno-seleccionado').value;
    if (!turnoElegido) return alert("Seleccione un turno disponible.");

    const payload = {
        action: 'registrarLecturaCamara',
        idCamara: document.getElementById('camara-select').value,
        fecha: formatearFecha(document.getElementById('val-fecha').value),
        turno: turnoElegido,
        temperatura: document.getElementById('val-temp').value,
        humedad: document.getElementById('val-humedad').value,
        incidencia: document.getElementById('val-incidencia').value,
        userName: currentUser.nombre 
    };

    btn.disabled = true; btn.innerHTML = '<i class="ph ph-spinner animate-spin"></i> Guardando...';

    try {
        const response = await apiFetch(payload);
        if (response.status === 'success') {
            btn.innerHTML = '<i class="ph ph-check-circle"></i> ¡Exito!';
            setTimeout(() => {
                const c = document.getElementById('camara-select').value;
                const f = document.getElementById('val-fecha').value;
                document.getElementById('form-lectura-camara').reset();
                document.getElementById('camara-select').value = c;
                document.getElementById('val-fecha').value = f;
                document.getElementById('panel-estado').classList.add('hidden');
                verificarTurnosDisponibles();
                btn.disabled = false; btn.innerHTML = '<i class="ph ph-floppy-disk text-2xl"></i> Registrar Lectura';
            }, 1500);
        } else {
            alert('Error: ' + response.message);
            btn.disabled = false; btn.innerHTML = '<i class="ph ph-floppy-disk text-2xl"></i> Registrar Lectura';
        }
    } catch (error) {
        alert('Fallo de red.');
        btn.disabled = false; btn.innerHTML = '<i class="ph ph-floppy-disk text-2xl"></i> Registrar Lectura';
    }
});

// ==========================================
// 4. PESTAÑAS (TABS)
// ==========================================
document.getElementById('tab-registro').addEventListener('click', () => switchTab('registro'));
document.getElementById('tab-revision').addEventListener('click', () => switchTab('revision'));

function switchTab(tab) {
    const vReg = document.getElementById('vista-registro');
    const vRev = document.getElementById('vista-revision');
    const tReg = document.getElementById('tab-registro');
    const tRev = document.getElementById('tab-revision');

    if (tab === 'registro') {
        vReg.classList.replace('hidden', 'block');
        vRev.classList.replace('flex', 'hidden'); // Flex porque revision usa flex-col
        tReg.classList.add('border-blue-600', 'text-blue-600', 'dark:text-blue-400');
        tReg.classList.remove('border-transparent', 'text-gray-500', 'dark:text-gray-400');
        tRev.classList.remove('border-blue-600', 'text-blue-600', 'dark:text-blue-400');
        tRev.classList.add('border-transparent', 'text-gray-500', 'dark:text-gray-400');
    } else {
        vRev.classList.replace('hidden', 'flex'); 
        vReg.classList.replace('block', 'hidden');
        tRev.classList.add('border-blue-600', 'text-blue-600', 'dark:text-blue-400');
        tRev.classList.remove('border-transparent', 'text-gray-500', 'dark:text-gray-400');
        tReg.classList.remove('border-blue-600', 'text-blue-600', 'dark:text-blue-400');
        tReg.classList.add('border-transparent', 'text-gray-500', 'dark:text-gray-400');

        const revCamara = document.getElementById('rev-camara');
        if (revCamara.options.length <= 1 && camarasDisponibles.length > 0) {
            revCamara.innerHTML = '<option value="">Seleccione...</option>';
            camarasDisponibles.forEach(c => revCamara.innerHTML += `<option value="${c.id}">${c.nombre}</option>`);
            const hoy = new Date();
            document.getElementById('rev-mes').value = hoy.getMonth() + 1;
            document.getElementById('rev-anio').value = hoy.getFullYear();
        }
    }
}


// ==========================================
// 5. DASHBOARD MATRIZ (REVISIÓN JEFATURA)
// ==========================================

// Evento: Al cambiar de cámara en Revisión, actualizar Banner de Límites
document.getElementById('rev-camara').addEventListener('change', (e) => {
    const camara = camarasDisponibles.find(c => c.id.toString() === e.target.value.toString());
    const banner = document.getElementById('rev-banner-limites');
    
    if (!camara) {
        document.getElementById('rev-herramientas').classList.add('hidden');
        return;
    }

    document.getElementById('rev-txt-temp').innerHTML = `<i class="ph ph-thermometer-simple text-lg text-blue-600 dark:text-blue-400"></i> Temp: ${camara.minTemp}°C a ${camara.maxTemp}°C`;

    if (camara.minHr !== null && camara.maxHr !== null && camara.maxHr > 0) {
        let minH = camara.minHr <= 1 ? camara.minHr * 100 : camara.minHr;
        let maxH = camara.maxHr <= 1 ? camara.maxHr * 100 : camara.maxHr;
        document.getElementById('rev-txt-hr').innerHTML = `<i class="ph ph-drop text-lg text-blue-600 dark:text-blue-400"></i> HR: ${minH}% a ${maxH}%`;
    } else {
        document.getElementById('rev-txt-hr').innerHTML = '';
    }
    document.getElementById('rev-herramientas').classList.remove('hidden');
    document.getElementById('rev-herramientas').classList.add('flex');
});

// Evento: Activar/Desactivar Modo Edición
document.getElementById('btn-toggle-edicion').addEventListener('click', () => {
    if (!currentUser || (currentUser.rol.toUpperCase() !== 'JEFE' && currentUser.rol.toUpperCase() !== 'ADMINISTRADOR')) {
        return alert("Solo Jefes y Administradores pueden editar registros.");
    }

    if (Object.keys(cambiosPendientes).length > 0) {
        if(!confirm("Tienes cambios sin guardar. Si desactivas la edición se perderán. ¿Continuar?")) return;
        cambiosPendientes = {};
        actualizarPanelMasivo();
    }

    modoEdicionActivo = !modoEdicionActivo;
    const btn = document.getElementById('btn-toggle-edicion');
    
    if (modoEdicionActivo) {
        btn.classList.replace('bg-white', 'bg-blue-600');
        btn.classList.replace('text-gray-800', 'text-white');
        btn.classList.replace('dark:bg-gray-700', 'dark:bg-blue-600');
        document.getElementById('txt-btn-edicion').innerText = "Cerrar Edición";
    } else {
        btn.classList.replace('bg-blue-600', 'bg-white');
        btn.classList.replace('text-white', 'text-gray-800');
        btn.classList.replace('dark:bg-blue-600', 'dark:bg-gray-700');
        document.getElementById('txt-btn-edicion').innerText = "Activar Edición";
    }

    // Redibujar la matriz sin ir al servidor
    if (ultimaDataRevision.length > 0 || configRevisionActual.mes) {
        dibujarTabla(ultimaDataRevision, configRevisionActual);
    }
});


document.getElementById('btn-generar-reporte').addEventListener('click', async () => {
    const idCamara = document.getElementById('rev-camara').value;
    const mes = document.getElementById('rev-mes').value;
    const anio = document.getElementById('rev-anio').value;
    
    if (!idCamara) return alert("Seleccione una cámara.");

    const camaraSel = camarasDisponibles.find(c => c.id.toString() === idCamara.toString());
    const usaHumedad = camaraSel && camaraSel.minHr !== null && camaraSel.maxHr !== null && camaraSel.maxHr > 0;

    configRevisionActual = { mes: parseInt(mes), anio: parseInt(anio), usaHumedad: usaHumedad };

    const btn = document.getElementById('btn-generar-reporte');
    const originalBtnHTML = btn.innerHTML;
    btn.disabled = true; btn.innerHTML = '<i class="ph ph-spinner animate-spin text-xl"></i>';
    
    document.getElementById('tabla-container').classList.add('hidden');
    document.getElementById('tabla-mensaje').classList.remove('hidden');
    document.getElementById('tabla-mensaje').innerHTML = '<i class="ph ph-spinner animate-spin text-4xl mb-3 text-blue-500"></i><br>Procesando Matriz...';

    try {
        if (Object.keys(cambiosPendientes).length > 0) {
            cambiosPendientes = {}; actualizarPanelMasivo();
        }

        const response = await apiFetch({ action: 'getRegistrosRevision', idCamara: idCamara, mes: mes, anio: anio });

        if (response.status === 'success') {
            ultimaDataRevision = response.data; // Guardamos en memoria
            
            if (ultimaDataRevision.length === 0 && !modoEdicionActivo) {
                document.getElementById('tabla-mensaje').innerHTML = '<i class="ph ph-folder-open text-5xl mb-3 text-gray-400"></i><br>Sin registros en este mes.';
            } else {
                document.getElementById('tabla-mensaje').classList.add('hidden');
                document.getElementById('tabla-container').classList.remove('hidden');
                dibujarTabla(ultimaDataRevision, configRevisionActual);
            }
        } else {
            document.getElementById('tabla-mensaje').innerHTML = `Error: ${response.message}`;
        }
    } catch (error) {
        document.getElementById('tabla-mensaje').innerHTML = 'Error de red.';
    } finally {
        btn.disabled = false; btn.innerHTML = originalBtnHTML;
    }
});

// Función centralizada para dibujar la tabla (permite redibujar al cambiar modo edición)
function dibujarTabla(data, config) {
    const thead = document.getElementById('tabla-head');
    const tbody = document.getElementById('tabla-body');
    const diasEnMes = new Date(config.anio, config.mes, 0).getDate();
    const usaHumedad = config.usaHumedad;
    
    // CABECERA STICKY (Congelada)
    let headHTML = '';
    const classThTurno = "sticky top-0 z-20 px-2 sm:px-4 py-2 text-center border-b border-r border-gray-200 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 shadow-[0_1px_0_var(--tw-shadow-color)] shadow-gray-200 dark:shadow-gray-700";
    const classThDia = "sticky top-0 left-0 z-30 px-2 sm:px-4 py-3 bg-blue-50 dark:bg-blue-900 text-blue-800 dark:text-blue-300 w-12 sm:w-16 text-center border-b border-r border-gray-200 dark:border-gray-600 align-middle shadow-[1px_1px_0_var(--tw-shadow-color)] shadow-gray-200 dark:shadow-gray-700";

    if (usaHumedad) {
        headHTML += `<tr><th rowspan="2" class="${classThDia}">DÍA</th>`;
        TODOS_LOS_TURNOS.forEach(t => headHTML += `<th colspan="2" class="${classThTurno}">${t}</th>`);
        headHTML += '</tr><tr>';
        const subTh = "sticky top-[32px] sm:top-[36px] z-20 px-1 sm:px-2 py-1 text-center text-[10px] sm:text-[11px] font-bold border-b border-r border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 shadow-[0_1px_0_var(--tw-shadow-color)] shadow-gray-200 dark:shadow-gray-700";
        TODOS_LOS_TURNOS.forEach(t => {
            headHTML += `<th class="${subTh} text-gray-500">°C</th><th class="${subTh} text-blue-600">%HR</th>`;
        });
        headHTML += '</tr>';
    } else {
        headHTML += `<tr><th class="${classThDia}">DÍA</th>`;
        TODOS_LOS_TURNOS.forEach(t => headHTML += `<th class="${classThTurno}">${t}</th>`);
        headHTML += '</tr>';
    }
    thead.innerHTML = headHTML;

    // CUERPO DE LA TABLA
    let bodyHTML = '';
    const FERIADOS_PERU = ['01/01', '01/05', '07/06', '29/06', '23/07', '28/07', '29/07','06/08', '30/08', '08/10', '01/11', '08/12', '09/12', '25/12'];
    const diasAbrev = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

    const puedeEditar = currentUser && (currentUser.rol.toUpperCase() === 'JEFE' || currentUser.rol.toUpperCase() === 'ADMINISTRADOR');

    for (let d = 1; d <= diasEnMes; d++) {
        const fechaFila = new Date(config.anio, config.mes - 1, d); 
        const indiceDia = fechaFila.getDay(); 
        const diaMesStr = `${d.toString().padStart(2, '0')}/${config.mes.toString().padStart(2, '0')}`;
        const esInactivo = (indiceDia === 0 || indiceDia === 6) || FERIADOS_PERU.includes(diaMesStr);

        let claseFila = "transition-colors " + (esInactivo ? "bg-gray-100 dark:bg-gray-800/80 opacity-90" : "hover:bg-gray-50 dark:hover:bg-gray-700/50");
        let claseCeldaCabecera = `sticky left-0 z-10 px-1 sm:px-4 py-1 sm:py-2 text-center border-r border-b border-gray-200 dark:border-gray-700 shadow-[1px_0_0_var(--tw-shadow-color)] shadow-gray-200 dark:shadow-gray-700 ${esInactivo ? 'bg-gray-200 dark:bg-gray-700/80' : 'bg-gray-50 dark:bg-gray-800'}`;

        bodyHTML += `<tr class="${claseFila}">
                      <td class="${claseCeldaCabecera}">
                          <span class="block text-[9px] sm:text-[10px] uppercase tracking-wider ${esInactivo ? 'text-gray-400' : 'text-gray-500'} font-bold mb-0.5">${diasAbrev[indiceDia]}</span>
                          <span class="${esInactivo ? 'text-gray-500 dark:text-gray-400' : 'text-gray-900 dark:text-white'} font-bold text-sm sm:text-base">${d}</span>
                      </td>`;
        
        TODOS_LOS_TURNOS.forEach(turno => {
            const reg = data.find(r => r.dia === d && r.turno === turno);
            const fechaCelda = `${d.toString().padStart(2, '0')}/${config.mes.toString().padStart(2, '0')}/${config.anio}`;
            
            const cellClass = `px-1 py-1 sm:px-2 sm:py-2 text-center border-r border-b border-gray-200 dark:border-gray-700 min-w-[50px] sm:min-w-[70px]`;

            if (reg) {
                const isDesviacion = reg.estado === 'DESVIACION';
                const bgWarning = isDesviacion ? 'bg-red-50 dark:bg-red-900/10' : '';
                const tooltip = `Por: ${reg.usuario}\nObs: ${reg.incidencia || 'Ninguna'}`;
                const obsSpan = isDesviacion ? `<span class="block text-[8px] sm:text-[9px] text-red-500 font-bold mt-1 tracking-tighter" title="${tooltip}">Ver Obs</span>` : '';

                if (usaHumedad) {
                    bodyHTML += `<td class="${cellClass} ${bgWarning}" title="${tooltip}">
                                    ${generarCelda(reg.temp, fechaCelda, turno, 'temp', puedeEditar, isDesviacion)} ${obsSpan}
                                 </td>`;
                    bodyHTML += `<td class="${cellClass} ${bgWarning}" title="${tooltip}">
                                    ${generarCelda(reg.humedad || '', fechaCelda, turno, 'hum', puedeEditar, isDesviacion)}
                                 </td>`;
                } else {
                    bodyHTML += `<td class="${cellClass} ${bgWarning}" title="${tooltip}">
                                    ${generarCelda(reg.temp, fechaCelda, turno, 'temp', puedeEditar, isDesviacion)} ${obsSpan}
                                 </td>`;
                }
            } else {
                const bgInactivo = esInactivo ? 'bg-gray-100/50 dark:bg-gray-800/30' : '';
                if (usaHumedad) {
                    bodyHTML += `<td class="${cellClass} ${bgInactivo}">${generarCelda('', fechaCelda, turno, 'temp', puedeEditar, false)}</td>`;
                    bodyHTML += `<td class="${cellClass} ${bgInactivo}">${generarCelda('', fechaCelda, turno, 'hum', puedeEditar, false)}</td>`;
                } else {
                    bodyHTML += `<td class="${cellClass} ${bgInactivo}">${generarCelda('', fechaCelda, turno, 'temp', puedeEditar, false)}</td>`;
                }
            }
        });
        bodyHTML += '</tr>';
    }
    tbody.innerHTML = bodyHTML;
}


// ==========================================
// 6. LÓGICA DE EDICIÓN MASIVA
// ==========================================

function generarCelda(valor, fecha, turno, tipo, puedeEditar, isDesviacion) {
    // Si no está el Modo Edición Activo, mostramos solo Texto plano (Optimización Visual)
    if (!modoEdicionActivo || !puedeEditar) {
        let textStyle = valor === '' ? 'text-gray-300 dark:text-gray-600' : (isDesviacion ? 'text-red-600 font-bold' : 'text-gray-800 dark:text-gray-200 font-semibold');
        if (tipo === 'hum' && valor !== '') textStyle = 'text-blue-600 font-medium dark:text-blue-400';
        return `<span class="text-xs sm:text-sm ${textStyle}">${valor === '' ? '-' : valor + (tipo === 'temp' ? '°' : '%')}</span>`;
    }
    
    // Si está en Modo Edición, mostramos Inputs
    const placeholder = tipo === 'temp' ? '°' : '%';
    const textColor = valor === '' ? 'text-gray-900 dark:text-gray-100' : '';
    
    return `<input type="number" step="0.1" value="${valor}" data-old="${valor}" data-fecha="${fecha}" data-turno="${turno}" data-tipo="${tipo}" placeholder="${placeholder}"
             class="w-full bg-transparent text-center focus:outline-none focus:bg-blue-50 dark:focus:bg-blue-900/50 focus:ring-2 focus:ring-blue-400 rounded transition-all font-bold cursor-text placeholder-gray-300 dark:placeholder-gray-600 text-xs sm:text-sm ${textColor}" 
             onblur="validarCeldaMasiva(this)" onkeydown="if(event.key==='Enter') this.blur()">`;
}

function validarCeldaMasiva(input) {
    const newVal = input.value.trim();
    const oldVal = input.getAttribute('data-old').trim();
    const fecha = input.getAttribute('data-fecha');
    const turno = input.getAttribute('data-turno');
    const tipo = input.getAttribute('data-tipo');
    const key = `${fecha}_${turno}`;

    const currentCartVal = (cambiosPendientes[key] && cambiosPendientes[key][tipo] !== undefined) ? cambiosPendientes[key][tipo] : oldVal;
    if (newVal === currentCartVal) return;

    const idCamara = document.getElementById('rev-camara').value;
    const camara = camarasDisponibles.find(c => c.id.toString() === idCamara.toString());
    let isDesviacion = false;
    let incidencia = "";

    if (newVal !== '') {
        const num = parseFloat(newVal);
        if (tipo === 'temp' && (num < camara.minTemp || num > camara.maxTemp)) isDesviacion = true;
        if (tipo === 'hum' && camara.minHr) {
             let minH = camara.minHr <= 1 ? camara.minHr * 100 : camara.minHr;
             let maxH = camara.maxHr <= 1 ? camara.maxHr * 100 : camara.maxHr;
             if (num < minH || num > maxH) isDesviacion = true;
        }
    }

    if (isDesviacion || (oldVal !== '' && newVal !== oldVal)) {
        let razon = isDesviacion ? "⚠️ VALOR FUERA DE RANGO HACCP.\n" : "✏️ MODIFICACIÓN HISTÓRICA.\n";
        if (newVal === '') razon = "🗑️ BORRADO HISTÓRICO.\n"; 

        let motivo = prompt(`${razon}Ingrese obligatoriamente justificación:`);
        if (!motivo || motivo.trim() === '') {
            input.value = currentCartVal; 
            return;
        }
        incidencia = motivo.trim();
    }

    if (!cambiosPendientes[key]) {
        const tr = input.closest('tr');
        const inputTemp = tr.querySelector(`input[data-fecha="${fecha}"][data-turno="${turno}"][data-tipo="temp"]`);
        const inputHum = tr.querySelector(`input[data-fecha="${fecha}"][data-turno="${turno}"][data-tipo="hum"]`);
        
        cambiosPendientes[key] = {
            fecha: fecha, turno: turno,
            temp: inputTemp ? inputTemp.getAttribute('data-old') : '',
            hum: inputHum ? inputHum.getAttribute('data-old') : '',
            incidencia: ''
        };
    }

    cambiosPendientes[key][tipo] = newVal;
    if (incidencia) cambiosPendientes[key].incidencia = incidencia;

    const tr = input.closest('tr');
    const iTemp = tr.querySelector(`input[data-fecha="${fecha}"][data-turno="${turno}"][data-tipo="temp"]`);
    const iHum = tr.querySelector(`input[data-fecha="${fecha}"][data-turno="${turno}"][data-tipo="hum"]`);
    const tOld = iTemp ? iTemp.getAttribute('data-old') : '';
    const tNew = iTemp ? iTemp.value.trim() : '';
    const hOld = iHum ? iHum.getAttribute('data-old') : '';
    const hNew = iHum ? iHum.value.trim() : '';

    if (tOld === tNew && hOld === hNew) {
        delete cambiosPendientes[key]; 
        if(iTemp) iTemp.classList.remove('bg-yellow-100', 'text-yellow-900');
        if(iHum) iHum.classList.remove('bg-yellow-100', 'text-yellow-900');
    } else {
        input.classList.add('bg-yellow-100', 'dark:bg-yellow-900/40', 'text-yellow-900', 'dark:text-yellow-200');
    }

    actualizarPanelMasivo();
}

function actualizarPanelMasivo() {
    const count = Object.keys(cambiosPendientes).length;
    const panel = document.getElementById('panel-guardado-masivo');
    document.getElementById('txt-cambios-count').innerText = count;

    if (count > 0) panel.classList.remove('translate-y-full');
    else panel.classList.add('translate-y-full');
}

async function guardarCambiosMasivos() {
    const arrCambios = Object.values(cambiosPendientes);
    if (arrCambios.length === 0) return;

    for (let c of arrCambios) {
        if (c.temp === '' && c.hum !== '') return alert(`Error: Falta Temperatura para el día ${c.fecha} turno ${c.turno}.`);
    }

    const payload = {
        action: 'guardarLecturasMasivas',
        idCamara: document.getElementById('rev-camara').value,
        userName: currentUser.nombre,
        cambios: arrCambios
    };

    const btn = document.getElementById('btn-ejecutar-masivo');
    btn.disabled = true; btn.innerHTML = '<i class="ph ph-spinner animate-spin"></i>';

    try {
        const response = await apiFetch(payload);
        if (response.status === 'success') {
            cambiosPendientes = {};
            actualizarPanelMasivo();
            document.getElementById('btn-toggle-edicion').click(); // Salir de modo edición
            document.getElementById('btn-generar-reporte').click(); // Recargar
        } else alert("Error: " + response.message);
    } catch (e) { alert("Fallo de red."); } 
    finally { btn.disabled = false; btn.innerHTML = '<i class="ph ph-cloud-arrow-up text-xl"></i> Sincronizar'; }
}

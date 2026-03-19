// =========================================================================
// SCRIPT.JS - CONTROL DE TEMPERATURAS (VERSIÓN UNIFICADA FINAL)
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
    modoEdicion: false,
    turnosCache: {}
};

// ==========================================
// 2. SEGURIDAD Y GESTIÓN DE SESIÓN (MODO DIOS)
// ==========================================

window.addEventListener('message', (event) => {
    // BLINDAJE 1: Soportar mensajes tanto en Objeto como en String (Súper común en iframes)
    let data = event.data;
    if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch (e) { return; }
    }
    
    const { type, user, theme } = data || {};
    
    if (type === 'THEME_UPDATE') {
        document.documentElement.classList.toggle('dark', theme === 'dark');
    }

    if (type === 'SESSION_SYNC' && user) {
        document.documentElement.classList.toggle('dark', theme === 'dark');
        
        AppState.user = user;
        AppState.isSessionVerified = true;
        
        // BLINDAJE 2: Try/Catch estricto para memorias bloqueadas en incógnito
        try {
            sessionStorage.setItem('moduloUser', JSON.stringify(user));
        } catch (e) {
            console.warn("Navegador bloqueó la caché local. Usando sesión volátil.");
        }
        
        // BLINDAJE 3: Evitar que fallos visuales detengan la lógica de datos
        try { actualizarUIUsuario(); } catch(e) { console.error("Error UI Usuario:", e); }
        try { cargarCamaras(); } catch(e) { console.error("Error UI Cámaras:", e); }
    }
});

document.addEventListener('DOMContentLoaded', () => {
    configurarFechaInicial();
    
    try {
        const savedUser = sessionStorage.getItem('moduloUser');
        if (savedUser) {
            AppState.user = JSON.parse(savedUser);
            AppState.isSessionVerified = true; 
            actualizarUIUsuario();
            cargarCamaras(); 
        }
    } catch (e) {}
    
    // BLINDAJE 4: PING RECURRENTE (El Salvavidas)
    // Si el Iframe carga antes que el portal principal, el mensaje original se pierde.
    // Esto enviará el aviso CADA SEGUNDO hasta que el portal responda y autorice la sesión.
    const pingInterval = setInterval(() => {
        if (AppState.isSessionVerified) {
            clearInterval(pingInterval); // Ya nos autorizaron, dejamos de insistir
        } else {
            // Mandamos ambas versiones (Objeto y String) para asegurar la comunicación
            window.parent.postMessage({ type: 'MODULO_LISTO' }, '*');
            window.parent.postMessage(JSON.stringify({ type: 'MODULO_LISTO' }), '*');
        }
    }, 1000);
    
    // Alerta visual si después de 6 segundos el portal padre sigue sin responder
    setTimeout(() => {
        if (!AppState.isSessionVerified) {
            const alerta = document.getElementById('txt-usuario-activo');
            if(alerta) alerta.innerHTML = '<i class="ph ph-warning text-red-500"></i> Esperando al Portal Maestro...';
            const btn = document.getElementById('btn-guardar-lectura');
            if(btn) btn.disabled = true;
        }
    }, 6000);
});

function actualizarUIUsuario() {
    if(!AppState.user) return;
    
    // BLINDAJE 5: Valores por defecto anti-crasheo
    const uNombre = AppState.user.nombre || AppState.user.usuario || 'Usuario';
    const uArea = (AppState.user.area || 'GENERAL').toUpperCase();
    const uRol = (AppState.user.rol || 'OPERADOR').toUpperCase();
    
    const uiActivo = document.getElementById('txt-usuario-activo');
    if(uiActivo) uiActivo.innerHTML = `<i class="ph ph-user-check"></i> ${uNombre} | ${uArea}`;

    // NIVELES DE ACCESO
    const rolesDashboard = ['JEFE', 'GERENTE', 'ADMINISTRADOR'];
    const rolesMonitoreo = ['CALIDAD', 'JEFE', 'GERENTE', 'ADMINISTRADOR']; 

    // CONTROL TABS (Dashboard)
    const tabDash = document.getElementById('tab-dashboard');
    if (tabDash) {
        if(rolesDashboard.includes(uRol)) {
            tabDash.style.display = '';
            tabDash.classList.remove('hidden');
        } else {
            tabDash.style.display = 'none';
        }
    }

    // CONTROL TABS (Monitoreo)
    const tabMonitoreo = document.getElementById('tab-monitoreo');
    if (tabMonitoreo) {
        if(rolesMonitoreo.includes(uRol) || uArea === 'CALIDAD') {
            tabMonitoreo.style.display = '';
            tabMonitoreo.classList.remove('hidden'); 
        } else {
            tabMonitoreo.style.display = 'none';
            tabMonitoreo.classList.add('hidden');
        }
    }

    // CONTROL GESTOR
    const btnGestor = document.getElementById('btn-abrir-gestor-camaras');
    if (btnGestor) {
        if (rolesDashboard.includes(uRol)) btnGestor.classList.remove('hidden'); 
        else btnGestor.classList.add('hidden'); 
    }
}

function configurarFechaInicial() {
    const hoy = new Date();
    hoy.setHours(hoy.getHours() - 5); 
    const inputF = document.getElementById('val-fecha');
    if(inputF) inputF.value = hoy.toISOString().split('T')[0]; 
}


// ==========================================
// 3. CONEXIÓN API (BLINDADA)
// ==========================================
async function apiFetch(payload) {
    try {
        const response = await fetch(API_URL, { 
            method: 'POST', 
            body: JSON.stringify(payload) 
        });
        
        const text = await response.text();
        try {
            return JSON.parse(text);
        } catch (err) {
            console.error("El servidor devolvió un error HTML/Texto en lugar de JSON:", text);
            throw new Error("Error interno del servidor Google.");
        }
    } catch (error) {
        console.error("Fallo de red en apiFetch:", error);
        throw new Error("Fallo de red. Verifique su conexión o la publicación del Script.");
    }
}

async function cargarCamaras() {
    if(!AppState.user) return;
    const select = document.getElementById('camara-select');
    if(!select) return;

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
            if(btn) {
                btn.classList.replace('bg-gray-400', 'bg-blue-600');
                btn.classList.replace('dark:bg-gray-600', 'hover:bg-blue-700');
                btn.classList.remove('cursor-not-allowed');
                btn.innerHTML = '<i class="ph ph-floppy-disk text-2xl"></i> Registrar Lectura';
                btn.disabled = false;
            }
        } else {
            select.innerHTML = `<option value="">Error: ${res.message}</option>`;
        }
    } catch (e) { 
        select.innerHTML = '<option value="">Error de conexión</option>'; 
    }
}

// ==========================================
// 4. REGISTRO DIARIO Y TRIGGERS (VISTA 1)
// ==========================================

const selCamara = document.getElementById('camara-select');
const inFecha = document.getElementById('val-fecha');
if(selCamara) selCamara.addEventListener('change', manejarCambioCamara);
if(inFecha) inFecha.addEventListener('change', verificarTurnosDisponibles); 

function manejarCambioCamara(e) {
    const camara = AppState.camaras.find(c => c.id.toString() === e.target.value.toString());
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
    
    const fechaFormat = fecha.split('-').reverse().join('/');

    try {
        // MAGIA DEL CACHÉ: Si no tenemos los turnos de este día, pedimos la matriz completa
        if (!AppState.turnosCache[fechaFormat]) {
            container.innerHTML = '<div class="col-span-3 md:col-span-6 text-sm text-blue-600 font-bold py-4 text-center bg-blue-50 dark:bg-blue-900/30 rounded-lg"><i class="ph ph-spinner animate-spin text-xl inline-block mr-2"></i> Cargando cuadrícula del día...</div>';
            const res = await apiFetch({ action: 'getTurnosPorFecha', fecha: fechaFormat });
            
            if (res.status === 'success') {
                AppState.turnosCache[fechaFormat] = res.data; // Guardamos en memoria RAM
            } else {
                throw new Error(res.message);
            }
        }

        // RENDERIZADO INSTANTÁNEO DESDE LA MEMORIA (0 segundos de espera)
        const ocupados = AppState.turnosCache[fechaFormat][idCamara] || [];
        
        container.innerHTML = '';
        let disp = 0;
        TODOS_LOS_TURNOS.forEach(turno => {
            const btn = document.createElement('button');
            btn.type = 'button';
            const ocupado = ocupados.includes(turno);
            
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

    } catch (e) { 
        container.innerHTML = '<div class="col-span-3 md:col-span-6 text-center text-red-600 font-bold bg-red-50 p-3 rounded-lg">Error: ${e.message}</div>`; 
    }
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

const inTemp = document.getElementById('val-temp');
const inHum = document.getElementById('val-humedad');
if(inTemp) inTemp.addEventListener('input', evaluarParametrosEnVivo);
if(inHum) inHum.addEventListener('input', evaluarParametrosEnVivo);

function evaluarParametrosEnVivo() {
    const camara = AppState.camaras.find(c => c.id.toString() === document.getElementById('camara-select').value.toString());
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
const formRegistro = document.getElementById('form-lectura-camara');
if(formRegistro) {
    formRegistro.addEventListener('submit', async (e) => {
        e.preventDefault();
        if(!AppState.isSessionVerified) return alert("Sesión no validada.");
        
        const turnoElegido = document.getElementById('turno-seleccionado').value;
        if (!turnoElegido) return alert("Seleccione un turno disponible.");

        // EVALUACIÓN HACCP ESTRICTA: Solo las matemáticas definen el ESTADO
        const camara = AppState.camaras.find(c => c.id.toString() === document.getElementById('camara-select').value.toString());
        const tempVal = document.getElementById('val-temp').value;
        const humVal = document.getElementById('val-humedad').value;

        const temp = parseFloat(tempVal);
        const hum = humVal ? parseFloat(humVal) : null;

        let isDesv = false;
        if (temp < camara.minTemp || temp > camara.maxTemp) isDesv = true;
        if (camara.minHr && hum !== null) {
            const mH = camara.minHr <= 1 ? camara.minHr * 100 : camara.minHr;
            const xH = camara.maxHr <= 1 ? camara.maxHr * 100 : camara.maxHr;
            if (hum < mH || hum > xH) isDesv = true;
        }

        const btn = document.getElementById('btn-guardar-lectura');
        btn.disabled = true; 
        btn.innerHTML = '<i class="ph ph-spinner animate-spin text-xl"></i> Guardando...';

        const payload = {
            action: 'registrarLecturaCamara',
            idCamara: camara.id,
            fecha: document.getElementById('val-fecha').value.split('-').reverse().join('/'),
            turno: turnoElegido,
            temperatura: tempVal,
            humedad: humVal,
            incidencia: document.getElementById('val-incidencia').value,
            userName: AppState.user.nombre,
            // Inyectamos el estado matemático real para que el backend deje de adivinar
            estado: isDesv ? 'DESVIACION' : 'OK' 
        };

        try {
            const res = await apiFetch(payload);
            if (res.status === 'success') {
            btn.innerHTML = '<i class="ph ph-check-circle text-xl"></i> ¡Exito!';
            
            // ACTUALIZAR MEMORIA CACHÉ LOCAL
            const fFormat = document.getElementById('val-fecha').value.split('-').reverse().join('/');
            if(AppState.turnosCache[fFormat]) {
                if(!AppState.turnosCache[fFormat][camara.id]) AppState.turnosCache[fFormat][camara.id] = [];
                AppState.turnosCache[fFormat][camara.id].push(turnoElegido);
            }
                setTimeout(() => {
                    document.getElementById('form-lectura-camara').reset();
                    configurarFechaInicial(); 
                    document.getElementById('panel-estado').classList.add('hidden');
                    verificarTurnosDisponibles();
                    btn.disabled = false; 
                    btn.innerHTML = '<i class="ph ph-floppy-disk text-2xl"></i> Registrar Lectura';
                }, 1500);
            } else {
                throw new Error(res.message);
            }
        } catch (e) { 
            alert('Error: ' + e.message); 
            btn.disabled = false; 
            btn.innerHTML = '<i class="ph ph-floppy-disk text-2xl"></i> Registrar Lectura'; 
        }
    });
}

// ==========================================
// 5. NAVEGACIÓN (TABS)
// ==========================================
const tabReg = document.getElementById('tab-registro');
const tabRev = document.getElementById('tab-revision');
const tabDash = document.getElementById('tab-dashboard');

if(tabReg) tabReg.addEventListener('click', () => switchTab('registro'));
if(tabRev) tabRev.addEventListener('click', () => switchTab('revision'));
if(tabDash) tabDash.addEventListener('click', () => switchTab('dashboard'));

function switchTab(tab) {
    const rolesDashboard = ['JEFE', 'GERENTE', 'ADMINISTRADOR'];
    const rolesMonitoreo = ['CALIDAD', 'JEFE', 'GERENTE', 'ADMINISTRADOR'];
    
    // BLINDAJE 4: Prevenir crasheo por toUpperCase()
    const uRol = AppState.user && AppState.user.rol ? AppState.user.rol.toUpperCase() : 'OPERADOR';
    const uArea = AppState.user && AppState.user.area ? AppState.user.area.toUpperCase() : 'GENERAL';

    // BLINDAJE LÓGICO
    if (tab === 'dashboard') {
        if (!AppState.user || !rolesDashboard.includes(uRol)) {
            return alert("Acceso denegado. El Dashboard es exclusivo para Jefaturas y Gerencia.");
        }
    }
    if (tab === 'monitoreo') {
        if (!AppState.user || (!rolesMonitoreo.includes(uRol) && uArea !== 'CALIDAD')) {
            return alert("Acceso denegado. Vista exclusiva para Calidad y Jefaturas.");
        }
    }

    // CAPTURAR ELEMENTOS HTML
    const vReg = document.getElementById('vista-registro');
    const vRev = document.getElementById('vista-revision');
    const vDash = document.getElementById('vista-dashboard'); 
    const vMon = document.getElementById('vista-monitoreo'); // NUEVA VISTA
          
    const tReg = document.getElementById('tab-registro');
    const tRev = document.getElementById('tab-revision');
    const tDash = document.getElementById('tab-dashboard'); 
    const tMon = document.getElementById('tab-monitoreo'); // NUEVO TAB

    const actClass = ['border-blue-600','text-blue-600','dark:text-blue-400'];
    const inactClass = ['border-transparent','text-gray-500','dark:text-gray-400'];

    // 1. APAGAR TODAS LAS VISTAS
    if(vReg) { vReg.classList.replace('block', 'hidden'); vReg.classList.replace('flex', 'hidden'); }
    if(vRev) { vRev.classList.replace('block', 'hidden'); vRev.classList.replace('flex', 'hidden'); }
    if(vDash) { vDash.classList.replace('block', 'hidden'); vDash.classList.replace('flex', 'hidden'); }
    if(vMon) { vMon.classList.replace('block', 'hidden'); vMon.classList.replace('flex', 'hidden'); }

    // 2. APAGAR TODOS LOS TABS
    if(tReg) { tReg.classList.add(...inactClass); tReg.classList.remove(...actClass); }
    if(tRev) { tRev.classList.add(...inactClass); tRev.classList.remove(...actClass); }
    if(tDash) { tDash.classList.add(...inactClass); tDash.classList.remove(...actClass); }
    if(tMon) { tMon.classList.add(...inactClass); tMon.classList.remove(...actClass); }

    // 3. ENCENDER SOLO LA SELECCIONADA
    if (tab === 'registro' && vReg && tReg) {
        vReg.classList.replace('hidden', 'block'); 
        tReg.classList.add(...actClass); tReg.classList.remove(...inactClass);
    } 
    else if (tab === 'revision' && vRev && tRev) {
        vRev.classList.replace('hidden', 'flex'); 
        tRev.classList.add(...actClass); tRev.classList.remove(...inactClass);
        const revC = document.getElementById('rev-camara');
        if (revC && revC.options.length <= 1 && AppState.camaras.length > 0) {
            revC.innerHTML = '<option value="">Seleccione...</option>' + AppState.camaras.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');
            const hoy = new Date();
            document.getElementById('rev-mes').value = hoy.getMonth() + 1;
            document.getElementById('rev-anio').value = hoy.getFullYear();
        }
    } 
    else if (tab === 'dashboard' && vDash && tDash) {
        vDash.classList.replace('hidden', 'flex'); 
        tDash.classList.add(...actClass); tDash.classList.remove(...inactClass);
        
        const dMes = document.getElementById('dash-mes');
        const dAnio = document.getElementById('dash-anio');
        if(dMes && !dMes.value) {
            const hoy = new Date();
            dMes.value = hoy.getMonth() + 1;
            dAnio.value = hoy.getFullYear();
        }
    }
    else if (tab === 'monitoreo' && vMon && tMon) {
        vMon.classList.replace('hidden', 'flex'); 
        tMon.classList.add(...actClass); tMon.classList.remove(...inactClass);
        
        // Ejecutar la petición al servidor solo al abrir esta pestaña
        cargarCentroDeComando(); 
    }
}

// ==========================================
// 6. MATRIZ DE REVISIÓN Y EDICIÓN MASIVA
// ==========================================
const selRevCamara = document.getElementById('rev-camara');
if(selRevCamara) {
    selRevCamara.addEventListener('change', (e) => {
        const c = AppState.camaras.find(c => c.id.toString() === e.target.value.toString());
        const tools = document.getElementById('rev-herramientas');
        if (!c) return tools.classList.add('hidden');
        
        document.getElementById('rev-txt-temp').innerHTML = `<i class="ph ph-thermometer-simple text-blue-600 dark:text-blue-400"></i> ${c.minTemp}°C a ${c.maxTemp}°C`;
        document.getElementById('rev-txt-hr').innerHTML = (c.minHr) ? `<i class="ph ph-drop text-blue-600 dark:text-blue-400"></i> ${(c.minHr<=1?c.minHr*100:c.minHr)}% a ${(c.maxHr<=1?c.maxHr*100:c.maxHr)}%` : '';
        tools.classList.remove('hidden'); tools.classList.add('flex');
    });
}

const btnGenReporte = document.getElementById('btn-generar-reporte');
if(btnGenReporte) {
    btnGenReporte.addEventListener('click', async () => {
        const idC = document.getElementById('rev-camara').value;
        const m = document.getElementById('rev-mes').value;
        const a = document.getElementById('rev-anio').value;
        
        if (!idC) return alert("Seleccione cámara.");
        
        const btnPdf = document.getElementById('btn-descargar-pdf');
        const btnImp = document.getElementById('btn-imprimir');
        if(btnPdf) btnPdf.classList.add('hidden');
        if(btnImp) btnImp.classList.add('hidden');

        const cSel = AppState.camaras.find(c => c.id.toString() === idC.toString());
        AppState.configRev = { mes: parseInt(m), anio: parseInt(a), usaHumedad: !!cSel.minHr };

        const btn = document.getElementById('btn-generar-reporte');
        const origHTML = btn.innerHTML;
        btn.disabled = true; btn.innerHTML = '<i class="ph ph-spinner animate-spin text-xl"></i>';
        
        document.getElementById('tabla-container').classList.add('hidden');
        const msg = document.getElementById('tabla-mensaje');
        msg.classList.remove('hidden'); 
        msg.innerHTML = '<i class="ph ph-spinner animate-spin text-4xl text-blue-500"></i><br>Procesando Matriz...';

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
                    if(btnPdf) btnPdf.classList.remove('hidden');
                    if(btnImp) btnImp.classList.remove('hidden');
                }
            } else throw new Error(res.message);
        } catch (e) { 
            msg.innerHTML = 'Error de red. Intente nuevamente.'; 
        } finally { 
            btn.disabled = false; btn.innerHTML = origHTML; 
        }
    });
}

const btnToggleEdicion = document.getElementById('btn-toggle-edicion');
if(btnToggleEdicion) {
    btnToggleEdicion.addEventListener('click', () => {
        const rols = ['JEFE', 'ADMINISTRADOR', 'SUPERVISOR', 'GERENTE'];
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
}

function dibujarMatrizUI() {
    const data = AppState.revisionData, { anio, mes, usaHumedad } = AppState.configRev;
    const diasEnMes = new Date(anio, mes, 0).getDate();
    
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
    const roles = ['JEFE', 'ADMINISTRADOR', 'SUPERVISOR', 'GERENTE'];
    const puedeEditar = AppState.user && roles.includes(AppState.user.rol.toUpperCase());
    const feriados = ['01/01', '01/05', '07/06', '29/06', '23/07', '28/07', '29/07','06/08', '30/08', '08/10', '01/11', '08/12', '09/12', '25/12'];
    const diasA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

    for (let d = 1; d <= diasEnMes; d++) {
        const fDate = new Date(anio, mes - 1, d); 
        const inactivo = (fDate.getDay() === 0 || fDate.getDay() === 6) || feriados.includes(`${d.toString().padStart(2, '0')}/${mes.toString().padStart(2, '0')}`);

        const trClass = inactivo ? 'bg-gray-100 dark:bg-gray-800/40 opacity-90' : 'hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors';
        const tdDiaClass = `sticky left-0 z-10 px-4 py-2 text-center border-r border-b border-gray-200 dark:border-gray-700 shadow-sm ${inactivo ? 'bg-gray-200 dark:bg-gray-800/80' : 'bg-gray-50 dark:bg-gray-800'}`;
        const colorAbrev = inactivo ? 'text-gray-400 dark:text-gray-500' : 'text-gray-500 dark:text-gray-400';
        const colorNum = inactivo ? 'text-gray-500 dark:text-gray-500' : 'text-gray-900 dark:text-gray-200';

        body += `<tr class="${trClass}">
                 <td class="${tdDiaClass}"><span class="block text-[10px] uppercase font-bold ${colorAbrev}">${diasA[fDate.getDay()]}</span><span class="font-bold ${colorNum}">${d}</span></td>`;
        
        TODOS_LOS_TURNOS.forEach(t => {
            const reg = data.find(r => r.dia === d && r.turno === t);
            const fechaStr = `${d.toString().padStart(2, '0')}/${mes.toString().padStart(2, '0')}/${anio}`;
            const cClassBase = "px-2 py-2 text-center border-r border-b border-gray-200 dark:border-gray-700 min-w-[70px] relative";

            if (reg) {
                const desv = reg.estado === 'DESVIACION';
                let bg = desv ? 'bg-red-50 dark:bg-red-900/20' : '';

                // Color sutil para editados históricamente pero que actualmente están en Rango (OK)
                if (!desv && (reg.accionCorrectiva || reg.justificacion)) {
                    bg = 'bg-blue-50 dark:bg-blue-900/20';
                }

                // Clases dinámicas: Si NO estamos editando, la celda entera es clickeable
                const hoverClass = !AppState.modoEdicion ? "cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors celda-info-trigger" : "";

                // El badge "Ver Detalle" ahora fuerza el globo incluso en modo edición
                const obs = desv ? `<span class="block text-[9px] text-red-500 dark:text-red-400 font-bold mt-1 cursor-pointer hover:underline celda-info-trigger" onclick="abrirGloboInfo(event, ${d}, '${t}', true)">Ver Detalle</span>` : '';
                
                body += `<td class="${cClassBase} ${bg} ${hoverClass}" onclick="abrirGloboInfo(event, ${d}, '${t}')">${crearInput(reg.temp, fechaStr, t, 'temp', puedeEditar, desv)} ${obs}</td>`;
                if(usaHumedad) body += `<td class="${cClassBase} ${bg} ${hoverClass}" onclick="abrirGloboInfo(event, ${d}, '${t}')">${crearInput(reg.humedad||'', fechaStr, t, 'hum', puedeEditar, desv)}</td>`;
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

// ==========================================
// FUNCIÓN RESTAURADA: COMPORTAMIENTO Y ENTER
// ==========================================
function crearInput(v, f, t, tipo, puedeEditar, desv) {
    if (!AppState.modoEdicion || !puedeEditar) {
        let style = v === '' ? 'text-gray-300 dark:text-gray-600' : (desv ? 'text-red-600 dark:text-red-400 font-bold' : 'text-gray-800 dark:text-gray-300 font-semibold');
        if(tipo === 'hum' && v !== '') style = 'text-blue-600 dark:text-blue-400 font-medium';
        return `<span class="text-sm block ${style}">${v === '' ? '-' : v + (tipo === 'temp' ? '°' : '%')}</span>`;
    }
    
    return `<input type="number" step="0.1" value="${v}" data-old="${v}" data-fecha="${f}" data-turno="${t}" data-tipo="${tipo}" placeholder="${tipo === 'temp' ? '°' : '%'}" class="w-full bg-transparent text-center focus:bg-blue-50 dark:focus:bg-blue-900/40 focus:ring-2 dark:focus:ring-blue-500 rounded font-bold text-sm cursor-text ${v === '' ? 'text-gray-900 dark:text-gray-100' : ''} placeholder-gray-300 dark:placeholder-gray-600 transition-colors outline-none" onblur="validarEdicionUI(this)" onkeydown="if(event.key==='Enter') this.blur()">`;
}

// CONTROLADOR ASÍNCRONO DEL MODAL PERSONALIZADO
function solicitarTextoModal(titulo, mensaje, iconoClase, colorIcono) {
    return new Promise((resolve) => {
        const modal = document.getElementById('modal-justificacion');
        const titleEl = document.getElementById('modal-just-titulo');
        const msgEl = document.getElementById('modal-just-mensaje');
        const inputEl = document.getElementById('modal-just-input');
        const iconEl = document.getElementById('modal-just-icono');
        const errorEl = document.getElementById('modal-just-error');
        const btnConfirm = document.getElementById('btn-just-confirmar');
        const btnCancel = document.getElementById('btn-just-cancelar');

        // Configuración visual dinámica
        titleEl.textContent = titulo;
        msgEl.textContent = mensaje;
        iconEl.className = `${iconoClase} text-3xl ${colorIcono}`;
        inputEl.value = '';
        errorEl.classList.add('hidden');
        modal.classList.remove('hidden');

        // Función de limpieza para no acumular eventos fantasma
        const cleanup = () => {
            modal.classList.add('hidden');
            btnConfirm.removeEventListener('click', onConfirm);
            btnCancel.removeEventListener('click', onCancel);
        };

        const onConfirm = () => {
            const val = inputEl.value.trim();
            if (!val) {
                errorEl.classList.remove('hidden'); 
                inputEl.focus();
                return;
            }
            cleanup();
            resolve(val);
        };

        const onCancel = () => {
            cleanup();
            resolve(null);
        };

        btnConfirm.addEventListener('click', onConfirm);
        btnCancel.addEventListener('click', onCancel);
        
        // Auto-focus para agilizar la escritura
        setTimeout(() => inputEl.focus(), 100); 
    });
}

async function validarEdicionUI(input) {
    const nv = input.value.trim();
    const ov = input.getAttribute('data-old').trim();
    const f = input.dataset.fecha;
    const t = input.dataset.turno;
    const tp = input.dataset.tipo;
    const key = `${f}_${t}`;
    
    const cv = (AppState.cambiosCart[key] && AppState.cambiosCart[key][tp] !== undefined) ? AppState.cambiosCart[key][tp] : ov;
    if (nv === cv) return;

    const camara = AppState.camaras.find(c => c.id.toString() === document.getElementById('rev-camara').value.toString());
    let isDesv = false;
    let requiereJustificacion = (ov !== '' && nv !== ov);
    
    let accionCorrectivaVal = "";
    let justificacionVal = "";

    const tr = input.closest('tr');
    const iT = tr.querySelector(`input[data-fecha="${f}"][data-turno="${t}"][data-tipo="temp"]`);
    const iH = tr.querySelector(`input[data-fecha="${f}"][data-turno="${t}"][data-tipo="hum"]`);
    
    const tempActual = (tp === 'temp') ? nv : (iT ? iT.value.trim() : '');
    const humActual = (tp === 'hum') ? nv : (iH ? iH.value.trim() : '');

    // 1. Evaluación HACCP 
    if (tempActual !== '') {
        const numT = parseFloat(tempActual);
        if (numT < camara.minTemp || numT > camara.maxTemp) isDesv = true;
    }
    if (humActual !== '' && camara.minHr) {
         const mH = camara.minHr <= 1 ? camara.minHr * 100 : camara.minHr;
         const xH = camara.maxHr <= 1 ? camara.maxHr * 100 : camara.maxHr;
         const numH = parseFloat(humActual);
         if (numH < mH || numH > xH) isDesv = true;
    }

    // 2. Recolección Estricta usando el MODAL UI
    if (isDesv) {
        accionCorrectivaVal = await solicitarTextoModal(
            "Acción Correctiva Requerida", 
            "⚠️ Valores Fuera de Rango (HACCP). Ingrese la ACCIÓN CORRECTIVA ejecutada (Obligatorio):",
            "ph ph-warning-octagon",
            "text-red-500"
        );
        if (!accionCorrectivaVal) { input.value = cv; return; }
    }

    if (requiereJustificacion) {
        justificacionVal = await solicitarTextoModal(
            "Justificación de Edición", 
            "📝 Modificación Histórica Detectada. Indique el motivo de esta alteración (Obligatorio):",
            "ph ph-pencil-simple-slash",
            "text-amber-500"
        );
        if (!justificacionVal) { input.value = cv; return; }
    }

    // 3. Empaquetado del Payload
    if (!AppState.cambiosCart[key]) {
        AppState.cambiosCart[key] = { 
            fecha: f, turno: t, 
            temp: iT ? iT.getAttribute('data-old') : '', 
            hum: iH ? iH.getAttribute('data-old') : '', 
            accionCorrectiva: '', justificacion: '', estado: '' 
        };
    }
    
    AppState.cambiosCart[key][tp] = nv;
    if (accionCorrectivaVal) AppState.cambiosCart[key].accionCorrectiva = accionCorrectivaVal;
    if (justificacionVal) AppState.cambiosCart[key].justificacion = justificacionVal;
    AppState.cambiosCart[key].estado = isDesv ? 'DESVIACION' : 'OK';

    // 4. Restauración Visual UI
    const isTempOriginal = (iT ? iT.getAttribute('data-old') : '') === tempActual;
    const isHumOriginal = (iH ? iH.getAttribute('data-old') : '') === humActual;

    if (isTempOriginal && isHumOriginal) {
        delete AppState.cambiosCart[key]; 
        if(iT) iT.classList.remove('bg-yellow-100', 'text-yellow-900', 'dark:bg-yellow-900/40', 'dark:text-yellow-300'); 
        if(iH) iH.classList.remove('bg-yellow-100', 'text-yellow-900', 'dark:bg-yellow-900/40', 'dark:text-yellow-300');
    } else { 
        input.classList.add('bg-yellow-100', 'text-yellow-900', 'dark:bg-yellow-900/40', 'dark:text-yellow-300'); 
    }
    
    actualizarPanelMasivo();
}

function actualizarPanelMasivo() {
    const count = Object.keys(AppState.cambiosCart).length;
    const btn = document.getElementById('btn-ejecutar-masivo');
    if (btn) {
        btn.classList.toggle('hidden', count === 0); 
        btn.classList.toggle('flex', count > 0);
    }
    const txtGuardar = document.getElementById('txt-btn-guardar-masivo');
    if (txtGuardar) {
        txtGuardar.innerText = `Guardar (${count})`;
    }
}

// ==========================================
// FUNCIÓN GLOBAL RESTAURADA PARA HTML (ONCLICK)
// ==========================================
async function guardarCambiosMasivos() {
    const arr = Object.values(AppState.cambiosCart);
    if (arr.length === 0) return;
    for (let c of arr) if (c.temp === '' && c.hum !== '') return alert(`Falta Temperatura en el día ${c.fecha}`);

    const btn = document.getElementById('btn-ejecutar-masivo');
    const orig = btn.innerHTML;
    btn.disabled = true; btn.innerHTML = '<i class="ph ph-spinner animate-spin"></i> Guardando...';

    try {
        const res = await apiFetch({ action: 'guardarLecturasMasivas', idCamara: document.getElementById('rev-camara').value, userName: AppState.user.nombre, cambios: arr });
        if (res.status === 'success') {
            AppState.cambiosCart = {}; 
            actualizarPanelMasivo();
            document.getElementById('btn-toggle-edicion').click(); 
            document.getElementById('btn-generar-reporte').click(); 
        } else {
            alert("Error: " + res.message);
        }
    } catch (e) { 
        alert("Error de red al guardar los cambios masivos."); 
    } finally { 
        btn.disabled = false; btn.innerHTML = orig; 
    }
}

// ==========================================
// 7. MOTOR DE IMPRESIÓN AISLADA Y PDF
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

function prepararImpresion() { 
    if(!generarMoldeHACCP()) return;
    const formatoHTML = document.getElementById('formato-oficial-impresion').outerHTML;
    
    const printIframe = document.createElement('iframe');
    printIframe.style.position = 'absolute';
    printIframe.style.width = '0px';
    printIframe.style.height = '0px';
    printIframe.style.border = 'none';
    document.body.appendChild(printIframe);

    const doc = printIframe.contentWindow.document;
    doc.open();
    doc.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Impresión de Control Operativo</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <style>
                /* Quitamos 'size: landscape;' para que el usuario elija en la ventana de impresión */
                @page { margin: 10mm; } 
                body { 
                    background-color: white !important; 
                    color: black; 
                    font-family: sans-serif; 
                    -webkit-print-color-adjust: exact; 
                    print-color-adjust: exact; 
                }
                #formato-oficial-impresion { display: block !important; }
                table { border-collapse: collapse !important; width: 100% !important; page-break-inside: auto; }
                tr { page-break-inside: avoid; page-break-after: auto; }
                th, td { border: 1px solid #000 !important; padding: 4px !important; color: #000 !important; }
                th { background-color: #f3f4f6 !important; }
            </style>
        </head>
        <body>
            ${formatoHTML}
        </body>
        </html>
    `);
    doc.close();

    setTimeout(() => {
        printIframe.contentWindow.focus();
        printIframe.contentWindow.print();
        setTimeout(() => document.body.removeChild(printIframe), 1000);
    }, 800);
}

function generarPDF() {
    if(!generarMoldeHACCP()) return;
    const btn = document.getElementById('btn-descargar-pdf');
    const orig = btn.innerHTML;
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

const btnGenerarDash = document.getElementById('btn-generar-dashboard');
if(btnGenerarDash) {
    btnGenerarDash.addEventListener('click', async () => {
        const mes = document.getElementById('dash-mes').value;
        const anio = document.getElementById('dash-anio').value;
        
        const btn = document.getElementById('btn-generar-dashboard');
        const origHTML = btn.innerHTML;
        btn.disabled = true; 
        btn.innerHTML = '<i class="ph ph-spinner animate-spin text-lg"></i>';

        try {
            const res = await apiFetch({ action: 'getDashboardData', mes: mes, anio: anio });
            
            if (res.status === 'success') {
                if (typeof Chart === 'undefined') {
                    alert("Error: La librería de gráficos (Chart.js) no cargó correctamente en el HTML.");
                } else {
                    renderizarDashboardGraficos(res.data);
                }
            } else {
                alert("Error de Servidor: " + res.message);
            }
        } catch (e) {
            alert(e.message);
        } finally {
            btn.disabled = false; 
            btn.innerHTML = origHTML;
        }
    });
}

function renderizarDashboardGraficos(registros) {
    let totalLecturas = registros.length;
    let totalDesviaciones = 0;
    let conteoCamaras = {};
    let conteoTurnos = {};

    registros.forEach(r => {
        if (r.estado === 'DESVIACION') {
            totalDesviaciones++;
            conteoCamaras[r.camaraNombre] = (conteoCamaras[r.camaraNombre] || 0) + 1;
            conteoTurnos[r.turno] = (conteoTurnos[r.turno] || 0) + 1;
        }
    });

    let porcentajeOk = totalLecturas > 0 ? (((totalLecturas - totalDesviaciones) / totalLecturas) * 100).toFixed(1) : 0;
    document.getElementById('kpi-cumplimiento').innerText = totalLecturas > 0 ? `${porcentajeOk}% OK` : 'Sin datos';
    document.getElementById('kpi-incidencias').innerText = totalDesviaciones;
    
    let camaraPico = "-";
    let maxDesv = 0;
    for (const [camara, count] of Object.entries(conteoCamaras)) {
        if (count > maxDesv) { maxDesv = count; camaraPico = camara; }
    }
    document.getElementById('kpi-critica').innerText = camaraPico;

    const isDark = document.documentElement.classList.contains('dark');
    const textColor = isDark ? '#e2e8f0' : '#475569';
    const gridColor = isDark ? '#334155' : '#e2e8f0';

    const ctxCamaras = document.getElementById('chartIncidencias');
    if(ctxCamaras) {
        if (chartIncidenciasInst) chartIncidenciasInst.destroy();
        chartIncidenciasInst = new Chart(ctxCamaras.getContext('2d'), {
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
    }

    const ctxTurnos = document.getElementById('chartTurnos');
    if(ctxTurnos) {
        if (chartTurnosInst) chartTurnosInst.destroy();
        chartTurnosInst = new Chart(ctxTurnos.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: Object.keys(conteoTurnos),
                datasets: [{
                    data: Object.values(conteoTurnos),
                    backgroundColor: ['#3b82f6', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6', '#64748b'],
                    borderWidth: isDark ? 0 : 2,
                    borderColor: isDark ? '#1e293b' : '#ffffff'
                }]
            },
            options: { 
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { position: 'right', labels: { color: textColor } } }
            }
        });
    }
}

// ==========================================
// 9. GESTOR DE CÁMARAS (CRUD ROBUSTO)
// ==========================================
const modalGestor = document.getElementById('modal-gestor-camaras');
const btnAbrirGestor = document.getElementById('btn-abrir-gestor-camaras');
const btnCerrarGestor = document.getElementById('btn-cerrar-gestor');
const btnCancelarGestor = document.getElementById('btn-cancelar-gestor');
const selectorGestor = document.getElementById('gestor-selector');
const formGestor = document.getElementById('form-gestor-camara');

function cargarTiposYAreasEnGestor() {
    const selectArea = document.getElementById('gestor-area');
    const selectTipo = document.getElementById('gestor-tipo');
    
    if (!Array.isArray(AppState.camaras)) return;

    if (selectArea) {
        const areasUnicas = [...new Set(
            AppState.camaras.filter(c => c && typeof c === 'object' && c.area)
                            .map(c => c.area.toString().trim().toUpperCase())
                            .filter(a => a !== '')
        )].sort();
        selectArea.innerHTML = '<option value="">Seleccione un área...</option>' + 
                               areasUnicas.map(a => `<option value="${a}">${a}</option>`).join('') +
                               '<option value="OTRO">✏️ OTRA ÁREA NUEVA...</option>';
    }

    if (selectTipo) {
        const tiposUnicos = [...new Set(
            AppState.camaras.filter(c => c && typeof c === 'object' && c.tipo)
                            .map(c => c.tipo.toString().trim().toUpperCase())
                            .filter(t => t !== '')
        )].sort();
        selectTipo.innerHTML = '<option value="">Seleccione un tipo...</option>' + 
                               tiposUnicos.map(t => `<option value="${t}">${t}</option>`).join('') +
                               '<option value="OTRO">✏️ OTRO TIPO NUEVO...</option>';
    }
}

function setSelectOrOtro(selectId, inputOtroId, valueToSet) {
    const selectEl = document.getElementById(selectId);
    const inputOtroEl = document.getElementById(inputOtroId);
    
    if (!selectEl) return;

    if (!valueToSet || valueToSet.toString().trim() === '') {
        selectEl.value = '';
        if (inputOtroEl) { inputOtroEl.classList.add('hidden'); inputOtroEl.removeAttribute('required'); inputOtroEl.value = ''; }
        return;
    }

    const normalizedValue = valueToSet.toString().trim().toUpperCase();
    
    const optionMatch = Array.from(selectEl.options).find(opt => opt.value.trim().toUpperCase() === normalizedValue);

    if (optionMatch && optionMatch.value !== 'OTRO') {
        selectEl.value = optionMatch.value;
        if (inputOtroEl) { inputOtroEl.classList.add('hidden'); inputOtroEl.removeAttribute('required'); inputOtroEl.value = ''; }
    } else {
        selectEl.value = 'OTRO';
        if (inputOtroEl) {
            inputOtroEl.value = normalizedValue;
            inputOtroEl.classList.remove('hidden');
            inputOtroEl.setAttribute('required', 'true');
        }
    }
}

['gestor-tipo', 'gestor-area'].forEach(id => {
    const el = document.getElementById(id);
    if(el) {
        el.addEventListener('change', (e) => {
            const inputOtro = document.getElementById(`${id}-otro`);
            if (!inputOtro) return;
            
            if (e.target.value === 'OTRO') {
                inputOtro.classList.remove('hidden');
                inputOtro.setAttribute('required', 'true');
                inputOtro.focus();
            } else {
                inputOtro.classList.add('hidden');
                inputOtro.removeAttribute('required');
                inputOtro.value = '';
            }
        });
    }
});

if (btnAbrirGestor) {
    btnAbrirGestor.addEventListener('click', () => {
        if (selectorGestor) {
            const camarasSeguras = Array.isArray(AppState.camaras) ? AppState.camaras : [];
            selectorGestor.innerHTML = '<option value="NEW">✨ CREAR NUEVA CÁMARA</option>' + 
                camarasSeguras.map(c => `<option value="${c.id}">✏️ Editar: ${c.nombre || 'Sin nombre'}</option>`).join('');
        }
        
        if (formGestor) formGestor.reset();
        document.getElementById('gestor-id').value = '';
        
        cargarTiposYAreasEnGestor(); 
        
        setSelectOrOtro('gestor-tipo', 'gestor-tipo-otro', '');
        setSelectOrOtro('gestor-area', 'gestor-area-otro', '');
        
        if (modalGestor) modalGestor.classList.remove('hidden');
    });
}

[btnCerrarGestor, btnCancelarGestor].forEach(btn => {
    if(btn) btn.addEventListener('click', () => {
        if (modalGestor) modalGestor.classList.add('hidden');
    });
});

if (selectorGestor) {
    selectorGestor.addEventListener('change', (e) => {
        const val = e.target.value;

        if (val === 'NEW') {
            if (formGestor) formGestor.reset();
            document.getElementById('gestor-id').value = '';
            setSelectOrOtro('gestor-tipo', 'gestor-tipo-otro', '');
            setSelectOrOtro('gestor-area', 'gestor-area-otro', '');
        } else {
            const c = AppState.camaras.find(cam => cam.id.toString() === val);
            if(c) {
                document.getElementById('gestor-id').value = c.id || '';
                document.getElementById('gestor-nombre').value = c.nombre || '';
                document.getElementById('gestor-min-temp').value = c.minTemp !== null ? c.minTemp : '';
                document.getElementById('gestor-max-temp').value = c.maxTemp !== null ? c.maxTemp : '';
                document.getElementById('gestor-min-hr').value = c.minHr ? (c.minHr<=1 ? c.minHr*100 : c.minHr) : '';
                document.getElementById('gestor-max-hr').value = c.maxHr ? (c.maxHr<=1 ? c.maxHr*100 : c.maxHr) : '';
                
                setSelectOrOtro('gestor-tipo', 'gestor-tipo-otro', c.tipo);
                setSelectOrOtro('gestor-area', 'gestor-area-otro', c.area);
            }
        }
    });
}

if (formGestor) {
    formGestor.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('btn-guardar-gestor');
        const origHTML = btn.innerHTML;
        btn.disabled = true; btn.innerHTML = '<i class="ph ph-spinner animate-spin"></i> Guardando...';

        const tSel = document.getElementById('gestor-tipo').value;
        const inTipoOtro = document.getElementById('gestor-tipo-otro');
        const tipoFinal = (tSel === 'OTRO' && inTipoOtro) ? inTipoOtro.value : tSel;
        
        const aSel = document.getElementById('gestor-area').value;
        const inAreaOtro = document.getElementById('gestor-area-otro');
        const areaFinal = (aSel === 'OTRO' && inAreaOtro) ? inAreaOtro.value : aSel;

        const camaraData = {
            id: document.getElementById('gestor-id').value,
            nombre: document.getElementById('gestor-nombre').value,
            tipo: tipoFinal,
            area: areaFinal,
            minTemp: parseFloat(document.getElementById('gestor-min-temp').value),
            maxTemp: parseFloat(document.getElementById('gestor-max-temp').value),
            minHr: document.getElementById('gestor-min-hr').value ? parseFloat(document.getElementById('gestor-min-hr').value) : '',
            maxHr: document.getElementById('gestor-max-hr').value ? parseFloat(document.getElementById('gestor-max-hr').value) : ''
        };

        if(camaraData.minTemp > camaraData.maxTemp) {
            alert("Error de lógica: La temperatura mínima no puede ser mayor a la máxima.");
            btn.disabled = false; btn.innerHTML = origHTML; return;
        }

        try {
            const res = await apiFetch({ action: 'guardarCamaraConfig', camaraData: camaraData });
            if (res.status === 'success') {
                if (modalGestor) modalGestor.classList.add('hidden');
                cargarCamaras(); 
            } else {
                alert("Error del Servidor: " + res.message);
            }
        } catch (error) {
            alert("Error de Red al intentar guardar.");
        } finally {
            btn.disabled = false; btn.innerHTML = origHTML;
        }
    });
}

// ==========================================
// 10. MOTOR DE GLOBO DE INFORMACIÓN (POPOVER CREADO EN DOM)
// ==========================================
function inicializarGloboInfo() {
    let globo = document.getElementById('globo-info-registro');
    if (!globo) {
        globo = document.createElement('div');
        globo.id = 'globo-info-registro';
        // Diseño premium en Tailwind, oculto por defecto
        globo.className = 'absolute z-[100] hidden bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-300 dark:border-gray-600 p-4 w-72 text-left transform transition-opacity opacity-0';
        
        globo.innerHTML = `
            <div id="globo-info-contenido" class="text-sm space-y-2"></div>
            <div class="absolute -bottom-2 left-1/2 transform -translate-x-1/2 w-4 h-4 bg-white dark:bg-gray-800 border-b border-r border-gray-300 dark:border-gray-600 rotate-45 transition-all" id="globo-flecha"></div>
        `;
        document.body.appendChild(globo);

        // Auto-cierre al hacer clic en cualquier lugar fuera del globo
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.celda-info-trigger') && !globo.contains(e.target)) {
                globo.classList.add('hidden');
                globo.classList.remove('opacity-100');
            }
        });
    }
}

window.abrirGloboInfo = function(e, dia, turno, force = false) {
    // Si estamos editando y no se forzó el clic (ej. en "Ver Detalle"), abortar
    if (AppState.modoEdicion && !force) return; 
    
    const reg = AppState.revisionData.find(r => r.dia === dia && r.turno === turno);
    if (!reg) return; 

    inicializarGloboInfo();
    const globo = document.getElementById('globo-info-registro');
    const contenido = document.getElementById('globo-info-contenido');
    const flecha = document.getElementById('globo-flecha');

    // Construcción de la Trazabilidad
    let html = `<div class="border-b pb-2 mb-2 border-gray-100 dark:border-gray-700 text-gray-800 dark:text-gray-200">
                    <div class="flex items-center gap-1 font-bold text-blue-600 dark:text-blue-400"><i class="ph ph-user-circle"></i> ${reg.usuario || 'Desconocido'}</div>
                    <div class="text-xs text-gray-500 mt-1"><i class="ph ph-clock"></i> ${reg.timestamp || 'Sin fecha'}</div>
                </div>`;
    
    if (reg.incidencia && reg.incidencia.trim() !== '') {
        html += `<div class="mt-2 text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2 rounded">
                    <span class="font-bold text-[11px] uppercase flex items-center gap-1"><i class="ph ph-warning-octagon"></i> Observación Inicial</span>
                    <span class="text-xs mt-1 block break-words">${reg.incidencia}</span>
                 </div>`;
    }
    if (reg.accionCorrectiva && reg.accionCorrectiva.trim() !== '') {
        html += `<div class="mt-2 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 p-2 rounded">
                    <span class="font-bold text-[11px] uppercase flex items-center gap-1"><i class="ph ph-wrench"></i> Acción Correctiva</span>
                    <span class="text-xs mt-1 block break-words">${reg.accionCorrectiva}</span>
                 </div>`;
    }
    if (reg.justificacion && reg.justificacion.trim() !== '') {
        html += `<div class="mt-2 text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 p-2 rounded">
                    <span class="font-bold text-[11px] uppercase flex items-center gap-1"><i class="ph ph-pencil-simple"></i> Justificación Edición</span>
                    <span class="text-xs mt-1 block break-words">${reg.justificacion}</span>
                 </div>`;
    }
    if(!reg.incidencia && !reg.accionCorrectiva && !reg.justificacion) {
         html += `<div class="mt-2 text-green-600 dark:text-green-400 text-center text-xs p-1 font-bold">Registro Operativo OK</div>`;
    }

    contenido.innerHTML = html;
    
    // Preparar el DOM para cálculos
    globo.classList.remove('hidden');
    globo.classList.remove('opacity-100');

    // Cálculos de Posicionamiento Inteligente Absoluto
    const rect = e.currentTarget.getBoundingClientRect(); 
    const globoRect = globo.getBoundingClientRect();
    
    // Posición base (por encima de la celda)
    let top = rect.top + window.scrollY - globoRect.height - 10;
    let left = rect.left + window.scrollX + (rect.width / 2) - (globoRect.width / 2);

    flecha.className = "absolute -bottom-2 left-1/2 transform -translate-x-1/2 w-4 h-4 bg-white dark:bg-gray-800 border-b border-r border-gray-300 dark:border-gray-600 rotate-45 transition-all";

    // Si se corta por arriba de la pantalla, lo dibujamos por DEBAJO de la celda
    if (top < window.scrollY + 10) {
        top = rect.bottom + window.scrollY + 10;
        flecha.className = "absolute -top-2 left-1/2 transform -translate-x-1/2 w-4 h-4 bg-white dark:bg-gray-800 border-t border-l border-gray-300 dark:border-gray-600 rotate-45 transition-all";
    }

    // Prevención de desbordamiento horizontal (Móviles)
    if (left < 10) left = 10;
    if (left + globoRect.width > window.innerWidth - 10) left = window.innerWidth - globoRect.width - 10;

    // Aplicar estilos y transición visual suave
    globo.style.top = top + 'px';
    globo.style.left = left + 'px';
    
    setTimeout(() => globo.classList.add('opacity-100'), 10);
}

// ==========================================
// 11. MONITOREO DIARIO (CENTRO DE COMANDO)
// ==========================================
const tabMonitoreo = document.getElementById('tab-monitoreo');
const btnRefrescarMonitoreo = document.getElementById('btn-refrescar-monitoreo');

if(tabMonitoreo) tabMonitoreo.addEventListener('click', () => switchTab('monitoreo'));
if(btnRefrescarMonitoreo) btnRefrescarMonitoreo.addEventListener('click', cargarCentroDeComando);

async function cargarCentroDeComando() {
    const grid = document.getElementById('grid-monitoreo');
    const hoyStr = document.getElementById('val-fecha').value.split('-').reverse().join('/'); // Usa la fecha del panel principal
    
    document.getElementById('txt-fecha-monitoreo').innerText = `Estado en vivo para el: ${hoyStr}`;
    grid.innerHTML = '<div class="col-span-full text-center py-10"><i class="ph ph-spinner animate-spin text-4xl text-blue-500"></i><br>Escaneando planta...</div>';

    try {
        const res = await apiFetch({ action: 'getMonitoreoDiario', fechaDia: hoyStr });
        if (res.status === 'success') {
            dibujarTarjetasMonitoreo(res.data);
        } else {
            grid.innerHTML = `<div class="col-span-full text-red-500 text-center py-4">${res.message}</div>`;
        }
    } catch (e) {
        grid.innerHTML = `<div class="col-span-full text-red-500 text-center py-4">Error de conexión.</div>`;
    }
}

function dibujarTarjetasMonitoreo(camarasActivas) {
    const grid = document.getElementById('grid-monitoreo');
    grid.innerHTML = '';

    if (camarasActivas.length === 0) {
        grid.innerHTML = '<div class="col-span-full text-center text-gray-500 py-4">No hay cámaras configuradas en la BD.</div>';
        return;
    }

    camarasActivas.forEach(cam => {
        // Estilos base de la tarjeta dependiendo del estado global del día
        let bordeAcento = "border-gray-200 dark:border-gray-700";
        let iconoEstado = `<i class="ph ph-clock text-gray-400"></i> Pendiente`;
        
        if (cam.estadoGlobal === 'ALERTA') {
            bordeAcento = "border-red-500 shadow-red-100 dark:shadow-red-900/20";
            iconoEstado = `<i class="ph ph-warning-octagon text-red-600"></i> Desviación Activa`;
        } else if (cam.estadoGlobal === 'OK') {
            bordeAcento = "border-green-500 shadow-green-100 dark:shadow-green-900/20";
            iconoEstado = `<i class="ph ph-check-circle text-green-600"></i> En Rango`;
        }

        let tarjetaHTML = `
            <div class="bg-white dark:bg-gray-800 rounded-xl border-t-4 border-x border-b ${bordeAcento} p-4 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
                
                <div class="flex justify-between items-start mb-4">
                    <div>
                        <h3 class="font-black text-gray-800 dark:text-gray-100 text-lg leading-tight">${cam.nombre}</h3>
                        <span class="inline-block mt-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">${cam.area}</span>
                    </div>
                    <div class="text-right">
                        <span class="block text-xs font-bold text-gray-700 dark:text-gray-300">${iconoEstado}</span>
                        <span class="block text-[10px] text-gray-400 mt-1">Últ. act: ${cam.ultimaLectura}</span>
                    </div>
                </div>

                <div class="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-2 flex justify-between items-center border border-gray-100 dark:border-gray-700">
        `;

        // Generar los 6 semáforos por turno
        TODOS_LOS_TURNOS.forEach(t => {
            let estadoTurno = cam.turnos[t];
            let colorBolita = "bg-gray-200 dark:bg-gray-600 border-gray-300 dark:border-gray-500"; // Pendiente
            let textoSemaforo = "text-gray-400";

            if (estadoTurno === 'OK') {
                colorBolita = "bg-green-500 border-green-600 shadow-sm shadow-green-200 dark:shadow-green-900";
                textoSemaforo = "text-green-600 font-bold";
            } else if (estadoTurno === 'DESVIACION') {
                colorBolita = "bg-red-500 border-red-600 shadow-sm shadow-red-200 dark:shadow-red-900 animate-pulse";
                textoSemaforo = "text-red-600 font-bold";
            }

            tarjetaHTML += `
                <div class="flex flex-col items-center gap-1 cursor-default" title="Turno: ${t} | Estado: ${estadoTurno || 'Pendiente'}">
                    <div class="w-4 h-4 rounded-full border ${colorBolita}"></div>
                    <span class="text-[9px] ${textoSemaforo}">${t}</span>
                </div>
            `;
        });

        tarjetaHTML += `
                </div>
            </div>
        `;
        
        grid.innerHTML += tarjetaHTML;
    });
}

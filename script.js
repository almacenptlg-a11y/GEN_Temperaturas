// script.js (Módulo Temperaturas - GitHub)

// ==========================================
// CONFIGURACIÓN Y ESTADO GLOBAL
// ==========================================
const API_URL = "https://script.google.com/macros/s/AKfycbw9DjZJw8DelWMQQKvUxGhjHs1Ka0sWZPyHBu4lYwMg-2L-avGrzWNEoZOMXT8x9g3c/exec"; 
const TODOS_LOS_TURNOS = ['07:30', '09:30', '11:30', '13:30', '15:30', '17:30'];
let currentUser = null;
let camarasDisponibles = [];


// ==========================================
// 1. GESTIÓN DE SESIÓN Y TEMA (MICRO-FRONTEND)
// ==========================================

window.addEventListener('message', function(event) {
    const data = event.data;

    // 1. Recibir Sesión y Tema Inicial
    if (data && data.type === 'SESSION_SYNC') {
        const usuarioGenApps = data.user;
        
        // Guardamos en memoria local del Iframe para sobrevivir a recargas (F5)
        sessionStorage.setItem('moduloUser', JSON.stringify(usuarioGenApps));
        
        // Aplicar tema inicial que nos manda el padre
        if (data.theme === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }

        iniciarModuloConUsuario(usuarioGenApps);
    }

    // 2. Escuchar cambios de tema en tiempo real
    if (data && data.type === 'THEME_UPDATE') {
        if (data.theme === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }
});

// Ciclo de vida al cargar la vista
document.addEventListener('DOMContentLoaded', () => {
    const savedUser = sessionStorage.getItem('moduloUser');
    
    if (savedUser) {
        // Rehidratación
        const usuarioRehidratado = JSON.parse(savedUser);
        console.log("MÓDULO HIJO: Sesión recuperada de memoria ->", usuarioRehidratado);
        iniciarModuloConUsuario(usuarioRehidratado);
    } else {
        // Handshake
        console.log("MÓDULO HIJO: DOM Cargado, solicitando sesión al Padre...");
        window.parent.postMessage({ type: 'MODULO_LISTO' }, '*');
        
        setTimeout(() => {
            if (!sessionStorage.getItem('moduloUser')) {
                const uiUsuario = document.getElementById('txt-usuario-activo');
                if(uiUsuario) uiUsuario.innerHTML = '<i class="ph ph-warning text-red-500"></i> Error: Sesión no sincronizada desde GENAPPS';
            }
        }, 3000);
    }
});

// ==========================================
// CONFIGURACIÓN INICIAL DE LA VISTA
// ==========================================

function configurarFechaInicial() {
    const hoy = new Date();
    hoy.setHours(hoy.getHours() - 5); 
    const fechaISO = hoy.toISOString().split('T')[0]; 
    const inputFecha = document.getElementById('val-fecha');
    if (inputFecha) inputFecha.value = fechaISO;
}

function iniciarModuloConUsuario(usuario) {
    currentUser = usuario;

    const nombreDisplay = document.getElementById('txt-usuario-activo');
    if (nombreDisplay) {
        nombreDisplay.innerHTML = `<i class="ph ph-user-check"></i> Operador: ${usuario.nombre} | ${usuario.area}`;
    }

    configurarFechaInicial();
    cargarCamaras();
}


// ==========================================
// 2. UTILIDADES Y VERIFICACIÓN DE TURNOS
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

    const fechaFormat = formatearFecha(inputFecha);
    
    turnosContainer.innerHTML = '<div class="col-span-3 md:col-span-6 text-sm text-blue-600 font-bold py-4 text-center bg-blue-50 dark:bg-blue-900/30 rounded-lg border border-blue-200 dark:border-blue-800"><i class="ph ph-spinner animate-spin text-xl inline-block align-middle mr-2"></i> Consultando turnos en servidor...</div>';

    try {
        const response = await apiFetch({
            action: 'getTurnosRegistrados',
            idCamara: idCamara,
            fecha: fechaFormat
        });

        if (response.status === 'success') {
            const registrados = response.data;
            let disponibles = 0;
            turnosContainer.innerHTML = '';
            
            TODOS_LOS_TURNOS.forEach(turno => {
                const btn = document.createElement('button');
                btn.type = 'button';
                const isOcupado = registrados.includes(turno);

                if (isOcupado) {
                    btn.className = "py-3 rounded-xl border bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed flex flex-col items-center justify-center gap-1 opacity-70";
                    btn.innerHTML = `<i class="ph ph-check-square-offset text-2xl"></i><span class="font-bold text-sm">${turno}</span>`;
                    btn.disabled = true;
                } else {
                    btn.className = "turno-btn py-3 rounded-xl border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/40 hover:text-blue-700 dark:hover:text-blue-300 transition-all flex flex-col items-center justify-center gap-1 cursor-pointer shadow-sm";
                    btn.innerHTML = `<i class="ph ph-clock text-2xl"></i><span class="font-bold text-sm">${turno}</span>`;
                    btn.onclick = () => seleccionarBotonTurno(turno, btn);
                    disponibles++;
                }
                turnosContainer.appendChild(btn);
            });

            if (disponibles === 0) {
                turnosContainer.innerHTML = '<div class="col-span-3 md:col-span-6 text-center text-amber-700 font-bold bg-amber-50 dark:bg-amber-900/30 p-4 rounded-lg border border-amber-300 dark:border-amber-700">⚠️ Todos los turnos han sido completados para esta fecha.</div>';
            }
        }
    } catch (e) {
        turnosContainer.innerHTML = '<div class="col-span-3 md:col-span-6 text-center text-red-600 font-bold bg-red-50 dark:bg-red-900/30 p-3 rounded-lg border border-red-200 dark:border-red-800">Error de red. Intente nuevamente.</div>';
    }
}

function seleccionarBotonTurno(turno, btnActivado) {
    document.getElementById('turno-seleccionado').value = turno;
    
    const botones = document.querySelectorAll('.turno-btn');
    botones.forEach(b => {
        b.classList.remove('border-blue-600', 'bg-blue-50', 'text-blue-800', 'dark:bg-blue-900/40', 'dark:text-blue-300', 'shadow-md', 'scale-[1.02]');
        b.classList.add('border-gray-200', 'dark:border-gray-600', 'bg-white', 'dark:bg-gray-700', 'text-gray-700', 'dark:text-gray-200');
        b.querySelector('i').className = 'ph ph-clock text-2xl';
    });

    btnActivado.classList.remove('border-gray-200', 'dark:border-gray-600', 'bg-white', 'dark:bg-gray-700', 'text-gray-700', 'dark:text-gray-200');
    btnActivado.classList.add('border-blue-600', 'bg-blue-50', 'dark:bg-blue-900/40', 'text-blue-800', 'dark:text-blue-300', 'shadow-md', 'scale-[1.02]');
    btnActivado.querySelector('i').className = 'ph ph-check-circle-fill text-2xl text-blue-600 dark:text-blue-400';
}


// ==========================================
// VALIDADOR DE ESTADO EN TIEMPO REAL
// ==========================================

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
    const icon = document.getElementById('icono-estado');
    const titulo = document.getElementById('titulo-estado');
    const desc = document.getElementById('desc-estado');

    if (esTempOk && esHumOk) {
        panelEstado.className = 'rounded-xl p-4 border flex items-start gap-4 shadow-sm bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800';
        icon.innerHTML = '<i class="ph ph-check-circle text-4xl text-green-600 dark:text-green-400"></i>';
        titulo.className = 'font-bold text-lg mb-0.5 text-green-800 dark:text-green-400';
        titulo.textContent = 'PARÁMETROS DENTRO DE RANGO';
        desc.className = 'text-sm font-medium text-green-700 dark:text-green-500';
        desc.textContent = 'Todo se encuentra OK. Proceda a registrar.';
        
        textareaIncidencia.removeAttribute('required'); 
    } else {
        panelEstado.className = 'rounded-xl p-4 border flex items-start gap-4 shadow-sm bg-red-50 dark:bg-red-900/30 border-red-300 dark:border-red-800 animate-pulse';
        icon.innerHTML = '<i class="ph ph-warning-octagon text-4xl text-red-600 dark:text-red-400"></i>';
        titulo.className = 'font-bold text-lg mb-0.5 text-red-800 dark:text-red-400';
        titulo.textContent = '⚠️ DESVIACIÓN DETECTADA';
        desc.className = 'text-sm font-medium text-red-700 dark:text-red-500';
        desc.textContent = 'Los valores superan el límite HACCP. Describa la medida correctiva aplicada abajo (Obligatorio).';
        
        textareaIncidencia.setAttribute('required', 'true'); 
    }
}

document.getElementById('val-temp').addEventListener('input', evaluarParametrosEnVivo);
document.getElementById('val-humedad').addEventListener('input', evaluarParametrosEnVivo);

// ==========================================
// 3. REACTIVIDAD DE EVENTOS (DOM)
// ==========================================

document.getElementById('camara-select').addEventListener('change', (e) => {
    const idCamara = e.target.value;
    const camara = camarasDisponibles.find(c => c.id.toString() === idCamara.toString());
    
    const boxHumedad = document.getElementById('box-humedad');
    const inputHumedad = document.getElementById('val-humedad');
    const banner = document.getElementById('banner-limites');
    const txtTemp = document.getElementById('txt-limites-temp');
    const txtHr = document.getElementById('txt-limites-hr');

    if (!camara) {
        banner.classList.add('hidden');
        boxHumedad.classList.add('hidden');
        inputHumedad.removeAttribute('required');
        verificarTurnosDisponibles(); 
        if (typeof evaluarParametrosEnVivo === 'function') evaluarParametrosEnVivo();
        return;
    }

    banner.classList.remove('hidden');
    txtTemp.innerHTML = `<i class="ph ph-thermometer-simple text-xl text-blue-600 dark:text-blue-400"></i> <strong>Rango Temp:</strong> ${camara.minTemp}°C a ${camara.maxTemp}°C`;

    if (camara.minHr !== null && camara.maxHr !== null && camara.maxHr > 0) {
        boxHumedad.classList.remove('hidden');
        inputHumedad.setAttribute('required', 'true');
        
        let minH = camara.minHr <= 1 ? camara.minHr * 100 : camara.minHr;
        let maxH = camara.maxHr <= 1 ? camara.maxHr * 100 : camara.maxHr;
        
        txtHr.innerHTML = `<i class="ph ph-drop text-xl text-blue-600 dark:text-blue-400"></i> <strong>Rango HR:</strong> ${minH}% a ${maxH}%`;
    } else {
        boxHumedad.classList.add('hidden');
        inputHumedad.removeAttribute('required');
        inputHumedad.value = '';
        txtHr.innerHTML = '';
    }

    verificarTurnosDisponibles();
    if (typeof evaluarParametrosEnVivo === 'function') evaluarParametrosEnVivo();
});

const inputFecha = document.getElementById('val-fecha');
if (inputFecha) {
    inputFecha.addEventListener('blur', (e) => {
        if (e.target.value.length === 10) verificarTurnosDisponibles();
    });

    inputFecha.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.value.length === 10) {
            e.preventDefault();
            verificarTurnosDisponibles();
        }
    });
}

// ==========================================
// 4. COMUNICACIÓN CON LA API
// ==========================================

async function apiFetch(payload) {
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        return await response.json();
    } catch (error) {
        console.error("Error en petición HTTP:", error);
        throw new Error("Fallo la comunicación con el servidor");
    }
}

async function cargarCamaras() {
    const select = document.getElementById('camara-select');
    select.innerHTML = '<option value="">Descargando cámaras autorizadas...</option>';

    try {
        const payload = { 
            action: 'getCamarasConfig', 
            userEmail: currentUser.usuario, 
            userRol: currentUser.rol, 
            userArea: currentUser.area 
        };
        
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
        } else {
            alert("Error del servidor: " + response.message);
            select.innerHTML = '<option value="">Error al cargar</option>';
        }
    } catch (error) {
        console.error("Error al cargar cámaras", error);
        select.innerHTML = '<option value="">Error de conexión</option>';
    }
}

function llenarSelectCamaras(camaras) {
    const select = document.getElementById('camara-select');
    select.innerHTML = '<option value="">Seleccione una cámara...</option>';
    camaras.forEach(c => {
        select.innerHTML += `<option value="${c.id}">${c.nombre}</option>`;
    });
}

// ==========================================
// 5. ENVÍO DEL FORMULARIO
// ==========================================

document.getElementById('form-lectura-camara').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (!currentUser) {
        alert("Seguridad: No hay sesión activa. Refresque la aplicación.");
        return;
    }

    const btn = document.getElementById('btn-guardar-lectura');
    const originalBtnHTML = btn.innerHTML;
    
    const turnoElegido = document.getElementById('turno-seleccionado').value;
    
    if (!turnoElegido) {
        alert("Por favor seleccione el botón de un turno disponible antes de guardar.");
        return;
    }

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

    btn.disabled = true;
    btn.classList.replace('bg-blue-600', 'bg-gray-500');
    btn.innerHTML = '<i class="ph ph-spinner animate-spin text-2xl"></i> Guardando...';

    try {
        const response = await apiFetch(payload);
        
        if (response.status === 'success') {
            btn.classList.replace('bg-gray-500', 'bg-green-600');
            btn.innerHTML = '<i class="ph ph-check-circle text-2xl"></i> ¡Guardado Exitosamente!';
            
            setTimeout(() => {
                const camaraActual = document.getElementById('camara-select').value;
                const fechaActual = document.getElementById('val-fecha').value;
                
                document.getElementById('form-lectura-camara').reset();
                
                document.getElementById('camara-select').value = camaraActual;
                document.getElementById('val-fecha').value = fechaActual;
                
                document.getElementById('panel-estado').classList.add('hidden');
                document.getElementById('val-incidencia').removeAttribute('required');
                document.getElementById('val-incidencia').value = ''; 
                
                verificarTurnosDisponibles();
                
                restaurarBotonGuardar(btn, originalBtnHTML);
            }, 1500);
            
        } else {
            alert('Error en BD: ' + response.message);
            restaurarBotonGuardar(btn, originalBtnHTML);
        }
    } catch (error) {
        alert('Fallo de conexión. Revise su internet e intente de nuevo.');
        restaurarBotonGuardar(btn, originalBtnHTML);
    }
});

function restaurarBotonGuardar(btn, htmlOriginal) {
    btn.disabled = false;
    btn.classList.remove('bg-gray-500', 'bg-green-600');
    btn.classList.add('bg-blue-600');
    btn.innerHTML = htmlOriginal;
}

// ==========================================
// 6. NAVEGACIÓN DE PESTAÑAS (TABS)
// ==========================================

const tabRegistro = document.getElementById('tab-registro');
const tabRevision = document.getElementById('tab-revision');
const vistaRegistro = document.getElementById('vista-registro');
const vistaRevision = document.getElementById('vista-revision');

tabRegistro.addEventListener('click', () => {
    // Mostrar Registro, Ocultar Revisión
    vistaRegistro.classList.remove('hidden');
    vistaRegistro.classList.add('block');
    vistaRevision.classList.remove('block');
    vistaRevision.classList.add('hidden');

    // Cambiar estilos (Pestaña Activa)
    tabRegistro.classList.replace('border-transparent', 'border-blue-600');
    tabRegistro.classList.replace('text-gray-500', 'text-blue-600');
    tabRegistro.classList.replace('dark:text-gray-400', 'dark:text-blue-400');

    // Cambiar estilos (Pestaña Inactiva)
    tabRevision.classList.replace('border-blue-600', 'border-transparent');
    tabRevision.classList.replace('text-blue-600', 'text-gray-500');
    tabRevision.classList.replace('dark:text-blue-400', 'dark:text-gray-400');
});

tabRevision.addEventListener('click', () => {
    // Mostrar Revisión, Ocultar Registro
    vistaRevision.classList.remove('hidden');
    vistaRevision.classList.add('block');
    vistaRegistro.classList.remove('block');
    vistaRegistro.classList.add('hidden');

    // Cambiar estilos (Pestaña Activa)
    tabRevision.classList.replace('border-transparent', 'border-blue-600');
    tabRevision.classList.replace('text-gray-500', 'text-blue-600');
    tabRevision.classList.replace('dark:text-gray-400', 'dark:text-blue-400');

    // Cambiar estilos (Pestaña Inactiva)
    tabRegistro.classList.replace('border-blue-600', 'border-transparent');
    tabRegistro.classList.replace('text-blue-600', 'text-gray-500');
    tabRegistro.classList.replace('dark:text-blue-400', 'dark:text-gray-400');

    // Cargar los combos del Dashboard la primera vez que se entra
    const revCamara = document.getElementById('rev-camara');
    if (revCamara.options.length <= 1 && camarasDisponibles.length > 0) {
        revCamara.innerHTML = '<option value="">Seleccione cámara...</option>';
        camarasDisponibles.forEach(c => {
            revCamara.innerHTML += `<option value="${c.id}">${c.nombre}</option>`;
        });
        
        // Seleccionar el mes y año actual automáticamente
        const hoy = new Date();
        document.getElementById('rev-mes').value = hoy.getMonth() + 1;
        document.getElementById('rev-anio').value = hoy.getFullYear();
    }
});


// ==========================================
// 7. DASHBOARD MATRIZ (REVISIÓN JEFATURA)
// ==========================================

document.getElementById('btn-generar-reporte').addEventListener('click', async () => {
    const idCamara = document.getElementById('rev-camara').value;
    const mes = document.getElementById('rev-mes').value;
    const anio = document.getElementById('rev-anio').value;
    
    if (!idCamara) return alert("Por favor seleccione una cámara para generar el reporte.");

    // 1. EVALUAR SI LA CÁMARA USA HUMEDAD
    const camaraSel = camarasDisponibles.find(c => c.id.toString() === idCamara.toString());
    const usaHumedad = camaraSel && camaraSel.minHr !== null && camaraSel.maxHr !== null && camaraSel.maxHr > 0;

    const btn = document.getElementById('btn-generar-reporte');
    const originalBtnHTML = btn.innerHTML;
    
    // UI Cargando
    btn.disabled = true;
    btn.innerHTML = '<i class="ph ph-spinner animate-spin text-xl"></i> Extrayendo datos...';
    
    const container = document.getElementById('tabla-container');
    const mensaje = document.getElementById('tabla-mensaje');
    const thead = document.getElementById('tabla-head');
    const tbody = document.getElementById('tabla-body');

    container.classList.add('hidden');
    mensaje.classList.remove('hidden');
    mensaje.innerHTML = '<i class="ph ph-spinner animate-spin text-4xl mb-3 text-blue-500"></i><br><span class="font-bold">Procesando Matriz HACCP...</span>';

    try {
        const response = await apiFetch({
            action: 'getRegistrosRevision',
            idCamara: idCamara,
            mes: mes,
            anio: anio
        });

        if (response.status === 'success') {
            const data = response.data;
            
            if (data.length === 0) {
                mensaje.innerHTML = '<i class="ph ph-folder-open text-5xl mb-3 text-gray-400"></i><br><span class="font-bold text-lg">Sin registros</span><br>No se encontraron datos para este mes.';
                restaurarBotonReporte(btn, originalBtnHTML);
                return;
            }

            mensaje.classList.add('hidden');
            container.classList.remove('hidden');

            const diasEnMes = new Date(anio, mes, 0).getDate();
            
            // =========================================================
            // ARMADO DINÁMICO DE LA CABECERA (Simple vs Doble)
            // =========================================================
            let headHTML = '';
            
            if (usaHumedad) {
                // Cabecera de 2 niveles (Turno -> °C | %HR)
                headHTML += '<tr><th rowspan="2" class="px-4 py-3 bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 w-16 text-center border-b border-r border-gray-200 dark:border-gray-600 align-middle">DÍA</th>';
                TODOS_LOS_TURNOS.forEach(t => {
                    headHTML += `<th colspan="2" class="px-4 py-2 text-center border-b border-gray-200 dark:border-gray-600 bg-gray-100 dark:bg-gray-700">${t}</th>`;
                });
                headHTML += '</tr><tr>';
                TODOS_LOS_TURNOS.forEach(t => {
                    headHTML += `<th class="px-2 py-1 text-center text-[11px] text-gray-500 dark:text-gray-400 border-b border-r border-gray-200 dark:border-gray-600">°C</th>`;
                    headHTML += `<th class="px-2 py-1 text-center text-[11px] text-blue-600 dark:text-blue-400 border-b border-r border-gray-200 dark:border-gray-600">%HR</th>`;
                });
                headHTML += '</tr>';
            } else {
                // Cabecera de 1 nivel (Solo Temperaturas)
                headHTML += '<tr><th class="px-4 py-3 bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 w-16 text-center border-b border-r border-gray-200 dark:border-gray-600">DÍA</th>';
                TODOS_LOS_TURNOS.forEach(t => {
                    headHTML += `<th class="px-4 py-3 text-center border-b border-r border-gray-200 dark:border-gray-600">${t}</th>`;
                });
                headHTML += '</tr>';
            }
            
            thead.innerHTML = headHTML;

            // =========================================================
            // ARMADO DINÁMICO DEL CUERPO (Celdas)
            // =========================================================
            let bodyHTML = '';
            
            // Feriados fijos de Perú (DD/MM)
            const FERIADOS_PERU = ['01/01', '01/05', '07/06', '29/06', '23/07', '28/07', '29/07','06/08', '30/08', '08/10', '01/11', '08/12', '09/12', '25/12'];
            const diasAbrev = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

            for (let d = 1; d <= diasEnMes; d++) {
                
                // 1. Cálculos de Fecha (Día de la semana y Feriados)
                const fechaFila = new Date(anio, mes - 1, d); // mes - 1 porque JS cuenta los meses de 0 a 11
                const indiceDia = fechaFila.getDay(); // 0 = Domingo, 6 = Sábado
                const abrev = diasAbrev[indiceDia];
                
                const diaMesStr = `${d.toString().padStart(2, '0')}/${mes.toString().padStart(2, '0')}`;
                const esFeriado = FERIADOS_PERU.includes(diaMesStr);
                const esFinSemana = (indiceDia === 0 || indiceDia === 6);
                
                const esInactivo = esFinSemana || esFeriado; // Si es inactivo, lo sombreamos

                // 2. Estilos Dinámicos para la Fila (Tachado suave / Sombreado)
                let claseFila = "transition-colors ";
                let claseCeldaCabecera = "px-4 py-2 text-center border-r border-gray-200 dark:border-gray-700 ";

                if (esInactivo) {
                    // Fila sombreada (Sábados, Domingos y Feriados)
                    claseFila += "bg-gray-100 dark:bg-gray-800/80 opacity-90"; 
                    claseCeldaCabecera += "bg-gray-200 dark:bg-gray-700/80";
                } else {
                    // Fila normal (Días hábiles)
                    claseFila += "hover:bg-gray-50 dark:hover:bg-gray-700/50";
                    claseCeldaCabecera += "bg-gray-50 dark:bg-gray-800/50";
                }

                // 3. Dibujar la celda principal del DÍA
                bodyHTML += `<tr class="${claseFila}">
                              <td class="${claseCeldaCabecera}">
                                  <span class="block text-[10px] uppercase tracking-wider ${esInactivo ? 'text-gray-400' : 'text-gray-500'} font-bold mb-0.5">${abrev}</span>
                                  <span class="${esInactivo ? 'text-gray-500 dark:text-gray-400 font-bold' : 'text-gray-900 dark:text-white font-bold text-base'}">${d}</span>
                                  ${esFeriado ? `<span class="block text-[9px] text-red-500 font-bold mt-0.5">Feriado</span>` : ''}
                              </td>`;
                
                // 4. Dibujar las celdas de Temperaturas
                TODOS_LOS_TURNOS.forEach(turno => {
                    const reg = data.find(r => r.dia === d && r.turno === turno);
                    
                    if (reg) {
                        const isDesviacion = reg.estado === 'DESVIACION';
                        const textColor = isDesviacion ? 'text-red-600 dark:text-red-400 font-bold' : 'text-gray-800 dark:text-gray-200 font-semibold';
                        const bgWarning = isDesviacion ? 'bg-red-50 dark:bg-red-900/10' : '';
                        const tooltip = `Registrado por: ${reg.usuario}\nObs: ${reg.incidencia || 'Ninguna'}`;
                        const obsSpan = isDesviacion ? '<span class="block text-[10px] text-red-500 font-normal">Ver Obs.</span>' : '';

                        if (usaHumedad) {
                            bodyHTML += `<td class="px-2 py-2 text-center border-r border-gray-200 dark:border-gray-700 cursor-help ${textColor} ${bgWarning}" title="${tooltip}">
                                            ${reg.temp}° ${obsSpan}
                                         </td>`;
                            bodyHTML += `<td class="px-2 py-2 text-center border-r border-gray-200 dark:border-gray-700 cursor-help text-blue-600 dark:text-blue-400 font-medium ${bgWarning}" title="${tooltip}">
                                            ${reg.humedad ? reg.humedad + '%' : '-'}
                                         </td>`;
                        } else {
                            bodyHTML += `<td class="px-4 py-2 text-center border-r border-gray-200 dark:border-gray-700 cursor-help ${textColor} ${bgWarning}" title="${tooltip}">
                                            ${reg.temp}° ${obsSpan}
                                         </td>`;
                        }
                    } else {
                        // Celdas Vacías (Tachado suave visual usando texto atenuado)
                        const celdaVaciaClass = `text-center border-r border-gray-200 dark:border-gray-700 ${esInactivo ? 'text-gray-300 dark:text-gray-600' : 'text-gray-300 dark:text-gray-500'}`;
                        
                        if (usaHumedad) {
                            bodyHTML += `<td class="px-2 py-2 ${celdaVaciaClass}">-</td>`;
                            bodyHTML += `<td class="px-2 py-2 ${celdaVaciaClass}">-</td>`;
                        } else {
                            bodyHTML += `<td class="px-4 py-2 ${celdaVaciaClass}">-</td>`;
                        }
                    }
                });
                bodyHTML += '</tr>';
            }
            tbody.innerHTML = bodyHTML;

        } else {
            mensaje.innerHTML = `<i class="ph ph-warning text-4xl mb-2 text-red-500"></i><br><span class="text-red-500 font-bold">Error: ${response.message}</span>`;
        }
    } catch (error) {
        mensaje.innerHTML = `<i class="ph ph-wifi-x text-4xl mb-2 text-red-500"></i><br><span class="text-red-500 font-bold">Error de red. Intente nuevamente.</span>`;
    } finally {
        restaurarBotonReporte(btn, originalBtnHTML);
    }
});

function restaurarBotonReporte(btn, htmlOriginal) {
    btn.disabled = false;
    btn.innerHTML = htmlOriginal;
}

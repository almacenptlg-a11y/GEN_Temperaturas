// script.js (Módulo Temperaturas - GitHub)

// ==========================================
// CONFIGURACIÓN Y ESTADO GLOBAL
// ==========================================
const API_URL = "https://script.google.com/macros/s/AKfycbw9DjZJw8DelWMQQKvUxGhjHs1Ka0sWZPyHBu4lYwMg-2L-avGrzWNEoZOMXT8x9g3c/exec"; 
const TODOS_LOS_TURNOS = ['07:30', '09:30', '11:30', '13:30', '15:30', '17:30'];
let currentUser = null;
let camarasDisponibles = [];


// ==========================================
// 1. GESTIÓN DE SESIÓN (MICRO-FRONTEND)
// ==========================================

// Escuchamos los mensajes que llegan del Padre (GENAPPS)
window.addEventListener('message', function(event) {
    const data = event.data;

    if (data && data.type === 'SESSION_SYNC') {
        const usuarioGenApps = data.user;
        console.log("MÓDULO HIJO: Sesión recibida desde el Hub ->", usuarioGenApps);

        // Guardamos en memoria local del Iframe para sobrevivir a recargas (F5)
        sessionStorage.setItem('moduloUser', JSON.stringify(usuarioGenApps));

        iniciarModuloConUsuario(usuarioGenApps);
    }
});

// Ciclo de vida al cargar la vista
document.addEventListener('DOMContentLoaded', () => {
    const savedUser = sessionStorage.getItem('moduloUser');
    
    if (savedUser) {
        // Rehidratación: Si ya teníamos la sesión guardada, arrancamos de inmediato
        const usuarioRehidratado = JSON.parse(savedUser);
        console.log("MÓDULO HIJO: Sesión recuperada de memoria ->", usuarioRehidratado);
        iniciarModuloConUsuario(usuarioRehidratado);
    } else {
        // Handshake: No hay sesión, le gritamos al Padre que estamos listos para recibirla
        console.log("MÓDULO HIJO: DOM Cargado, solicitando sesión al Padre...");
        window.parent.postMessage({ type: 'MODULO_LISTO' }, '*');
        
        // Timeout de seguridad por si falla la conexión con el Padre
        setTimeout(() => {
            if (!sessionStorage.getItem('moduloUser')) {
                const uiUsuario = document.getElementById('txt-usuario-activo');
                if(uiUsuario) uiUsuario.innerHTML = '<i class="ph ph-warning text-red-500"></i> Error: Sesión no sincronizada desde GENAPPS';
            }
        }, 3000);
    }
});

// AL INICIAR EL MÓDULO: Configurar la fecha de hoy por defecto
function configurarFechaInicial() {
    const hoy = new Date();
    hoy.setHours(hoy.getHours() - 5); // Ajuste simple para GMT-5
    const fechaISO = hoy.toISOString().split('T')[0]; // "YYYY-MM-DD"
    const inputFecha = document.getElementById('val-fecha');
    if (inputFecha) inputFecha.value = fechaISO;
}

// Función central de desbloqueo de UI
function iniciarModuloConUsuario(usuario) {
    currentUser = usuario;

    // Actualizar UI con datos del operador
    const nombreDisplay = document.getElementById('txt-usuario-activo');
    if (nombreDisplay) {
        nombreDisplay.innerHTML = `<i class="ph ph-user-check"></i> Operador: ${usuario.nombre} | ${usuario.area}`;
    }

    // Setear la fecha de hoy por defecto al cargar
    configurarFechaInicial();

    // Iniciar carga de datos desde la Base de Datos
    cargarCamaras();
} // <--- ESTA ES LA LLAVE QUE FALTABA

// ==========================================
// 2. UTILIDADES Y VERIFICACIÓN DE TURNOS
// ==========================================

// UTILIDAD: Convertir YYYY-MM-DD a DD/MM/YYYY para el Backend
function formatearFecha(fechaInput) {
    if (!fechaInput || fechaInput.length !== 10) return null;
    const [y, m, d] = fechaInput.split('-');
    return `${d}/${m}/${y}`;
}

// ==========================================
// RENDERIZADO DE TURNOS (BOTONES HORIZONTALES)
// ==========================================

async function verificarTurnosDisponibles() {
    const idCamara = document.getElementById('camara-select').value;
    const inputFecha = document.getElementById('val-fecha').value;
    const turnosContainer = document.getElementById('turnos-container');
    const inputOcultoTurno = document.getElementById('turno-seleccionado');

    inputOcultoTurno.value = ''; // Resetear turno elegido

    if (!idCamara || inputFecha.length !== 10) {
        turnosContainer.innerHTML = '<div class="col-span-3 md:col-span-6 text-sm text-gray-500 py-3 text-center bg-gray-50 rounded-lg border border-dashed">Seleccione cámara y fecha primero...</div>';
        return;
    }

    const fechaFormat = formatearFecha(inputFecha);
    
    // UI Cargando
    turnosContainer.innerHTML = '<div class="col-span-3 md:col-span-6 text-sm text-blue-600 font-bold py-4 text-center bg-blue-50 rounded-lg border border-blue-200"><i class="ph ph-spinner animate-spin text-xl inline-block align-middle mr-2"></i> Consultando turnos en servidor...</div>';

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
                    // Turno Bloqueado
                    btn.className = "py-3 rounded-xl border bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed flex flex-col items-center justify-center gap-1 opacity-70";
                    btn.innerHTML = `<i class="ph ph-check-square-offset text-2xl"></i><span class="font-bold text-sm">${turno}</span>`;
                    btn.disabled = true;
                } else {
                    // Turno Libre
                    btn.className = "turno-btn py-3 rounded-xl border-2 border-gray-200 bg-white text-gray-700 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 transition-all flex flex-col items-center justify-center gap-1 cursor-pointer shadow-sm";
                    btn.innerHTML = `<i class="ph ph-clock text-2xl"></i><span class="font-bold text-sm">${turno}</span>`;
                    btn.onclick = () => seleccionarBotonTurno(turno, btn);
                    disponibles++;
                }
                turnosContainer.appendChild(btn);
            });

            if (disponibles === 0) {
                turnosContainer.innerHTML = '<div class="col-span-3 md:col-span-6 text-center text-amber-700 font-bold bg-amber-50 p-4 rounded-lg border border-amber-300">⚠️ Todos los turnos han sido completados para esta fecha.</div>';
            }
        }
    } catch (e) {
        turnosContainer.innerHTML = '<div class="col-span-3 md:col-span-6 text-center text-red-600 font-bold bg-red-50 p-3 rounded-lg border border-red-200">Error de red. Intente nuevamente.</div>';
    }
}

// Lógica de UI para seleccionar un botón
function seleccionarBotonTurno(turno, btnActivado) {
    document.getElementById('turno-seleccionado').value = turno;
    
    // Reiniciar estilos de todos los botones disponibles
    const botones = document.querySelectorAll('.turno-btn');
    botones.forEach(b => {
        b.classList.remove('border-blue-600', 'bg-blue-50', 'text-blue-800', 'shadow-md', 'scale-[1.02]');
        b.classList.add('border-gray-200', 'bg-white', 'text-gray-700');
        b.querySelector('i').className = 'ph ph-clock text-2xl';
    });

    // Aplicar estilo al seleccionado
    btnActivado.classList.remove('border-gray-200', 'bg-white', 'text-gray-700');
    btnActivado.classList.add('border-blue-600', 'bg-blue-50', 'text-blue-800', 'shadow-md', 'scale-[1.02]');
    btnActivado.querySelector('i').className = 'ph ph-check-circle-fill text-2xl text-blue-600';
}


// ==========================================
// VALIDADOR DE ESTADO EN TIEMPO REAL (NUEVO)
// ==========================================

function evaluarParametrosEnVivo() {
    const idCamara = document.getElementById('camara-select').value;
    const camara = camarasDisponibles.find(c => c.id.toString() === idCamara.toString());
    
    const panelEstado = document.getElementById('panel-estado');
    const inputTemp = document.getElementById('val-temp').value;
    const inputHum = document.getElementById('val-humedad').value;
    const textareaIncidencia = document.getElementById('val-incidencia');
    
    // Si no hay cámara o no han digitado temp, ocultar panel
    if (!camara || inputTemp === '') {
        panelEstado.classList.add('hidden');
        textareaIncidencia.removeAttribute('required');
        return;
    }

    const temp = parseFloat(inputTemp);
    let esTempOk = (temp >= camara.minTemp && temp <= camara.maxTemp);
    let esHumOk = true; // Por defecto true por si no requiere humedad

    if (camara.minHr !== null && camara.maxHr !== null && camara.maxHr > 0 && inputHum !== '') {
        const hum = parseFloat(inputHum);
        let minH = camara.minHr <= 1 ? camara.minHr * 100 : camara.minHr;
        let maxH = camara.maxHr <= 1 ? camara.maxHr * 100 : camara.maxHr;
        esHumOk = (hum >= minH && hum <= maxH);
    }

    // Renderizar Panel
    panelEstado.classList.remove('hidden');
    const icon = document.getElementById('icono-estado');
    const titulo = document.getElementById('titulo-estado');
    const desc = document.getElementById('desc-estado');

    if (esTempOk && esHumOk) {
        // ESTADO OK
        panelEstado.className = 'rounded-xl p-4 border flex items-start gap-4 shadow-sm bg-green-50 border-green-200';
        icon.innerHTML = '<i class="ph ph-check-circle text-4xl text-green-600"></i>';
        titulo.className = 'font-bold text-lg mb-0.5 text-green-800';
        titulo.textContent = 'PARÁMETROS DENTRO DE RANGO';
        desc.className = 'text-sm font-medium text-green-700';
        desc.textContent = 'Todo se encuentra OK. Proceda a registrar.';
        
        textareaIncidencia.removeAttribute('required'); // No forzar observación
    } else {
        // ESTADO DESVIACIÓN
        panelEstado.className = 'rounded-xl p-4 border flex items-start gap-4 shadow-sm bg-red-50 border-red-300 animate-pulse';
        icon.innerHTML = '<i class="ph ph-warning-octagon text-4xl text-red-600"></i>';
        titulo.className = 'font-bold text-lg mb-0.5 text-red-800';
        titulo.textContent = '⚠️ DESVIACIÓN DETECTADA';
        desc.className = 'text-sm font-medium text-red-700';
        desc.textContent = 'Los valores superan el límite HACCP. Describa la medida correctiva aplicada abajo (Obligatorio).';
        
        textareaIncidencia.setAttribute('required', 'true'); // ¡Forzar justificación!
    }
}

// Disparadores de Reactividad en Tiempo Real
document.getElementById('val-temp').addEventListener('input', evaluarParametrosEnVivo);
document.getElementById('val-humedad').addEventListener('input', evaluarParametrosEnVivo);

// ==========================================
// 3. REACTIVIDAD DE EVENTOS (DOM)
// ==========================================

// Cuando cambia la cámara elegida, se revisan los límites y los turnos
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
        verificarTurnosDisponibles(); // Bloqueará los turnos
        return;
    }

    // Mostrar límites de temperatura
    banner.classList.remove('hidden');
    txtTemp.innerHTML = `<i class="ph ph-thermometer-simple text-xl text-blue-600"></i> <strong>Rango Temp:</strong> ${camara.minTemp}°C a ${camara.maxTemp}°C`;

    // Gestionar input de humedad si la cámara lo requiere
    if (camara.minHr !== null && camara.maxHr !== null && camara.maxHr > 0) {
        boxHumedad.classList.remove('hidden');
        inputHumedad.setAttribute('required', 'true');
        
        let minH = camara.minHr <= 1 ? camara.minHr * 100 : camara.minHr;
        let maxH = camara.maxHr <= 1 ? camara.maxHr * 100 : camara.maxHr;
        
        txtHr.innerHTML = `<i class="ph ph-drop text-xl text-blue-600"></i> <strong>Rango HR:</strong> ${minH}% a ${maxH}%`;
    } else {
        boxHumedad.classList.add('hidden');
        inputHumedad.removeAttribute('required');
        inputHumedad.value = '';
        txtHr.innerHTML = '';
    }

    // Verificamos qué turnos están libres para esta cámara
    verificarTurnosDisponibles();
});

// REGLA ESTRICTA DE FECHA: Blur y Keydown (Enter), validando longitud
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
// 4. COMUNICACIÓN CON LA API (BACKEND GAS)
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

// Cargar catálogo de cámaras
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
            select.classList.remove('cursor-not-allowed', 'bg-gray-50');
            select.classList.add('bg-white');
            
            // Habilitar el botón general
            const btnGuardar = document.getElementById('btn-guardar-lectura');
            if (btnGuardar) {
                btnGuardar.disabled = false;
                btnGuardar.classList.remove('bg-gray-400', 'cursor-not-allowed');
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
    
    // VALIDACIÓN: Asegurarnos de que el turno no es un placeholder vacío
    const turnoElegido = document.getElementById('turno-seleccionado').value;
    
    if (!turnoElegido) {
        alert("Por favor seleccione el botón de un turno disponible antes de guardar.");
        return;
    }

    const payload = {
        action: 'registrarLecturaCamara',
        idCamara: document.getElementById('camara-select').value,
        fecha: formatearFecha(document.getElementById('val-fecha').value),
        turno: turnoElegido, // <--- Usar la nueva variable aquí
        temperatura: document.getElementById('val-temp').value,
        humedad: document.getElementById('val-humedad').value,
        incidencia: document.getElementById('val-incidencia').value,
        userName: currentUser.nombre // Ajustado al nombre del backend
    };

    // Estado Loading
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
                
                // --- SOLUCIÓN: LIMPIAR ESTADO Y OBSERVACIONES ---
                document.getElementById('panel-estado').classList.add('hidden');
                document.getElementById('val-incidencia').removeAttribute('required');
                document.getElementById('val-incidencia').value = ''; 
                // ------------------------------------------------
                
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

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
    // Ajuste simple para GMT-5 (Hora Perú) sin depender de librerías
    hoy.setHours(hoy.getHours() - 5);
    const fechaISO = hoy.toISOString().split('T')[0]; // "YYYY-MM-DD"
    document.getElementById('val-fecha').value = fechaISO;
}

// Función central de desbloqueo de UI
function iniciarModuloConUsuario(usuario) {
    currentUser = usuario;

    // Actualizar UI con datos del operador
    const nombreDisplay = document.getElementById('txt-usuario-activo');
    if (nombreDisplay) {
        nombreDisplay.innerHTML = `<i class="ph ph-user-check"></i> Operador: ${usuario.nombre} | ${usuario.area}`;
    }

// UTILIDAD: Convertir YYYY-MM-DD a DD/MM/YYYY para el Backend
function formatearFecha(fechaInput) {
    if (!fechaInput || fechaInput.length !== 10) return null;
    const [y, m, d] = fechaInput.split('-');
    return `${d}/${m}/${y}`;
}

// NÚCLEO: Función que consulta la disponibilidad al backend
async function verificarTurnosDisponibles() {
    const idCamara = document.getElementById('camara-select').value;
    const inputFecha = document.getElementById('val-fecha').value;
    const selectTurno = document.getElementById('turno-select');

    if (!idCamara || inputFecha.length !== 10) {
        selectTurno.innerHTML = '<option value="">Seleccione cámara y fecha primero...</option>';
        selectTurno.disabled = true;
        selectTurno.classList.add('bg-gray-50');
        return;
    }

    const fechaFormat = formatearFecha(inputFecha);
    
    // Estado de carga visual en el select de turnos
    selectTurno.disabled = true;
    selectTurno.classList.add('bg-gray-50');
    selectTurno.innerHTML = '<option value="">Consultando disponibilidad...</option>';

    try {
        const response = await apiFetch({
            action: 'getTurnosRegistrados',
            idCamara: idCamara,
            fecha: fechaFormat
        });

        if (response.status === 'success') {
            const registrados = response.data;
            let disponibles = 0;
            
            selectTurno.innerHTML = '<option value="">Seleccione turno disponible...</option>';
            
            TODOS_LOS_TURNOS.forEach(turno => {
                if (registrados.includes(turno)) {
                    // Turno bloqueado (Ya existe en BD)
                    selectTurno.innerHTML += `<option value="${turno}" disabled class="text-gray-400 bg-gray-100">❌ ${turno} hrs (Ya registrado)</option>`;
                } else {
                    // Turno libre
                    selectTurno.innerHTML += `<option value="${turno}" class="font-bold text-green-700">✅ ${turno} hrs</option>`;
                    disponibles++;
                }
            });

            if (disponibles === 0) {
                selectTurno.innerHTML = '<option value="">⚠️ Todos los turnos completados hoy</option>';
            } else {
                selectTurno.disabled = false;
                selectTurno.classList.remove('bg-gray-50');
            }
        }
    } catch (e) {
        selectTurno.innerHTML = '<option value="">Error de conexión. Reintente.</option>';
    }
}

// === REACTIVIDAD DE EVENTOS ===

// 1. Cuando cambia la cámara elegida, se revisan los límites (tu código actual) Y los turnos
document.getElementById('camara-select').addEventListener('change', (e) => {
    // ... (Mantén tu código de mostrar límites de Temp y Humedad aquí) ...
    
    // Y al final llamas a la verificación de turnos:
    verificarTurnosDisponibles();
});

// 2. REGLA ESTRICTA DE FECHA: Blur y Keydown (Enter), validando longitud
const inputFecha = document.getElementById('val-fecha');

inputFecha.addEventListener('blur', (e) => {
    if (e.target.value.length === 10) {
        verificarTurnosDisponibles();
    }
});

inputFecha.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.value.length === 10) {
        e.preventDefault();
        verificarTurnosDisponibles();
    }
});

// 3. ACTUALIZAR EL PAYLOAD DEL SUBMIT PARA ENVIAR LA FECHA MANUAL
// En tu document.getElementById('form-lectura-camara').addEventListener('submit'...
    const payload = {
        action: 'registrarLecturaCamara',
        idCamara: document.getElementById('camara-select').value,
        fecha: formatearFecha(document.getElementById('val-fecha').value), // NUEVO
        turno: document.getElementById('turno-select').value,
        temperatura: document.getElementById('val-temp').value,
        humedad: document.getElementById('val-humedad').value,
        incidencia: document.getElementById('val-incidencia').value,
        userName: currentUser.nombre 
    };
    
    // Tras el success del fetch de guardado, recargamos la disponibilidad:
    // ...
    if (response.status === 'success') {
       // ... tu feedback de éxito ...
       setTimeout(() => {
           // Reseteamos form, PERO mantenemos la cámara y fecha para seguir rápido
           const camaraActual = document.getElementById('camara-select').value;
           const fechaActual = document.getElementById('val-fecha').value;
           
           document.getElementById('form-lectura-camara').reset();
           
           document.getElementById('camara-select').value = camaraActual;
           document.getElementById('val-fecha').value = fechaActual;
           
           // Ocultar humedad si aplica (reiniciar UI)
           // ...
           
           // Volver a verificar turnos para ocultar el que acabamos de registrar
           verificarTurnosDisponibles();
       }, 1500);
    }
    
    // Desbloquear botón de guardado
    const btnGuardar = document.getElementById('btn-guardar-lectura');
    if (btnGuardar) {
        btnGuardar.disabled = false;
        btnGuardar.classList.remove('bg-gray-400', 'cursor-not-allowed');
        btnGuardar.classList.add('bg-blue-600', 'hover:bg-blue-700');
        btnGuardar.innerHTML = '<i class="ph ph-floppy-disk text-2xl"></i> Registrar Lectura';
    }

    // Iniciar carga de datos desde la Base de Datos
    cargarCamaras();
}

// ==========================================
// 2. COMUNICACIÓN CON LA API (BACKEND GAS)
// ==========================================

async function apiFetch(payload) {
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify(payload) // Enviado como text/plain implícito para evitar CORS
        });
        return await response.json();
    } catch (error) {
        console.error("Error en petición HTTP:", error);
        throw new Error("Fallo la comunicación con el servidor");
    }
}

// ==========================================
// 3. LÓGICA DE NEGOCIO (CÁMARAS Y FORMULARIO)
// ==========================================

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
            
            // Habilitar el select
            select.disabled = false;
            select.classList.remove('cursor-not-allowed', 'bg-gray-50');
            select.classList.add('bg-white');
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

// Reactividad: Mostrar/Ocultar Humedad y Límites según la cámara elegida
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
        return;
    }

    // Mostrar límites de temperatura
    banner.classList.remove('hidden');
    txtTemp.innerHTML = `<i class="ph ph-thermometer-simple text-xl text-blue-600"></i> <strong>Rango Temp:</strong> ${camara.minTemp}°C a ${camara.maxTemp}°C`;

    // Gestionar input de humedad si la cámara lo requiere
    if (camara.minHr !== null && camara.maxHr !== null && camara.maxHr > 0) {
        boxHumedad.classList.remove('hidden');
        inputHumedad.setAttribute('required', 'true');
        
        // Convertir a porcentaje visual si viene en decimal (ej. 0.85 -> 85%)
        let minH = camara.minHr <= 1 ? camara.minHr * 100 : camara.minHr;
        let maxH = camara.maxHr <= 1 ? camara.maxHr * 100 : camara.maxHr;
        
        txtHr.innerHTML = `<i class="ph ph-drop text-xl text-blue-600"></i> <strong>Rango HR:</strong> ${minH}% a ${maxH}%`;
    } else {
        // Ocultar humedad si no aplica
        boxHumedad.classList.add('hidden');
        inputHumedad.removeAttribute('required');
        inputHumedad.value = '';
        txtHr.innerHTML = '';
    }
});

// Enviar los datos al Servidor
document.getElementById('form-lectura-camara').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (!currentUser) {
        alert("Seguridad: No hay sesión activa. Refresque la aplicación.");
        return;
    }

    const btn = document.getElementById('btn-guardar-lectura');
    const originalBtnHTML = btn.innerHTML;
    
    const payload = {
        action: 'registrarLecturaCamara',
        idCamara: document.getElementById('camara-select').value,
        turno: document.getElementById('turno-select').value,
        temperatura: document.getElementById('val-temp').value,
        humedad: document.getElementById('val-humedad').value,
        incidencia: document.getElementById('val-incidencia').value,
        userEmail: currentUser.nombre // Token validado
    };

    // Estado Loading
    btn.disabled = true;
    btn.classList.replace('bg-blue-600', 'bg-gray-500');
    btn.innerHTML = '<i class="ph ph-spinner animate-spin text-2xl"></i> Guardando...';

    try {
        const response = await apiFetch(payload);
        
        if (response.status === 'success') {
            // Feedback visual de éxito
            btn.classList.replace('bg-gray-500', 'bg-green-600');
            btn.innerHTML = '<i class="ph ph-check-circle text-2xl"></i> ¡Guardado Exitosamente!';
            
            // Limpiar formulario y restaurar UI tras 1.5s
            setTimeout(() => {
                document.getElementById('form-lectura-camara').reset();
                document.getElementById('banner-limites').classList.add('hidden');
                document.getElementById('box-humedad').classList.add('hidden');
                
                btn.disabled = false;
                btn.classList.replace('bg-green-600', 'bg-blue-600');
                btn.innerHTML = originalBtnHTML;
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

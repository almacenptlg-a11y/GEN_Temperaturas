// script.js (Módulo Temperaturas - GitHub)

const API_URL = "https://script.google.com/macros/s/AKfycbw9DjZJw8DelWMQQKvUxGhjHs1Ka0sWZPyHBu4lYwMg-2L-avGrzWNEoZOMXT8x9g3c/exec"; 
let currentUser = null;
let camarasDisponibles = [];

// 1. ESCUCHAR LA RESPUESTA DEL PADRE
window.addEventListener("message", (event) => {
  if (event.data && event.data.type === 'SESSION_SYNC') {
    console.log("Iframe: Sesión recibida desde GENAPPS", event.data.user);
    currentUser = event.data.user;
    
    // Desbloquear UI
    document.getElementById('txt-usuario-activo').innerHTML = `<i class="ph ph-user-check"></i> Operador: ${currentUser.nombre} | ${currentUser.area}`;
    
    const btnGuardar = document.getElementById('btn-guardar-lectura');
    btnGuardar.disabled = false;
    btnGuardar.classList.remove('bg-gray-400', 'cursor-not-allowed');
    btnGuardar.classList.add('bg-blue-600', 'hover:bg-blue-700');
    btnGuardar.innerHTML = '<i class="ph ph-floppy-disk text-2xl"></i> Registrar Lectura';

    // Cargar las cámaras
    cargarCamaras();
  }
});

// 2. EL HANDSHAKE: AVISAR AL PADRE QUE ESTAMOS LISTOS
document.addEventListener("DOMContentLoaded", () => {
  console.log("Iframe: DOM Cargado, solicitando sesión al Padre...");
  // Le gritamos al contenedor principal que nos envíe la sesión
  window.parent.postMessage({ type: 'MODULO_LISTO' }, '*');

  // Si después de 3 segundos no hay respuesta, mostramos error
  setTimeout(() => {
    if (!currentUser) {
      document.getElementById('txt-usuario-activo').innerHTML = '<i class="ph ph-warning text-red-500"></i> Error: Sesión no sincronizada';
    }
  }, 3000); 
});

// ... (Mantén tu código de apiFetch, cargarCamaras y submit intacto de aquí hacia abajo) ...

// Función genérica para interactuar con tu Backend
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

// 2. Cargar la configuración de cámaras
async function cargarCamaras() {
  try {
    const payload = { 
      action: 'getCamarasConfig', 
      userEmail: currentUser.usuario, // Usando el ID que viene de tu login
      userRol: currentUser.rol, 
      userArea: currentUser.area 
    };
    
    const response = await apiFetch(payload);
    
    if (response.status === 'success') {
      camarasDisponibles = response.data;
      llenarSelectCamaras(camarasDisponibles);
    } else {
      alert("Error del servidor: " + response.message);
    }
  } catch (error) {
    console.error("Error al cargar cámaras", error);
  }
}

function llenarSelectCamaras(camaras) {
  const select = document.getElementById('camara-select');
  select.innerHTML = '<option value="">Seleccione una cámara...</option>';
  camaras.forEach(c => {
    select.innerHTML += `<option value="${c.id}">${c.nombre}</option>`;
  });
}

// 3. Reactividad al cambiar de cámara (Mostrar/Ocultar Humedad y Límites)
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
    return;
  }

  // Mostrar límites de temperatura
  banner.classList.remove('hidden');
  txtTemp.innerHTML = `<strong>Rango Temp:</strong> ${camara.minTemp}°C a ${camara.maxTemp}°C`;

  // Gestionar input de humedad si aplica
  if (camara.minHr !== null && camara.maxHr !== null && camara.maxHr > 0) {
    boxHumedad.classList.remove('hidden');
    inputHumedad.setAttribute('required', 'true');
    // Convertir a porcentaje visual si viene en decimal (ej. 0.85 -> 85%)
    let minH = camara.minHr < 1 ? camara.minHr * 100 : camara.minHr;
    let maxH = camara.maxHr < 1 ? camara.maxHr * 100 : camara.maxHr;
    txtHr.innerHTML = `<strong>Rango HR:</strong> ${minH}% a ${maxH}%`;
  } else {
    boxHumedad.classList.add('hidden');
    inputHumedad.removeAttribute('required');
    inputHumedad.value = '';
    txtHr.innerHTML = '';
  }
});

// 4. Enviar los datos al Backend
document.getElementById('form-lectura-camara').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  if (!currentUser) {
    alert("No hay sesión activa.");
    return;
  }

  const btn = document.getElementById('btn-guardar-lectura');
  
  const payload = {
    action: 'registrarLecturaCamara',
    idCamara: document.getElementById('camara-select').value,
    turno: document.getElementById('turno-select').value,
    temperatura: document.getElementById('val-temp').value,
    humedad: document.getElementById('val-humedad').value,
    incidencia: document.getElementById('val-incidencia').value,
    userEmail: currentUser.usuario // Seguridad: Validado desde la variable de sesión
  };

  btn.disabled = true;
  btn.innerHTML = '<i class="ph ph-spinner animate-spin text-xl"></i> Guardando...';

  try {
    const response = await apiFetch(payload);
    if (response.status === 'success') {
      alert('Registro guardado exitosamente.');
      document.getElementById('form-lectura-camara').reset();
      document.getElementById('banner-limites').classList.add('hidden');
      document.getElementById('box-humedad').classList.add('hidden');
    } else {
      alert('Error: ' + response.message);
    }
  } catch (error) {
    alert('Error de conexión con el servidor.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="ph ph-floppy-disk text-xl"></i> Registrar Lectura';
  }
});

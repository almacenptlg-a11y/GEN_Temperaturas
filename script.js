// script.js

// URL de tu Backend (GAS) - Reemplaza con la URL de despliegue de tu script
const API_URL = "https://script.google.com/macros/s/AKfycbw9DjZJw8DelWMQQKvUxGhjHs1Ka0sWZPyHBu4lYwMg-2L-avGrzWNEoZOMXT8x9g3c/exec"; 
let currentUser = null;
let camarasDisponibles = [];

// 1. Inicialización al cargar el Iframe
document.addEventListener("DOMContentLoaded", () => {
  inicializarSesion();
});

function inicializarSesion() {
  // Intentar leer la sesión desde localStorage (funciona si están en el mismo dominio base)
  const sessionStr = localStorage.getItem('userSession');
  
  if (sessionStr) {
    currentUser = JSON.parse(sessionStr);
    document.getElementById('txt-usuario-activo').textContent = `Operador: ${currentUser.nombre} | ${currentUser.area}`;
    cargarCamaras();
  } else {
    document.getElementById('txt-usuario-activo').textContent = "⚠️ Sesión no encontrada. Inicie sesión en GENAPPS.";
    document.getElementById('btn-guardar-lectura').disabled = true;
    document.getElementById('btn-guardar-lectura').classList.replace('bg-blue-600', 'bg-gray-400');
  }
}

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

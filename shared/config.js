// Configuración central. Todo se lee de variables de entorno (.env); nada de secretos en el código.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const e = process.env;
const num = (v, def) => (v === undefined || v === '' ? def : Number(v));

module.exports = {
  entorno: e.NODE_ENV || 'development',
  jwtSecreto: e.JWT_SECRET || 'cambia-este-secreto-en-.env',
  jwtExpiraSegundos: num(e.JWT_EXPIRA_SEGUNDOS, 3600),
  tokenServicio: e.SERVICE_TOKEN || 'cambia-este-token-interno',
  bcryptRondas: num(e.BCRYPT_RONDAS, 10),
  puertos: {
    gateway: num(e.PORT_GATEWAY, 8080),
    usuarios: num(e.PORT_USUARIOS, 3001),
    inventario: num(e.PORT_INVENTARIO, 3002),
    reservas: num(e.PORT_RESERVAS, 3003),
    notificaciones: num(e.PORT_NOTIFICACIONES, 3004),
    reportes: num(e.PORT_REPORTES, 3005),
  },
  urls: {
    usuarios: e.URL_USUARIOS || `http://localhost:${num(e.PORT_USUARIOS, 3001)}`,
    inventario: e.URL_INVENTARIO || `http://localhost:${num(e.PORT_INVENTARIO, 3002)}`,
    reservas: e.URL_RESERVAS || `http://localhost:${num(e.PORT_RESERVAS, 3003)}`,
    notificaciones: e.URL_NOTIFICACIONES || `http://localhost:${num(e.PORT_NOTIFICACIONES, 3004)}`,
    reportes: e.URL_REPORTES || `http://localhost:${num(e.PORT_REPORTES, 3005)}`,
  },
  bd: {
    host: e.DB_HOST || 'localhost',
    port: num(e.DB_PORT, 5432),
    user: e.DB_USER || 'prestalab',
    password: e.DB_PASSWORD || 'prestalab',
    nombres: {
      usuarios: e.DB_NAME_USUARIOS || 'usuarios_db',
      inventario: e.DB_NAME_INVENTARIO || 'inventario_db',
      reservas: e.DB_NAME_RESERVAS || 'reservas_db',
      notificaciones: e.DB_NAME_NOTIFICACIONES || 'notificaciones_db',
    },
  },
  // Reglas de negocio (RN)
  reglas: {
    limiteReservas: { alumno: 2, docente: 5, encargado: 5, administrador: 5 },
    cancelarHorasAntes: num(e.CANCELAR_MINUTOS_ANTES, 60),   // RN: cancelar o modificar hasta 1 h antes
    toleranciaMinutos: num(e.TOLERANCIA_MINUTOS, 15),         // RN: tolerancia de entrega y devolución
    sancionDias: num(e.SANCION_DIAS, 3),                      // RN: bloqueo temporal por retraso
    recordatorioMinutos: num(e.RECORDATORIO_MINUTOS, 60),
    horarioHoras: num(e.HORAS_OPERATIVAS_DIA, 12),            // para el % de ocupación (8:00 a 20:00)
  },
  limites: {
    sesionesPorMinuto: num(e.LIMITE_SESIONES_MIN, 20),
    generalPorMinuto: num(e.LIMITE_GENERAL_MIN, 600),
  },
  timeoutLlamadasMs: num(e.TIMEOUT_LLAMADAS_MS, 3000),
  intervaloTareasMs: num(e.INTERVALO_TAREAS_MS, 60000),
  tareasActivas: e.TAREAS !== 'off',
};

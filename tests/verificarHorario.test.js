const { verificarHorario } = require('../src/whatsapp/messageHandler');

// Mock menuService
jest.mock('../src/services/menuService', () => {
  let mockHorario = {};
  return {
    getRestauranteConfig: jest.fn(async () => ({
      nombre: 'Urbano Fast Food',
      horario: mockHorario,
    })),
    __setMockHorario: (h) => {
      mockHorario = h;
    },
  };
});

const { __setMockHorario } = require('../src/services/menuService');

describe('verificarHorario - Modo Dev y Horario Regular', () => {
  test('activa MODO DEV 24/7 cuando todos los días están desactivados (abre === false)', async () => {
    // Configuración donde el chef apagó todos los días de la semana
    __setMockHorario({
      lunes:     { abre: false, apertura: '17:00', cierre: '23:00' },
      martes:    { abre: false, apertura: '17:00', cierre: '23:00' },
      miercoles: { abre: false, apertura: '17:00', cierre: '23:00' },
      jueves:    { abre: false, apertura: '17:00', cierre: '23:00' },
      viernes:   { abre: false, apertura: '17:00', cierre: '23:59' },
      sabado:    { abre: false, apertura: '17:00', cierre: '23:59' },
      domingo:   { abre: false, apertura: '17:00', cierre: '23:00' },
    });

    const resultado = await verificarHorario('urbano');
    expect(resultado.abierto).toBe(true);
    expect(resultado.modoDev).toBe(true);
  });

  test('respeta el horario regular cuando al menos un día está activo', async () => {
    // Configuración donde solo el viernes está activo y hoy es un día cerrado
    __setMockHorario({
      lunes:     { abre: false, apertura: '17:00', cierre: '23:00' },
      martes:    { abre: false, apertura: '17:00', cierre: '23:00' },
      miercoles: { abre: false, apertura: '17:00', cierre: '23:00' },
      jueves:    { abre: false, apertura: '17:00', cierre: '23:00' },
      viernes:   { abre: true,  apertura: '17:00', cierre: '23:59' },
      sabado:    { abre: false, apertura: '17:00', cierre: '23:59' },
      domingo:   { abre: false, apertura: '17:00', cierre: '23:00' },
    });

    const resultado = await verificarHorario('urbano');
    // Como al menos un día (viernes) está activo, NO entra a modo dev.
    // Dependiendo del día actual, puede estar cerrado o fuera de horario si no es viernes a las 17:00-23:59
    expect(resultado.modoDev).toBeUndefined();
  });
});

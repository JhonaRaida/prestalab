process.env.JWT_SECRET = 'prueba-unitaria';
const { validar, z, idRuta, fechaIso } = require('../shared/validar');
const { firmar, verificar } = require('../shared/auth');
const { AppError, Errores, manejadorErrores } = require('../shared/errors');

describe('validación', () => {
  const esq = z.object({ nombre: z.string({ required_error: 'Es obligatorio' }).min(3, 'Mínimo 3') });
  test('acepta datos válidos', () => expect(validar(esq, { nombre: 'Ana' })).toEqual({ nombre: 'Ana' }));
  test('rechaza datos inválidos con detalles por campo', () => {
    try { validar(esq, {}); throw new Error('no lanzó'); } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect(e.status).toBe(400);
      expect(e.codigo).toBe('VALIDACION_FALLIDA');
      expect(e.detalles[0]).toEqual({ campo: 'nombre', problema: 'Es obligatorio' });
    }
  });
  test('idRuta solo acepta enteros positivos', () => {
    expect(idRuta('7')).toBe(7);
    for (const malo of ['abc', '0', '-1', '1.5']) expect(() => idRuta(malo)).toThrow(AppError);
  });
  test('fechaIso exige zona horaria', () => {
    expect(fechaIso.safeParse('2026-11-03T10:00:00-06:00').success).toBe(true);
    expect(fechaIso.safeParse('2026-11-03').success).toBe(false);
  });
});

describe('JWT', () => {
  test('firma y verifica identidad y rol', () => {
    const t = firmar({ id: 5, rol: 'docente' });
    expect(verificar(t)).toEqual({ id: 5, rol: 'docente' });
  });
  test('un token alterado se rechaza', () => {
    const t = firmar({ id: 5, rol: 'alumno' });
    expect(() => verificar(t.slice(0, -2) + 'xx')).toThrow(AppError);
  });
});

describe('formato de error', () => {
  const res = () => { const r = { codigo: 0 }; r.status = (c) => { r.codigo = c; return r; }; r.json = (b) => { r.cuerpo = b; return r; }; return r; };
  const req = { method: 'GET', originalUrl: '/api/v1/x?y=1', headers: { 'x-request-id': 'req-1' } };
  test('error de aplicación', () => {
    const r = res(); manejadorErrores(Errores.noEncontrado('El recurso'), req, r, () => {});
    expect(r.codigo).toBe(404);
    expect(r.cuerpo.error).toMatchObject({ codigo: 'NO_ENCONTRADO', ruta: '/api/v1/x', idPeticion: 'req-1' });
  });
  test('un error inesperado no revela detalles internos', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const r = res(); manejadorErrores(new Error('password=secreta en la BD'), req, r, () => {});
    expect(r.codigo).toBe(500);
    expect(JSON.stringify(r.cuerpo)).not.toMatch(/secreta/);
    expect(r.cuerpo.error.codigo).toBe('ERROR_INTERNO');
    spy.mockRestore();
  });
});

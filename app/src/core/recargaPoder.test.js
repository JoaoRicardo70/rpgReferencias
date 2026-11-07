import { describe, it, expect } from 'vitest';
import { normalizarRecarga, emRecarga, mensagemRecarga, descreverRecarga, iniciarRecarga, passarTurnoDasRecargas, zerarRecargas, recargaRestanteDe } from './recargaPoder';
import { descansarCompleto } from './vitals';

describe('recargaPoder', () => {
    it('normaliza para inteiro 0..99', () => {
        expect(normalizarRecarga('3')).toBe(3);
        expect(normalizarRecarga(2.9)).toBe(2);
        expect(normalizarRecarga(500)).toBe(99);
        [0, -1, '', 'abc', undefined, null].forEach(v => expect(normalizarRecarga(v)).toBe(0));
    });
    it('iniciarRecarga define o restante; sem recarga nao escreve nada', () => {
        const a = { nome: 'A', recargaTurnos: 2 };
        iniciarRecarga(a);
        expect(a.recargaRestante).toBe(2);
        const b = { nome: 'B' };
        iniciarRecarga(b);
        expect('recargaRestante' in b).toBe(false);
    });
    it('passarTurno decrementa ate 0 e apaga o campo', () => {
        const f = { poderes: [{ id: 1, recargaTurnos: 2, recargaRestante: 2 }, { id: 2 }] };
        expect(passarTurnoDasRecargas(f)).toBe(1);
        expect(f.poderes[0].recargaRestante).toBe(1);
        passarTurnoDasRecargas(f);
        expect('recargaRestante' in f.poderes[0]).toBe(false);
        expect(passarTurnoDasRecargas(f)).toBe(0);
        expect(passarTurnoDasRecargas({})).toBe(0);
    });
    it('bloqueio e mensagem', () => {
        const p = { nome: 'Escudo', recargaRestante: 1 };
        expect(emRecarga(p)).toBe(true);
        expect(mensagemRecarga(p)).toBe('Escudo em recarga: faltam 1 turno');
        expect(mensagemRecarga({ nome: 'Escudo', recargaRestante: 3 })).toBe('Escudo em recarga: faltam 3 turnos');
        expect(emRecarga({ nome: 'x' })).toBe(false);
        expect(recargaRestanteDe(null)).toBe(0);
    });
    it('selo do cartao', () => {
        expect(descreverRecarga({ recargaTurnos: 2, recargaRestante: 1 })).toBe('⏳ recarga 1');
        expect(descreverRecarga({ recargaTurnos: 2 })).toBe('⏳ recarga de 2 turnos');
        expect(descreverRecarga({})).toBe('');
    });
    it('descanso zera as recargas', () => {
        const f = { poderes: [{ id: 1, recargaTurnos: 2, recargaRestante: 2 }] };
        descansarCompleto(f);
        expect('recargaRestante' in f.poderes[0]).toBe(false);
        expect(f.poderes[0].recargaTurnos).toBe(2);
        const g = { poderes: [{ recargaRestante: 1 }] };
        zerarRecargas(g);
        expect(g.poderes[0].recargaRestante).toBeUndefined();
    });
});

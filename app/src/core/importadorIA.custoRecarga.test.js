import { describe, it, expect } from 'vitest';
import { montarPromptImportacao, montarPoderFinal } from './importadorIA';
import { normalizarPoder } from './sextaFeiraCriacao';

describe('importador: custo por turno, recarga e ao desligar', () => {
    it('o prompt descreve os tres campos', () => {
        const p = montarPromptImportacao('poder');
        expect(p).toContain('"custoPorTurno"');
        expect(p).toContain('"recargaTurnos"');
        expect(p).toContain('"aoDesligar"');
    });
    it('normalizarPoder grava os campos validos', () => {
        const { objeto, avisos } = normalizarPoder({ nome: 'Portao', categoria: 'poder', custoPorTurno: { modo: 'percMax', valor: 5, energia: 'chakra' }, recargaTurnos: 2, aoDesligar: { dadosQtd: 238, dadosFaces: 6 } });
        expect(objeto.custoPorTurno).toEqual({ modo: 'percMax', valor: 5, energia: 'chakra' });
        expect(objeto.recargaTurnos).toBe(2);
        expect(objeto.aoDesligar).toEqual({ dadosQtd: 238, dadosFaces: 6 });
        expect(avisos).toEqual([]);
    });
    it('invalidos sao ignorados com aviso; ausentes nao criam campos (retrocompativel)', () => {
        const ruim = normalizarPoder({ nome: 'X', custoPorTurno: { modo: 'fixo', valor: -3, energia: 'mana' }, aoDesligar: { dadosQtd: 0, dadosFaces: 6 } });
        expect('custoPorTurno' in ruim.objeto).toBe(false);
        expect('aoDesligar' in ruim.objeto).toBe(false);
        expect(ruim.avisos.length).toBe(2);
        const limpo = normalizarPoder({ nome: 'Y' });
        ['custoPorTurno', 'recargaTurnos', 'aoDesligar', 'recargaRestante'].forEach(k => expect(k in limpo.objeto).toBe(false));
        expect(limpo.avisos).toEqual([]);
    });
    it('recarga limita a 99 com aviso e sobrevive ao poder final sem undefined', () => {
        const r = normalizarPoder({ nome: 'Z', recargaTurnos: 500 });
        expect(r.objeto.recargaTurnos).toBe(99);
        expect(r.avisos.length).toBe(1);
        const final = montarPoderFinal(r.objeto, 7);
        expect(final.recargaTurnos).toBe(99);
        expect(JSON.stringify(final)).not.toContain('undefined');
    });
});

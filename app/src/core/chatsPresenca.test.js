import { describe, it, expect } from 'vitest';
import { transferirPresencaNaTaverna, marcarMestreNaTaverna } from './chats';

describe('transferirPresencaNaTaverna', () => {
    it('move a vaga do antigo para o novo', () => {
        const r = transferirPresencaNaTaverna({ tavernaAtivos: ['A', 'B'] }, 'A', 'C');
        expect(r.tavernaAtivos).toEqual(['B', 'C']);
    });
    it('novo já na call: só remove o antigo, sem duplicar', () => {
        const r = transferirPresencaNaTaverna({ tavernaAtivos: ['A', 'C'] }, 'A', 'C');
        expect(r.tavernaAtivos).toEqual(['C']);
    });
    it('antigo fora da call: nada muda', () => {
        const c = { tavernaAtivos: ['B'], x: 1 };
        expect(transferirPresencaNaTaverna(c, 'A', 'C')).toEqual(c);
    });
    it('apaga a marca do antigo em tavernaMestres', () => {
        const r = transferirPresencaNaTaverna({ tavernaAtivos: ['A'], tavernaMestres: { A: true, Z: true } }, 'A', 'C');
        expect(r.tavernaMestres).toEqual({ Z: true });
    });
    it('não muta a entrada', () => {
        const c = { tavernaAtivos: ['A'], tavernaMestres: { A: true } };
        const copia = JSON.parse(JSON.stringify(c));
        transferirPresencaNaTaverna(c, 'A', 'C');
        expect(c).toEqual(copia);
    });
    it('nomes iguais/vazios e cenário nulo não quebram', () => {
        expect(transferirPresencaNaTaverna({ tavernaAtivos: ['A'] }, 'A', 'A').tavernaAtivos).toEqual(['A']);
        expect(transferirPresencaNaTaverna({ tavernaAtivos: ['A'] }, '', 'B').tavernaAtivos).toEqual(['A']);
        expect(transferirPresencaNaTaverna({ tavernaAtivos: ['A'] }, 'A', '').tavernaAtivos).toEqual(['A']);
        expect(transferirPresencaNaTaverna(null, 'A', 'B')).toEqual({});
    });
});

describe('marcarMestreNaTaverna', () => {
    it('marca', () => {
        expect(marcarMestreNaTaverna({ tavernaAtivos: ['A'] }, 'A', true).tavernaMestres).toEqual({ A: true });
    });
    it('desmarca', () => {
        expect(marcarMestreNaTaverna({ tavernaMestres: { A: true, B: true } }, 'A', false).tavernaMestres).toEqual({ B: true });
    });
    it('devolve o mesmo objeto se nada muda', () => {
        const c = { tavernaMestres: { A: true } };
        expect(marcarMestreNaTaverna(c, 'A', true)).toBe(c);
        const d = {};
        expect(marcarMestreNaTaverna(d, 'A', false)).toBe(d);
        expect(marcarMestreNaTaverna(undefined, 'A', false)).toBeUndefined();
    });
    it('nome vazio devolve o mesmo cenário', () => {
        const c = {};
        expect(marcarMestreNaTaverna(c, '', true)).toBe(c);
        expect(marcarMestreNaTaverna(c, null, true)).toBe(c);
    });
    it('não muta a entrada e aceita cenário nulo ao marcar', () => {
        const c = { tavernaMestres: { B: true } };
        const r = marcarMestreNaTaverna(c, 'A', true);
        expect(r).not.toBe(c);
        expect(c.tavernaMestres).toEqual({ B: true });
        expect(marcarMestreNaTaverna(null, 'A', true)).toEqual({ tavernaMestres: { A: true } });
    });
});

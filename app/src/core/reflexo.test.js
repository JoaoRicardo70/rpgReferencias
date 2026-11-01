import { describe, it, expect } from 'vitest';
import { normalizarReflexo, reflexosDisponiveis, calcularReflexo, descreverReflexo } from './reflexo';

describe('reflexo - normalizarReflexo', () => {
    it('invalidos devolvem null', () => {
        expect(normalizarReflexo(null)).toBeNull();
        expect(normalizarReflexo(undefined)).toBeNull();
        expect(normalizarReflexo('devolver')).toBeNull();
        expect(normalizarReflexo({})).toBeNull();
        expect(normalizarReflexo({ modo: 'xyz' })).toBeNull();
    });
    it('padroes: mult 100 (150 em contra), mana, sem custo', () => {
        expect(normalizarReflexo({ modo: 'devolver' })).toEqual({ modo: 'devolver', mult: 100, automatico: false, gastaReacao: false, custoPercentual: 0, energia: 'mana', descricao: '' });
        expect(normalizarReflexo({ modo: 'contra' }).mult).toBe(150);
    });
    it('mult limitado entre 10 e 1000; 0 e texto caem no padrao', () => {
        expect(normalizarReflexo({ modo: 'devolver', mult: 5 }).mult).toBe(10);
        expect(normalizarReflexo({ modo: 'devolver', mult: 99999 }).mult).toBe(1000);
        expect(normalizarReflexo({ modo: 'devolver', mult: 0 }).mult).toBe(100);
        expect(normalizarReflexo({ modo: 'devolver', mult: 'abc' }).mult).toBe(100);
    });
    it('custo 0..100 e energia valida', () => {
        expect(normalizarReflexo({ modo: 'devolver', custoPercentual: 500 }).custoPercentual).toBe(100);
        expect(normalizarReflexo({ modo: 'devolver', custoPercentual: -5 }).custoPercentual).toBe(0);
        expect(normalizarReflexo({ modo: 'devolver', energia: 'aura' }).energia).toBe('aura');
        expect(normalizarReflexo({ modo: 'devolver', energia: 'vida' }).energia).toBe('mana');
    });
    it('booleanos e descricao cortada em 200', () => {
        const r = normalizarReflexo({ modo: 'devolver', automatico: 1, gastaReacao: 'sim', descricao: 'a'.repeat(300) });
        expect(r.automatico).toBe(true);
        expect(r.gastaReacao).toBe(true);
        expect(r.descricao).toHaveLength(200);
    });
});

describe('reflexo - reflexosDisponiveis', () => {
    const refl = { modo: 'devolver' };
    it('ficha vazia/nula', () => {
        expect(reflexosDisponiveis(null)).toEqual([]);
        expect(reflexosDisponiveis({})).toEqual([]);
    });
    it('so Poder ativo e Tecnica equipada', () => {
        const ficha = {
            poderes: [{ id: 'p1', nome: 'A', ativa: true, reflexo: refl }, { id: 'p2', nome: 'B', ativa: false, reflexo: refl }, null],
            ataquesElementais: [{ id: 't1', nome: 'C', equipado: true, reflexo: refl }, { id: 't2', nome: 'D', equipado: false, reflexo: refl }]
        };
        expect(reflexosDisponiveis(ficha).map(x => [x.origem, x.id])).toEqual([['poder', 'p1'], ['tecnica', 't1']]);
    });
    it('ignora reflexo invalido ou ausente e usa nome padrao', () => {
        const r = reflexosDisponiveis({ poderes: [{ id: 'p', ativa: true, reflexo: { modo: 'x' } }, { id: 'q', ativa: true }, { id: 'r', ativa: true, reflexo: refl }] });
        expect(r).toHaveLength(1);
        expect(r[0].nome).toBe('Poder');
    });
});

describe('reflexo - calcularReflexo', () => {
    const dano = { danoChega: 1000, danoOriginal: 2000 };
    it('devolver: defensor 0, atacante recebe o que chegaria x mult', () => {
        expect(calcularReflexo({ modo: 'devolver' }, dano)).toEqual({ danoNoDefensor: 0, danoNoAtacante: 1000 });
        expect(calcularReflexo({ modo: 'devolver', mult: 50 }, dano)).toEqual({ danoNoDefensor: 0, danoNoAtacante: 500 });
    });
    it('compartilhar: defensor sofre e atacante tambem', () => {
        expect(calcularReflexo({ modo: 'compartilhar', mult: 200 }, dano)).toEqual({ danoNoDefensor: 1000, danoNoAtacante: 2000 });
    });
    it('contra: usa o dano original x 150% por padrao', () => {
        expect(calcularReflexo({ modo: 'contra' }, dano)).toEqual({ danoNoDefensor: 0, danoNoAtacante: 3000 });
    });
    it('arredonda para baixo', () => {
        expect(calcularReflexo({ modo: 'devolver', mult: 33 }, { danoChega: 10, danoOriginal: 10 }).danoNoAtacante).toBe(3);
    });
    it('reflexo invalido devolve dano como esta', () => {
        expect(calcularReflexo(null, dano)).toEqual({ danoNoDefensor: 1000, danoNoAtacante: 0 });
    });
    it('danos negativos, NaN e decimais sao saneados', () => {
        expect(calcularReflexo({ modo: 'devolver' }, { danoChega: -5, danoOriginal: NaN })).toEqual({ danoNoDefensor: 0, danoNoAtacante: 0 });
        expect(calcularReflexo({ modo: 'devolver' }, { danoChega: 10.9, danoOriginal: 0 }).danoNoAtacante).toBe(10);
    });
    it('dano zero', () => {
        expect(calcularReflexo({ modo: 'contra' }, { danoChega: 0, danoOriginal: 0 })).toEqual({ danoNoDefensor: 0, danoNoAtacante: 0 });
    });
});

describe('reflexo - descreverReflexo', () => {
    it('texto com nomes e valores', () => {
        const t = descreverReflexo({ nome: 'Espelho', reflexo: { modo: 'devolver', mult: 100 } }, { danoNoDefensor: 0, danoNoAtacante: 5 }, 'Vegeta');
        expect(t).toContain('Espelho');
        expect(t).toContain('Vegeta recebeu 5');
        expect(t).toContain('não sofreu nada');
    });
    it('defensor que sofre', () => {
        const t = descreverReflexo({ nome: 'E', reflexo: { modo: 'compartilhar', mult: 100 } }, { danoNoDefensor: 7, danoNoAtacante: 7 });
        expect(t).toContain('o atacante recebeu 7');
        expect(t).toContain('sofreu 7');
    });
});

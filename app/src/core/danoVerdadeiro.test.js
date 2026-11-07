import { describe, it, expect } from 'vitest';
import { ehDanoVerdadeiro, getPassosReducaoDano } from './reducaoDano';
import { reduzirDanoNoAlvo } from './alvoCombate';
import { calcularDanoRapido } from './danoRapido';

const fichaBlindada = () => ({
    reducoesDano: [{ id: 'r1', nome: 'Pele', percentual: 50, elemento: 'todos' }],
    afinidades: { resistencias: ['fogo'], imunidades: ['gelo'], vulnerabilidades: [] },
    poderes: [{ id: 'p1', nome: 'Barreira', ativa: true, efeitos: [{ atributo: 'reducao_dano', propriedade: 'base', valor: 20, nome: 'Barreira' }] }],
    dominios: { Fogo: { nivel: 10 } },
});
const alvoPersonagem = (ficha) => ({ isPersonagem: true, ficha });

describe('ehDanoVerdadeiro', () => {
    it('aceita só o boolean true', () => {
        expect(ehDanoVerdadeiro(true)).toBe(true);
    });
    it('rejeita o resto, inclusive a string', () => {
        [false, undefined, null, '', 'fogo', 1, 'verdadeiro', 'true'].forEach(v => expect(ehDanoVerdadeiro(v)).toBe(false));
    });
});

describe('getPassosReducaoDano com Dano Verdadeiro', () => {
    it('true não devolve nenhum passo; a string "verdadeiro" é elemento comum', () => {
        expect(getPassosReducaoDano(fichaBlindada(), 'verdadeiro').length).toBeGreaterThan(0);
        expect(getPassosReducaoDano(fichaBlindada(), true)).toEqual([]);
    });
    it('dano normal segue com os passos', () => {
        expect(getPassosReducaoDano(fichaBlindada(), 'fogo').length).toBeGreaterThan(0);
    });
});

describe('reduzirDanoNoAlvo com verdadeiro', () => {
    it('ignora Imunidade 100%', () => {
        const f = { afinidades: { imunidades: ['gelo'] } };
        expect(reduzirDanoNoAlvo(alvoPersonagem(f), 100, 'gelo').final).toBe(0);
        const r = reduzirDanoNoAlvo(alvoPersonagem(f), 100, 'gelo', { verdadeiro: true });
        expect(r.final).toBe(100);
        expect(r.texto).toMatch(/Dano Verdadeiro/);
        expect(r.detalhe).toEqual([]);
    });
    it('ignora Resistência, reducao_dano e Domínio', () => {
        const f = fichaBlindada();
        expect(reduzirDanoNoAlvo(alvoPersonagem(f), 1000, 'fogo').final).toBeLessThan(1000);
        expect(reduzirDanoNoAlvo(alvoPersonagem(f), 1000, 'fogo', { verdadeiro: true }).final).toBe(1000);
        expect(reduzirDanoNoAlvo(alvoPersonagem(f), 1000, 'fogo', { verdadeiro: true, nivelDefensorOverride: 10 }).final).toBe(1000);
    });
    it('a string "verdadeiro" não ativa o dano verdadeiro', () => {
        expect(reduzirDanoNoAlvo(alvoPersonagem(fichaBlindada()), 500, 'verdadeiro').texto).not.toMatch(/Dano Verdadeiro/);
    });
    it('dano normal continua igual (flag ausente ou false)', () => {
        const f = fichaBlindada();
        const a = reduzirDanoNoAlvo(alvoPersonagem(f), 1000, 'fogo');
        expect(reduzirDanoNoAlvo(alvoPersonagem(f), 1000, 'fogo', { verdadeiro: false })).toEqual(a);
        expect(reduzirDanoNoAlvo(alvoPersonagem(f), 1000, 'fogo', {})).toEqual(a);
    });
    it('dummie sem ficha e alvo nulo devolvem o dano inteiro', () => {
        expect(reduzirDanoNoAlvo({ isPersonagem: false }, 80, 'fogo').final).toBe(80);
        expect(reduzirDanoNoAlvo(null, 80, 'fogo', { verdadeiro: true }).final).toBe(80);
        expect(reduzirDanoNoAlvo(alvoPersonagem(null), 80, 'fogo', { verdadeiro: true }).final).toBe(80);
    });
});

describe('calcularDanoRapido com verdadeiro', () => {
    const alvo = { nome: 'Alvo', isDummie: false, ficha: fichaBlindada() };
    const base = { alvo, fichaDoAlvo: fichaBlindada(), dano: 1000, elemento: 'Fogo', nivelDominioOverride: 10, divisorMesa: 1, pontosVida: 100 };
    it('verdadeiro ignora tudo; sem flag reduz', () => {
        const normal = calcularDanoRapido(base);
        const v = calcularDanoRapido({ ...base, verdadeiro: true });
        expect(normal.valor).toBeLessThan(v.valor);
        expect(v.valor).toBe(v.valorBruto);
        expect(v.verdadeiro).toBe(true);
        expect(v.textoReducao).toMatch(/Dano Verdadeiro/);
        expect(normal.verdadeiro).toBe(false);
    });
});

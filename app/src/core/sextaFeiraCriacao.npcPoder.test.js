import { describe, it, expect } from 'vitest';
import { normalizarNpc, resumirProposta, DECLARACOES_CRIACAO } from './sextaFeiraCriacao';

describe('normalizarNpc - Poder Calculado (campo poder)', () => {
    it('poder valido vira poderCalculado no objeto', () => {
        const r = normalizarNpc({ nome: 'Dragao', vida: 100, poder: 5000 });
        expect(r.valido).toBe(true);
        expect(r.objeto.poderCalculado).toBe(5000);
    });
    it('sem poder: o campo poderCalculado nem existe no objeto', () => {
        const r = normalizarNpc({ nome: 'Goblin', vida: 100 });
        expect('poderCalculado' in r.objeto).toBe(false);
    });
    it.each([[null], [undefined], [''], ['abc'], [NaN], [Infinity], [{}]])('poder %s e ignorado (sem disputa)', (v) => {
        const r = normalizarNpc({ nome: 'X', vida: 10, poder: v });
        expect('poderCalculado' in r.objeto).toBe(false);
    });
    it('poder 0 e valido e mantido', () => {
        expect(normalizarNpc({ nome: 'X', vida: 10, poder: 0 }).objeto.poderCalculado).toBe(0);
    });
    it('poder negativo e limitado a 0', () => {
        expect(normalizarNpc({ nome: 'X', vida: 10, poder: -50 }).objeto.poderCalculado).toBe(0);
    });
    it('poder em texto numerico e convertido', () => {
        expect(normalizarNpc({ nome: 'X', vida: 10, poder: '1234.5' }).objeto.poderCalculado).toBe(1234.5);
    });
    it('poder gigante e limitado a 1e300', () => {
        expect(normalizarNpc({ nome: 'X', vida: 10, poder: 1e308 }).objeto.poderCalculado).toBe(1e300);
    });
    it('poder fracionario e preservado', () => {
        expect(normalizarNpc({ nome: 'X', vida: 10, poder: 0.25 }).objeto.poderCalculado).toBe(0.25);
    });
    it('o poder nao interfere nos demais campos nem na quantidade', () => {
        const r = normalizarNpc({ nome: 'Goblin', vida: 250, poder: 10, quantidade: 3, tipoDefesa: 'resistencia', valorDefesa: 30, visibilidadeHp: 'mestre' });
        expect(r.quantidade).toBe(3);
        expect(r.objeto).toEqual({
            nome: 'Goblin', hpMax: 250000, hpAtual: 250000, tipoDefesa: 'resistencia', valorDefesa: 30, visibilidadeHp: 'mestre', poderCalculado: 10,
        });
    });
    it('objeto de entrada nulo nao quebra e nao tem poder', () => {
        const r = normalizarNpc(null);
        expect(r.valido).toBe(true);
        expect('poderCalculado' in r.objeto).toBe(false);
    });
});

describe('resumirProposta(npc) com Poder', () => {
    it('inclui "Poder" arredondado quando definido', () => {
        const { objeto } = normalizarNpc({ nome: 'X', vida: 10, poder: 1234.6 });
        expect(resumirProposta('npc', objeto)).toContain(`Poder ${(1235).toLocaleString('pt-BR')}`);
    });
    it('poder 0 ainda aparece no resumo', () => {
        const { objeto } = normalizarNpc({ nome: 'X', vida: 10, poder: 0 });
        expect(resumirProposta('npc', objeto)).toContain('Poder 0');
    });
    it('sem poder, o resumo nao menciona Poder', () => {
        const { objeto } = normalizarNpc({ nome: 'X', vida: 10 });
        expect(resumirProposta('npc', objeto)).not.toContain('Poder');
    });
});

describe('DECLARACOES_CRIACAO - ferramenta de NPC', () => {
    it('declara o parametro numerico opcional "poder"', () => {
        const dec = DECLARACOES_CRIACAO.find(d => d.parameters && d.parameters.properties && d.parameters.properties.poder);
        expect(dec).toBeDefined();
        expect(dec.parameters.properties.poder.type).toBe('NUMBER');
        expect(dec.parameters.required).not.toContain('poder');
    });
});

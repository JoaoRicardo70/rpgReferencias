import { describe, it, expect } from 'vitest';
import { montarPromptImportacao, prepararItemImportado } from './importadorIA';
import { normalizarPoder, DECLARACOES_CRIACAO } from './sextaFeiraCriacao';
import { normalizarAoAcertar } from './aoAcertar';

// QA (endurecimento) - importador / schema da Sexta-Feira: valores invalidos de escudoAoLigar e reduzirCuraAlvo.
describe('importador QA - escudoAoLigar com valores invalidos', () => {
    it.each([
        ['valor 0', { nome: 'X', valor: 0 }],
        ['valor negativo', { nome: 'X', valor: -10 }],
        ['valor NaN', { nome: 'X', valor: NaN }],
        ['valor texto', { nome: 'X', valor: 'muito' }],
        ['valor null', { nome: 'X', valor: null }],
        ['nome ausente', { valor: 10 }],
        ['nome so espacos', { nome: '   ', valor: 10 }],
    ])('%s: ignora o escudo e avisa (uma vez)', (_d, esc) => {
        const { objeto, avisos } = normalizarPoder({ nome: 'Domo', escudoAoLigar: esc });
        expect('escudoAoLigar' in objeto).toBe(false);
        expect(avisos.filter(a => /Escudo ao ligar/.test(a))).toHaveLength(1);
    });
    it.each([[''], [0], [null], [undefined], [false]])('campo %j (vazio/falsy) nao grava e nao avisa', (v) => {
        const { objeto, avisos } = normalizarPoder({ nome: 'Domo', escudoAoLigar: v });
        expect('escudoAoLigar' in objeto).toBe(false);
        expect(avisos.filter(a => /Escudo ao ligar/.test(a))).toHaveLength(0);
    });
    it('formatos nao-objeto (texto, numero, array) sao ignorados com aviso, sem quebrar', () => {
        ['1600', 1600, [1600], [{ nome: 'X', valor: 5 }]].forEach((v) => {
            const { objeto } = normalizarPoder({ nome: 'Domo', escudoAoLigar: v });
            expect('escudoAoLigar' in objeto).toBe(false);
        });
    });
    it('valor enorme e limitado; texto numerico com virgula vira inteiro; tipo vidaTemporaria preservado', () => {
        expect(normalizarPoder({ nome: 'D', escudoAoLigar: { nome: 'X', valor: 1e40 } }).objeto.escudoAoLigar.valor).toBe(1e15);
        expect(normalizarPoder({ nome: 'D', escudoAoLigar: { nome: 'X', valor: '12,7', tipo: 'vidaTemporaria' } }).objeto.escudoAoLigar).toEqual({ nome: 'X', valor: 12, tipo: 'vidaTemporaria' });
    });
    it('nome gigante e cortado em 40; unicode preservado', () => {
        const r = normalizarPoder({ nome: 'D', escudoAoLigar: { nome: '盾'.repeat(100), valor: 5 } }).objeto.escudoAoLigar;
        expect(r.nome).toHaveLength(40);
    });
    it('o schema da Sexta-Feira declara escudoAoLigar com nome e valor obrigatorios e os dois tipos', () => {
        const txt = JSON.stringify(DECLARACOES_CRIACAO);
        expect(txt).toContain('escudoAoLigar');
        expect(txt).toContain('vidaTemporaria');
    });
    it('prepararItemImportado preserva o escudo normalizado no objeto do Poder', () => {
        const item = prepararItemImportado({ nome: 'Domo', categoria: 'habilidade', escudoAoLigar: { nome: 'Domo Gelido', valor: '1600', tipo: 'escudo' } }, 'poder');
        expect(JSON.stringify(item)).toContain('"valor":1600');
    });
});

describe('importador QA - reduzirCuraAlvo com valores invalidos', () => {
    const poderCom = (ao) => normalizarPoder({ nome: 'EA', aoAcertar: ao }).objeto;
    it.each([
        ['fator 0', { tipo: 'reduzirCuraAlvo', fator: 0, duracao: 1 }],
        ['fator 1.5', { tipo: 'reduzirCuraAlvo', fator: 1.5, duracao: 1 }],
        ['fator negativo', { tipo: 'reduzirCuraAlvo', fator: -0.5, duracao: 1 }],
        ['fator NaN', { tipo: 'reduzirCuraAlvo', fator: NaN, duracao: 1 }],
        ['fator texto', { tipo: 'reduzirCuraAlvo', fator: 'metade', duracao: 1 }],
        ['fator ausente', { tipo: 'reduzirCuraAlvo', duracao: 1 }],
        ['fator 1/0', { tipo: 'reduzirCuraAlvo', fator: '1/0', duracao: 1 }],
        ['fator 150%', { tipo: 'reduzirCuraAlvo', fator: '150%', duracao: 1 }],
    ])('%s: o efeito e descartado (e o campo aoAcertar nem e criado)', (_d, item) => {
        expect('aoAcertar' in poderCom([item])).toBe(false);
    });
    it('fator valido + duracao invalida: duracao vira 1 (padrao) e o efeito entra', () => {
        ['abc', null, undefined, -2, 0, NaN].forEach((dur) => {
            expect(poderCom([{ tipo: 'reduzirCuraAlvo', fator: 0.5, duracao: dur }]).aoAcertar[0].duracao).toBe(1);
        });
    });
    it('fator em formatos humanos: "1/2", "50%", "0,5" e 1/3 aproximado', () => {
        ['1/2', '50%', '0,5', 0.5].forEach(f => expect(poderCom([{ tipo: 'reduzirCuraAlvo', fator: f, duracao: 2 }]).aoAcertar[0].fator).toBe(0.5));
        expect(poderCom([{ tipo: 'reduzirCuraAlvo', fator: '1/3', duracao: 2 }]).aoAcertar[0].fator).toBeCloseTo(1 / 3, 10);
    });
    it('mais de 6 efeitos: corta em 6; invalido no meio nao ocupa vaga', () => {
        const itens = [
            { tipo: 'reduzirCuraAlvo', fator: 9, duracao: 1 },
            ...Array.from({ length: 8 }, (_, i) => ({ tipo: 'reduzirCuraAlvo', fator: 0.5, duracao: i + 1 })),
        ];
        const r = normalizarAoAcertar(itens);
        expect(r).toHaveLength(6);
        expect(r[0].duracao).toBe(1);
    });
    it('o prompt de Tecnicas tambem descreve o efeito; o schema da Sexta-Feira lista o tipo e o campo fator', () => {
        const txt = JSON.stringify(DECLARACOES_CRIACAO);
        expect(txt).toContain('reduzirCuraAlvo');
        expect(txt).toContain('"fator"');
        expect(montarPromptImportacao('tecnica')).toContain('reduzirCuraAlvo');
    });
    it('aoAcertar que nao e array (objeto/texto) e ignorado sem quebrar', () => {
        ['x', 5, { tipo: 'reduzirCuraAlvo', fator: 0.5 }].forEach((v) => {
            expect(() => poderCom(v)).not.toThrow();
        });
    });
});

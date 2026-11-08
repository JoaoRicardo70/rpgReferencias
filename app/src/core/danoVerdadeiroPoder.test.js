import { describe, it, expect } from 'vitest';
import { resolverDanoVerdadeiroDoGolpe, textoDanoVerdadeiroDoPoder } from './reducaoDano';
import { montarPromptImportacao } from './importadorIA';
import { normalizarPoder } from './sextaFeiraCriacao';

describe('Poder com danoVerdadeiro (core)', () => {
    it('poder marcado torna o golpe verdadeiro e informa o nome', () => {
        expect(resolverDanoVerdadeiroDoGolpe([{ nome: 'A' }, { nome: 'Lamina', danoVerdadeiro: true }], false)).toEqual({ verdadeiro: true, nomePoder: 'Lamina' });
    });
    it('sem marca e sem interruptor: nao e verdadeiro', () => {
        expect(resolverDanoVerdadeiroDoGolpe([{ nome: 'A' }, null], false)).toEqual({ verdadeiro: false, nomePoder: null });
        expect(resolverDanoVerdadeiroDoGolpe(undefined, undefined).verdadeiro).toBe(false);
    });
    it('interruptor manual sozinho continua valendo; so o boolean true conta', () => {
        expect(resolverDanoVerdadeiroDoGolpe([], true)).toEqual({ verdadeiro: true, nomePoder: null });
        expect(resolverDanoVerdadeiroDoGolpe([{ nome: 'X', danoVerdadeiro: 'true' }], 'sim').verdadeiro).toBe(false);
    });
    it('texto do feed cita o poder', () => {
        expect(textoDanoVerdadeiroDoPoder('Lamina')).toContain('Dano Verdadeiro (do poder Lamina)');
    });
});

describe('importador: danoVerdadeiro', () => {
    it('o prompt descreve o campo', () => {
        expect(montarPromptImportacao('poder')).toContain('"danoVerdadeiro"');
    });
    it('normalizarPoder grava true e nao cria a chave nos demais casos', () => {
        expect(normalizarPoder({ nome: 'P', danoVerdadeiro: true }).objeto.danoVerdadeiro).toBe(true);
        expect(normalizarPoder({ nome: 'P', danoVerdadeiro: 'true' }).objeto.danoVerdadeiro).toBe(true);
        expect('danoVerdadeiro' in normalizarPoder({ nome: 'P', danoVerdadeiro: false }).objeto).toBe(false);
        expect('danoVerdadeiro' in normalizarPoder({ nome: 'P' }).objeto).toBe(false);
    });
});

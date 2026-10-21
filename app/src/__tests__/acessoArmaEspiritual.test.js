import { describe, it, expect } from 'vitest';
import {
    armaEspiritualTemConteudo, temAcessoArmaEspiritual, podeVerArmaEspiritual, filtrarCapitulos, resolverAbaVisivel,
} from '../core/acessoArmaEspiritual.js';

describe('armaEspiritualTemConteudo', () => {
    it.each([undefined, null, 'x', 5, []])('retorna false para %s', (v) => {
        expect(armaEspiritualTemConteudo(v)).toBe(false);
    });
    it('false para arma vazia / só espaços / listas vazias', () => {
        expect(armaEspiritualTemConteudo({})).toBe(false);
        expect(armaEspiritualTemConteudo({ nome: '   ', passivas: [] })).toBe(false);
    });
    it.each(['nome', 'epiteto', 'cantico', 'danoBase', 'avatarHumano', 'avatarArma'])('true com texto em %s', (c) => {
        expect(armaEspiritualTemConteudo({ [c]: 'algo' })).toBe(true);
    });
    it.each(['passivas', 'runas', 'formas', 'formasVerdadeiras', 'passivasVerdadeira', 'runasVerdadeira', 'passivasFantasma', 'runasFantasma'])('true com item em %s', (c) => {
        expect(armaEspiritualTemConteudo({ [c]: [{ id: 1 }] })).toBe(true);
    });
    it('ignora tipos errados (número no lugar de texto, string no lugar de lista)', () => {
        expect(armaEspiritualTemConteudo({ nome: 5, passivas: 'abc' })).toBe(false);
    });
});

describe('temAcessoArmaEspiritual', () => {
    it('flag explícita true/false vence o conteúdo', () => {
        expect(temAcessoArmaEspiritual({ armaEspiritual: { acessoArma: true } })).toBe(true);
        expect(temAcessoArmaEspiritual({ armaEspiritual: { acessoArma: false, nome: 'Excalibur' } })).toBe(false);
    });
    it('sem flag deriva do conteúdo', () => {
        expect(temAcessoArmaEspiritual({ armaEspiritual: { nome: 'Excalibur' } })).toBe(true);
        expect(temAcessoArmaEspiritual({ armaEspiritual: { nome: '' } })).toBe(false);
    });
    it('flag não booleana (string "true") é ignorada e deriva do conteúdo', () => {
        expect(temAcessoArmaEspiritual({ armaEspiritual: { acessoArma: 'true' } })).toBe(false);
    });
    it('ficha nula/sem arma => false', () => {
        expect(temAcessoArmaEspiritual(null)).toBe(false);
        expect(temAcessoArmaEspiritual(undefined)).toBe(false);
        expect(temAcessoArmaEspiritual({})).toBe(false);
    });
});

describe('podeVerArmaEspiritual', () => {
    it('Mestre sempre vê, mesmo sem ficha', () => {
        expect(podeVerArmaEspiritual(null, true)).toBe(true);
        expect(podeVerArmaEspiritual({ armaEspiritual: { acessoArma: false } }, true)).toBe(true);
    });
    it('jogador depende do acesso', () => {
        expect(podeVerArmaEspiritual({ armaEspiritual: { acessoArma: true } }, false)).toBe(true);
        expect(podeVerArmaEspiritual({ armaEspiritual: { acessoArma: false } }, false)).toBe(false);
        expect(podeVerArmaEspiritual(null, undefined)).toBe(false);
    });
});

describe('filtrarCapitulos / resolverAbaVisivel', () => {
    const caps = [{ id: 'altar' }, { id: 'formas' }, { id: 'arsenal' }, { id: 'suprimentos' }];
    const ids = ['altar', 'formas'];
    it('com acesso devolve todos', () => {
        expect(filtrarCapitulos(caps, ids, true)).toEqual(caps);
    });
    it('sem acesso remove os da arma', () => {
        expect(filtrarCapitulos(caps, ids, false).map(c => c.id)).toEqual(['arsenal', 'suprimentos']);
    });
    it('lista vazia', () => {
        expect(filtrarCapitulos([], ids, false)).toEqual([]);
    });
    it('aba visível é mantida', () => {
        expect(resolverAbaVisivel('arsenal', caps)).toBe('arsenal');
    });
    it('aba indisponível cai na primeira visível', () => {
        const vis = filtrarCapitulos(caps, ids, false);
        expect(resolverAbaVisivel('altar', vis)).toBe('arsenal');
    });
    it('sem capítulos visíveis devolve a aba original', () => {
        expect(resolverAbaVisivel('altar', [])).toBe('altar');
    });
});

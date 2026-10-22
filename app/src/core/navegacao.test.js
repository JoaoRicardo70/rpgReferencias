import { describe, it, expect } from 'vitest';
import {
    listarDestinos, filtrarDestinos, registrarVisita, recentesValidos, destinoDoAtalho,
    abaPrecisaFicarMontada, GRUPOS_NAVEGACAO, MAX_RECENTES_NAVEGACAO,
} from './navegacao';

describe('listarDestinos', () => {
    it('sem Mestre: todas as abas dos grupos, sem aba-mestre', () => {
        const l = listarDestinos();
        const total = GRUPOS_NAVEGACAO.reduce((n, g) => n + g.abas.length, 0);
        expect(l).toHaveLength(total);
        expect(l.find(d => d.id === 'aba-mestre')).toBeUndefined();
        expect(l[0].id).toBe('aba-perfil');
    });
    it('com Mestre: aba-mestre vem primeiro com grupo mestre', () => {
        const l = listarDestinos({ isMestre: true });
        expect(l[0]).toMatchObject({ id: 'aba-mestre', grupo: 'mestre', grupoNome: 'Mestre' });
        expect(l).toHaveLength(listarDestinos().length + 1);
    });
    it('cada destino carrega grupo e grupoNome; ids unicos', () => {
        const l = listarDestinos({ isMestre: true });
        l.forEach(d => { expect(d.grupo).toBeTruthy(); expect(d.grupoNome).toBeTruthy(); });
        expect(new Set(l.map(d => d.id)).size).toBe(l.length);
    });
    it('argumento undefined usa o padrao', () => {
        expect(listarDestinos(undefined)).toEqual(listarDestinos({}));
    });
});

describe('filtrarDestinos', () => {
    const d = listarDestinos({ isMestre: true });
    it('busca vazia/so espacos/null devolve tudo', () => {
        expect(filtrarDestinos(d, '')).toBe(d);
        expect(filtrarDestinos(d, '   ')).toBe(d);
        expect(filtrarDestinos(d, null)).toBe(d);
    });
    it('ignora acento e caixa', () => {
        expect(filtrarDestinos(d, 'COMUNICACAO').map(x => x.id)).toContain('aba-comunicacao');
        expect(filtrarDestinos(d, 'oráculo').map(x => x.id)).toEqual(['aba-oraculo']);
        expect(filtrarDestinos(d, 'oraculo').map(x => x.id)).toEqual(['aba-oraculo']);
        expect(filtrarDestinos(d, 'grimorio').map(x => x.id)).toEqual(['aba-grimorio']);
    });
    it('filtra pelo nome do grupo', () => {
        const ids = filtrarDestinos(d, 'combate').map(x => x.id);
        expect(ids).toContain('aba-combate');
        ['aba-testes', 'aba-ataque', 'aba-acerto', 'aba-defesa'].forEach(removida => expect(ids).not.toContain(removida));
        expect(filtrarDestinos(d, 'diarios').map(x => x.id)).toEqual(['aba-Ficha Def', 'aba-grimorio']);
        expect(filtrarDestinos(d, 'mestre').map(x => x.id)).toContain('aba-mestre');
    });
    it('sem resultado devolve lista vazia', () => {
        expect(filtrarDestinos(d, 'zzzxyz')).toEqual([]);
    });
});

describe('registrarVisita', () => {
    it('poe o ultimo no comeco', () => {
        expect(registrarVisita(['a', 'b'], 'c')).toEqual(['c', 'a', 'b']);
    });
    it('nao repete: move existente para o topo', () => {
        expect(registrarVisita(['a', 'b', 'c'], 'c')).toEqual(['c', 'a', 'b']);
    });
    it('limita a 5', () => {
        expect(MAX_RECENTES_NAVEGACAO).toBe(5);
        let r = [];
        ['1', '2', '3', '4', '5', '6', '7'].forEach(id => { r = registrarVisita(r, id); });
        expect(r).toEqual(['7', '6', '5', '4', '3']);
    });
    it('id vazio devolve a lista (ou [] se invalida)', () => {
        expect(registrarVisita(['a'], '')).toEqual(['a']);
        expect(registrarVisita(null, null)).toEqual([]);
    });
    it('recentes invalidos viram [id]; descarta nao-strings; nao muta a entrada', () => {
        expect(registrarVisita(undefined, 'x')).toEqual(['x']);
        expect(registrarVisita('lixo', 'x')).toEqual(['x']);
        const orig = ['a', 5, null, 'b'];
        expect(registrarVisita(orig, 'c')).toEqual(['c', 'a', 'b']);
        expect(orig).toEqual(['a', 5, null, 'b']);
    });
});

describe('recentesValidos', () => {
    const d = listarDestinos();
    it('mantem a ordem, tira a aba atual e ids que nao existem mais', () => {
        const r = recentesValidos(['aba-mapa', 'aba-fantasma', 'aba-perfil', 'aba-log'], d, 'aba-perfil');
        expect(r.map(x => x.id)).toEqual(['aba-mapa', 'aba-log']);
    });
    it('devolve os objetos de destino', () => {
        expect(recentesValidos(['aba-mapa'], d, null)[0]).toBe(d.find(x => x.id === 'aba-mapa'));
    });
    it('aba-mestre some quando nao e Mestre', () => {
        expect(recentesValidos(['aba-mestre'], d, null)).toEqual([]);
    });
    it('recentes nao-array vira []', () => {
        expect(recentesValidos(null, d, null)).toEqual([]);
        expect(recentesValidos({}, d, null)).toEqual([]);
    });
});

describe('destinoDoAtalho', () => {
    const d = listarDestinos();
    it('1..9 retorna o N-esimo (1-based)', () => {
        expect(destinoDoAtalho(d, 1)).toBe(d[0]);
        expect(destinoDoAtalho(d, '9')).toBe(d[8]);
        expect(destinoDoAtalho(d, 5)).toBe(d[4]);
    });
    it('fora de 1..9 ou invalido devolve null', () => {
        [0, 10, -1, 'x', null, undefined, NaN].forEach(n => expect(destinoDoAtalho(d, n)).toBeNull());
    });
    it('lista curta: N alem do tamanho devolve null', () => {
        expect(destinoDoAtalho(d.slice(0, 2), 3)).toBeNull();
        expect(destinoDoAtalho([], 1)).toBeNull();
    });
});

describe('abaPrecisaFicarMontada', () => {
    it('so Mapa e Comunicacao', () => {
        expect(abaPrecisaFicarMontada('aba-mapa')).toBe(true);
        expect(abaPrecisaFicarMontada('aba-comunicacao')).toBe(true);
        listarDestinos({ isMestre: true }).filter(x => !['aba-mapa', 'aba-comunicacao'].includes(x.id))
            .forEach(x => expect(abaPrecisaFicarMontada(x.id)).toBe(false));
        expect(abaPrecisaFicarMontada(undefined)).toBe(false);
    });
});

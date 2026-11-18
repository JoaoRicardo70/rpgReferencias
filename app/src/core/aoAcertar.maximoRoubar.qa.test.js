import { describe, it, expect } from 'vitest';
import { normalizarAoAcertar, resolverAoAcertarNoAlvo, aplicarRoubadoNoRascunho, ATRIBUTOS_DEBUFF_AO_ACERTAR } from './aoAcertar';

const stat = (atual, base = 1000000) => ({ base, atual, mBase: 1, mGeral: 1, mFormas: 1, mUnico: '1.0', mAbsoluto: 1 });
const alvoFicha = (extra = {}) => ({ vida: stat(1000000), mana: stat(100000), aura: stat(100000), buffsTemporarios: [], ...extra });
const deb = (extra = {}) => ({ tipo: 'debuffAlvo', modo: 'fixo', valor: 5, atributo: 'evasiva', duracao: 3, empilha: true, origem: 'Gen', ...extra });
const golpe = (entrada, ficha, nomeAtacante = 'Atk', agora = 1000) => resolverAoAcertarNoAlvo([entrada], ficha, { nomeAtacante, agora });
const somaDeb = (buffs) => buffs.reduce((t, b) => t + b.efeitos.reduce((x, e) => x - e.valor, 0), 0);
const sequencia = (entradaBase, valores, atk = 'Atk') => {
    let f = alvoFicha(); const out = [];
    valores.forEach((v, i) => {
        const r = golpe({ ...entradaBase, valor: v }, f, atk, 1000 + i * 10);
        if (r.buffs) f = { ...f, buffsTemporarios: r.buffs };
        out.push(r);
    });
    return { f, out };
};

describe('debuffAlvo.maximo', () => {
    it('sequencia 5,5,5 com teto 12 acumula 12 (terceiro aplica so 2) e depois fica no teto', () => {
        const { f, out } = sequencia(deb({ maximo: 12 }), [5, 5, 5]);
        expect(somaDeb(f.buffsTemporarios)).toBe(12);
        expect(out[2].textos[0]).toContain('-2 de');
        const prox = golpe(deb({ maximo: 12 }), f, 'Atk', 2000);
        expect(prox.buffs).toBe(null);
        expect(prox.textos[0]).toMatch(/já está no teto \(-12\)/);
    });
    it('sequencia explicita 5,5,2 (valor muda por golpe)', () => {
        const { f } = sequencia(deb({ maximo: 12 }), [5, 5, 2]);
        expect(somaDeb(f.buffsTemporarios)).toBe(12);
    });
    it('sem maximo = comportamento antigo (sem teto)', () => {
        const { f } = sequencia(deb(), [5, 5, 5, 5]);
        expect(somaDeb(f.buffsTemporarios)).toBe(20);
    });
    it('normalizar: maximo 0/negativo/NaN/string e ignorado; valido e mantido; sem empilha e ignorado', () => {
        [0, -3, NaN, 'abc', '', null].forEach((m) => {
            const [e] = normalizarAoAcertar([deb({ maximo: m })]);
            expect(e && e.maximo).toBeUndefined();
        });
        expect(normalizarAoAcertar([deb({ maximo: '12' })])[0].maximo).toBe(12);
        expect(normalizarAoAcertar([deb({ maximo: 12, empilha: false })])[0].maximo).toBeUndefined();
    });
    it('maximo invalido na resolucao (entrada crua com 0/NaN) nao trava o debuff', () => {
        [0, -1, NaN, 'x'].forEach((m) => {
            const r = golpe(deb({ maximo: m }), alvoFicha());
            expect(r.buffs).toHaveLength(1);
        });
    });
    it('so conta stacks #n do mesmo atacante+atributo', () => {
        const outroAtk = { id: 'a', nome: 'Enfraquecido (Evasiva) #1', fonte: 'Outro', efeitos: [{ atributo: 'evasiva', propriedade: 'base', valor: -10 }], restantes: 3 };
        const semN = { id: 'b', nome: 'Enfraquecido (Evasiva)', fonte: 'Atk', efeitos: [{ atributo: 'evasiva', propriedade: 'base', valor: -10 }], restantes: 3 };
        const outroAtributo = { id: 'c', nome: 'Enfraquecido (Resistência) #1', fonte: 'Atk', efeitos: [{ atributo: 'resistencia', propriedade: 'base', valor: -10 }], restantes: 3 };
        const f = alvoFicha({ buffsTemporarios: [outroAtk, semN, outroAtributo] });
        const r = golpe(deb({ maximo: 12, valor: 5 }), f);
        expect(r.textos[0]).toContain('-5 de');
        expect(r.buffs).toHaveLength(4);
    });
    it('atributo cd e aceito e gera buff de cd', () => {
        expect(ATRIBUTOS_DEBUFF_AO_ACERTAR).toContain('cd');
        const r = golpe(deb({ atributo: 'cd', valor: 3 }), alvoFicha());
        expect(r.buffs[0].efeitos[0]).toMatchObject({ atributo: 'cd', valor: -3 });
        expect(normalizarAoAcertar([deb({ atributo: 'cd' })])[0].atributo).toBe('cd');
    });
    it('buff expirado (fora da lista) libera o teto', () => {
        const { f } = sequencia(deb({ maximo: 10 }), [5, 5]);
        expect(golpe(deb({ maximo: 10 }), f).buffs).toBe(null);
        const livre = { ...f, buffsTemporarios: [] };
        expect(golpe(deb({ maximo: 10 }), livre).buffs).toHaveLength(1);
    });
});

describe('drenarEnergiaAlvo.roubar', () => {
    const dreno = (extra = {}) => ({ tipo: 'drenarEnergiaAlvo', modo: 'fixo', valor: 10, energia: 'mana', origem: 'Sifao', ...extra });
    it('devolve roubado = o que saiu', () => {
        const r = golpe(dreno({ roubar: true }), alvoFicha());
        expect(r.campos['mana/atual']).toBe(100000 - 10000);
        expect(r.roubado).toEqual({ mana: 10000 });
    });
    it('limitado ao que o alvo tinha', () => {
        const r = golpe(dreno({ roubar: true, valor: 500 }), alvoFicha({ mana: stat(3000) }));
        expect(r.roubado).toEqual({ mana: 3000 });
        expect(r.campos['mana/atual']).toBe(0);
    });
    it('alvo zerado nao rouba nada', () => {
        expect(golpe(dreno({ roubar: true }), alvoFicha({ mana: stat(0) })).roubado).toBeUndefined();
    });
    it('sem roubar = nada em roubado', () => {
        expect(golpe(dreno(), alvoFicha()).roubado).toBeUndefined();
    });
    it('normalizar preserva roubar so no dreno', () => {
        expect(normalizarAoAcertar([dreno({ roubar: true })])[0].roubar).toBe(true);
        expect(normalizarAoAcertar([dreno()])[0].roubar).toBeUndefined();
        expect(normalizarAoAcertar([deb({ roubar: true })])[0].roubar).toBeUndefined();
    });
    it('aplicarRoubadoNoRascunho soma no atacante limitado ao maximo', () => {
        const f = { mana: stat(90000, 100000) };
        const t = aplicarRoubadoNoRascunho(f, { mana: 50000 });
        expect(f.mana.atual).toBe(100000);
        expect(t).toHaveLength(1);
    });
    it('aplicarRoubadoNoRascunho: abaixo do maximo soma; acima do maximo nao diminui; invalidos ignorados', () => {
        const f = { mana: stat(10000, 100000), aura: stat(150000, 100000) };
        aplicarRoubadoNoRascunho(f, { mana: 5000, aura: 9999, chakra: 10, vida: 5 });
        expect(f.mana.atual).toBe(15000);
        expect(f.aura.atual).toBe(150000);
        expect(aplicarRoubadoNoRascunho(f, null)).toEqual([]);
        expect(aplicarRoubadoNoRascunho(null, { mana: 1 })).toEqual([]);
        aplicarRoubadoNoRascunho(f, { mana: -5 }); aplicarRoubadoNoRascunho(f, { mana: NaN });
        expect(f.mana.atual).toBe(15000);
    });
});

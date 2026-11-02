import { describe, it, expect } from 'vitest';
import { getPoderDiretoMultiplier } from './poder.js';
import { getBuffs } from './attributes.js';

const pd = (propriedade, valor) => ({ nome: 'x', atributo: 'poder_direto', propriedade, valor });
const ef = (atributo, propriedade, valor) => ({ nome: 'x', atributo, propriedade, valor });
const item = (extra) => ({ id: 1, nome: 'Anel', tipo: 'artefato', equipado: true, ...extra });
const ficha = (inventario = [], extra = {}) => ({ poderes: [], seresSelados: [], inventario, ...extra });

describe('getPoderDiretoMultiplier - itens: ativos x passivos', () => {
    const base = { efeitos: [pd('mgeral', 2)], efeitosPassivos: [pd('mbase', 4)] };
    it('efeitosAtivos undefined e true contam os ativos', () => {
        expect(getPoderDiretoMultiplier(ficha([item(base)]))).toBe(3 * 5);
        expect(getPoderDiretoMultiplier(ficha([item({ ...base, efeitosAtivos: true })]))).toBe(3 * 5);
    });
    it('efeitosAtivos false corta so os ativos', () => {
        expect(getPoderDiretoMultiplier(ficha([item({ ...base, efeitosAtivos: false })]))).toBe(5);
    });
    it('so passivos sem efeitos ativos', () => {
        expect(getPoderDiretoMultiplier(ficha([item({ efeitosPassivos: [pd('mgeral', 1)] })]))).toBe(2);
    });
    it('efeito de outro atributo e valor invalido nao contam', () => {
        const f = ficha([item({ efeitos: [ef('forca', 'mgeral', 50), pd('mgeral', 'abc'), null, pd('inexistente', 9)] })]);
        expect(getPoderDiretoMultiplier(f)).toBe(1);
    });
    it('dois itens equipados somam dentro do mesmo grupo', () => {
        const f = ficha([item({ id: 1, efeitos: [pd('mgeral', 2)] }), item({ id: 2, efeitos: [pd('mgeral', 3)] })]);
        expect(getPoderDiretoMultiplier(f)).toBe(1 + 2 + 3);
    });
    it('ficha nula ou vazia = 1', () => {
        expect(getPoderDiretoMultiplier(null)).toBe(1);
        expect(getPoderDiretoMultiplier({})).toBe(1);
    });
});

describe('getPoderDiretoMultiplier - Forma/Config do item', () => {
    const formas = (extra = {}) => [{ id: 'f1', nome: 'F', efeitos: [pd('mformas', 100)], efeitosPassivos: [], configs: [
        { id: 'c1', nome: 'A', efeitos: [pd('mformas', 9)], efeitosPassivos: [pd('mabs', 1)] },
    ], ...extra }];

    it('com Config ativa: conta efeitos e passivos da Config (nao os da Forma)', () => {
        const f = ficha([item({ formas: formas(), formaAtivaId: 'f1', configAtivaId: 'c1' })]);
        expect(getPoderDiretoMultiplier(f)).toBe(10 * 2);
    });
    it('Forma sem configs: usa efeitos da propria Forma', () => {
        const f = ficha([item({ formas: formas({ configs: [] }), formaAtivaId: 'f1' })]);
        expect(getPoderDiretoMultiplier(f)).toBe(101);
    });
    it('Forma ativa soma com os efeitos base do item (acumula) e desativar remove so a Forma', () => {
        const comBase = { efeitos: [pd('mgeral', 2)], formas: formas() };
        expect(getPoderDiretoMultiplier(ficha([item({ ...comBase, formaAtivaId: 'f1', configAtivaId: 'c1' })]))).toBe(3 * 10 * 2);
        expect(getPoderDiretoMultiplier(ficha([item({ ...comBase, formaAtivaId: null, configAtivaId: null })]))).toBe(3);
    });
    it('Forma de item NAO equipado nao conta', () => {
        expect(getPoderDiretoMultiplier(ficha([item({ equipado: false, formas: formas(), formaAtivaId: 'f1', configAtivaId: 'c1' })]))).toBe(1);
    });
    it('formaAtivaId que nao existe nas formas = so efeitos base', () => {
        expect(getPoderDiretoMultiplier(ficha([item({ efeitos: [pd('mgeral', 2)], formas: formas(), formaAtivaId: 'zzz' })]))).toBe(3);
    });
    it('item com efeitosAtivos=false mantem Config da Forma ativa', () => {
        const f = ficha([item({ efeitos: [pd('mgeral', 50)], efeitosAtivos: false, formas: formas(), formaAtivaId: 'f1', configAtivaId: 'c1' })]);
        expect(getPoderDiretoMultiplier(f)).toBe(10 * 2);
    });
});

describe('getPoderDiretoMultiplier - Poder com Forma', () => {
    const forma = { id: 'f1', nome: 'F', efeitos: [pd('mformas', 100)], efeitosPassivos: [pd('mbase', 1000)], configs: [
        { id: 'c1', nome: 'A', efeitos: [pd('mabs', 3)], efeitosPassivos: [] },
    ] };
    const poder = (extra = {}) => ({ id: 'p', nome: 'P', ativa: true, efeitos: [pd('mgeral', 2)], efeitosPassivos: [], formas: [forma], formaAtivaId: 'f1', configAtivaId: 'c1', ...extra });

    it('Poder ativo com Forma+Config: base, forma e config contam cada um uma vez', () => {
        // mgeral 2, mformas 100 (forma), mbase 1000 (forma passiva), mabs 3 (config)
        expect(getPoderDiretoMultiplier(ficha([], { poderes: [poder()] }))).toBe(3 * 101 * 1001 * 4);
    });
    it('desativar a Forma remove forma e config, mantendo o efeito base', () => {
        expect(getPoderDiretoMultiplier(ficha([], { poderes: [poder({ formaAtivaId: null, configAtivaId: null })] }))).toBe(3);
    });
    it('Poder desativado (ativa false): efeitos ativos saem, passivos da Forma e a Config permanecem', () => {
        // passivo da forma (mbase 1000) + config (mabs 3); efeitos ativos (mgeral 2, mformas 100) fora
        expect(getPoderDiretoMultiplier(ficha([], { poderes: [poder({ ativa: false })] }))).toBe(1001 * 4);
    });
    it('Poder desativado sem Forma nao contribui', () => {
        expect(getPoderDiretoMultiplier(ficha([], { poderes: [poder({ ativa: false, formaAtivaId: null, configAtivaId: null })] }))).toBe(1);
    });
    it('mUnico de Poder e de Item multiplicam entre si', () => {
        const f = ficha([item({ efeitos: [pd('munico', 3)] })], { poderes: [{ id: 'p', ativa: true, efeitos: [pd('munico', 5)] }] });
        expect(getPoderDiretoMultiplier(f)).toBe(15);
    });
});

describe('getBuffs - Config de Forma de Poder nao conta duas vezes', () => {
    // Potencias de 10 distintas: qualquer duplicidade muda o total de forma visivel.
    const forma = { id: 'f1', nome: 'F',
        efeitos: [ef('forca', 'base', 100), ef('dano', 'mgeral', 2)],
        efeitosPassivos: [ef('forca', 'base', 1000)],
        configs: [{ id: 'c1', nome: 'A',
            efeitos: [ef('forca', 'base', 10000), ef('dano', 'mgeral', 3)],
            efeitosPassivos: [ef('forca', 'base', 100000)] }] };
    const poder = (extra = {}) => ({ id: 'p', nome: 'P', ativa: true, efeitos: [ef('forca', 'base', 10), ef('dano', 'mgeral', 1)], efeitosPassivos: [], formas: [forma], formaAtivaId: 'f1', configAtivaId: 'c1', ...extra });
    const fi = (p) => ({ poderes: [p], inventario: [] });

    it("forca: base 10 + forma 100 + forma passiva 1000 + config 10000 + config passiva 100000 = 111110 (cada um uma vez)", () => {
        expect(getBuffs(fi(poder()), 'forca').base).toBe(111110);
    });
    it("dano: mgeral 1 + 2 + 3 = 6 (config nao duplica a forma)", () => {
        const b = getBuffs(fi(poder()), 'dano');
        expect(b.mgeral).toBe(6);
        expect(b.fontesMgeral).toHaveLength(3);
    });
    it('sem configAtivaId usa a primeira Config e mantem o mesmo total', () => {
        expect(getBuffs(fi(poder({ configAtivaId: null })), 'forca').base).toBe(111110);
    });
    it('desativar a Forma remove forma e config', () => {
        const b = getBuffs(fi(poder({ formaAtivaId: null, configAtivaId: null })), 'forca');
        expect(b.base).toBe(10);
        expect(getBuffs(fi(poder({ formaAtivaId: null, configAtivaId: null })), 'dano').mgeral).toBe(1);
    });
    it('Poder inativo: sem efeitos ativos (base e forma), ficam passivo da forma e Config', () => {
        expect(getBuffs(fi(poder({ ativa: false })), 'forca').base).toBe(1000 + 10000 + 100000);
        expect(getBuffs(fi(poder({ ativa: false })), 'dano').mgeral).toBe(3);
    });
    it('Forma com acumulaFormaBase=false esconde os efeitos base do Poder, config segue valendo', () => {
        const p = poder({ formas: [{ ...forma, acumulaFormaBase: false }] });
        expect(getBuffs(fi(p), 'forca').base).toBe(100 + 1000 + 10000 + 100000);
    });
    it('atributo nao relacionado nao e afetado', () => {
        expect(getBuffs(fi(poder()), 'destreza').base).toBe(0);
    });
});

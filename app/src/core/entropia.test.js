import { describe, it, expect } from 'vitest';
import {
    normalizarEntropia, normalizarEfeitoEntropia, entropiasDaFicha, entropiasAtivas, entropiasVisiveis, efeitosDaEntropia,
    descreverEfeitoEntropia, gravarEntropias, LIMITES_ENTROPIA,
} from './entropia';
import { getBuffs } from './attributes';
import { getPoderDiretoMultiplier } from './poder';

const ent = (extra = {}) => ({ id: 'e1', nome: 'Maré do Caos', ativa: true, efeitos: [{ nome: 'Fúria', atributo: 'forca', propriedade: 'base', valor: 100 }], ...extra });

describe('normalizarEfeitoEntropia', () => {
    it('aceita atributo comum, Poder Direto e dados de dano', () => {
        expect(normalizarEfeitoEntropia({ atributo: 'forca', propriedade: 'base', valor: '12,5' })).toMatchObject({ atributo: 'forca', propriedade: 'base', valor: 12.5 });
        expect(normalizarEfeitoEntropia({ atributo: 'poder_direto', propriedade: 'mgeral', valor: 2 })).toMatchObject({ atributo: 'poder_direto', propriedade: 'mgeral', valor: 2 });
        expect(normalizarEfeitoEntropia({ atributo: 'dano_dados', valor: '50d20' })).toMatchObject({ atributo: 'dano_dados', propriedade: 'base', valor: '50d20' });
    });
    it('Poder Direto só aceita multiplicadores (propriedade inválida cai na primeira)', () => {
        expect(normalizarEfeitoEntropia({ atributo: 'poder_direto', propriedade: 'base', valor: 2 }).propriedade).toBe('mbase');
    });
    it('rejeita atributo desconhecido, valor não numérico e dado inválido', () => {
        expect(normalizarEfeitoEntropia({ atributo: 'coisa', valor: 1 })).toBeNull();
        expect(normalizarEfeitoEntropia({ atributo: 'forca', valor: 'abc' })).toBeNull();
        expect(normalizarEfeitoEntropia({ atributo: 'dano_dados', valor: 'xx' })).toBeNull();
        expect(normalizarEfeitoEntropia(null)).toBeNull();
    });
});

describe('normalizarEntropia / entropiasDaFicha', () => {
    it('preenche padrões e limita tamanhos', () => {
        const e = normalizarEntropia({ nome: '', efeitos: [{ atributo: 'forca', valor: 1 }, { atributo: 'xx', valor: 1 }] });
        expect(e.nome).toBe('Entropia sem nome');
        expect(e.ativa).toBe(false);
        expect(e.oculta).toBe(false);
        expect(e.efeitos).toHaveLength(1);
        expect(e.id).toMatch(/^en/);
        expect(normalizarEntropia({ nome: 'x'.repeat(200) }).nome).toHaveLength(LIMITES_ENTROPIA.nome);
    });
    it('ids inseguros são trocados', () => {
        expect(normalizarEntropia({ id: '__proto__' }).id).not.toBe('__proto__');
        expect(normalizarEntropia({ id: 'ok-1' }).id).toBe('ok-1');
    });
    it('ativas e visíveis', () => {
        const f = { entropias: [ent(), ent({ id: 'e2', ativa: false }), ent({ id: 'e3', oculta: true })] };
        expect(entropiasDaFicha(f)).toHaveLength(3);
        expect(entropiasAtivas(f).map(x => x.id)).toEqual(['e1', 'e3']);
        expect(entropiasVisiveis(f).map(x => x.id)).toEqual(['e1']);
    });
    it('ficha sem entropias ou com lixo não quebra', () => {
        expect(entropiasDaFicha(null)).toEqual([]);
        expect(entropiasDaFicha({ entropias: 'x' })).toEqual([]);
        expect(entropiasDaFicha({ entropias: [null, 3, ent()] })).toHaveLength(1);
        expect(efeitosDaEntropia({})).toEqual([]);
    });
    it('respeita o limite de Entropias por ficha', () => {
        const f = { entropias: Array.from({ length: 30 }, (_, i) => ent({ id: `e${i}` })) };
        expect(entropiasDaFicha(f)).toHaveLength(LIMITES_ENTROPIA.entropias);
    });
});

describe('efeitosDaEntropia / gravarEntropias', () => {
    it('só as ativas geram efeitos, com nome de origem', () => {
        const f = { entropias: [ent(), ent({ id: 'e2', ativa: false, efeitos: [{ atributo: 'forca', valor: 5 }] })] };
        const r = efeitosDaEntropia(f);
        expect(r).toHaveLength(1);
        expect(r[0]).toMatchObject({ atributo: 'forca', valor: 100 });
        const sem = efeitosDaEntropia({ entropias: [ent({ efeitos: [{ atributo: 'forca', valor: 1 }] })] });
        expect(sem[0].nome).toBe('Entropia: Maré do Caos');
    });
    it('Entropia oculta usa nome neutro nos efeitos (o nome secreto não vaza)', () => {
        const f = { entropias: [ent({ oculta: true, nome: 'Segredo do Vazio', efeitos: [{ nome: 'Pista', atributo: 'forca', valor: 5 }] })] };
        const r = efeitosDaEntropia(f);
        expect(r[0].nome).toBe('Entropia');
        expect(JSON.stringify(r)).not.toContain('Segredo');
        expect(JSON.stringify(r)).not.toContain('Pista');
    });
    it('gravarEntropias normaliza e limita', () => {
        const f = {};
        gravarEntropias(f, [{ nome: 'A', ativa: true, efeitos: [{ atributo: 'forca', valor: 3 }] }, null]);
        expect(f.entropias).toHaveLength(2);
        expect(f.entropias[0].ativa).toBe(true);
    });
    it('descreve o efeito', () => {
        expect(descreverEfeitoEntropia({ atributo: 'forca', propriedade: 'base', valor: 5 })).toBe('forca (base) +5');
        expect(descreverEfeitoEntropia({ atributo: 'dano_dados', valor: '2d6' })).toBe('dado de dano +2d6');
    });
});

describe('integração: a Entropia ativa mexe nos números da ficha', () => {
    const base = () => ({ forca: { base: 100, mBase: 1, mGeral: 1, mFormas: 1, mUnico: '1', mAbsoluto: 1, reducaoCusto: 0, regeneracao: 0 }, poderes: [], inventario: [], bio: {} });

    it('atributo: soma na Base só enquanto ativa', () => {
        const sem = getBuffs(base(), 'forca').base;
        const f = { ...base(), entropias: [ent()] };
        expect(getBuffs(f, 'forca').base).toBe(sem + 100);
        const desligada = { ...base(), entropias: [ent({ ativa: false })] };
        expect(getBuffs(desligada, 'forca').base).toBe(sem);
    });
    it('Poder Direto: multiplicador geral entra no Poder Calculado', () => {
        const sem = getPoderDiretoMultiplier(base());
        const f = { ...base(), entropias: [ent({ efeitos: [{ nome: 'Auge', atributo: 'poder_direto', propriedade: 'mgeral', valor: 4 }] })] };
        expect(getPoderDiretoMultiplier(f)).toBeGreaterThan(sem);
        const desligada = { ...base(), entropias: [ent({ ativa: false, efeitos: [{ atributo: 'poder_direto', propriedade: 'mgeral', valor: 4 }] })] };
        expect(getPoderDiretoMultiplier(desligada)).toBe(sem);
    });
});

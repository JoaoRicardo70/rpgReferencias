import { describe, it, expect } from 'vitest';
import { resolverEfeitosEntidade } from './efeitos-resolver';
import { getBuffs, getMaximo } from './attributes';

function poderComEstagio(extra = {}) {
    return {
        id: 1, nome: 'Portões', categoria: 'poder', ativa: true, estagioAtual: 3,
        estagios: { habilitado: true, maximo: 10, crescimento: 100, fadigaPorEstagio: 2, rotulo: 'Portão', nomes: [] },
        efeitos: [{ atributo: 'forca', propriedade: 'base', valor: 10 }],
        efeitosPassivos: [{ atributo: 'forca', propriedade: 'base', valor: 7 }],
        ...extra,
    };
}

describe('core/efeitos-resolver — resolverEfeitosEntidade com Estágios', () => {
    it('escala os efeitos ATIVOS pelo estágio e não toca nos passivos', () => {
        const r = resolverEfeitosEntidade(poderComEstagio());
        expect(r.efeitos[0].valor).toBe(30);
        expect(r.efeitosPassivos[0].valor).toBe(7);
    });

    it('no 1º estágio devolve os efeitos originais (mesma referência)', () => {
        const p = poderComEstagio({ estagioAtual: 1 });
        expect(resolverEfeitosEntidade(p).efeitos).toBe(p.efeitos);
    });

    it('escala também os efeitos da sub-forma ativa (acumulando com a base)', () => {
        const p = poderComEstagio({
            formaAtivaId: 'f1',
            formas: [{ id: 'f1', efeitos: [{ atributo: 'forca', propriedade: 'base', valor: 5 }], efeitosPassivos: [] }],
        });
        const r = resolverEfeitosEntidade(p);
        expect(r.efeitos.map(e => e.valor)).toEqual([30, 15]);
    });

    it('sub-forma que NÃO acumula com a base também é escalada', () => {
        const p = poderComEstagio({
            formaAtivaId: 'f1',
            formas: [{ id: 'f1', acumulaFormaBase: false, efeitos: [{ atributo: 'forca', propriedade: 'base', valor: 4 }] }],
        });
        expect(resolverEfeitosEntidade(p).efeitos.map(e => e.valor)).toEqual([12]);
    });

    it('item sem estágios e entidade nula não são afetados', () => {
        const item = { id: 2, estagioAtual: 5, efeitos: [{ atributo: 'forca', propriedade: 'base', valor: 10 }], efeitosPassivos: [] };
        expect(resolverEfeitosEntidade(item).efeitos[0].valor).toBe(10);
        expect(resolverEfeitosEntidade(null)).toEqual({ efeitos: [], efeitosPassivos: [] });
        expect(resolverEfeitosEntidade(undefined)).toEqual({ efeitos: [], efeitosPassivos: [] });
    });

    it('estágios desabilitados ignoram estagioAtual', () => {
        const p = poderComEstagio({ estagios: { habilitado: false, maximo: 10 } });
        expect(resolverEfeitosEntidade(p).efeitos[0].valor).toBe(10);
    });
});

describe('core/attributes — getBuffs/getMaximo refletem o estágio', () => {
    function ficha(poder) {
        return { forca: { base: 100 }, vida: { base: 100 }, poderes: [poder], inventario: [], passivas: [], seresSelados: [], combate: {} };
    }

    it('getBuffs soma o efeito base escalado pelo estágio quando a técnica está ativa (passivo fixo)', () => {
        expect(getBuffs(ficha(poderComEstagio({ estagioAtual: 1 })), 'forca').base).toBe(10 + 7);
        expect(getBuffs(ficha(poderComEstagio({ estagioAtual: 3 })), 'forca').base).toBe(30 + 7);
    });

    it('técnica desligada: só o passivo vale, independente do estágio', () => {
        expect(getBuffs(ficha(poderComEstagio({ ativa: false, estagioAtual: 5 })), 'forca').base).toBe(7);
    });

    it('getMaximo aumenta ao subir de estágio', () => {
        const baixo = getMaximo(ficha(poderComEstagio({ estagioAtual: 1 })), 'forca');
        const alto = getMaximo(ficha(poderComEstagio({ estagioAtual: 4 })), 'forca');
        expect(alto).toBeGreaterThan(baixo);
        expect(alto - baixo).toBe(30);
    });

    it('multiplicador (mgeral) também escala com o estágio', () => {
        const p1 = poderComEstagio({ efeitos: [{ atributo: 'forca', propriedade: 'mgeral', valor: 1.5 }], efeitosPassivos: [], estagioAtual: 1 });
        const p3 = poderComEstagio({ efeitos: [{ atributo: 'forca', propriedade: 'mgeral', valor: 1.5 }], efeitosPassivos: [], estagioAtual: 3 });
        const b1 = getBuffs(ficha(p1), 'forca').mgeral;
        const b3 = getBuffs(ficha(p3), 'forca').mgeral;
        expect(b3).toBeGreaterThan(b1);
    });
});

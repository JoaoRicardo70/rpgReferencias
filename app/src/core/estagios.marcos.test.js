import { describe, it, expect } from 'vitest';
import {
    normalizarMarcos, normalizarEstagios, marcoVigente, fatorDoEstagio, fatorGeralDoEstagio,
    escalarPorFator, efeitosDoEstagio, escalarEfeitosPorEstagio, fadigaPorTurnoDoEstagio,
    previaEstagios, marcoParaRascunho,
} from './estagios';
import { resolverEfeitosEntidade } from './efeitos-resolver';
import { getBuffs, getMaximo } from './attributes';

const BASE = [{ atributo: 'geral', propriedade: 'mgeral', valor: 10 }];

function portoes(estagioAtual = 1, marcosExtra, cfg = {}) {
    return {
        id: 1, nome: 'Portões Internos', categoria: 'poder', ativa: true, estagioAtual,
        estagios: {
            habilitado: true, maximo: 10, crescimento: 100, fadigaPorEstagio: 2, rotulo: 'Portão', nomes: [],
            marcos: marcosExtra ?? [
                { estagio: 7, efeitos: [{ atributo: 'geral', propriedade: 'mgeral', valor: 120 }, { atributo: 'geral', propriedade: 'munico', valor: 1.5 }], crescimento: 0, fadigaPorEstagio: null },
                { estagio: 8, efeitos: [{ atributo: 'geral', propriedade: 'mgeral', valor: 200 }, { atributo: 'geral', propriedade: 'munico', valor: 2 }], crescimento: null, fadigaPorEstagio: 5 },
            ],
            ...cfg,
        },
        efeitos: BASE, efeitosPassivos: [],
    };
}
const valor = (p, prop, n) => {
    const l = efeitosDoEstagio(p.efeitos, { ...p, estagioAtual: n }, n);
    const e = l.find(x => x.propriedade === prop);
    return e ? e.valor : undefined;
};

describe('core/estagios — normalizarMarcos', () => {
    it('aceita array válido, ordena por estágio', () => {
        const r = normalizarMarcos([{ estagio: 8, efeitos: [] }, { estagio: 3, efeitos: [] }]);
        expect(r.map(m => m.estagio)).toEqual([3, 8]);
    });
    it('aceita objeto estilo Firebase (índices) em marcos e em efeitos', () => {
        const r = normalizarMarcos({ 0: { estagio: '4', efeitos: { 0: { atributo: 'forca', propriedade: 'base', valor: 5 } } } });
        expect(r).toHaveLength(1);
        expect(r[0].estagio).toBe(4);
        expect(r[0].efeitos).toEqual([{ nome: '', atributo: 'forca', propriedade: 'base', valor: 5 }]);
    });
    it('entradas vazias, nulas ou de tipo errado viram lista vazia', () => {
        [undefined, null, [], {}, 'x', 5, true].forEach(v => expect(normalizarMarcos(v)).toEqual([]));
    });
    it('descarta nulos, estágios inválidos e menores que 2', () => {
        const r = normalizarMarcos([null, 'x', { estagio: 1 }, { estagio: 0 }, { estagio: -4 }, { estagio: 'abc' }, {}, { estagio: 2 }, { estagio: 1e9 }]);
        expect(r.map(m => m.estagio)).toEqual([2]);
    });
    it('estágio duplicado: o último vence', () => {
        const r = normalizarMarcos([{ estagio: 5, efeitos: [{ atributo: 'a', propriedade: 'b', valor: 1 }] }, { estagio: 5, efeitos: [{ atributo: 'a', propriedade: 'b', valor: 9 }] }]);
        expect(r).toHaveLength(1);
        expect(r[0].efeitos[0].valor).toBe(9);
    });
    it('estágio decimal é arredondado pra baixo', () => {
        expect(normalizarMarcos([{ estagio: '7.9' }])[0].estagio).toBe(7);
    });
    it('descarta efeitos sem valor (vazio ou só espaços) e nulos, mas mantém valor 0', () => {
        const r = normalizarMarcos([{ estagio: 3, efeitos: [{ valor: '' }, { valor: '  ' }, null, { atributo: 'a', propriedade: 'b', valor: 0 }, { atributo: 'a', propriedade: 'b' }] }]);
        expect(r[0].efeitos).toHaveLength(1);
        expect(r[0].efeitos[0].valor).toBe(0);
    });
    it('mantém fixo somente quando verdadeiro', () => {
        const r = normalizarMarcos([{ estagio: 3, efeitos: [{ atributo: 'a', propriedade: 'b', valor: 1, fixo: true }, { atributo: 'a', propriedade: 'b', valor: 2, fixo: false }] }]);
        expect(r[0].efeitos[0].fixo).toBe(true);
        expect('fixo' in r[0].efeitos[1]).toBe(false);
    });
    it('crescimento e fadiga: vazio/null/inválido = null, números preservados, negativos viram 0', () => {
        const r = normalizarMarcos([
            { estagio: 2, crescimento: '', fadigaPorEstagio: null },
            { estagio: 3, crescimento: 'abc', fadigaPorEstagio: undefined },
            { estagio: 4, crescimento: '50', fadigaPorEstagio: '1.5' },
            { estagio: 5, crescimento: 0, fadigaPorEstagio: -3 },
        ]);
        expect(r[0]).toMatchObject({ crescimento: null, fadigaPorEstagio: null });
        expect(r[1]).toMatchObject({ crescimento: null, fadigaPorEstagio: null });
        expect(r[2]).toMatchObject({ crescimento: 50, fadigaPorEstagio: 1.5 });
        expect(r[3]).toMatchObject({ crescimento: 0, fadigaPorEstagio: 0 });
    });
    it('não grava a chave do rascunho', () => {
        expect(normalizarMarcos([{ chave: 'x', estagio: 3 }])[0]).not.toHaveProperty('chave');
    });
});

describe('core/estagios — normalizarEstagios com marcos', () => {
    it('inclui marcos normalizados e [] por padrão', () => {
        expect(normalizarEstagios({}).marcos).toEqual([]);
        expect(normalizarEstagios({ marcos: [{ estagio: 6 }, { estagio: 1 }] }).marcos.map(m => m.estagio)).toEqual([6]);
    });
});

describe('core/estagios — marcoVigente / fatores', () => {
    it('sem marco: regra do 1º estágio com valores gerais', () => {
        const p = portoes(5, []);
        expect(marcoVigente(p, 5)).toEqual({ estagio: 1, efeitos: null, crescimento: 100, fadigaPorEstagio: 2 });
    });
    it('no estágio do marco e acima pega o último marco até n', () => {
        const p = portoes(1);
        expect(marcoVigente(p, 6).estagio).toBe(1);
        expect(marcoVigente(p, 7).estagio).toBe(7);
        expect(marcoVigente(p, 7).crescimento).toBe(0);
        expect(marcoVigente(p, 7).fadigaPorEstagio).toBe(2);
        expect(marcoVigente(p, 9).estagio).toBe(8);
        expect(marcoVigente(p, 9).crescimento).toBe(100);
        expect(marcoVigente(p, 9).fadigaPorEstagio).toBe(5);
    });
    it('fatorDoEstagio é relativo ao marco; fatorGeralDoEstagio ignora marcos', () => {
        const p = portoes(1);
        expect(fatorDoEstagio(p, 6)).toBe(6);
        expect(fatorDoEstagio(p, 7)).toBe(1);
        expect(fatorDoEstagio(p, 8)).toBe(1);
        expect(fatorDoEstagio(p, 10)).toBe(3);
        expect(fatorGeralDoEstagio(p, 7)).toBe(7);
        expect(fatorGeralDoEstagio(p, 10)).toBe(10);
    });
    it('sem estágios habilitados, fatores são 1 e fadiga 0', () => {
        const p = { ...portoes(5), estagios: { habilitado: false } };
        expect(fatorDoEstagio(p)).toBe(1);
        expect(fatorGeralDoEstagio(p)).toBe(1);
        expect(fadigaPorTurnoDoEstagio(p)).toBe(0);
    });
});

describe('core/estagios — escalarPorFator', () => {
    it('fator 1 devolve a mesma referência', () => {
        expect(escalarPorFator(BASE, 1)).toBe(BASE);
    });
    it('null/undefined viram lista vazia', () => {
        expect(escalarPorFator(null, 2)).toEqual([]);
        expect(escalarPorFator(undefined, 1)).toEqual([]);
    });
    it('fixo e não numérico não escalam; arredonda a 4 casas', () => {
        const r = escalarPorFator([{ valor: 2, fixo: true }, { valor: 'abc' }, { valor: 1 }, null], 1 / 3);
        expect(r[0].valor).toBe(2);
        expect(r[1].valor).toBe('abc');
        expect(r[2].valor).toBe(0.3333);
        expect(r[3]).toBeNull();
    });
});

describe('core/estagios — cenário Portões Internos', () => {
    const p = portoes(1);
    it('1º ao 6º: mgeral 10..60 e fadiga 2..12', () => {
        for (let n = 1; n <= 6; n++) {
            expect(valor(p, 'mgeral', n)).toBe(10 * n);
            expect(fadigaPorTurnoDoEstagio(p, n)).toBe(2 * n);
            expect(valor(p, 'munico', n)).toBeUndefined();
        }
    });
    it('7º: mgeral 120 + munico 1.5, fadiga 14', () => {
        expect(valor(p, 'mgeral', 7)).toBe(120);
        expect(valor(p, 'munico', 7)).toBe(1.5);
        expect(fadigaPorTurnoDoEstagio(p, 7)).toBe(14);
    });
    it('8º: 200 / 2, fadiga 40 (estágio absoluto x 5)', () => {
        expect(valor(p, 'mgeral', 8)).toBe(200);
        expect(valor(p, 'munico', 8)).toBe(2);
        expect(fadigaPorTurnoDoEstagio(p, 8)).toBe(40);
    });
    it('9º e 10º crescem a partir do marco 8', () => {
        expect(valor(p, 'mgeral', 9)).toBe(400);
        expect(valor(p, 'munico', 9)).toBe(4);
        expect(fadigaPorTurnoDoEstagio(p, 9)).toBe(45);
        expect(valor(p, 'mgeral', 10)).toBe(600);
        expect(valor(p, 'munico', 10)).toBe(6);
        expect(fadigaPorTurnoDoEstagio(p, 10)).toBe(50);
    });
    it('munico fixo no marco 8 permanece 2 no 9º e 10º', () => {
        const marcos = [
            { estagio: 7, efeitos: [{ atributo: 'geral', propriedade: 'mgeral', valor: 120 }, { atributo: 'geral', propriedade: 'munico', valor: 1.5 }], crescimento: 0 },
            { estagio: 8, efeitos: [{ atributo: 'geral', propriedade: 'mgeral', valor: 200 }, { atributo: 'geral', propriedade: 'munico', valor: 2, fixo: true }], fadigaPorEstagio: 5 },
        ];
        const q = portoes(1, marcos);
        expect(valor(q, 'mgeral', 9)).toBe(400);
        expect(valor(q, 'munico', 9)).toBe(2);
        expect(valor(q, 'munico', 10)).toBe(2);
    });
    it('marco com lista de efeitos vazia: sem bônus dali em diante', () => {
        const q = portoes(1, [{ estagio: 3, efeitos: [] }]);
        expect(efeitosDoEstagio(q.efeitos, q, 3)).toEqual([]);
        expect(efeitosDoEstagio(q.efeitos, q, 2)[0].valor).toBe(20);
    });
    it('estágio acima do máximo é limitado ao último', () => {
        expect(valor(p, 'mgeral', 99)).toBe(600);
    });
});

describe('core/estagios — referência e atalho', () => {
    it('sem marco e fator 1 (1º estágio) devolve a mesma referência', () => {
        const q = portoes(1, []);
        expect(efeitosDoEstagio(q.efeitos, q, 1)).toBe(q.efeitos);
        expect(escalarEfeitosPorEstagio(q.efeitos, q)).toBe(q.efeitos);
    });
    it('sem estágios habilitados devolve efeitosBase (ou [] se nulo)', () => {
        const q = { estagios: { habilitado: false } };
        expect(efeitosDoEstagio(BASE, q)).toBe(BASE);
        expect(efeitosDoEstagio(null, q)).toEqual([]);
    });
    it('escalarEfeitosPorEstagio usa o estágio atual do poder', () => {
        expect(escalarEfeitosPorEstagio(BASE, portoes(7))[0].valor).toBe(120);
    });
    it('cache por objeto estagios: trocar o objeto (Immer) reflete na hora', () => {
        const q = portoes(7);
        expect(valor(q, 'mgeral', 7)).toBe(120);
        const q2 = { ...q, estagios: { ...q.estagios, marcos: [] } };
        expect(valor(q2, 'mgeral', 7)).toBe(70);
    });
});

describe('core/estagios — previaEstagios', () => {
    it('máximo 10 -> 10 linhas, marcos marcados só a partir do 2º', () => {
        const l = previaEstagios(BASE, portoes(1).estagios);
        expect(l).toHaveLength(10);
        expect(l.filter(x => x.marco).map(x => x.estagio)).toEqual([7, 8]);
        expect(l[6].efeitos.map(e => e.valor)).toEqual([120, 1.5]);
        expect(l[7].fadiga).toBe(40);
        expect(l[0].marco).toBe(false);
    });
    it('sem teto (maximo 0) respeita o limite', () => {
        expect(previaEstagios(BASE, { maximo: 0 }, 5)).toHaveLength(5);
        expect(previaEstagios(BASE, { maximo: 0 })).toHaveLength(12);
    });
    it('aceita rascunho com texto e marcos como rascunho (chave)', () => {
        const rascunho = { maximo: '3', crescimento: '50', fadigaPorEstagio: '1', marcos: [marcoParaRascunho({ estagio: 3, efeitos: [{ atributo: 'a', propriedade: 'b', valor: 5 }] })] };
        const l = previaEstagios(BASE, rascunho, 12);
        expect(l).toHaveLength(3);
        expect(l[1].efeitos[0].valor).toBe(15);
        expect(l[2].efeitos[0].valor).toBe(5);
        expect(l[2].marco).toBe(true);
    });
    it('config vazia/nula não quebra', () => {
        expect(previaEstagios(null, null)).toHaveLength(10);
        expect(previaEstagios(undefined, undefined, 0)).toEqual([]);
    });
});

describe('core/estagios — marcoParaRascunho', () => {
    it('números viram texto e null/undefined viram vazio', () => {
        const r = marcoParaRascunho({ estagio: 7, efeitos: [{ valor: 1 }], crescimento: 0, fadigaPorEstagio: null });
        expect(r).toMatchObject({ estagio: '7', crescimento: '0', fadigaPorEstagio: '' });
        expect(marcoParaRascunho(undefined)).toMatchObject({ estagio: '', crescimento: '', fadigaPorEstagio: '', efeitos: [] });
    });
    it('chaves são únicas e os efeitos são cópias', () => {
        const ef = { valor: 1 };
        const a = marcoParaRascunho({ estagio: 2, efeitos: [ef] });
        const b = marcoParaRascunho({ estagio: 2, efeitos: [ef] });
        expect(a.chave).not.toBe(b.chave);
        expect(a.efeitos[0]).not.toBe(ef);
    });
});

describe('core/efeitos-resolver — marcos', () => {
    it('poder estagiado usa efeitosDoEstagio (7º = marco)', () => {
        const r = resolverEfeitosEntidade(portoes(7));
        expect(r.efeitos.map(e => [e.propriedade, e.valor])).toEqual([['mgeral', 120], ['munico', 1.5]]);
    });
    it('sub-forma escala pelo fator GERAL (7x no 7º), não volta a x1', () => {
        const p = {
            ...portoes(7), formaAtivaId: 'f1',
            formas: [{ id: 'f1', efeitos: [{ atributo: 'forca', propriedade: 'base', valor: 5 }], efeitosPassivos: [] }],
        };
        const r = resolverEfeitosEntidade(p);
        expect(r.efeitos.map(e => e.valor)).toEqual([120, 1.5, 35]);
        expect(p.formas[0].efeitos[0].valor).toBe(5);
    });
    it('item e null seguem inalterados', () => {
        const item = { estagioAtual: 7, efeitos: BASE, efeitosPassivos: [] };
        expect(resolverEfeitosEntidade(item).efeitos).toBe(BASE);
        expect(resolverEfeitosEntidade(null)).toEqual({ efeitos: [], efeitosPassivos: [] });
    });
    it('getBuffs/getMaximo no 7º: mgeral 120 e munico 1.5 aplicados', () => {
        const ficha = (n) => ({ forca: { base: 100 }, vida: { base: 100 }, poderes: [portoes(n)], inventario: [], passivas: [], seresSelados: [], combate: {} });
        const b7 = getBuffs(ficha(7), 'forca');
        expect(b7.mgeral).toBe(120);
        expect(b7.munico).toEqual([1.5]);
        const b6 = getBuffs(ficha(6), 'forca');
        expect(b6.mgeral).toBe(60);
        expect(b6.munico).toEqual([]);
        expect(getMaximo(ficha(7), 'forca')).toBeGreaterThan(getMaximo(ficha(6), 'forca'));
    });
});

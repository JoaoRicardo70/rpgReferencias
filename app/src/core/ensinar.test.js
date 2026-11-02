import { describe, it, expect } from 'vitest';
import { montarOferta, aceitarOferta, removerOferta, ofertasRecebidas, alunosPossiveis, prepararItemEnsinado } from './ensinar';

const poder = { id: 5, nome: 'Chama', categoria: 'habilidade', ativa: true, maestria: 90, dadosQtd: 3 };

describe('ensinar', () => {
    it('monta a oferta sem id/estado de uso e com nível limitado', () => {
        const r = montarOferta({ professor: 'Natsu', tipo: 'poder', item: poder, nivel: 150, agora: 1000, sorteio: () => 0.5 });
        expect(r.ok).toBe(true);
        expect(r.id).toBe('ens_1000_500000');
        expect(r.oferta).toMatchObject({ de: 'Natsu', tipo: 'poder', nivel: 100 });
        expect(r.oferta.item.id).toBeUndefined();
        expect(r.oferta.item.ativa).toBe(false);
    });

    it('recusa item sem nome, tipo inválido e chaves que o Firebase não aceita', () => {
        expect(montarOferta({ professor: 'A', tipo: 'poder', item: { nome: ' ' }, nivel: 1 }).ok).toBe(false);
        expect(montarOferta({ professor: 'A', tipo: 'x', item: poder, nivel: 1 }).ok).toBe(false);
        expect(montarOferta({ professor: 'A', tipo: 'poder', item: { nome: 'x', 'a.b': 1 }, nivel: 1 }).ok).toBe(false);
    });

    it('tira imagem embutida gigante', () => {
        expect(prepararItemEnsinado({ imagemUrl: 'data:' + 'a'.repeat(400000) }).imagemUrl).toBe('');
    });

    it('aceitar copia para poderes com a Maestria do nível, anota a origem e remove a oferta', () => {
        const { oferta } = montarOferta({ professor: 'Natsu', tipo: 'poder', item: poder, nivel: 40 });
        const f = { ensinamentos: { [oferta.id]: oferta, outra: { id: 'outra', item: {}, tipo: 'poder' } } };
        const criado = aceitarOferta(f, oferta, 99);
        expect(f.poderes).toHaveLength(1);
        expect(f.poderes[0]).toMatchObject({ id: 99, maestria: 40, ensinadoPor: 'Natsu', ativa: false });
        expect(f.poderes[0].notasIA).toContain('Aprendido com Natsu');
        expect(criado.id).toBe(99);
        expect(f.ensinamentos[oferta.id]).toBeUndefined();
        expect(f.ensinamentos.outra).toBeDefined();
    });

    it('técnica vai para ataquesElementais, desequipada; ensinamentos some quando esvazia', () => {
        const { oferta } = montarOferta({ professor: 'Rin', tipo: 'tecnica', item: { nome: 'Raio', equipado: true }, nivel: 70 });
        const f = { ensinamentos: { [oferta.id]: oferta } };
        aceitarOferta(f, oferta, 7);
        expect(f.ataquesElementais[0]).toMatchObject({ id: 7, equipado: false });
        expect(f.ataquesElementais[0].notasIA).toContain('nível 70%');
        expect(f.ensinamentos).toEqual({});
        expect(aceitarOferta(f, oferta, 8)).toBeNull();
        expect(f.ataquesElementais).toHaveLength(1);
    });

    it('lista ofertas por tipo, em ordem, ignorando lixo; alunos sem mim', () => {
        const f = { ensinamentos: { a: { id: 'a', tipo: 'poder', em: 2, item: {} }, b: { id: 'b', tipo: 'tecnica', em: 1, item: {} }, c: null } };
        expect(ofertasRecebidas(f, 'poder').map(o => o.id)).toEqual(['a']);
        expect(ofertasRecebidas(f).map(o => o.id)).toEqual(['b', 'a']);
        expect(alunosPossiveis({ Rin: {}, Natsu: {}, Ayla: {} }, 'Natsu')).toEqual(['Ayla', 'Rin']);
        removerOferta(f, 'a'); expect(f.ensinamentos.a).toBeUndefined();
    });
});

describe('ensinar (bordas)', () => {
    it('nível: NaN/texto/negativo/decimal são limitados a 0-100', () => {
        const n = (v) => montarOferta({ professor: 'A', tipo: 'poder', item: { nome: 'x' }, nivel: v }).oferta.nivel;
        expect(n('abc')).toBe(0);
        expect(n(undefined)).toBe(0);
        expect(n(-5)).toBe(0);
        expect(n(49.5)).toBe(50);
        expect(n('70')).toBe(70);
        expect(n(Infinity)).toBe(100);
    });

    it('sem professor, item nulo ou array de item', () => {
        expect(montarOferta({ professor: '', tipo: 'poder', item: poder, nivel: 1 }).ok).toBe(false);
        expect(montarOferta({ professor: 'A', tipo: 'poder', item: null, nivel: 1 }).ok).toBe(false);
        expect(montarOferta({ professor: 'A', tipo: 'poder', item: 'texto', nivel: 1 }).ok).toBe(false);
    });

    it('prepararItemEnsinado não altera o original e mantém imagem http / data pequena', () => {
        const orig = { id: 1, nome: 'x', ativa: true, imagemUrl: 'http://a/b.png' };
        const c = prepararItemEnsinado(orig);
        expect(orig.id).toBe(1);
        expect(orig.ativa).toBe(true);
        expect(c.imagemUrl).toBe('http://a/b.png');
        expect(prepararItemEnsinado({ imagemUrl: 'data:abc' }).imagemUrl).toBe('data:abc');
        expect(prepararItemEnsinado(null)).toMatchObject({ ativa: false, equipado: false });
    });

    it('aceitar: forma ganha fadigaPorUso, categoria desconhecida não ganha maestria, notasIA existentes são preservadas', () => {
        const mk = (item) => montarOferta({ professor: 'N', tipo: 'poder', item, nivel: 30 }).oferta;
        let o = mk({ nome: 'F', categoria: 'forma' });
        let f = { ensinamentos: { [o.id]: o } };
        expect(aceitarOferta(f, o, 1)).toMatchObject({ maestria: 30, fadigaPorUso: 0 });
        o = mk({ nome: 'F', categoria: 'forma', fadigaPorUso: 5 });
        f = { ensinamentos: { [o.id]: o } };
        expect(aceitarOferta(f, o, 1).fadigaPorUso).toBe(5);
        o = mk({ nome: 'X', categoria: 'outra', notasIA: 'nota' });
        f = { ensinamentos: { [o.id]: o } };
        const c = aceitarOferta(f, o, 2);
        expect(c.maestria).toBeUndefined();
        expect(c.notasIA).toBe('Aprendido com N. nota');
    });

    it('aceitar com entradas inválidas devolve null; sem ensinamentos não cria nada', () => {
        expect(aceitarOferta(null, { id: 'a', item: {} }, 1)).toBeNull();
        expect(aceitarOferta({}, null, 1)).toBeNull();
        expect(aceitarOferta({}, { id: 'a' }, 1)).toBeNull();
        const f = {};
        expect(aceitarOferta(f, { id: 'a', item: { nome: 'x' }, tipo: 'poder' }, 1)).toBeNull();
        expect(f.poderes).toBeUndefined();
    });

    it('aceitar não compartilha referência com a oferta', () => {
        const { oferta } = montarOferta({ professor: 'N', tipo: 'poder', item: { nome: 'x', efeitos: [{ a: 1 }] }, nivel: 1 });
        const f = { ensinamentos: { [oferta.id]: oferta } };
        const c = aceitarOferta(f, oferta, 1);
        expect(c.efeitos).not.toBe(oferta.item.efeitos);
        expect(oferta.item.id).toBeUndefined();
    });

    it('removerOferta/ofertasRecebidas/alunosPossiveis toleram entradas inválidas', () => {
        expect(() => removerOferta(null, 'a')).not.toThrow();
        expect(() => removerOferta({ ensinamentos: 'x' }, 'a')).not.toThrow();
        expect(ofertasRecebidas(null)).toEqual([]);
        expect(ofertasRecebidas({ ensinamentos: 'x' })).toEqual([]);
        expect(ofertasRecebidas({ ensinamentos: { a: { tipo: 'poder', item: {} } } })).toEqual([]);
        expect(alunosPossiveis(null, 'x')).toEqual([]);
        expect(alunosPossiveis({}, 'x')).toEqual([]);
        expect(alunosPossiveis({ A: 1 }, 'A')).toEqual([]);
    });
});

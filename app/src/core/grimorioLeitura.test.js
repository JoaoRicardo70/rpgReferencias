import { describe, it, expect } from 'vitest';
import {
    SEM_PASTA, ABAS_GRIMORIO_MESTRE, listaDaFicha, categoriaDoPoder, separarPoderesPorCategoria,
    agruparPorPasta, agruparTecnicasPorElemento, textoEfeito, listarDominios, abaDoPedido,
} from './grimorioLeitura';

describe('ABAS_GRIMORIO_MESTRE', () => {
    it('tem os ids na ordem esperada', () => {
        expect(ABAS_GRIMORIO_MESTRE.map(a => a.id)).toEqual(['habilidade', 'poder', 'forma', 'magias', 'inventario', 'dominios']);
    });
});

describe('listaDaFicha', () => {
    it('mantém array e descarta não objetos', () => {
        expect(listaDaFicha([{ a: 1 }, null, 'x', 3, undefined, { b: 2 }])).toEqual([{ a: 1 }, { b: 2 }]);
    });
    it('converte objeto vindo do Firebase', () => {
        expect(listaDaFicha({ 0: { n: 1 }, 1: null, 2: { n: 2 } })).toEqual([{ n: 1 }, { n: 2 }]);
    });
    it('string, número, null e undefined viram []', () => {
        expect(listaDaFicha('lixo')).toEqual([]);
        expect(listaDaFicha(5)).toEqual([]);
        expect(listaDaFicha(null)).toEqual([]);
        expect(listaDaFicha(undefined)).toEqual([]);
    });
});

describe('categoriaDoPoder', () => {
    it('padrão e inválida viram poder', () => {
        expect(categoriaDoPoder({})).toBe('poder');
        expect(categoriaDoPoder(null)).toBe('poder');
        expect(categoriaDoPoder({ categoria: 'xyz' })).toBe('poder');
        expect(categoriaDoPoder({ categoria: 42 })).toBe('poder');
    });
    it('ignora maiúsculas', () => {
        expect(categoriaDoPoder({ categoria: 'FORMA' })).toBe('forma');
        expect(categoriaDoPoder({ categoria: 'Habilidade' })).toBe('habilidade');
    });
});

describe('separarPoderesPorCategoria', () => {
    it('separa nas três categorias', () => {
        const r = separarPoderesPorCategoria([{ categoria: 'habilidade' }, { categoria: 'forma' }, {}, { categoria: 'x' }, null]);
        expect(r.habilidade).toHaveLength(1);
        expect(r.forma).toHaveLength(1);
        expect(r.poder).toHaveLength(2);
    });
    it('entrada inválida dá grupos vazios', () => {
        expect(separarPoderesPorCategoria('texto')).toEqual({ habilidade: [], poder: [], forma: [] });
    });
});

describe('agruparPorPasta', () => {
    it('habilidade/poder sem pasta devolve null', () => {
        expect(agruparPorPasta([{ nome: 'a' }, { nome: 'b', pasta: '  ' }], 'habilidade')).toBeNull();
        expect(agruparPorPasta([{ nome: 'a' }], 'poder')).toBeNull();
    });
    it('forma sempre agrupa, mesmo sem pasta', () => {
        const r = agruparPorPasta([{ nome: 'a' }], 'forma');
        expect(r).toEqual([{ nome: SEM_PASTA, itens: [{ nome: 'a' }] }]);
    });
    it('agrupa com ordem pt-BR e Sem Pasta por último', () => {
        const r = agruparPorPasta([{ nome: '1' }, { nome: '2', pasta: 'Zeta' }, { nome: '3', pasta: 'Água' }, { nome: '4', pasta: 'Zeta' }], 'poder');
        expect(r.map(g => g.nome)).toEqual(['Água', 'Zeta', 'Sem Pasta']);
        expect(r[1].itens).toHaveLength(2);
    });
    it('lista vazia: forma dá [], poder dá null', () => {
        expect(agruparPorPasta([], 'forma')).toEqual([]);
        expect(agruparPorPasta(null, 'poder')).toBeNull();
    });
});

describe('agruparTecnicasPorElemento', () => {
    it('padrão Neutro e ordem alfabética', () => {
        const r = agruparTecnicasPorElemento([{ nome: 'a', elemento: 'Fogo' }, { nome: 'b' }, { nome: 'c', elemento: ' ' }, { nome: 'd', elemento: 'Água' }]);
        expect(r.map(g => g.elemento)).toEqual(['Água', 'Fogo', 'Neutro']);
        expect(r[2].itens).toHaveLength(2);
    });
    it('entradas inválidas dão []', () => {
        expect(agruparTecnicasPorElemento(null)).toEqual([]);
        expect(agruparTecnicasPorElemento('x')).toEqual([]);
    });
});

describe('textoEfeito', () => {
    it('formata atributo, propriedade e valor', () => {
        expect(textoEfeito({ atributo: 'energia_esp', propriedade: 'mgeral', valor: 2 })).toBe('[ENERGIA ESP] MGERAL: +2');
    });
    it('faltando campos usa 0 e vazio', () => {
        expect(textoEfeito({})).toBe('[] : +0');
    });
    it('não objeto devolve vazio', () => {
        expect(textoEfeito(null)).toBe('');
        expect(textoEfeito('x')).toBe('');
    });
});

describe('listarDominios', () => {
    it('só entradas com nivel, ordenadas', () => {
        const r = listarDominios({ Fogo: { nivel: 3, categoria: 'elemental' }, Água: { nivel: '2' }, lixo: { x: 1 }, nulo: null, str: 'a' });
        expect(r).toEqual([
            { nome: 'Água', nivel: 2, categoria: '' },
            { nome: 'Fogo', nivel: 3, categoria: 'elemental' },
        ]);
    });
    it('nivel inválido vira 0; entrada inválida dá []', () => {
        expect(listarDominios({ A: { nivel: 'abc' } })[0].nivel).toBe(0);
        expect(listarDominios(null)).toEqual([]);
        expect(listarDominios('x')).toEqual([]);
    });
});

describe('abaDoPedido', () => {
    it('poder usa a categoria', () => {
        expect(abaDoPedido({ tipo: 'poder', objeto: { categoria: 'forma' } })).toBe('forma');
        expect(abaDoPedido({ tipo: 'poder', objeto: {} })).toBe('poder');
        expect(abaDoPedido({ tipo: 'poder' })).toBe('poder');
    });
    it('magia e item', () => {
        expect(abaDoPedido({ tipo: 'magia' })).toBe('magias');
        expect(abaDoPedido({ tipo: 'item' })).toBe('inventario');
    });
    it('outro tipo ou nulo dá null', () => {
        expect(abaDoPedido({ tipo: 'outro' })).toBeNull();
        expect(abaDoPedido(null)).toBeNull();
    });
});

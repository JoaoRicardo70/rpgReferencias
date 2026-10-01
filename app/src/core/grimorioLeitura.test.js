import { describe, it, expect } from 'vitest';
import {
    SEM_PASTA, ABAS_LIVRO_ENTIDADE, listaDaFicha, categoriaDoPoder, separarPoderesPorCategoria,
    agruparPorPasta, agruparTecnicasPorElemento, textoEfeito, abaDoPedido,
} from './grimorioLeitura';
import * as modulo from './grimorioLeitura';

describe('ABAS_LIVRO_ENTIDADE', () => {
    it('tem os ids na ordem esperada, com a Ficha Definitiva primeiro', () => {
        expect(ABAS_LIVRO_ENTIDADE.map(a => a.id)).toEqual(['ficha', 'habilidade', 'poder', 'forma', 'magias', 'inventario']);
    });
    it('toda aba tem ícone e nome, e não existe aba de domínios', () => {
        ABAS_LIVRO_ENTIDADE.forEach(a => { expect(a.icone).toBeTruthy(); expect(a.nome).toBeTruthy(); });
        expect(ABAS_LIVRO_ENTIDADE.some(a => a.id === 'dominios')).toBe(false);
    });
    it('a primeira aba é a Ficha Definitiva', () => {
        expect(ABAS_LIVRO_ENTIDADE[0].nome).toBe('Ficha Definitiva');
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

describe('exports removidos', () => {
    it('listarDominios e ABAS_GRIMORIO_MESTRE não existem mais', () => {
        expect(modulo.listarDominios).toBeUndefined();
        expect(modulo.ABAS_GRIMORIO_MESTRE).toBeUndefined();
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

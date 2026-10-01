import { describe, it, expect } from 'vitest';
import { ABAS_LIVRO_ENTIDADE, categoriaDoPoder, abaDoPedido } from './grimorioLeitura';
import * as modulo from './grimorioLeitura';

describe('ABAS_LIVRO_ENTIDADE', () => {
    it('tem exatamente dois botões, na ordem: ficha e grimorio', () => {
        expect(ABAS_LIVRO_ENTIDADE.map(a => a.id)).toEqual(['ficha', 'grimorio']);
    });
    it('a Ficha Definitiva vem primeiro, com ícone 📕', () => {
        expect(ABAS_LIVRO_ENTIDADE[0]).toEqual({ id: 'ficha', icone: '📕', nome: 'Ficha Definitiva' });
    });
    it('o Grimório Místico vem em segundo, com ícone 📖 e o nome completo', () => {
        expect(ABAS_LIVRO_ENTIDADE[1]).toEqual({ id: 'grimorio', icone: '📖', nome: 'Grimório Místico (Poderes & Elementos)' });
    });
    it('toda aba tem id, ícone e nome preenchidos e os ids são únicos', () => {
        ABAS_LIVRO_ENTIDADE.forEach(a => { expect(a.id).toBeTruthy(); expect(a.icone).toBeTruthy(); expect(a.nome).toBeTruthy(); });
        expect(new Set(ABAS_LIVRO_ENTIDADE.map(a => a.id)).size).toBe(ABAS_LIVRO_ENTIDADE.length);
    });
    it('não existem mais as abas antigas (habilidade, poder, forma, magias, inventario, dominios)', () => {
        const ids = ABAS_LIVRO_ENTIDADE.map(a => a.id);
        ['habilidade', 'poder', 'forma', 'magias', 'inventario', 'dominios'].forEach(id => expect(ids).not.toContain(id));
    });
});

describe('exports do módulo', () => {
    it('exporta somente ABAS_LIVRO_ENTIDADE, categoriaDoPoder e abaDoPedido', () => {
        expect(Object.keys(modulo).sort()).toEqual(['ABAS_LIVRO_ENTIDADE', 'abaDoPedido', 'categoriaDoPoder']);
    });
    it('os helpers de leitura removidos não existem mais', () => {
        ['SEM_PASTA', 'listaDaFicha', 'separarPoderesPorCategoria', 'agruparPorPasta', 'agruparTecnicasPorElemento', 'textoEfeito']
            .forEach(nome => expect(modulo[nome]).toBeUndefined());
    });
});

describe('categoriaDoPoder', () => {
    it('devolve a categoria quando é habilidade, poder ou forma', () => {
        expect(categoriaDoPoder({ categoria: 'habilidade' })).toBe('habilidade');
        expect(categoriaDoPoder({ categoria: 'poder' })).toBe('poder');
        expect(categoriaDoPoder({ categoria: 'forma' })).toBe('forma');
    });
    it('ignora maiúsculas/minúsculas', () => {
        expect(categoriaDoPoder({ categoria: 'FORMA' })).toBe('forma');
        expect(categoriaDoPoder({ categoria: 'Habilidade' })).toBe('habilidade');
    });
    it('sem categoria, objeto vazio, null e undefined caem em poder', () => {
        expect(categoriaDoPoder({})).toBe('poder');
        expect(categoriaDoPoder(null)).toBe('poder');
        expect(categoriaDoPoder(undefined)).toBe('poder');
        expect(categoriaDoPoder({ categoria: '' })).toBe('poder');
    });
    it('categoria desconhecida ou de tipo estranho cai em poder', () => {
        expect(categoriaDoPoder({ categoria: 'xyz' })).toBe('poder');
        expect(categoriaDoPoder({ categoria: 42 })).toBe('poder');
    });
});

describe('abaDoPedido', () => {
    it('pedido de poder usa a categoria do objeto', () => {
        expect(abaDoPedido({ tipo: 'poder', objeto: { categoria: 'habilidade' } })).toBe('habilidade');
        expect(abaDoPedido({ tipo: 'poder', objeto: { categoria: 'forma' } })).toBe('forma');
        expect(abaDoPedido({ tipo: 'poder', objeto: { categoria: 'poder' } })).toBe('poder');
    });
    it('pedido de poder sem categoria (ou sem objeto) cai em poder', () => {
        expect(abaDoPedido({ tipo: 'poder', objeto: {} })).toBe('poder');
        expect(abaDoPedido({ tipo: 'poder' })).toBe('poder');
    });
    it('magia vai para magias e item para inventario', () => {
        expect(abaDoPedido({ tipo: 'magia' })).toBe('magias');
        expect(abaDoPedido({ tipo: 'item' })).toBe('inventario');
    });
    it('tipo desconhecido, null e undefined devolvem null', () => {
        expect(abaDoPedido({ tipo: 'outro' })).toBeNull();
        expect(abaDoPedido({})).toBeNull();
        expect(abaDoPedido(null)).toBeNull();
        expect(abaDoPedido(undefined)).toBeNull();
    });
});

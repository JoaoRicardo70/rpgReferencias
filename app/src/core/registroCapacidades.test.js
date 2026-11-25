import { describe, it, expect } from 'vitest';
import {
    indexarCapacidades, chaveDaCapacidade, jogadorVeCapacidade, liberacaoDe, montarLiberacao, montarPedido, pedidosPendentes,
    jaPediu, totalPedidosDe, jogadorJaTem, filtrarCapacidades,
} from './registroCapacidades';

const mesa = () => ({
    Lohen: { poderes: [{ id: 'p1', nome: 'Corte Lunar', categoria: 'habilidade', descricao: 'Um corte.' }, { id: 'p2', nome: 'Vazio', categoria: 'singularidade' }], ataquesElementais: [{ id: 't1', nome: 'Bola de Fogo' }] },
    Rappa: { isNPC: true, poderes: [{ nome: 'Sem Id' }, { id: 'x', nome: '   ' }, null], ataquesElementais: 'lixo' },
    Vazia: null,
});

describe('registroCapacidades - índice', () => {
    it('lista Habilidades/Poderes e Técnicas de todas as fichas, inclusive NPCs, ignorando lixo', () => {
        const lista = indexarCapacidades(mesa());
        expect(lista.map(c => c.nome).sort()).toEqual(['Bola de Fogo', 'Corte Lunar', 'Sem Id', 'Vazio']);
        expect(lista.find(c => c.nome === 'Sem Id').ehNpc).toBe(true);
        expect(lista.find(c => c.nome === 'Bola de Fogo').tipo).toBe('tecnica');
        expect(lista.find(c => c.nome === 'Corte Lunar').descricao).toBe('Um corte.');
    });
    it('Singularidade aparece, mas não é copiável', () => {
        const lista = indexarCapacidades(mesa());
        expect(lista.find(c => c.nome === 'Vazio').copiavel).toBe(false);
        expect(lista.find(c => c.nome === 'Corte Lunar').copiavel).toBe(true);
    });
    it('chaves são únicas e seguras pro Firebase', () => {
        const chaves = indexarCapacidades(mesa()).map(c => c.chave);
        expect(new Set(chaves).size).toBe(chaves.length);
        chaves.forEach(k => expect(k).not.toMatch(/[.#$[\]/]/));
        expect(chaveDaCapacidade('Rappa #2', 'poder', { id: 'a.b' }, 0)).not.toMatch(/[.#$[\]/]/);
    });
    it('sem id, reordenar ou apagar outro item NÃO muda a chave (usa o nome, não a posição)', () => {
        const a = indexarCapacidades({ X: { poderes: [{ nome: 'A' }, { nome: 'B' }] } }).find(c => c.nome === 'B').chave;
        const b = indexarCapacidades({ X: { poderes: [{ nome: 'B' }] } }).find(c => c.nome === 'B').chave;
        const c = indexarCapacidades({ X: { poderes: [{ nome: 'B' }, { nome: 'A' }] } }).find(c2 => c2.nome === 'B').chave;
        expect(a).toBe(b); expect(a).toBe(c);
        const dup = indexarCapacidades({ X: { poderes: [{ nome: 'B' }, { nome: 'B' }] } }).map(c2 => c2.chave);
        expect(new Set(dup).size).toBe(2);
    });
    it('entrada vazia não quebra', () => {
        expect(indexarCapacidades(null)).toEqual([]);
        expect(indexarCapacidades({})).toEqual([]);
    });
});

describe('registroCapacidades - liberação e pedidos', () => {
    it('jogador só vê o liberado a ele ou a todos', () => {
        const lib = { a: { todos: true }, b: { para: { Lohen: true } }, c: { para: { Outro: true } } };
        expect(jogadorVeCapacidade(lib, 'a', 'Qualquer')).toBe(true);
        expect(jogadorVeCapacidade(lib, 'b', 'Lohen')).toBe(true);
        expect(jogadorVeCapacidade(lib, 'b', 'Natsu')).toBe(false);
        expect(jogadorVeCapacidade(lib, 'c', 'Lohen')).toBe(false);
        expect(jogadorVeCapacidade(lib, 'sem', 'Lohen')).toBe(false);
        expect(jogadorVeCapacidade(null, 'a', 'Lohen')).toBe(false);
    });
    it('montarLiberacao: todos, lista ou nada', () => {
        expect(montarLiberacao({ todos: true, para: ['A'] })).toEqual({ todos: true });
        expect(montarLiberacao({ todos: false, para: ['A', 'B'] })).toEqual({ para: { A: true, B: true } });
        expect(montarLiberacao({ todos: false, para: [] })).toBeNull();
        expect(montarLiberacao({})).toBeNull();
    });
    it('liberacaoDe lê os dois formatos', () => {
        expect(liberacaoDe({ x: { todos: true } }, 'x')).toEqual({ todos: true, para: [] });
        expect(liberacaoDe({ x: { para: { A: true, B: false } } }, 'x')).toEqual({ todos: false, para: ['A'] });
        expect(liberacaoDe({}, 'x')).toEqual({ todos: false, para: [] });
    });
    it('pedidos: monta, lista em ordem, conta e detecta duplicado', () => {
        const p1 = montarPedido({ de: 'Lohen', chave: 'k1', agora: 100, sorteio: () => 0.5 });
        const p2 = montarPedido({ de: 'Lohen', chave: 'k2', agora: 50, sorteio: () => 0.1 });
        expect(montarPedido({ de: '', chave: 'k' })).toBeNull();
        const mapa = { [p1.id]: p1, [p2.id]: p2, lixo: { id: 'ruim id', de: 'x', chave: 'y' } };
        expect(pedidosPendentes(mapa).map(p => p.chave)).toEqual(['k2', 'k1']);
        expect(jaPediu(mapa, 'Lohen', 'k1')).toBe(true);
        expect(jaPediu(mapa, 'Natsu', 'k1')).toBe(false);
        expect(totalPedidosDe(mapa, 'Lohen')).toBe(2);
        expect(pedidosPendentes(null)).toEqual([]);
    });
    it('jogadorJaTem compara pelo nome, sem ligar pra maiúsculas', () => {
        const cap = { tipo: 'poder', nome: 'Corte Lunar' };
        expect(jogadorJaTem({ poderes: [{ nome: 'corte lunar' }] }, cap)).toBe(true);
        expect(jogadorJaTem({ poderes: [{ nome: 'Outro' }] }, cap)).toBe(false);
        expect(jogadorJaTem({ ataquesElementais: [{ nome: 'Fogo' }] }, { tipo: 'tecnica', nome: 'Fogo' })).toBe(true);
        expect(jogadorJaTem(null, cap)).toBe(false);
    });
    it('filtrarCapacidades busca por nome, dono e categoria', () => {
        const lista = indexarCapacidades(mesa());
        expect(filtrarCapacidades(lista, 'corte')).toHaveLength(1);
        expect(filtrarCapacidades(lista, 'rappa')).toHaveLength(1);
        expect(filtrarCapacidades(lista, '')).toHaveLength(lista.length);
    });
});

import { filtrarCapacidades as filtrar, categoriasPresentes } from './registroCapacidades';
describe('registroCapacidades - filtros do Grimório Supremo', () => {
    const lista = indexarCapacidades(mesa());
    it('filtra por categoria, dono e tipo de dono', () => {
        expect(filtrar(lista, { categoria: 'tecnica' }).map(c => c.nome)).toEqual(['Bola de Fogo']);
        expect(filtrar(lista, { dono: 'Lohen' })).toHaveLength(3);
        expect(filtrar(lista, { origem: 'npc' }).map(c => c.nome)).toEqual(['Sem Id']);
        expect(filtrar(lista, { origem: 'jogador' })).toHaveLength(3);
        expect(filtrar(lista, { categoria: 'todas' })).toHaveLength(lista.length);
    });
    it('filtra por liberação e combina filtros', () => {
        const k = lista.find(c => c.nome === 'Corte Lunar').chave;
        const liberacoes = { [k]: { todos: true } };
        expect(filtrar(lista, { liberacao: 'liberado', liberacoes }).map(c => c.nome)).toEqual(['Corte Lunar']);
        expect(filtrar(lista, { liberacao: 'oculto', liberacoes })).toHaveLength(lista.length - 1);
        expect(filtrar(lista, { liberacao: 'liberado', liberacoes, dono: 'Rappa' })).toHaveLength(0);
        expect(filtrar(lista, { busca: 'fogo', origem: 'jogador' })).toHaveLength(1);
    });
    it('categoriasPresentes conta por categoria', () => {
        const cats = categoriasPresentes(lista);
        expect(cats.reduce((n, c) => n + c.total, 0)).toBe(lista.length);
        expect(cats.find(c => c.id === 'tecnica').total).toBe(1);
    });
});

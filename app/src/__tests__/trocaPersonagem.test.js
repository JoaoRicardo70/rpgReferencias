import { describe, it, expect } from 'vitest';
import { listarPersonagensParaTroca, registrarRecente, recentesValidos, MAX_RECENTES } from '../core/trocaPersonagem.js';

const mesa = {
    Zeca: { nome: 'z' },
    'Álvaro': { nome: 'a' },
    Goblin: { isNPC: true },
    'Dragão': { bio: { mesa: 'npc' } },
    Heroi: { bio: { mesa: 'jogador' } },
    Vazio: null,
    Texto: 'abc',
};

describe('listarPersonagensParaTroca', () => {
    it('separa NPCs de jogadores, ordena e ignora entradas inválidas', () => {
        const r = listarPersonagensParaTroca(mesa, 'Nenhum');
        expect(r.npcs.map(p => p.nome)).toEqual(['Dragão', 'Goblin']);
        expect(r.jogadores.map(p => p.nome)).toEqual(['Álvaro', 'Heroi', 'Zeca']);
        expect(r.npcs.every(p => p.npc === true)).toBe(true);
        expect(r.jogadores.every(p => p.npc === false)).toBe(true);
        expect(r.jogadores[0].ficha).toBe(mesa['Álvaro']);
    });
    it('exclui o personagem atual', () => {
        const r = listarPersonagensParaTroca(mesa, 'Goblin');
        expect(r.npcs.map(p => p.nome)).toEqual(['Dragão']);
    });
    it('busca sem acento e sem caixa', () => {
        expect(listarPersonagensParaTroca(mesa, '', 'alvaro').jogadores.map(p => p.nome)).toEqual(['Álvaro']);
        expect(listarPersonagensParaTroca(mesa, '', 'DRAGAO').npcs.map(p => p.nome)).toEqual(['Dragão']);
        expect(listarPersonagensParaTroca(mesa, '', 'ÁLV').jogadores.length).toBe(1);
    });
    it('busca só com espaços é ignorada; sem resultado devolve listas vazias', () => {
        expect(listarPersonagensParaTroca(mesa, '', '   ').jogadores.length).toBe(3);
        expect(listarPersonagensParaTroca(mesa, '', 'xyz')).toEqual({ npcs: [], jogadores: [] });
    });
    it('personagens null/undefined não lançam', () => {
        expect(listarPersonagensParaTroca(null, 'a')).toEqual({ npcs: [], jogadores: [] });
        expect(listarPersonagensParaTroca(undefined, 'a', undefined)).toEqual({ npcs: [], jogadores: [] });
    });
});

describe('registrarRecente', () => {
    it('coloca no começo sem repetir', () => {
        expect(registrarRecente(['a', 'b', 'c'], 'b')).toEqual(['b', 'a', 'c']);
    });
    it('limita a MAX_RECENTES', () => {
        const base = ['1', '2', '3', '4', '5', '6'];
        const r = registrarRecente(base, 'novo');
        expect(r.length).toBe(MAX_RECENTES);
        expect(r[0]).toBe('novo');
        expect(r).not.toContain('6');
    });
    it('entrada inválida vira lista nova; filtra não-strings', () => {
        expect(registrarRecente(null, 'a')).toEqual(['a']);
        expect(registrarRecente('x', 'a')).toEqual(['a']);
        expect(registrarRecente(['a', 5, null, 'b'], 'c')).toEqual(['c', 'a', 'b']);
    });
    it('não muta o array original', () => {
        const base = Object.freeze(['a']);
        expect(() => registrarRecente(base, 'b')).not.toThrow();
    });
});

describe('recentesValidos', () => {
    it('mantém só os que existem e não são o atual, na ordem', () => {
        expect(recentesValidos(['Zeca', 'Fantasma', 'Goblin', 'Heroi'], mesa, 'Goblin')).toEqual(['Zeca', 'Heroi']);
    });
    it('descarta entradas cujo valor não é objeto', () => {
        expect(recentesValidos(['Texto', 'Vazio'], mesa, 'x')).toEqual([]);
    });
    it('entradas inválidas', () => {
        expect(recentesValidos(null, mesa, 'x')).toEqual([]);
        expect(recentesValidos(['Zeca'], null, 'x')).toEqual([]);
    });
});

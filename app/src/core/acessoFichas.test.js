import { describe, it, expect } from 'vitest';
import { listarFichasParaAcesso, nomeFichaDoToken, atorValorDoToken } from './acessoFichas';

const npc = (extra = {}) => ({ isNPC: true, ...extra });
const naCena = (cena, x = 1, y = 1) => ({ posicoes: { [cena]: { x, y, z: 0, cenaId: cena } } });

const personagens = {
    Rappa: npc(naCena('c1')),
    Muscular: npc(),
    Toga: npc(),
    Lohen: { ...naCena('c1') },
    natsu: {},
    Ámbar: { bio: { mesa: 'npc' } },
};

describe('listarFichasParaAcesso', () => {
    const r = listarFichasParaAcesso({ personagens, cenaId: 'c1' });

    it('separa quem está na cena de NPCs e jogadores fora dela', () => {
        expect(r.naCena.map(i => i.chave).sort()).toEqual(['n:Lohen', 'n:Rappa']);
        expect(r.npcs.map(i => i.chave).sort()).toEqual(['n:Muscular', 'n:Toga', 'n:Ámbar']);
        expect(r.jogadores.map(i => i.chave)).toEqual(['n:natsu']);
    });
    it('NPC com ficha na cena permite Atuar como; jogador na cena não', () => {
        expect(r.naCena.find(i => i.chave === 'n:Rappa').atorValor).toBe('n:Rappa');
        expect(r.naCena.find(i => i.chave === 'n:Lohen').atorValor).toBeNull();
    });
    it('cada item abre a própria ficha', () => {
        expect(r.naCena.find(i => i.chave === 'n:Rappa').nomeFicha).toBe('Rappa');
    });
    it('busca sem acento e sem diferenciar maiúsculas', () => {
        const b = listarFichasParaAcesso({ personagens, cenaId: 'c1', busca: 'ambar' });
        expect(b.npcs.map(i => i.chave)).toEqual(['n:Ámbar']);
        const m = listarFichasParaAcesso({ personagens, cenaId: 'c1', busca: 'MUSC' });
        expect(m.npcs.map(i => i.chave)).toEqual(['n:Muscular']);
    });
    it('aguenta entradas vazias ou inválidas', () => {
        expect(listarFichasParaAcesso()).toEqual({ naCena: [], npcs: [], jogadores: [] });
        const x = listarFichasParaAcesso({ personagens: { a: null, b: 'x' } });
        expect(x).toEqual({ naCena: [], npcs: [], jogadores: [] });
    });
});

describe('nomeFichaDoToken / atorValorDoToken', () => {
    it('personagem: a própria ficha; Atuar só para NPC', () => {
        expect(nomeFichaDoToken({ id: 'Rappa' }, personagens)).toBe('Rappa');
        expect(atorValorDoToken({ id: 'Rappa' }, personagens)).toBe('n:Rappa');
        expect(atorValorDoToken({ id: 'Lohen' }, personagens)).toBeNull();
        expect(nomeFichaDoToken({ id: 'Nada' }, personagens)).toBeNull();
    });
    it('sem inspeção: null', () => {
        expect(nomeFichaDoToken(null, personagens)).toBeNull();
        expect(atorValorDoToken(null, personagens)).toBeNull();
    });
});

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
const dummies = {
    d1: { nome: 'Muscular #1', fichaOrigem: 'Muscular', cenaId: 'c1' },
    d2: { nome: 'Boneco', cenaId: 'c1' },
    d3: { nome: 'Toga #1', fichaOrigem: 'Toga', cenaId: 'outra' },
    d4: { nome: 'Fantasma #1', fichaOrigem: 'Sumiu', cenaId: 'c1' },
};

describe('listarFichasParaAcesso', () => {
    const r = listarFichasParaAcesso({ personagens, dummies, cenaId: 'c1' });

    it('separa quem está na cena de NPCs e jogadores fora dela', () => {
        expect(r.naCena.map(i => i.chave).sort()).toEqual(['d:d1', 'd:d2', 'd:d4', 'n:Lohen', 'n:Rappa']);
        expect(r.npcs.map(i => i.chave).sort()).toEqual(['n:Muscular', 'n:Toga', 'n:Ámbar']);
        expect(r.jogadores.map(i => i.chave)).toEqual(['n:natsu']);
    });
    it('token da Gaveta abre a ficha de origem e permite Atuar como', () => {
        const t = r.naCena.find(i => i.chave === 'd:d1');
        expect(t.nomeFicha).toBe('Muscular');
        expect(t.atorValor).toBe('d:d1');
        expect(t.dummieId).toBe('d1');
    });
    it('token sem ficha (boneco ou ficha apagada) não abre ficha nem permite Atuar', () => {
        ['d:d2', 'd:d4'].forEach(c => {
            const t = r.naCena.find(i => i.chave === c);
            expect(t.nomeFicha).toBeNull();
            expect(t.atorValor).toBeNull();
        });
    });
    it('NPC com ficha na cena permite Atuar como; jogador na cena não', () => {
        expect(r.naCena.find(i => i.chave === 'n:Rappa').atorValor).toBe('n:Rappa');
        expect(r.naCena.find(i => i.chave === 'n:Lohen').atorValor).toBeNull();
    });
    it('não lista tokens de outra cena', () => {
        expect(r.naCena.some(i => i.chave === 'd:d3')).toBe(false);
    });
    it('busca sem acento e sem diferenciar maiúsculas, também pelo nome da ficha de origem', () => {
        const b = listarFichasParaAcesso({ personagens, dummies, cenaId: 'c1', busca: 'ambar' });
        expect(b.npcs.map(i => i.chave)).toEqual(['n:Ámbar']);
        const m = listarFichasParaAcesso({ personagens, dummies, cenaId: 'c1', busca: 'MUSC' });
        expect(m.naCena.map(i => i.chave)).toEqual(['d:d1']);
        expect(m.npcs.map(i => i.chave)).toEqual(['n:Muscular']);
    });
    it('aguenta entradas vazias ou inválidas', () => {
        expect(listarFichasParaAcesso()).toEqual({ naCena: [], npcs: [], jogadores: [] });
        const x = listarFichasParaAcesso({ personagens: { a: null, b: 'x' }, dummies: { z: null } });
        expect(x).toEqual({ naCena: [], npcs: [], jogadores: [] });
    });
});

describe('nomeFichaDoToken / atorValorDoToken', () => {
    it('personagem: a própria ficha; Atuar só para NPC', () => {
        expect(nomeFichaDoToken({ id: 'Rappa', isDummie: false }, personagens)).toBe('Rappa');
        expect(atorValorDoToken({ id: 'Rappa', isDummie: false }, personagens)).toBe('n:Rappa');
        expect(atorValorDoToken({ id: 'Lohen', isDummie: false }, personagens)).toBeNull();
        expect(nomeFichaDoToken({ id: 'Nada', isDummie: false }, personagens)).toBeNull();
    });
    it('token da Gaveta: a ficha de origem', () => {
        const i = { id: 'd1', isDummie: true, ficha: dummies.d1 };
        expect(nomeFichaDoToken(i, personagens)).toBe('Muscular');
        expect(atorValorDoToken(i, personagens)).toBe('d:d1');
    });
    it('token sem origem ou sem ficha: null', () => {
        expect(nomeFichaDoToken({ id: 'd2', isDummie: true, ficha: dummies.d2 }, personagens)).toBeNull();
        expect(atorValorDoToken({ id: 'd4', isDummie: true, ficha: dummies.d4 }, personagens)).toBeNull();
        expect(nomeFichaDoToken(null, personagens)).toBeNull();
        expect(atorValorDoToken(null, personagens)).toBeNull();
    });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./firebase-sync', () => ({
    salvarCamposPersonagem: vi.fn(),
    salvarDummie: vi.fn()
}));

import { criarPosGolpe } from './posGolpe';

const personagem = (ficha = {}, nome = 'Goku') => ({ isPersonagem: true, personagemNome: nome, nome, ficha });
const dummie = (extra = {}) => ({ isPersonagem: false, nome: 'Boneco', vida: 100, ...extra });
const comReflexo = (reflexo) => ({
    mana: { base: 1000000, atual: 1000000 },
    poderes: [{ id: 'p1', nome: 'Espelho', ativa: true, reflexo }],
});

beforeEach(() => { vi.clearAllMocks(); });

describe('posGolpe - criarPosGolpe aoAcertar', () => {
    const lista = [{ tipo: 'curarAtacante', modo: 'fixo', valor: 5, origem: 'Poder' }];
    it('sem aplicar nenhum alvo: lista vazia', () => {
        expect(criarPosGolpe({ aoAcertar: lista }).resultado().aoAcertar).toEqual([]);
    });
    it('sem aoAcertar informado: [] mesmo com dano', () => {
        const p = criarPosGolpe();
        p.aplicar('d', dummie(), 10);
        expect(p.resultado().aoAcertar).toEqual([]);
    });
    it('alvo com dano > 0 devolve a lista', () => {
        const p = criarPosGolpe({ aoAcertar: lista });
        p.aplicar('d', dummie(), 10);
        expect(p.resultado().aoAcertar).toEqual(lista);
    });
    it('dano 0 e dano negativo nao liberam', () => {
        const p = criarPosGolpe({ aoAcertar: lista });
        p.aplicar('d', dummie(), 0);
        p.aplicar('e', dummie(), -5);
        expect(p.resultado().aoAcertar).toEqual([]);
    });
    it('reflexo devolveu tudo (dano 0) => []', () => {
        const alvo = personagem(comReflexo({ modo: 'devolver', automatico: true }));
        const p = criarPosGolpe({ aoAcertar: lista, danoOriginal: 1000, nomeAtacante: 'V' });
        expect(p.aplicar('a', alvo, 1000)).toBe(0);
        expect(p.resultado().aoAcertar).toEqual([]);
    });
    it('reflexo que compartilha (alvo ainda sofre) libera', () => {
        const alvo = personagem(comReflexo({ modo: 'compartilhar', automatico: true }));
        const p = criarPosGolpe({ aoAcertar: lista, danoOriginal: 1000 });
        p.aplicar('a', alvo, 1000);
        expect(p.resultado().aoAcertar).toEqual(lista);
    });
    it('varios alvos: a lista vem uma vez so (nao multiplicada)', () => {
        const p = criarPosGolpe({ aoAcertar: lista });
        p.aplicar('a', dummie(), 10);
        p.aplicar('b', dummie(), 10);
        p.aplicar('c', personagem(), 10);
        expect(p.resultado().aoAcertar).toHaveLength(1);
    });
    it('um alvo sem dano e outro com dano libera', () => {
        const p = criarPosGolpe({ aoAcertar: lista });
        p.aplicar('a', dummie(), 0);
        p.aplicar('b', dummie(), 3);
        expect(p.resultado().aoAcertar).toEqual(lista);
    });
    it('alvo nulo nao conta como acerto', () => {
        const p = criarPosGolpe({ aoAcertar: lista });
        p.aplicar('a', null, 99);
        expect(p.resultado().aoAcertar).toEqual([]);
    });
    it('critico e propagado (true e padrao false)', () => {
        expect(criarPosGolpe({ critico: true }).resultado().critico).toBe(true);
        expect(criarPosGolpe().resultado().critico).toBe(false);
    });
});

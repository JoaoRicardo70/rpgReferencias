import { describe, it, expect, vi } from 'vitest';
import { poderVivoDoDummie, dummiesComPoderDesatualizado, camposPosicaoNaCena } from './gavetaNpc';

// O Poder vem de um campo falso da ficha (__poder) para o teste controlar o número.
vi.mock('./disputaPoder.js', () => ({
    getPoderParaDisputa: vi.fn((ficha) => (ficha && ficha.__poder !== undefined ? ficha.__poder : null)),
}));
vi.mock('./engine.js', () => ({ BASE_CA: 12, calcularCA: vi.fn(() => 10) }));

const ficha = (poder) => ({ isNPC: true, __poder: poder });

describe('poderVivoDoDummie', () => {
    it('devolve o Poder da ficha com 2 casas', () => {
        expect(poderVivoDoDummie({ fichaOrigem: 'Boss' }, ficha(1234.5678), 1)).toBe(1234.57);
    });
    it('null sem fichaOrigem, sem ficha ou desvinculado', () => {
        expect(poderVivoDoDummie({ nome: 'x' }, ficha(10), 1)).toBeNull();
        expect(poderVivoDoDummie({ fichaOrigem: 'Boss' }, null, 1)).toBeNull();
        expect(poderVivoDoDummie({ fichaOrigem: 'Boss', poderDesvinculado: true }, ficha(10), 1)).toBeNull();
        expect(poderVivoDoDummie(null, ficha(10), 1)).toBeNull();
    });
    it('null quando a ficha não tem Poder calculável', () => {
        expect(poderVivoDoDummie({ fichaOrigem: 'Boss' }, { isNPC: true }, 1)).toBeNull();
    });
});

describe('dummiesComPoderDesatualizado', () => {
    const personagens = { Boss: ficha(15000000), Outro: ficha(500) };

    it('acha o token cujo Poder ficou diferente da ficha', () => {
        const r = dummiesComPoderDesatualizado({ d1: { nome: 'Boss #1', fichaOrigem: 'Boss', poderCalculado: 1000 } }, personagens, 1);
        expect(r).toHaveLength(1);
        expect(r[0].id).toBe('d1');
        expect(r[0].dummie.poderCalculado).toBe(15000000);
        expect(r[0].dummie.nome).toBe('Boss #1');
    });
    it('preenche o token que ainda não tem Poder', () => {
        const r = dummiesComPoderDesatualizado({ d1: { nome: 'Boss #1', fichaOrigem: 'Boss' } }, personagens, 1);
        expect(r).toHaveLength(1);
        expect(r[0].dummie.poderCalculado).toBe(15000000);
    });
    it('não mexe no que já está igual (nem por arredondamento)', () => {
        expect(dummiesComPoderDesatualizado({ d1: { fichaOrigem: 'Boss', poderCalculado: 15000000 } }, personagens, 1)).toEqual([]);
        expect(dummiesComPoderDesatualizado({ d1: { fichaOrigem: 'Boss', poderCalculado: 15000000.004 } }, personagens, 1)).toEqual([]);
    });
    it('ignora token sem ficha de origem, com ficha apagada ou desvinculado à mão', () => {
        const dummies = {
            a: { nome: 'Boneco', poderCalculado: 5 },
            b: { fichaOrigem: 'Sumiu', poderCalculado: 5 },
            c: { fichaOrigem: 'Boss', poderCalculado: 5, poderDesvinculado: true },
        };
        expect(dummiesComPoderDesatualizado(dummies, personagens, 1)).toEqual([]);
    });
    it('trata vários tokens da mesma ficha e entradas inválidas', () => {
        const dummies = { a: { fichaOrigem: 'Boss', poderCalculado: 1 }, b: { fichaOrigem: 'Boss', poderCalculado: 2 }, c: null, d: { fichaOrigem: 'Outro', poderCalculado: 500 } };
        const r = dummiesComPoderDesatualizado(dummies, personagens, 1);
        expect(r.map(x => x.id).sort()).toEqual(['a', 'b']);
        expect(dummiesComPoderDesatualizado(null, null, 1)).toEqual([]);
        expect(dummiesComPoderDesatualizado({ a: { fichaOrigem: 'Boss' } }, null, 1)).toEqual([]);
    });
    it('não altera o objeto original', () => {
        const d = { fichaOrigem: 'Boss', poderCalculado: 1 };
        dummiesComPoderDesatualizado({ a: d }, personagens, 1);
        expect(d.poderCalculado).toBe(1);
    });
});

describe('camposPosicaoNaCena', () => {
    it('grava a posição da cena e a legada', () => {
        const c = camposPosicaoNaCena('cena1', { x: 3, y: 4 });
        expect(c['posicoes/cena1']).toEqual({ x: 3, y: 4, z: 0, cenaId: 'cena1' });
        expect(c.posicao).toEqual({ x: 3, y: 4, z: 0, cenaId: 'cena1' });
    });
    it('usa a cena "default" e 0 quando faltar ou vier inválido', () => {
        expect(camposPosicaoNaCena('', { x: 'a' })['posicoes/default']).toEqual({ x: 0, y: 0, z: 0, cenaId: 'default' });
        expect(camposPosicaoNaCena(null, null)['posicoes/default'].x).toBe(0);
    });
    it('trunca decimais', () => {
        expect(camposPosicaoNaCena('c', { x: 2.9, y: 1.2, z: 5.7 })['posicoes/c']).toEqual({ x: 2, y: 1, z: 5, cenaId: 'c' });
    });
});

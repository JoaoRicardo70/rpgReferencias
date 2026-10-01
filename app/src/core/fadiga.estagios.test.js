import { describe, it, expect } from 'vitest';
import { calcularGanhoFadigaDinamico } from './fadiga';

function fichaCheia(poderes = []) {
    return {
        vida: { base: 1000000, atual: 1000000 }, mana: { base: 1000000, atual: 1000000 },
        aura: { base: 1000000, atual: 1000000 }, chakra: { base: 1000000, atual: 1000000 },
        corpo: { base: 1000000, atual: 1000000 }, forca: { base: 1000000 },
        poderes, inventario: [], passivas: [], seresSelados: [], combate: {},
    };
}
const portoes = (extra = {}) => ({
    id: 1, nome: 'Portões', categoria: 'poder', ativa: true, estagioAtual: 3, efeitos: [],
    estagios: { habilitado: true, maximo: 10, crescimento: 100, fadigaPorEstagio: 2, rotulo: 'Portão', nomes: [] },
    ...extra,
});

describe('core/fadiga — calcularGanhoFadigaDinamico com Estágios', () => {
    it('com incluirEsforcoPoder, soma fadigaPorEstagio x estágio (2 x 3 = 6) sobre o ganho base', () => {
        const base = calcularGanhoFadigaDinamico(fichaCheia(), { incluirEsforcoPoder: true });
        const com = calcularGanhoFadigaDinamico(fichaCheia([portoes()]), { incluirEsforcoPoder: true });
        expect(com - base).toBeCloseTo(6, 10);
    });

    it('SEM incluirEsforcoPoder (ganho por golpe) a Fadiga dos estágios NÃO entra', () => {
        const base = calcularGanhoFadigaDinamico(fichaCheia());
        expect(calcularGanhoFadigaDinamico(fichaCheia([portoes()]))).toBe(base);
        expect(calcularGanhoFadigaDinamico(fichaCheia([portoes()]), { incluirEsforcoPoder: false })).toBe(base);
    });

    it('técnica desligada não gera Fadiga de estágio', () => {
        const base = calcularGanhoFadigaDinamico(fichaCheia(), { incluirEsforcoPoder: true });
        expect(calcularGanhoFadigaDinamico(fichaCheia([portoes({ ativa: false })]), { incluirEsforcoPoder: true })).toBe(base);
    });

    it('cresce linearmente com o estágio e soma várias técnicas ativas', () => {
        const g = (e) => calcularGanhoFadigaDinamico(fichaCheia([portoes({ estagioAtual: e })]), { incluirEsforcoPoder: true });
        expect(g(5) - g(1)).toBeCloseTo(8, 10);
        const dois = calcularGanhoFadigaDinamico(fichaCheia([portoes(), portoes({ id: 2, estagioAtual: 1 })]), { incluirEsforcoPoder: true });
        const base = calcularGanhoFadigaDinamico(fichaCheia(), { incluirEsforcoPoder: true });
        expect(dois - base).toBeCloseTo(8, 10);
    });

    it('fadigaPorEstagio 0 não adiciona nada', () => {
        const base = calcularGanhoFadigaDinamico(fichaCheia(), { incluirEsforcoPoder: true });
        const p = portoes();
        p.estagios.fadigaPorEstagio = 0;
        expect(calcularGanhoFadigaDinamico(fichaCheia([p]), { incluirEsforcoPoder: true })).toBe(base);
    });

    it('sobrevive a erro nos outros fatores: ficha que lança ao ler vida ainda soma a Fadiga de estágio', () => {
        const quebrada = { poderes: [portoes()], inventario: [], passivas: [], seresSelados: [], combate: {} };
        Object.defineProperty(quebrada, 'vida', { get() { throw new Error('boom'); } });
        let r;
        expect(() => { r = calcularGanhoFadigaDinamico(quebrada, { incluirEsforcoPoder: true }); }).not.toThrow();
        expect(r).toBe(6);
    });

    it('ficha nula não lança e devolve 0', () => {
        expect(calcularGanhoFadigaDinamico(null, { incluirEsforcoPoder: true })).toBe(0);
    });
});

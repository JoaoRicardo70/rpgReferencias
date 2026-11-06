import { describe, it, expect } from 'vitest';
import { calcularCA, BASE_CA } from './engine.js';
import { reduzirComBonus } from './utils.js';

// calcularCA(ficha, tipo, bonusExtra): o bonus avulso entra DENTRO da reducao: BASE_CA + reduzirComBonus(atributo, bonusEfeitos + bonusExtra).
const ficha = (attrs = {}, extra = {}) => {
    const f = { poderes: [], inventario: [], ...extra };
    Object.entries(attrs).forEach(([k, v]) => { f[k] = { base: v, nome: k }; });
    return f;
};
const passivaCA = (atributo, valor) => ({ efeitos: [{ atributo, propriedade: 'base', valor: String(valor) }] });

describe('calcularCA - bonusExtra', () => {
    it('bonusExtra omitido, 0, null, undefined, NaN e string invalida sao iguais a nao passar', () => {
        const f = ficha({ destreza: 50 });
        const ref = calcularCA(f, 'evasiva');
        for (const b of [0, null, undefined, NaN, 'abc', '']) expect(calcularCA(f, 'evasiva', b)).toBe(ref);
        expect(ref).toBe(BASE_CA + reduzirComBonus(50, 0));
    });
    it('bonus > 0 entra dentro da reducao (evasiva e resistencia)', () => {
        const f = ficha({ destreza: 50, forca: 30 });
        expect(calcularCA(f, 'evasiva', 10)).toBe(BASE_CA + reduzirComBonus(50, 10));
        expect(calcularCA(f, 'resistencia', 10)).toBe(BASE_CA + reduzirComBonus(30, 10));
        expect(calcularCA(f, 'evasiva', 10)).toBeGreaterThan(calcularCA(f, 'evasiva'));
    });
    it('bonus e proporcional ao atributo: atributo alto muda pouco, baixo muda muito', () => {
        const baixo = ficha({ destreza: 5 });
        const alto = ficha({ destreza: 100000 });
        const ganhoBaixo = calcularCA(baixo, 'evasiva', 10) - calcularCA(baixo, 'evasiva');
        const ganhoAlto = calcularCA(alto, 'evasiva', 10) - calcularCA(alto, 'evasiva');
        expect(ganhoBaixo).toBe(6); // 12+9 vs 12+3
        expect(ganhoAlto).toBeGreaterThan(0);
        expect(ganhoAlto).toBeLessThanOrEqual(ganhoBaixo);
    });
    it('bonusExtra soma com bonus de efeitos ANTES de reduzir', () => {
        const f = ficha({ destreza: 5 }, { passivas: [passivaCA('evasiva', 4)] });
        expect(calcularCA(f, 'evasiva', 6)).toBe(BASE_CA + reduzirComBonus(5, 10));
    });
    it('aceita string numerica', () => {
        const f = ficha({ destreza: 5 });
        expect(calcularCA(f, 'evasiva', '10')).toBe(calcularCA(f, 'evasiva', 10));
    });
    it('bonus negativo reduz a CA e nunca gera NaN', () => {
        const f = ficha({ destreza: 5 });
        const r = calcularCA(f, 'evasiva', -10);
        expect(Number.isFinite(r)).toBe(true);
        expect(r).toBeLessThan(calcularCA(f, 'evasiva'));
    });
    it('bonus enorme permanece finito', () => {
        expect(Number.isFinite(calcularCA(ficha({ destreza: 5 }), 'evasiva', 1e300))).toBe(true);
    });
    it('ficha nula devolve BASE_CA mesmo com bonus', () => {
        expect(calcularCA(null, 'evasiva', 50)).toBe(BASE_CA);
    });
    it('condicoes continuam multiplicando o total com o bonus dentro', () => {
        const f = ficha({ destreza: 1000000, forca: 1000000 }, { condicoes: [{ id: 'lento', stacks: 1 }] });
        const sem = ficha({ destreza: 1000000, forca: 1000000 });
        expect(calcularCA(f, 'evasiva', 20)).toBe(Math.floor(calcularCA(sem, 'evasiva', 20) / 2));
        expect(calcularCA(f, 'resistencia', 20)).toBe(calcularCA(sem, 'resistencia', 20));
        const imob = { ...sem, condicoes: [{ id: 'imobilizado', stacks: 1 }] };
        expect(calcularCA(imob, 'evasiva', 20)).toBe(0);
    });
});

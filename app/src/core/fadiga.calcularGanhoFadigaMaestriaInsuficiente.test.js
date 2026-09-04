import { describe, it, expect } from 'vitest';
import { calcularGanhoFadigaMaestriaInsuficiente } from './fadiga';

// ---------------------------------------------------------------------------
// QA — core/fadiga.js > calcularGanhoFadigaMaestriaInsuficiente(maestria, maestriaRequerida)
//
// Pedido do usuário: "algumas Habilidades podem requerer certo nível de Maestria afim de não
// gerar gasto/Fadiga". Fadiga instantânea (mesmo padrão de calcularGanhoFadigaOvercharge em
// core/dominios.js) proporcional à distância entre a Maestria atual do personagem NESSA
// Habilidade e o requisito mínimo dela — 0 se já atingiu/superou o requisito, peso máximo (10) no
// pior caso (Maestria 0 contra requisito 100).
// ---------------------------------------------------------------------------

describe('core/fadiga - calcularGanhoFadigaMaestriaInsuficiente: sem penalidade (maestria >= requisito)', () => {
    it('maestria igual ao requisito não gera Fadiga', () => {
        expect(calcularGanhoFadigaMaestriaInsuficiente(50, 50)).toBe(0);
    });

    it('maestria acima do requisito não gera Fadiga', () => {
        expect(calcularGanhoFadigaMaestriaInsuficiente(80, 50)).toBe(0);
    });

    it('maestria 100 contra qualquer requisito nunca gera Fadiga', () => {
        expect(calcularGanhoFadigaMaestriaInsuficiente(100, 100)).toBe(0);
    });

    it('requisito 0 (sem exigência) nunca gera Fadiga, mesmo com maestria 0', () => {
        expect(calcularGanhoFadigaMaestriaInsuficiente(0, 0)).toBe(0);
    });
});

describe('core/fadiga - calcularGanhoFadigaMaestriaInsuficiente: penalidade proporcional à distância', () => {
    it('pior caso (maestria 0, requisito 100) soma o peso máximo (10)', () => {
        expect(calcularGanhoFadigaMaestriaInsuficiente(0, 100)).toBeCloseTo(10, 6);
    });

    it('metade do caminho (maestria 0, requisito 50) soma metade do peso máximo (5)', () => {
        expect(calcularGanhoFadigaMaestriaInsuficiente(0, 50)).toBeCloseTo(5, 6);
    });

    it('maestria 40 contra requisito 60 (faltam 20 pontos): 20/100 * 10 = 2', () => {
        expect(calcularGanhoFadigaMaestriaInsuficiente(40, 60)).toBeCloseTo(2, 6);
    });
});

describe('core/fadiga - calcularGanhoFadigaMaestriaInsuficiente: clamps e robustez', () => {
    it('valores fora de [0,100] são clampados antes da conta', () => {
        expect(calcularGanhoFadigaMaestriaInsuficiente(-50, 200)).toBeCloseTo(10, 6); // clampa pra 0 e 100
        expect(calcularGanhoFadigaMaestriaInsuficiente(150, 50)).toBe(0); // clampa maestria pra 100 -> acima do requisito
    });

    it('valores não numéricos (NaN/undefined) são tratados como 0, nunca lançam', () => {
        expect(() => calcularGanhoFadigaMaestriaInsuficiente(undefined, undefined)).not.toThrow();
        expect(calcularGanhoFadigaMaestriaInsuficiente(undefined, 100)).toBeCloseTo(10, 6);
        expect(calcularGanhoFadigaMaestriaInsuficiente('abc', 'xyz')).toBe(0);
    });

    it('nunca retorna um valor negativo', () => {
        expect(calcularGanhoFadigaMaestriaInsuficiente(100, 0)).toBeGreaterThanOrEqual(0);
        expect(calcularGanhoFadigaMaestriaInsuficiente(999, -999)).toBeGreaterThanOrEqual(0);
    });
});

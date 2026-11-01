import { describe, it, expect, vi, afterEach } from 'vitest';
import { calcularDano } from './engine.js';

afterEach(() => { vi.restoreAllMocks(); });

const vital = (base, atual) => ({ base, nome: 'v', atual, mBase: 1, mGeral: 1, mFormas: 1, mAbsoluto: 1, mUnico: '1.0', reducaoCusto: 0, regeneracao: 0 });
function fichaBase(extra = {}) {
    return {
        forca: vital(100), destreza: vital(80), vida: vital(1000), corpo: vital(500),
        mana: vital(1000, 1e9), aura: vital(1000, 1e9), chakra: vital(1000, 1e9),
        dano: { base: 0, mBase: 1, mGeral: 1, mFormas: 1, mAbsoluto: 1, mPotencial: 1, mUnico: '1.0' },
        poderes: [], inventario: [], ataquesElementais: [], bio: {}, combate: {}, ...extra
    };
}
const hab = (extra = {}) => ({ id: 'h1', nome: 'Golpe', dadosQtd: 2, dadosFaces: 6, custoPercentual: 10, statusUsados: ['forca'], energiaCombustao: 'mana', efeitos: [], ...extra });
const calc = (ficha, habs) => calcularDano({
    minhaFicha: ficha, configArma: { statusUsados: ['forca'], energiaCombustao: 'mana', percEnergia: 0 }, configHabilidades: habs, itensEquipados: []
});
const liberada = () => fichaBase({ combate: { conjuraComoPoder: true } });

describe('calcularDano: custoCheioTotal', () => {
    it('sem custo = 0', () => {
        expect(calc(fichaBase(), [hab({ custoPercentual: 0 })]).custoCheioTotal).toBe(0);
    });

    it('golpe normal: igual ao gasto real (soma dos drenos)', () => {
        const r = calc(fichaBase(), [hab()]);
        expect(r.drenos).toHaveLength(1);
        expect(r.drenos[0].valor).toBeGreaterThan(0);
        expect(r.custoCheioTotal).toBe(r.drenos[0].valor);
    });

    it('soma dois golpes que gastam energias diferentes', () => {
        const r = calc(fichaBase(), [hab(), hab({ id: 'h2', energiaCombustao: 'aura', custoPercentual: 20 })]);
        expect(r.custoCheioTotal).toBe(r.drenos.reduce((s, d) => s + d.valor, 0));
        expect(r.drenos).toHaveLength(2);
    });

    it('como Poder: nada é gasto, mas o custo cheio inclui o que gastaria sem ser Poder', () => {
        const normal = calc(fichaBase(), [hab({ custoPercentual: 10, custoPercentualMax: 30 })]);
        const poder = calc(liberada(), [hab({ custoPercentual: 10, custoPercentualMax: 30, comoPoder: true, percComoPoder: 20 })]);
        expect(poder.drenos).toEqual([]);
        expect(poder.custoCheioTotal).toBeGreaterThan(0);
        expect(poder.custoCheioTotal).toBe(normal.custoCheioTotal);
    });

    it('como Poder + golpe normal: custo cheio = gasto do normal + o que o Poder gastaria', () => {
        const so = calc(fichaBase(), [hab({ id: 'a', custoPercentual: 10 })]).custoCheioTotal;
        const outro = calc(fichaBase(), [hab({ id: 'b', custoPercentual: 10 })]).custoCheioTotal;
        const misto = calc(liberada(), [hab({ id: 'a', custoPercentual: 10 }), hab({ id: 'b', custoPercentual: 10, custoPercentualMax: 30, comoPoder: true })]);
        expect(misto.drenos).toHaveLength(1);
        expect(misto.custoCheioTotal).toBe(so + outro);
    });

    it('sem a permissão, comoPoder paga normal e custo cheio = gasto', () => {
        const r = calc(fichaBase(), [hab({ comoPoder: true, custoPercentualMax: 30 })]);
        expect(r.drenos).toHaveLength(1);
        expect(r.custoCheioTotal).toBe(r.drenos[0].valor);
    });

    it('habilidade vetada (semComoPoder) paga normal', () => {
        const r = calc(liberada(), [hab({ comoPoder: true, semComoPoder: true, custoPercentualMax: 30 })]);
        expect(r.custoCheioTotal).toBe(r.drenos[0].valor);
    });

    it('como Poder em habilidade Elemental inata não conta custo cheio extra', () => {
        const r = calc(liberada(), [hab({ vertente: 'Elemental', comoPoder: true, custoPercentualMax: 30 })]);
        expect(r.custoCheioTotal).toBe(0);
    });

    it('a Redução de Custo reduz o gasto real e o custo cheio acompanha', () => {
        const f = fichaBase();
        f.mana.reducaoCusto = 50;
        const g = fichaBase();
        expect(calc(f, [hab()]).custoCheioTotal).toBeLessThan(calc(g, [hab()]).custoCheioTotal);
    });
});

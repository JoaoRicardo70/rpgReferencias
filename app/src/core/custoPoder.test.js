import { describe, it, expect, vi, afterEach } from 'vitest';
import {
    getMargemCusto, limitarPercComoPoder, podeConjurarComoPoder, custoBrutoDeEnergia,
    fatorPoderPorCusto, somarCustosBrutos, ENERGIAS_COMO_PODER
} from './custoPoder.js';
import { calcularDano } from './engine.js';
import { getPoderParaDisputa } from './disputaPoder.js';

afterEach(() => { vi.restoreAllMocks(); });

const vital = (base, atual) => ({ base, nome: 'v', atual, mBase: 1, mGeral: 1, mFormas: 1, mAbsoluto: 1, mUnico: '1.0', reducaoCusto: 0, regeneracao: 0 });

function fichaBase(extra = {}) {
    return {
        forca: vital(100), destreza: vital(80),
        vida: vital(1000), corpo: vital(500),
        mana: vital(1000, 1e9), aura: vital(1000, 1e9), chakra: vital(1000, 1e9),
        dano: { base: 0, mBase: 1, mGeral: 1, mFormas: 1, mAbsoluto: 1, mPotencial: 1, mUnico: '1.0' },
        poderes: [], inventario: [], ataquesElementais: [], bio: {}, combate: {},
        ...extra
    };
}

const hab = (extra = {}) => ({ id: 'h1', nome: 'Golpe', dadosQtd: 2, dadosFaces: 6, custoPercentual: 10, statusUsados: ['forca'], energiaCombustao: 'mana', efeitos: [], ...extra });
const calc = (ficha, habs, configArma = { statusUsados: ['forca'], energiaCombustao: 'mana', percEnergia: 0 }) =>
    calcularDano({ minhaFicha: ficha, configArma, configHabilidades: habs, itensEquipados: [] });

describe('margem de Custo e permissão', () => {
    it('margem: mínimo = Custo, máximo = Custo Máx (nunca abaixo do mínimo)', () => {
        expect(getMargemCusto({ custoPercentual: 10, custoPercentualMax: 30 })).toEqual({ min: 10, max: 30 });
        expect(getMargemCusto({ custoPercentual: 10 })).toEqual({ min: 10, max: 10 });
        expect(getMargemCusto({ custoPercentual: 10, custoPercentualMax: 5 })).toEqual({ min: 10, max: 10 });
        expect(getMargemCusto({ custoValor: 8, custoValorMax: 20 })).toEqual({ min: 8, max: 20 });
        expect(getMargemCusto(null)).toEqual({ min: 0, max: 0 });
    });

    it('o % escolhido fica dentro da margem; vazio vale o máximo', () => {
        const h = { custoPercentual: 10, custoPercentualMax: 30 };
        expect(limitarPercComoPoder(h, 20)).toBe(20);
        expect(limitarPercComoPoder(h, 99)).toBe(30);
        expect(limitarPercComoPoder(h, 1)).toBe(10);
        expect(limitarPercComoPoder(h, undefined)).toBe(30);
        expect(limitarPercComoPoder(h, 'abc')).toBe(30);
    });

    it('só conjura como Poder com a capacidade liberada e a habilidade não vetada', () => {
        expect(podeConjurarComoPoder({ combate: {} }, {})).toBe(false);
        expect(podeConjurarComoPoder({ combate: { conjuraComoPoder: true } }, {})).toBe(true);
        expect(podeConjurarComoPoder({ combate: { conjuraComoPoder: true } }, { semComoPoder: true })).toBe(false);
        expect(podeConjurarComoPoder(null, {})).toBe(false);
    });
});

describe('fatorPoderPorCusto', () => {
    it('sem custo ou sem Poder o fator é 1', () => {
        expect(fatorPoderPorCusto(1e6, 0)).toBe(1);
        expect(fatorPoderPorCusto(0, 1e6)).toBe(1);
        expect(fatorPoderPorCusto(1e6, -5)).toBe(1);
    });

    it('custo maior dá fator maior e nunca abaixo de 1', () => {
        const pequeno = fatorPoderPorCusto(1e6, 1e5);
        const grande = fatorPoderPorCusto(1e6, 1e7);
        expect(pequeno).toBeGreaterThan(1);
        expect(grande).toBeGreaterThan(pequeno);
    });

    it('o amortecimento do Poder vale também para o bônus (0,9)', () => {
        // custo igual ao dobro da base*6 -> base' = 3x base -> fator = 3^0.9
        expect(fatorPoderPorCusto(100, 200 * 6)).toBeCloseTo(Math.pow(3, 0.9), 6);
    });
});

describe('custoBrutoDeEnergia', () => {
    it('% do máximo bruto, com Redução de Custo só quando é custo pago', () => {
        const f = fichaBase();
        f.mana.reducaoCusto = 50;
        const cheio = custoBrutoDeEnergia(f, 'mana', 10, false);
        const pago = custoBrutoDeEnergia(f, 'mana', 10, true);
        expect(cheio).toBeGreaterThan(0);
        expect(pago).toBeCloseTo(cheio / 2, 6);
    });

    it('energia inexistente ou % inválido valem 0', () => {
        expect(custoBrutoDeEnergia(fichaBase(), 'livre', 10)).toBe(0);
        expect(custoBrutoDeEnergia(fichaBase(), 'mana', 0)).toBe(0);
        expect(custoBrutoDeEnergia(fichaBase(), 'mana', 'x')).toBe(0);
    });

    it('somarCustosBrutos ignora lixo', () => {
        expect(somarCustosBrutos([{ bruto: 3 }, { bruto: 'x' }, null, { bruto: 4 }])).toBe(7);
        expect(somarCustosBrutos(undefined)).toBe(0);
    });
});

describe('calcularDano: Custo vira Poder, não Dano', () => {
    it('o Custo continua gasto, mas o dano é igual ao de uma habilidade sem Custo', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.5);
        const semCusto = calc(fichaBase(), [hab({ custoPercentual: 0 })]);
        const comCusto = calc(fichaBase(), [hab({ custoPercentual: 10 })]);
        expect(comCusto.erro).toBeUndefined();
        expect(comCusto.dano).toBe(semCusto.dano);
        expect(comCusto.drenos.length).toBe(1);
        expect(comCusto.drenos[0].key).toBe('mana');
        expect(semCusto.custoPoderBruto).toBe(0);
        expect(comCusto.custoPoderBruto).toBeGreaterThan(0);
    });

    it('habilidade sem dados também gera Poder pelo Custo', () => {
        const r = calc(fichaBase(), [hab({ dadosQtd: 0, custoPercentual: 10 }), hab({ id: 'h2', custoPercentual: 0 })]);
        expect(r.custoPoderBruto).toBeGreaterThan(0);
    });

    it('arma com % de energia também vira Poder', () => {
        const arma = { id: 'a', nome: 'Espada', tipo: 'arma', dadosQtd: 2, dadosFaces: 6, equipado: true };
        const r = calcularDano({
            minhaFicha: fichaBase(), configArma: { statusUsados: ['forca'], energiaCombustao: 'mana', percEnergia: 10 },
            configHabilidades: [], itensEquipados: [arma]
        });
        expect(r.custoPoderBruto).toBeGreaterThan(0);
        expect(r.drenos.length).toBe(1);
    });

    it('o Poder do golpe cresce com o Custo e a Disputa usa isso', () => {
        const f = fichaBase();
        const sem = getPoderParaDisputa(f, 1, { conjuracao: false, textos: [], custoBruto: 0 });
        const com = getPoderParaDisputa(f, 1, { conjuracao: false, textos: [], custoBruto: calc(f, [hab()]).custoPoderBruto });
        expect(sem).toBeGreaterThan(0);
        expect(com).toBeGreaterThan(sem);
    });
});

describe('calcularDano: conjurar como Poder', () => {
    const liberada = () => fichaBase({ combate: { conjuraComoPoder: true } });

    it('não gasta nada e soma Mana, Aura e Chakra no Poder do golpe', () => {
        const f = liberada();
        const r = calc(f, [hab({ custoPercentual: 10, custoPercentualMax: 30, comoPoder: true, percComoPoder: 20 })]);
        expect(r.erro).toBeUndefined();
        expect(r.drenos).toEqual([]);
        expect(r.custosPoder.map(c => c.energia).sort()).toEqual([...ENERGIAS_COMO_PODER].sort());
        expect(r.detalheEnergia).toContain('como Poder');
    });

    it('o benefício vale o % escolhido na margem (maior % = mais Poder)', () => {
        const f = liberada();
        const baixo = calc(f, [hab({ custoPercentual: 10, custoPercentualMax: 30, comoPoder: true, percComoPoder: 10 })]);
        const alto = calc(f, [hab({ custoPercentual: 10, custoPercentualMax: 30, comoPoder: true, percComoPoder: 30 })]);
        const fora = calc(f, [hab({ custoPercentual: 10, custoPercentualMax: 30, comoPoder: true, percComoPoder: 90 })]);
        expect(alto.custoPoderBruto).toBeGreaterThan(baixo.custoPoderBruto);
        expect(fora.custoPoderBruto).toBeCloseTo(alto.custoPoderBruto, 6);
    });

    it('funciona mesmo sem energia para pagar (0% gasto)', () => {
        const f = liberada();
        f.mana.atual = 0; f.aura.atual = 0; f.chakra.atual = 0;
        const r = calc(f, [hab({ custoPercentual: 50, comoPoder: true })]);
        expect(r.erro).toBeUndefined();
        expect(r.custoPoderBruto).toBeGreaterThan(0);
    });

    it('sem a permissão do Mestre, ou com a habilidade vetada, paga o Custo normal', () => {
        const semPermissao = calc(fichaBase(), [hab({ comoPoder: true })]);
        expect(semPermissao.drenos.length).toBe(1);
        const vetada = calc(liberada(), [hab({ comoPoder: true, semComoPoder: true })]);
        expect(vetada.drenos.length).toBe(1);
    });

    it('como Poder não aplica a Redução de Custo (benefício cheio)', () => {
        const f = liberada();
        f.mana.reducaoCusto = 50; f.aura.reducaoCusto = 50; f.chakra.reducaoCusto = 50;
        const g = liberada();
        const a = calc(f, [hab({ comoPoder: true })]);
        const b = calc(g, [hab({ comoPoder: true })]);
        expect(a.custoPoderBruto).toBeCloseTo(b.custoPoderBruto, 6);
    });
});

describe('Habilidade Elemental inata (Ressonância)', () => {
    it('continua sem custo e agora soma as três energias no Poder, não no dano', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.5);
        const f = fichaBase();
        const elem = calc(f, [hab({ vertente: 'Elemental', custoPercentual: 10 })]);
        const base = calc(f, [hab({ custoPercentual: 0 })]);
        expect(elem.drenos).toEqual([]);
        expect(elem.dano).toBe(base.dano);
        expect(elem.custosPoder.length).toBe(3);
    });
});

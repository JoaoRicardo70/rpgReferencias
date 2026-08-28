import { describe, it, expect } from 'vitest';
import { calcularPoderAtual, getTemaScouter } from './poder';

const STATUS_FISICOS = ['forca', 'destreza', 'inteligencia', 'sabedoria', 'energiaEsp', 'carisma', 'stamina', 'constituicao'];

function criarStat(base) {
    return { base, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mUnico: '1.0', mAbsoluto: 1.0, reducaoCusto: 0, regeneracao: 0 };
}

// Ficha mínima porém "completa" o suficiente para passar por todo o pipeline de
// calcularPoderAtual (vitais + 8 status físicos + ascensaoBase + divisorPoder).
function criarFichaMinima(overrides = {}) {
    const ficha = {
        ascensaoBase: 1,
        vida: criarStat(100000000),
        mana: criarStat(10000000),
        aura: criarStat(10000000),
        chakra: criarStat(10000000),
        corpo: criarStat(10000000),
        divisores: { vida: 1, status: 1, mana: 1, aura: 1, chakra: 1, corpo: 1 },
        divisorPoder: 0, // 0/ausente => cai no fallback (mesa ou 1)
        supressaoPoder: 100,
        limiteSupressao: 1,
    };
    STATUS_FISICOS.forEach(s => { ficha[s] = criarStat(100000); });
    return { ...ficha, ...overrides };
}

describe('core/poder - calcularPoderAtual', () => {
    it('retorna poderGlobal 0 sem lançar exceção quando a ficha é null', () => {
        const resultado = calcularPoderAtual(null, 1);
        expect(resultado).toEqual({
            poderGlobal: 0,
            vitalidadeGlobal: 0,
            supressao: 100,
            limiteSupressao: 1,
            temaScouter: getTemaScouter(100, 1),
        });
    });

    it('retorna poderGlobal 0 sem lançar exceção quando a ficha é undefined', () => {
        expect(() => calcularPoderAtual(undefined, 1)).not.toThrow();
        const resultado = calcularPoderAtual(undefined, 1);
        expect(resultado.poderGlobal).toBe(0);
        expect(resultado.vitalidadeGlobal).toBe(0);
    });

    it('produz um poderGlobal numérico finito e >= 0 para uma ficha mínima válida', () => {
        const ficha = criarFichaMinima();
        const resultado = calcularPoderAtual(ficha, 1);

        expect(typeof resultado.poderGlobal).toBe('number');
        expect(Number.isFinite(resultado.poderGlobal)).toBe(true);
        expect(resultado.poderGlobal).toBeGreaterThanOrEqual(0);
        expect(resultado.supressao).toBe(100);
        expect(resultado.limiteSupressao).toBe(1);
        expect(resultado.temaScouter).toBeDefined();
    });

    it('reduz o poderGlobal proporcionalmente quando supressaoPoder é menor (100 vs 50)', () => {
        const fichaCheia = criarFichaMinima({ supressaoPoder: 100 });
        const fichaSuprimida = criarFichaMinima({ supressaoPoder: 50 });

        const resultadoCheio = calcularPoderAtual(fichaCheia, 1);
        const resultadoSuprimido = calcularPoderAtual(fichaSuprimida, 1);

        expect(resultadoSuprimido.poderGlobal).toBeLessThan(resultadoCheio.poderGlobal);
        // A fórmula aplica "* (sup/100)" diretamente sobre poderComAscensao, então o
        // resultado com 50% de supressão deve ficar próximo da metade do valor cheio.
        const proporcao = resultadoSuprimido.poderGlobal / resultadoCheio.poderGlobal;
        expect(proporcao).toBeGreaterThan(0.4);
        expect(proporcao).toBeLessThan(0.6);
    });

    it('dá prioridade ao divisorPoder da própria ficha sobre o divisorPoderMesa quando ambos são > 0', () => {
        const fichaComDivisorProprio = criarFichaMinima({ divisorPoder: 2 });
        const resultadoComMesaDiferente = calcularPoderAtual(fichaComDivisorProprio, 10);
        const resultadoSemMesa = calcularPoderAtual(fichaComDivisorProprio, 2);

        // Se o divisor individual (2) prevalecer sobre o da mesa (10), o resultado
        // passando divisorPoderMesa=10 deve ser igual ao de passar divisorPoderMesa=2
        // (mesmo divisor efetivo == 2 em ambos os casos).
        expect(resultadoComMesaDiferente.poderGlobal).toBe(resultadoSemMesa.poderGlobal);
    });

    it('usa o divisorPoderMesa quando a ficha não define divisorPoder próprio (0 ou ausente)', () => {
        const fichaSemDivisorProprio = criarFichaMinima({ divisorPoder: 0 });
        const resultadoMesa1 = calcularPoderAtual(fichaSemDivisorProprio, 1);
        const resultadoMesa2 = calcularPoderAtual(fichaSemDivisorProprio, 2);

        // Dobrar o divisor da mesa deve, no mínimo, não aumentar o poder — e via de
        // regra reduzi-lo (poderGlobal2 <= poderGlobal1).
        expect(resultadoMesa2.poderGlobal).toBeLessThanOrEqual(resultadoMesa1.poderGlobal);
    });

    it('não lança exceção com ficha parcialmente vazia (campos faltando)', () => {
        const fichaParcial = { vida: { base: 100 } };
        expect(() => calcularPoderAtual(fichaParcial, 1)).not.toThrow();
        const resultado = calcularPoderAtual(fichaParcial, 1);
        expect(Number.isFinite(resultado.poderGlobal)).toBe(true);
        expect(resultado.temaScouter).toBeDefined();
    });

    it('não lança exceção com ficha vazia ({})', () => {
        expect(() => calcularPoderAtual({}, 1)).not.toThrow();
        const resultado = calcularPoderAtual({}, 1);
        expect(Number.isFinite(resultado.poderGlobal)).toBe(true);
    });
});

describe('core/poder - getTemaScouter', () => {
    it('retorna o tema "Poder Máximo" quando supressao >= 100', () => {
        expect(getTemaScouter(100, 1).nome).toBe('Poder Máximo (Liberto)');
    });

    it('retorna o tema "Anulação no Limite" quando supressao está no limite mínimo', () => {
        expect(getTemaScouter(1, 1).nome).toBe('Anulação no Limite');
    });
});

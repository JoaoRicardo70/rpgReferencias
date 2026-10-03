import { describe, it, expect } from 'vitest';
import {
    FATOR_DISPUTA_MAXIMO, getPoderParaDisputa, getPoderDummie, getPoderDeEntidade, calcularDisputaPoder,
    aplicarDisputaAoDano, formatarFatorDisputa, formatarPoderDisputa, descreverDisputa,
} from './disputaPoder';
import { calcularPoderAtual } from './poder';

const STATUS = ['forca', 'destreza', 'inteligencia', 'sabedoria', 'energiaEsp', 'carisma', 'stamina', 'constituicao'];
const stat = (base) => ({ base, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mUnico: '1.0', mAbsoluto: 1.0, reducaoCusto: 0, regeneracao: 0 });
function fichaMinima(overrides = {}) {
    const f = {
        ascensaoBase: 1,
        vida: stat(100000000), mana: stat(10000000), aura: stat(10000000), chakra: stat(10000000), corpo: stat(10000000),
        divisores: { vida: 1, status: 1, mana: 1, aura: 1, chakra: 1, corpo: 1 },
        divisorPoder: 0, supressaoPoder: 100, limiteSupressao: 1,
    };
    STATUS.forEach(s => { f[s] = stat(100000); });
    return { ...f, ...overrides };
}

describe('calcularDisputaPoder - exemplos do pedido', () => {
    it('1100 contra 1000: o mais forte causa x1,1', () => {
        const r = calcularDisputaPoder(1100, 1000);
        expect(r.ativa).toBe(true);
        expect(r.fator).toBeCloseTo(1.1, 10);
        expect(r.atacanteMaisForte).toBe(true);
    });
    it('1000 contra 1100: o mais fraco causa x0,9', () => {
        const r = calcularDisputaPoder(1000, 1100);
        expect(r.ativa).toBe(true);
        expect(r.fator).toBeCloseTo(0.9, 10);
        expect(r.atacanteMaisForte).toBe(false);
    });
    it('1000 contra 2000: o dobro de Poder zera o dano (x0)', () => {
        expect(calcularDisputaPoder(1000, 2000).fator).toBe(0);
    });
    it('Poder igual resulta em x1 e disputa ativa', () => {
        const r = calcularDisputaPoder(1000, 1000);
        expect(r.ativa).toBe(true);
        expect(r.fator).toBe(1);
        expect(r.diferenca).toBe(0);
    });
    it('mais de 2x de Poder do alvo nunca gera fator negativo', () => {
        expect(calcularDisputaPoder(1000, 50000).fator).toBe(0);
    });
    it('2x de Poder do atacante gera x2', () => {
        expect(calcularDisputaPoder(2000, 1000).fator).toBe(2);
    });
    it('retorna poderAtacante e poderDefensor numericos', () => {
        const r = calcularDisputaPoder('1100', '1000');
        expect(r.poderAtacante).toBe(1100);
        expect(r.poderDefensor).toBe(1000);
    });
});

describe('calcularDisputaPoder - casos de borda', () => {
    it.each([
        ['atacante null', null, 1000],
        ['defensor null', 1000, null],
        ['atacante undefined', undefined, 1000],
        ['defensor string vazia', 1000, ''],
        ['atacante NaN', NaN, 1000],
        ['defensor Infinity', 1000, Infinity],
        ['atacante -Infinity', -Infinity, 1000],
        ['atacante negativo', -5, 1000],
        ['defensor texto', 1000, 'abc'],
    ])('disputa inativa com fator 1 quando %s', (_n, a, d) => {
        const r = calcularDisputaPoder(a, d);
        expect(r.ativa).toBe(false);
        expect(r.fator).toBe(1);
        expect(r.poderAtacante).toBeNull();
        expect(r.poderDefensor).toBeNull();
    });

    it('os dois com Poder 0 e igual: x1 sem dividir por zero', () => {
        const r = calcularDisputaPoder(0, 0);
        expect(r.ativa).toBe(true);
        expect(r.fator).toBe(1);
    });
    it('atacante forte contra defensor 0 fica limitado ao teto', () => {
        const r = calcularDisputaPoder(1000, 0);
        expect(r.fator).toBe(FATOR_DISPUTA_MAXIMO);
        expect(r.diferenca).toBe(Infinity);
    });
    it('atacante 0 contra defensor forte causa x0', () => {
        const r = calcularDisputaPoder(0, 1000);
        expect(r.fator).toBe(0);
        expect(r.atacanteMaisForte).toBe(false);
    });
    it('diferenca enorme (acima do teto) e limitada a FATOR_DISPUTA_MAXIMO', () => {
        expect(calcularDisputaPoder(1e12, 1).fator).toBe(FATOR_DISPUTA_MAXIMO);
    });
    it('no limite do teto: 1 + d = 1e6 nao ultrapassa', () => {
        expect(calcularDisputaPoder(1e6, 1).fator).toBe(FATOR_DISPUTA_MAXIMO);
        expect(calcularDisputaPoder(999999, 1).fator).toBe(999999);
    });
    it('FATOR_DISPUTA_MAXIMO vale 1e6', () => {
        expect(FATOR_DISPUTA_MAXIMO).toBe(1e6);
    });
    it('valores fracionarios pequenos funcionam', () => {
        expect(calcularDisputaPoder(0.15, 0.1).fator).toBeCloseTo(1.5, 10);
    });
});

describe('aplicarDisputaAoDano', () => {
    it('sem disputa (null/inativa) devolve o dano inteiro', () => {
        expect(aplicarDisputaAoDano(100, null)).toBe(100);
        expect(aplicarDisputaAoDano(100.9, calcularDisputaPoder(null, 5))).toBe(100);
    });
    it('100 x 1,15 nao perde 1 de dano por ponto flutuante', () => {
        expect(aplicarDisputaAoDano(100, { ativa: true, fator: 1.15 })).toBe(115);
    });
    it('arredonda para baixo', () => {
        expect(aplicarDisputaAoDano(10, { ativa: true, fator: 1.19 })).toBe(11);
        expect(aplicarDisputaAoDano(7, { ativa: true, fator: 0.5 })).toBe(3);
    });
    it('fator 0 zera o dano', () => {
        expect(aplicarDisputaAoDano(5000, calcularDisputaPoder(1000, 2000))).toBe(0);
    });
    it('dano negativo, NaN, null e texto viram 0', () => {
        const d = { ativa: true, fator: 2 };
        expect(aplicarDisputaAoDano(-50, d)).toBe(0);
        expect(aplicarDisputaAoDano(NaN, d)).toBe(0);
        expect(aplicarDisputaAoDano(null, d)).toBe(0);
        expect(aplicarDisputaAoDano('abc', d)).toBe(0);
    });
    it('dano em texto numerico e aceito', () => {
        expect(aplicarDisputaAoDano('200', { ativa: true, fator: 1.5 })).toBe(300);
    });
    it('resultado infinito vira MAX_SAFE_INTEGER', () => {
        expect(aplicarDisputaAoDano(1e308, { ativa: true, fator: 1e6 })).toBe(Number.MAX_SAFE_INTEGER);
    });
    it('exemplo completo: 1000 de dano com 1100 vs 1000 = 1100, e 1000 vs 1100 = 900', () => {
        expect(aplicarDisputaAoDano(1000, calcularDisputaPoder(1100, 1000))).toBe(1100);
        expect(aplicarDisputaAoDano(1000, calcularDisputaPoder(1000, 1100))).toBe(900);
    });
});

describe('getPoderDummie', () => {
    it('null, undefined e sem campo: null', () => {
        expect(getPoderDummie(null)).toBeNull();
        expect(getPoderDummie(undefined)).toBeNull();
        expect(getPoderDummie({})).toBeNull();
        expect(getPoderDummie({ poderCalculado: null })).toBeNull();
        expect(getPoderDummie({ poderCalculado: '' })).toBeNull();
    });
    it('numero valido (incluindo 0 e texto numerico)', () => {
        expect(getPoderDummie({ poderCalculado: 1500 })).toBe(1500);
        expect(getPoderDummie({ poderCalculado: 0 })).toBe(0);
        expect(getPoderDummie({ poderCalculado: '42.5' })).toBe(42.5);
    });
    it('negativo, NaN, Infinity e texto invalido: null', () => {
        expect(getPoderDummie({ poderCalculado: -1 })).toBeNull();
        expect(getPoderDummie({ poderCalculado: NaN })).toBeNull();
        expect(getPoderDummie({ poderCalculado: Infinity })).toBeNull();
        expect(getPoderDummie({ poderCalculado: 'xyz' })).toBeNull();
    });
});

describe('getPoderParaDisputa e getPoderDeEntidade', () => {
    it('ficha nula: null', () => {
        expect(getPoderParaDisputa(null, 1)).toBeNull();
        expect(getPoderParaDisputa(undefined, 1)).toBeNull();
    });
    it('usa poderExato de calcularPoderAtual (sem arredondamento)', () => {
        const f = fichaMinima();
        expect(getPoderParaDisputa(f, 1)).toBe(calcularPoderAtual(f, 1).poderExato);
    });
    it('ficha que quebra o calculo devolve null em vez de lancar', () => {
        const quebrada = new Proxy({}, { get() { throw new Error('boom'); } });
        expect(getPoderParaDisputa(quebrada, 1)).toBeNull();
    });
    it('ficha vazia nunca devolve valor negativo ou NaN', () => {
        const v = getPoderParaDisputa({}, 1);
        expect(v === null || (Number.isFinite(v) && v >= 0)).toBe(true);
    });
    it('entidade dummie usa poderCalculado direto', () => {
        expect(getPoderDeEntidade({ isDummie: true, poderCalculado: 700 }, 1)).toBe(700);
        expect(getPoderDeEntidade({ isDummie: true, ficha: { poderCalculado: 300 } }, 1)).toBe(300);
        expect(getPoderDeEntidade({ isDummie: true }, 1)).toBeNull();
    });
    it('entidade jogador usa a ficha', () => {
        const f = fichaMinima();
        expect(getPoderDeEntidade({ isDummie: false, ficha: f }, 1)).toBe(getPoderParaDisputa(f, 1));
        expect(getPoderDeEntidade(f, 1)).toBe(getPoderParaDisputa(f, 1));
    });
    it('entidade nula: null', () => {
        expect(getPoderDeEntidade(null, 1)).toBeNull();
    });
});

describe('formatadores', () => {
    it('formatarFatorDisputa', () => {
        expect(formatarFatorDisputa(1.1)).toBe('1,1');
        expect(formatarFatorDisputa(0)).toBe('0');
        expect(formatarFatorDisputa(1)).toBe('1');
        expect(formatarFatorDisputa(Infinity)).toBe('∞');
        expect(formatarFatorDisputa(NaN)).toBe('∞');
        expect(formatarFatorDisputa(1234567)).toBe((1234567).toLocaleString('pt-BR'));
    });
    it('formatarPoderDisputa', () => {
        expect(formatarPoderDisputa(null)).toBe('?');
        expect(formatarPoderDisputa(undefined)).toBe('?');
        expect(formatarPoderDisputa(NaN)).toBe('?');
        expect(formatarPoderDisputa(Infinity)).toBe('?');
        expect(formatarPoderDisputa(0)).toBe('0');
        expect(formatarPoderDisputa(1234.6)).toBe((1235).toLocaleString('pt-BR'));
        expect(formatarPoderDisputa(2.5e15)).toBe('2.50E15');
    });
    it('descreverDisputa vazia para disputa inativa/nula', () => {
        expect(descreverDisputa(null)).toBe('');
        expect(descreverDisputa(undefined)).toBe('');
        expect(descreverDisputa(calcularDisputaPoder(null, 1))).toBe('');
    });
    it('descreverDisputa para atacante mais forte', () => {
        const t = descreverDisputa(calcularDisputaPoder(1100, 1000));
        expect(t).toContain('Disputa de Poder');
        expect(t).toContain('atacante +10%');
        expect(t).toContain('dano x1,1');
    });
    it('descreverDisputa para alvo mais forte', () => {
        const t = descreverDisputa(calcularDisputaPoder(1000, 1100));
        expect(t).toContain('alvo +10%');
        expect(t).toContain('dano x0,9');
    });
    it('descreverDisputa para Poder igual', () => {
        expect(descreverDisputa(calcularDisputaPoder(500, 500))).toContain('Poder igual');
    });
    it('descreverDisputa quando o golpe nao surte efeito', () => {
        const t = descreverDisputa(calcularDisputaPoder(1000, 2000));
        expect(t).toContain('o golpe não surte efeito');
        expect(t).not.toContain('dano x');
    });
    it('descreverDisputa com diferenca infinita mostra o simbolo de infinito', () => {
        expect(descreverDisputa(calcularDisputaPoder(1000, 0))).toContain('+∞');
    });
});

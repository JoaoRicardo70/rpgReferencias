import { describe, it, expect } from 'vitest';
import { getGlobalMultipliers, calcularPoderAtual, ESCALA_PODER_CALCULADO, aplicarEscalaPoderCalculado } from './poder';

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

describe('getGlobalMultipliers - exportada e valores neutros', () => {
    it('ficha nula devolve tudo 1, incluindo finalP', () => {
        expect(getGlobalMultipliers(null)).toEqual({ finalB: 1, finalG: 1, finalF: 1, finalA: 1, finalP: 1, finalUni: 1, totalDano: 1 });
    });
    it('ficha sem multiplicadores devolve tudo 1', () => {
        expect(getGlobalMultipliers(fichaMinima())).toMatchObject({ finalB: 1, finalG: 1, finalF: 1, finalA: 1, finalP: 1, finalUni: 1, totalDano: 1 });
    });
    it('ficha vazia (sem dano) nao lanca excecao', () => {
        expect(getGlobalMultipliers({}).totalDano).toBe(1);
    });
});

describe('getGlobalMultipliers - mFormas manual de ficha.dano', () => {
    it('mFormas=2 conta como (valor - 1) no grupo MFORMAS: finalF = 2', () => {
        expect(getGlobalMultipliers(fichaMinima({ dano: { mFormas: 2 } })).finalF).toBe(2);
    });
    it('mFormas igual a 1 ou menor que 1 nao altera finalF', () => {
        expect(getGlobalMultipliers(fichaMinima({ dano: { mFormas: 1 } })).finalF).toBe(1);
        expect(getGlobalMultipliers(fichaMinima({ dano: { mFormas: 0.5 } })).finalF).toBe(1);
    });
    it('mFormas invalido (texto) e ignorado', () => {
        expect(getGlobalMultipliers(fichaMinima({ dano: { mFormas: 'abc' } })).finalF).toBe(1);
    });
    it('mFormas manual soma com os eixos de Formas do mesmo grupo', () => {
        const f = fichaMinima({ dano: { mFormas: 2 }, forca: { ...stat(100000), mFormas: 3 } });
        expect(getGlobalMultipliers(f).finalF).toBe(1 + 1 + 2);
    });
    it('mFormas nao entra em totalDano (so B*G*A*P)', () => {
        expect(getGlobalMultipliers(fichaMinima({ dano: { mFormas: 5 } })).totalDano).toBe(1);
    });
});

describe('getGlobalMultipliers - mPotencial', () => {
    it('mPotencial=3 vira finalP=3 e multiplica totalDano', () => {
        const r = getGlobalMultipliers(fichaMinima({ dano: { mPotencial: 3 } }));
        expect(r.finalP).toBe(3);
        expect(r.totalDano).toBe(3);
    });
    it('mPotencial combina com mGeral em totalDano', () => {
        const r = getGlobalMultipliers(fichaMinima({ dano: { mPotencial: 2, mGeral: 3 } }));
        expect(r.finalG).toBe(1 + 3);
        expect(r.totalDano).toBe(r.finalB * r.finalG * r.finalA * 2);
    });
    it.each([0, -2, 'abc', null, undefined])('mPotencial invalido (%s) cai para 1', (v) => {
        expect(getGlobalMultipliers(fichaMinima({ dano: { mPotencial: v } })).finalP).toBe(1);
    });
});

describe('getGlobalMultipliers - mult_dano de itens e magias equipados', () => {
    it('item equipado com mult_dano entra em finalUni', () => {
        const r = getGlobalMultipliers(fichaMinima({ inventario: [{ equipado: true, bonusTipo: 'mult_dano', bonusValor: '2' }] }));
        expect(r.finalUni).toBe(2);
    });
    it('item NAO equipado e ignorado', () => {
        const r = getGlobalMultipliers(fichaMinima({ inventario: [{ equipado: false, bonusTipo: 'mult_dano', bonusValor: '2' }] }));
        expect(r.finalUni).toBe(1);
    });
    it('magia equipada com mult_dano entra em finalUni e multiplica com o item', () => {
        const r = getGlobalMultipliers(fichaMinima({
            inventario: [{ equipado: true, bonusTipo: 'mult_dano', bonusValor: 2 }],
            ataquesElementais: [{ equipado: true, bonusTipo: 'mult_dano', bonusValor: 3 }],
        }));
        expect(r.finalUni).toBe(6);
    });
    it('valor 0, negativo ou invalido e ignorado', () => {
        const r = getGlobalMultipliers(fichaMinima({
            inventario: [
                { equipado: true, bonusTipo: 'mult_dano', bonusValor: 0 },
                { equipado: true, bonusTipo: 'mult_dano', bonusValor: -3 },
                { equipado: true, bonusTipo: 'mult_dano', bonusValor: 'xx' },
            ],
        }));
        expect(r.finalUni).toBe(1);
    });
    it('outros bonusTipo (dano_bruto) nao entram', () => {
        const r = getGlobalMultipliers(fichaMinima({ inventario: [{ equipado: true, bonusTipo: 'dano_bruto', bonusValor: 50 }] }));
        expect(r.finalUni).toBe(1);
    });
    it('itens e magias nulos nas listas nao quebram', () => {
        const r = getGlobalMultipliers(fichaMinima({ inventario: [null, undefined], ataquesElementais: [null] }));
        expect(r.finalUni).toBe(1);
    });
    it('finalUni fica fora de totalDano', () => {
        const r = getGlobalMultipliers(fichaMinima({ inventario: [{ equipado: true, bonusTipo: 'mult_dano', bonusValor: 4 }] }));
        expect(r.totalDano).toBe(1);
    });
});

describe('getGlobalMultipliers - Passivas dano e Grimorio', () => {
    it('Passiva com efeito de dano (mgeral) conta no Poder', () => {
        const f = fichaMinima({ passivas: [{ nome: 'Furia', efeitos: [{ atributo: 'dano', propriedade: 'mgeral', valor: 2 }] }] });
        expect(getGlobalMultipliers(f).finalG).toBeGreaterThan(1);
    });
    it('Passiva com mUnico de dano entra em finalUni', () => {
        const f = fichaMinima({ passivas: [{ nome: 'P', efeitos: [{ atributo: 'dano', propriedade: 'munico', valor: 5 }] }] });
        expect(getGlobalMultipliers(f).finalUni).toBe(5);
    });
    it('Poder ativo do Grimorio (ficha.poderes) com efeito de dano continua EXCLUIDO', () => {
        const f = fichaMinima({ poderes: [{ nome: 'Rugido', ativa: true, efeitos: [{ atributo: 'dano', propriedade: 'mgeral', valor: 5 }], efeitosPassivos: [] }] });
        const r = getGlobalMultipliers(f);
        expect(r.finalG).toBe(1);
        expect(r.totalDano).toBe(1);
    });
    it('Passiva de OUTRO atributo (forca) nao conta como dano', () => {
        const f = fichaMinima({ passivas: [{ nome: 'P', efeitos: [{ atributo: 'forca', propriedade: 'mgeral', valor: 5 }] }] });
        expect(getGlobalMultipliers(f).finalG).toBe(1);
    });
});

describe('calcularPoderAtual - poderExato', () => {
    it('poderExato e finito, positivo e coerente com o poderGlobal arredondado', () => {
        const r = calcularPoderAtual(fichaMinima(), 1);
        expect(Number.isFinite(r.poderExato)).toBe(true);
        expect(r.poderExato).toBeGreaterThan(0);
        expect(r.poderGlobal).toBe(aplicarEscalaPoderCalculado(r.poderExato * ESCALA_PODER_CALCULADO));
    });
    it('ficha com valores minimos: poderExato nao negativo e proximo do poderGlobal', () => {
        const pequena = fichaMinima();
        [...STATUS, 'vida', 'mana', 'aura', 'chakra', 'corpo'].forEach(k => { pequena[k] = stat(1); });
        const r = calcularPoderAtual(pequena, 1);
        expect(r.poderExato).toBeGreaterThanOrEqual(0);
        expect(Math.abs(r.poderExato - r.poderGlobal)).toBeLessThanOrEqual(1);
    });
    it('ficha nula: poderExato 0', () => {
        expect(calcularPoderAtual(null, 1).poderExato).toBe(0);
    });
    it('mPotencial maior aumenta o poderExato', () => {
        const base = calcularPoderAtual(fichaMinima(), 1).poderExato;
        const maior = calcularPoderAtual(fichaMinima({ dano: { mPotencial: 2 } }), 1).poderExato;
        expect(maior).toBeGreaterThan(base);
    });
    it('mult_dano de item equipado aumenta o poderExato', () => {
        const base = calcularPoderAtual(fichaMinima(), 1).poderExato;
        const maior = calcularPoderAtual(fichaMinima({ inventario: [{ equipado: true, bonusTipo: 'mult_dano', bonusValor: 2 }] }), 1).poderExato;
        expect(maior).toBeGreaterThan(base);
    });
});

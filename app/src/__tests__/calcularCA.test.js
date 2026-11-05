import { describe, it, expect } from 'vitest';
import { calcularCA, calcularAcerto, BASE_CA } from '../core/engine.js';
import { reduzirComBonus } from '../core/utils.js';

// ==========================================
// Helpers
// ==========================================

function makeEfeito(atributo, propriedade, valor) {
    return { atributo, propriedade, valor: String(valor) };
}

function makeFicha({
    forcaBase = null,
    destrezaBase = null,
    poderes = [],
    passivas = [],
    inventario = [],
} = {}) {
    return {
        forca: forcaBase !== null ? { base: forcaBase } : undefined,
        destreza: destrezaBase !== null ? { base: destrezaBase } : undefined,
        poderes,
        passivas,
        inventario,
    };
}

function makePoder({
    ativa = false,
    efeitos = [],
    efeitosPassivos = [],
    formas = [],
    formaAtivaId = null,
} = {}) {
    return { ativa, efeitos, efeitosPassivos, formas, formaAtivaId };
}

function makeItem({ equipado = true, efeitos = [], efeitosPassivos = [], formas = [], formaAtivaId = null } = {}) {
    return { equipado, efeitos, efeitosPassivos, formas, formaAtivaId };
}

// ==========================================
// Happy Path — null / undefined ficha guard
// ==========================================

describe('calcularCA — ficha nula ou indefinida', () => {
    it('retorna BASE_CA (12) quando ficha e null', () => {
        expect(calcularCA(null, 'evasiva')).toBe(12);
    });

    it('retorna BASE_CA (12) quando ficha e undefined', () => {
        expect(calcularCA(undefined, 'resistencia')).toBe(12);
    });

    it('retorna BASE_CA (12) quando ficha e null independente do tipo', () => {
        expect(calcularCA(null, 'resistencia')).toBe(12);
        expect(calcularCA(null, 'evasiva')).toBe(12);
    });
});

// ==========================================
// Happy Path — base value derivation
// ==========================================

describe('calcularCA — valor base a partir de atributos', () => {
    it('evasiva: CA = BASE_CA + reduzirComBonus(destreza.base, 0)', () => {
        const ficha = makeFicha({ destrezaBase: 85 });
        // 12 + round(4*log10(85)) = 12 + 8
        expect(calcularCA(ficha, 'evasiva')).toBe(20);
    });

    it('resistencia: CA = BASE_CA + reduzirComBonus(forca.base, 0)', () => {
        const ficha = makeFicha({ forcaBase: 100 });
        // 12 + round(4*log10(100)) = 12 + 8
        expect(calcularCA(ficha, 'resistencia')).toBe(20);
    });

    it('evasiva: ficha sem destreza resulta so na base fixa: 12', () => {
        const ficha = makeFicha({ destrezaBase: null });
        expect(calcularCA(ficha, 'evasiva')).toBe(12);
    });

    it('resistencia: ficha sem forca resulta so na base fixa: 12', () => {
        const ficha = makeFicha({ forcaBase: null });
        expect(calcularCA(ficha, 'resistencia')).toBe(12);
    });

    it('evasiva ignora forca, resistencia ignora destreza', () => {
        const fichaAltoForca = makeFicha({ forcaBase: 99, destrezaBase: 10 });
        expect(calcularCA(fichaAltoForca, 'evasiva')).toBe(16);    // 12 + reduzirComBonus(10, 0) = 12 + 4
        expect(calcularCA(fichaAltoForca, 'resistencia')).toBe(20); // 12 + reduzirComBonus(99, 0) = 12 + 8
    });

    it('tipo desconhecido produz apenas a base fixa (12), sem atributo', () => {
        const ficha = makeFicha({ forcaBase: 99, destrezaBase: 99 });
        // nenhum if de tipo casa -> atributo 0, so os 12 fixos
        expect(calcularCA(ficha, 'defesa_magica')).toBe(12);
    });
});

// ==========================================
// Happy Path — bonusDeAtributo contínuo
// ==========================================

describe('calcularCA — redução contínua do total (MULTIPLICADOR_ATRIBUTO*log10)', () => {
    it('valor de 1 digito (7) => 12 + reduzirComBonus(7, 0) = 15', () => {
        const ficha = makeFicha({ destrezaBase: 7 });
        expect(calcularCA(ficha, 'evasiva')).toBe(15);
    });

    it('valor de 2 digitos (42) => 12 + reduzirComBonus(42, 0) = 18', () => {
        const ficha = makeFicha({ destrezaBase: 42 });
        expect(calcularCA(ficha, 'evasiva')).toBe(18);
    });

    it('valor de 3 digitos (350) => 12 + reduzirComBonus(350, 0) = 22', () => {
        const ficha = makeFicha({ destrezaBase: 350 });
        expect(calcularCA(ficha, 'evasiva')).toBe(22);
    });

    it('valores acima de 1000 seguem a mesma curva logaritmica (sem divisao por 1000)', () => {
        const ficha = makeFicha({ forcaBase: 1500 });
        // 12 + reduzirComBonus(1500, 0) = 12 + 13
        expect(calcularCA(ficha, 'resistencia')).toBe(25);
    });

    it('valor como string numerica e aceito', () => {
        const ficha = makeFicha({ destrezaBase: '75' });
        expect(calcularCA(ficha, 'evasiva')).toBe(20); // 12 + reduzirComBonus(75, 0)
    });

    it('valor zero resulta so na base fixa: 12', () => {
        const ficha = makeFicha({ destrezaBase: 0 });
        expect(calcularCA(ficha, 'evasiva')).toBe(12);
    });
});

// ==========================================
// Happy Path — bonus de poderes
// ==========================================

describe('calcularCA — bônus de poderes', () => {
    it('poder ativo com efeito de evasiva soma bonus', () => {
        const poder = makePoder({
            ativa: true,
            efeitos: [makeEfeito('evasiva', 'base', 10)],
        });
        const ficha = makeFicha({ destrezaBase: 0, poderes: [poder] });
        // 12 + reduzirComBonus(0, 10) = 12 + 6 (sem bonus seria 12)
        expect(calcularCA(ficha, 'evasiva')).toBe(18);
    });

    it('poder passivo (ativa=false) nao soma efeitos ativos', () => {
        const poder = makePoder({
            ativa: false,
            efeitos: [makeEfeito('evasiva', 'base', 10)],
        });
        const ficha = makeFicha({ destrezaBase: 0, poderes: [poder] });
        // efeitos ativos só são somados quando p.ativa === true
        expect(calcularCA(ficha, 'evasiva')).toBe(12);
    });

    it('efeitosPassivos de poder sempre somam, independente de ativa', () => {
        const poder = makePoder({
            ativa: false,
            efeitosPassivos: [makeEfeito('evasiva', 'base', 8)],
        });
        const ficha = makeFicha({ destrezaBase: 0, poderes: [poder] });
        // efeitosPassivos são sempre somados
        expect(calcularCA(ficha, 'evasiva')).toBe(18); // 12 + reduzirComBonus(0, 8) = 12 + 6
    });

    it('poder ativo soma tanto efeitos quanto efeitosPassivos', () => {
        const poder = makePoder({
            ativa: true,
            efeitos: [makeEfeito('evasiva', 'base', 5)],
            efeitosPassivos: [makeEfeito('evasiva', 'base', 3)],
        });
        const ficha = makeFicha({ destrezaBase: 0, poderes: [poder] });
        // bonus 5 + 3 = 8 => 12 + reduzirComBonus(0, 8) = 18
        expect(calcularCA(ficha, 'evasiva')).toBe(18);
    });

    it('efeito de atributo diferente do tipo nao e somado', () => {
        const poder = makePoder({
            ativa: true,
            efeitos: [makeEfeito('resistencia', 'base', 20)],
        });
        const ficha = makeFicha({ destrezaBase: 0, poderes: [poder] });
        // efeito atributo='resistencia' não bate com tipo='evasiva'
        expect(calcularCA(ficha, 'evasiva')).toBe(12);
    });

    it('efeito com propriedade diferente de base nao e somado', () => {
        const poder = makePoder({
            ativa: true,
            efeitos: [makeEfeito('evasiva', 'mbase', 20)],
        });
        const ficha = makeFicha({ destrezaBase: 0, poderes: [poder] });
        expect(calcularCA(ficha, 'evasiva')).toBe(12);
    });

    it('multiplos poderes com efeitos validos somam todos os bonus', () => {
        const p1 = makePoder({ ativa: true, efeitos: [makeEfeito('resistencia', 'base', 5)] });
        const p2 = makePoder({ ativa: true, efeitos: [makeEfeito('resistencia', 'base', 7)] });
        const ficha = makeFicha({ forcaBase: 0, poderes: [p1, p2] });
        // bonus 5 + 7 = 12 => 12 + reduzirComBonus(0, 12) = 12 + 6
        expect(calcularCA(ficha, 'resistencia')).toBe(18);
    });
});

// ==========================================
// Happy Path — bonus de passivas
// ==========================================

describe('calcularCA — bônus de passivas', () => {
    it('passiva com efeito correto soma bonus', () => {
        const passiva = { efeitos: [makeEfeito('evasiva', 'base', 6)] };
        const ficha = makeFicha({ destrezaBase: 0, passivas: [passiva] });
        expect(calcularCA(ficha, 'evasiva')).toBe(17); // 12 + reduzirComBonus(0, 6) = 12 + 5
    });

    it('passiva com atributo diferente nao soma', () => {
        const passiva = { efeitos: [makeEfeito('resistencia', 'base', 6)] };
        const ficha = makeFicha({ destrezaBase: 0, passivas: [passiva] });
        expect(calcularCA(ficha, 'evasiva')).toBe(12);
    });

    it('multiplas passivas somam todos os bonus validos', () => {
        const p1 = { efeitos: [makeEfeito('evasiva', 'base', 4)] };
        const p2 = { efeitos: [makeEfeito('evasiva', 'base', 6)] };
        const ficha = makeFicha({ destrezaBase: 0, passivas: [p1, p2] });
        expect(calcularCA(ficha, 'evasiva')).toBe(18); // 12 + reduzirComBonus(0, 10)
    });
});

// ==========================================
// Happy Path — bonus de inventario
// ==========================================

describe('calcularCA — bônus de inventário equipado', () => {
    it('item equipado com efeito correto soma bonus', () => {
        const item = makeItem({ equipado: true, efeitos: [makeEfeito('evasiva', 'base', 12)] });
        const ficha = makeFicha({ destrezaBase: 0, inventario: [item] });
        expect(calcularCA(ficha, 'evasiva')).toBe(18); // 12 + reduzirComBonus(0, 12)
    });

    it('item nao equipado nao soma bonus', () => {
        const item = makeItem({ equipado: false, efeitos: [makeEfeito('evasiva', 'base', 12)] });
        const ficha = makeFicha({ destrezaBase: 0, inventario: [item] });
        expect(calcularCA(ficha, 'evasiva')).toBe(12);
    });

    it('efeitosPassivos de item equipado somam', () => {
        const item = makeItem({ equipado: true, efeitosPassivos: [makeEfeito('resistencia', 'base', 9)] });
        const ficha = makeFicha({ forcaBase: 0, inventario: [item] });
        // 12 + reduzirComBonus(0, 9) = 12 + 6
        expect(calcularCA(ficha, 'resistencia')).toBe(18);
    });

    it('item equipado com atributo diferente nao soma', () => {
        const item = makeItem({ equipado: true, efeitos: [makeEfeito('forca', 'base', 99)] });
        const ficha = makeFicha({ destrezaBase: 0, inventario: [item] });
        expect(calcularCA(ficha, 'evasiva')).toBe(12);
    });
});

// ==========================================
// Happy Path — combinação de todas as fontes
// ==========================================

describe('calcularCA — combinação de múltiplas fontes de bônus', () => {
    it('soma base + poderes + passivas + inventario corretamente', () => {
        const poder = makePoder({
            ativa: true,
            efeitos: [makeEfeito('evasiva', 'base', 5)],
            efeitosPassivos: [makeEfeito('evasiva', 'base', 3)],
        });
        const passiva = { efeitos: [makeEfeito('evasiva', 'base', 4)] };
        const item = makeItem({ equipado: true, efeitos: [makeEfeito('evasiva', 'base', 6)] });

        const ficha = makeFicha({
            destrezaBase: 0,
            poderes: [poder],
            passivas: [passiva],
            inventario: [item],
        });
        // bonus = 5 + 3 + 4 + 6 = 18 => 12 + reduzirComBonus(0, 18) = 12 + 7
        expect(calcularCA(ficha, 'evasiva')).toBe(19);
    });
});

// ==========================================
// Happy Path — formas (integração real com resolverEfeitosEntidade)
// ==========================================

describe('calcularCA — formas em poderes e inventário', () => {
    it('poder ativo com forma acumuladora soma efeitos base + forma', () => {
        const poder = makePoder({
            ativa: true,
            efeitos: [makeEfeito('evasiva', 'base', 5)],
            efeitosPassivos: [],
            formas: [{
                id: 1, nome: 'Forma1', acumulaFormaBase: true,
                efeitos: [makeEfeito('evasiva', 'base', 10)],
                efeitosPassivos: [],
            }],
            formaAtivaId: 1,
        });
        const ficha = makeFicha({ destrezaBase: 0, poderes: [poder] });
        // resolved.efeitos = [base(5), forma(10)], p.ativa = true -> bonus = 15 => 12 + reduzirComBonus(0, 15) = 12 + 7
        expect(calcularCA(ficha, 'evasiva')).toBe(19);
    });

    it('poder ativo com forma substituta usa apenas efeitos da forma', () => {
        const poder = makePoder({
            ativa: true,
            efeitos: [makeEfeito('evasiva', 'base', 5)],
            efeitosPassivos: [],
            formas: [{
                id: 2, nome: 'Forma2', acumulaFormaBase: false,
                efeitos: [makeEfeito('evasiva', 'base', 20)],
                efeitosPassivos: [],
            }],
            formaAtivaId: 2,
        });
        const ficha = makeFicha({ destrezaBase: 0, poderes: [poder] });
        // resolved.efeitos = [forma(20)] apenas → bonus = 20
        // 12 + reduzirComBonus(0, 20) = 12 + 7 (so a forma conta: bonus 20, nao 25)
        expect(calcularCA(ficha, 'evasiva')).toBe(BASE_CA + reduzirComBonus(0, 20));
    });

    it('item equipado com forma acumuladora usa base + forma', () => {
        const item = makeItem({
            equipado: true,
            efeitos: [makeEfeito('resistencia', 'base', 3)],
            efeitosPassivos: [],
            formas: [{
                id: 1, nome: 'FormaCapa', acumulaFormaBase: true,
                efeitos: [makeEfeito('resistencia', 'base', 7)],
                efeitosPassivos: [],
            }],
            formaAtivaId: 1,
        });
        const ficha = makeFicha({ forcaBase: 0, inventario: [item] });
        // resolved.efeitos = [base(3), forma(7)] → bonus = 10
        // 12 + reduzirComBonus(0, 10) = 12 + 6
        expect(calcularCA(ficha, 'resistencia')).toBe(18);
    });
});

// ==========================================
// Edge Cases — valores nulos / indefinidos em sub-campos
// ==========================================

describe('calcularCA — edge cases de sub-campos', () => {
    it('ficha com destreza = undefined usa so a base fixa (12) para evasiva', () => {
        const ficha = { forca: undefined, destreza: undefined, poderes: [], passivas: [], inventario: [] };
        expect(calcularCA(ficha, 'evasiva')).toBe(12);
    });

    it('ficha com forca = undefined usa so a base fixa (12) para resistencia', () => {
        const ficha = { forca: undefined, destreza: undefined, poderes: [], passivas: [], inventario: [] };
        expect(calcularCA(ficha, 'resistencia')).toBe(12);
    });

    it('destreza.base = null -> atributo 0 -> 12', () => {
        const ficha = makeFicha({ destrezaBase: null });
        ficha.destreza = { base: null };
        expect(calcularCA(ficha, 'evasiva')).toBe(12);
    });

    it('destreza.base = string vazia -> 12', () => {
        const ficha = { ...makeFicha(), destreza: { base: '' } };
        expect(calcularCA(ficha, 'evasiva')).toBe(12);
    });

    it('destreza.base = string nao numerica -> 12', () => {
        const ficha = { ...makeFicha(), destreza: { base: 'abc' } };
        expect(calcularCA(ficha, 'evasiva')).toBe(12);
    });

    it('poderes = undefined nao lanca excecao', () => {
        const ficha = makeFicha({ destrezaBase: 50 });
        ficha.poderes = undefined;
        expect(() => calcularCA(ficha, 'evasiva')).not.toThrow();
        expect(calcularCA(ficha, 'evasiva')).toBe(19);
    });

    it('passivas = undefined nao lanca excecao', () => {
        const ficha = makeFicha({ destrezaBase: 50 });
        ficha.passivas = undefined;
        expect(() => calcularCA(ficha, 'evasiva')).not.toThrow();
        expect(calcularCA(ficha, 'evasiva')).toBe(19);
    });

    it('inventario = undefined nao lanca excecao', () => {
        const ficha = makeFicha({ destrezaBase: 50 });
        ficha.inventario = undefined;
        expect(() => calcularCA(ficha, 'evasiva')).not.toThrow();
        expect(calcularCA(ficha, 'evasiva')).toBe(19);
    });

    it('efeito com valor nao numerico nao contribui (parseFloat retorna NaN → 0)', () => {
        const poder = makePoder({
            ativa: true,
            efeitos: [{ atributo: 'evasiva', propriedade: 'base', valor: 'abc' }],
        });
        const ficha = makeFicha({ destrezaBase: 50, poderes: [poder] });
        expect(calcularCA(ficha, 'evasiva')).toBe(19);
    });

    it('efeito com valor null nao contribui', () => {
        const poder = makePoder({
            ativa: true,
            efeitos: [{ atributo: 'evasiva', propriedade: 'base', valor: null }],
        });
        const ficha = makeFicha({ destrezaBase: 50, poderes: [poder] });
        expect(calcularCA(ficha, 'evasiva')).toBe(19);
    });

    it('efeito null dentro do array e ignorado graciosamente', () => {
        const poder = makePoder({ ativa: true, efeitos: [null] });
        const ficha = makeFicha({ destrezaBase: 50, poderes: [poder] });
        expect(() => calcularCA(ficha, 'evasiva')).not.toThrow();
        expect(calcularCA(ficha, 'evasiva')).toBe(19);
    });

    it('passiva sem campo efeitos nao lanca excecao', () => {
        const ficha = makeFicha({ destrezaBase: 50, passivas: [{}] });
        expect(() => calcularCA(ficha, 'evasiva')).not.toThrow();
        expect(calcularCA(ficha, 'evasiva')).toBe(19);
    });
});

// ==========================================
// Edge Cases — valores de borda
// ==========================================

describe('calcularCA — valores de borda', () => {
    it('destreza.base = 1 -> 12 + reduzirComBonus(1, 0) = 12', () => {
        const ficha = makeFicha({ destrezaBase: 1 });
        expect(calcularCA(ficha, 'evasiva')).toBe(12);
    });

    it('destreza.base = 99 -> 12 + reduzirComBonus(99, 0) = 20', () => {
        const ficha = makeFicha({ destrezaBase: 99 });
        expect(calcularCA(ficha, 'evasiva')).toBe(20);
    });

    it('destreza.base = 9999 -> 12 + reduzirComBonus(9999, 0) = 28', () => {
        const ficha = makeFicha({ destrezaBase: 9999 });
        expect(calcularCA(ficha, 'evasiva')).toBe(28);
    });

    it('bonus flutuante entra sem truncar', () => {
        const poder = makePoder({
            ativa: true,
            efeitos: [makeEfeito('evasiva', 'base', '1.9')],
        });
        const ficha = makeFicha({ destrezaBase: 5, poderes: [poder] });
        // 12 + reduzirComBonus(5, 1.9) = 12 + 6 (truncado para 1 daria 12 + reduzirComBonus(5, 1) = 12 + 5)
        expect(calcularCA(ficha, 'evasiva')).toBe(18);
        expect(calcularCA(ficha, 'evasiva')).toBe(BASE_CA + reduzirComBonus(5, 1.9));
    });

    it('bonus negativo reduz o valor final', () => {
        const poder = makePoder({
            ativa: true,
            efeitos: [makeEfeito('evasiva', 'base', -40)],
        });
        const ficha = makeFicha({ destrezaBase: 50, poderes: [poder] });
        // 12 + reduzirComBonus(50, -40) = 12 - 2 = 10 (sem o bonus negativo seria 19)
        expect(calcularCA(ficha, 'evasiva')).toBe(BASE_CA + reduzirComBonus(50, -40));
        expect(calcularCA(ficha, 'evasiva')).toBe(10);
    });

    it('sem poderes, passivas ou inventario retorna apenas BASE_CA + reduzirComBonus(atributo, 0)', () => {
        const ficha = makeFicha({ destrezaBase: 60 });
        expect(calcularCA(ficha, 'evasiva')).toBe(19); // 12 + 7
    });

    it('ficha completamente vazia (sem atributos nem colecoes) retorna 12', () => {
        expect(calcularCA({}, 'evasiva')).toBe(12);
        expect(calcularCA({}, 'resistencia')).toBe(12);
    });
});

// ==========================================
// Error Cases — entradas inválidas
// ==========================================

describe('calcularCA — entradas inválidas', () => {
    it('tipo = null nao lanca excecao e retorna apenas base', () => {
        const ficha = makeFicha({ forcaBase: 80, destrezaBase: 50 });
        expect(() => calcularCA(ficha, null)).not.toThrow();
        // null nao bate em nenhum if -> atributo 0 -> so a base fixa
        expect(calcularCA(ficha, null)).toBe(12);
    });

    it('tipo = undefined nao lanca excecao e retorna apenas base', () => {
        const ficha = makeFicha({ forcaBase: 80, destrezaBase: 50 });
        expect(() => calcularCA(ficha, undefined)).not.toThrow();
        expect(calcularCA(ficha, undefined)).toBe(12);
    });

    it('tipo = numero nao lanca excecao e retorna apenas base', () => {
        const ficha = makeFicha({ forcaBase: 80, destrezaBase: 50 });
        expect(() => calcularCA(ficha, 42)).not.toThrow();
        expect(calcularCA(ficha, 42)).toBe(12);
    });

    it('retorna numero (nao NaN, nao Infinity) em todos os casos validos', () => {
        const ficha = makeFicha({ forcaBase: 100, destrezaBase: 80 });
        const caEvasiva = calcularCA(ficha, 'evasiva');
        const caResist = calcularCA(ficha, 'resistencia');
        expect(typeof caEvasiva).toBe('number');
        expect(isNaN(caEvasiva)).toBe(false);
        expect(isFinite(caEvasiva)).toBe(true);
        expect(typeof caResist).toBe('number');
        expect(isNaN(caResist)).toBe(false);
        expect(isFinite(caResist)).toBe(true);
    });

    it('ficha = 0 (falsy) retorna 12', () => {
        expect(calcularCA(0, 'evasiva')).toBe(12);
    });

    it('ficha = false (falsy) retorna 12', () => {
        expect(calcularCA(false, 'evasiva')).toBe(12);
    });

    it('ficha = string vazia (falsy) retorna 12', () => {
        expect(calcularCA('', 'evasiva')).toBe(12);
    });
});

describe('calcularCA — Ascensao nao entra na CA', () => {
    it('Ascensao e multiplicador de Ascensao nao mudam Evasiva nem Resistencia', () => {
        const semAsc = makeFicha({ destrezaBase: 50, forcaBase: 400 });
        const comAsc = makeFicha({ destrezaBase: 50, forcaBase: 400 });
        comAsc.ascensaoBase = 8;
        comAsc.multiplicadorForcaAscensao = 3;
        expect(calcularCA(comAsc, 'evasiva')).toBe(calcularCA(semAsc, 'evasiva'));
        expect(calcularCA(comAsc, 'resistencia')).toBe(calcularCA(semAsc, 'resistencia'));
        expect(calcularCA(comAsc, 'evasiva')).toBe(19);
        expect(calcularCA(comAsc, 'resistencia')).toBe(22);
    });
});

describe('calcularCA — bônus pesa em proporção ao atributo (decisão do usuário)', () => {
    const passivaPoder = (atributo, valor) => makePoder({ ativa: false, efeitosPassivos: [makeEfeito(atributo, 'base', valor)] });

    it('destreza ~316000 com bônus +5 em evasiva: CA 39 (sem bônus: 34)', () => {
        const sem = makeFicha({ destrezaBase: 316000 });
        const com = makeFicha({ destrezaBase: 316000, poderes: [passivaPoder('evasiva', 5)] });
        expect(calcularCA(sem, 'evasiva')).toBe(34);
        expect(calcularCA(com, 'evasiva')).toBe(39);
    });

    it('efeitos passivos EVASIVA +50 base e RESISTENCIA +50 base mudam a CA de 34 para 43', () => {
        const poderes = [passivaPoder('evasiva', 50), passivaPoder('resistencia', 50)];
        const sem = makeFicha({ destrezaBase: 316000, forcaBase: 316000 });
        const com = makeFicha({ destrezaBase: 316000, forcaBase: 316000, poderes });
        expect(calcularCA(sem, 'evasiva')).toBe(34);
        expect(calcularCA(sem, 'resistencia')).toBe(34);
        expect(calcularCA(com, 'evasiva')).toBe(43);
        expect(calcularCA(com, 'resistencia')).toBe(43);
    });

    it('o bônus de uma defesa não vaza para a outra', () => {
        const f = makeFicha({ destrezaBase: 316000, forcaBase: 316000, poderes: [passivaPoder('evasiva', 50)] });
        expect(calcularCA(f, 'evasiva')).toBe(43);
        expect(calcularCA(f, 'resistencia')).toBe(34);
    });

    it('o mesmo bônus soma o mesmo tanto com atributo fraco e forte', () => {
        const ganho = (attr) => calcularCA(makeFicha({ destrezaBase: attr, poderes: [passivaPoder('evasiva', 50)] }), 'evasiva')
            - calcularCA(makeFicha({ destrezaBase: attr }), 'evasiva');
        expect(ganho(1e7 - 5)).toBe(ganho(995));
    });
});

// ==========================================
// BASE_CA fixa (12), fora da redução
// ==========================================

describe('calcularCA — BASE_CA (12) somada depois da redução', () => {
    const passivaPoder = (atributo, valor) => makePoder({ ativa: false, efeitosPassivos: [makeEfeito(atributo, 'base', valor)] });

    it('BASE_CA vale exatamente 12', () => {
        expect(BASE_CA).toBe(12);
    });

    it('atributo 0 sem bonus da exatamente 12 (evasiva e resistencia)', () => {
        const ficha = makeFicha({ destrezaBase: 0, forcaBase: 0 });
        expect(calcularCA(ficha, 'evasiva')).toBe(12);
        expect(calcularCA(ficha, 'resistencia')).toBe(12);
    });

    it('ancoras: destreza 316000 => 12 + 22 = 34; com +50 => 12 + 31 = 43', () => {
        const sem = makeFicha({ destrezaBase: 316000 });
        const com = makeFicha({ destrezaBase: 316000, poderes: [passivaPoder('evasiva', 50)] });
        expect(calcularCA(sem, 'evasiva')).toBe(34);
        expect(calcularCA(com, 'evasiva')).toBe(43);
    });

    it('destreza 100000 => 12 + 20 = 32', () => {
        expect(calcularCA(makeFicha({ destrezaBase: 100000 }), 'evasiva')).toBe(32);
    });

    it('a base fica FORA da reducao: CA - 12 e exatamente reduzirComBonus(atributo, bonus)', () => {
        [[0, 0], [5, 10], [50, 3], [316000, 50], [316000, 0]].forEach(([attr, bonus]) => {
            const poderes = bonus ? [passivaPoder('evasiva', bonus)] : [];
            const ca = calcularCA(makeFicha({ destrezaBase: attr, poderes }), 'evasiva');
            expect(ca - BASE_CA).toBe(reduzirComBonus(attr, bonus));
        });
    });

    it('bonus grande nao reduz a base: soma 12 inteiros mesmo com bonus enorme', () => {
        const ficha = makeFicha({ destrezaBase: 0, poderes: [passivaPoder('evasiva', 1e9)] });
        const ca = calcularCA(ficha, 'evasiva');
        expect(ca).toBe(12 + reduzirComBonus(0, 1e9));
        expect(ca).toBeGreaterThan(12 + 30);
    });

    it('penalidade pode derrubar a CA abaixo de 12 e ate abaixo de 0, mas a base continua inteira', () => {
        const mod = makeFicha({ destrezaBase: 0, poderes: [passivaPoder('evasiva', -45)] });
        expect(calcularCA(mod, 'evasiva')).toBe(12 + reduzirComBonus(0, -45));
        expect(calcularCA(mod, 'evasiva')).toBeLessThan(12);
        const enorme = makeFicha({ destrezaBase: 0, poderes: [passivaPoder('evasiva', -1e9)] });
        expect(calcularCA(enorme, 'evasiva')).toBeLessThan(0);
    });

    it('condicao que multiplica a CA (Lento: evasiva x1/2) multiplica tambem os 12', () => {
        const lento = makeFicha({ destrezaBase: 0 });
        lento.condicoes = [{ id: 'lento', stacks: 1 }];
        expect(calcularCA(lento, 'evasiva')).toBe(6); // floor(12 / 2)
        // resistencia nao e afetada pelo Lento
        expect(calcularCA(lento, 'resistencia')).toBe(12);

        const lentoAlto = makeFicha({ destrezaBase: 316000 });
        lentoAlto.condicoes = [{ id: 'lento', stacks: 1 }];
        expect(calcularCA(lentoAlto, 'evasiva')).toBe(17); // floor((12 + 22) / 2)
    });

    it('condicao que multiplica a CA (Vulneravel: resistencia x1/2) multiplica tambem os 12', () => {
        const f = makeFicha({ forcaBase: 316000 });
        f.condicoes = [{ id: 'vulneravel', stacks: 1 }];
        expect(calcularCA(f, 'resistencia')).toBe(17); // floor((12 + 22) / 2)
    });

    it('condicao que zera a CA (Imobilizado) zera tambem os 12', () => {
        const f = makeFicha({ destrezaBase: 0 });
        f.condicoes = [{ id: 'imobilizado', stacks: 1 }];
        expect(calcularCA(f, 'evasiva')).toBe(0);
    });
});

describe('Acerto x CA — atributos iguais exigem d20 >= 10 (~55%)', () => {
    const fichaIgual = (attr) => ({ poderes: [], inventario: [], passivas: [], destreza: { base: attr, nome: 'destreza' } });

    // Mesmo atributo dos dois lados, sem bonus, Prof 2: Acerto = reduz(attr) + d20 + 2 contra CA = 12 + reduz(attr).
    const acertoComD20 = (attr, d20) => {
        const orig = Math.random;
        Math.random = () => (d20 - 1) / 20 + 0.01; // floor(r * 20) + 1 = d20
        try {
            return calcularAcerto({ qD: 1, fD: 20, prof: 2, bonus: 0, sels: ['destreza'], minhaFicha: fichaIgual(attr), itensEquipados: [] }).acertoTotal;
        } finally { Math.random = orig; }
    };

    it.each([5, 100, 316000])('atributo %s: acerta (acerto >= CA) se, e somente se, d20 >= 10', (attr) => {
        const ca = calcularCA(fichaIgual(attr), 'evasiva');
        for (let d = 1; d <= 20; d++) {
            const acerto = acertoComD20(attr, d);
            expect(acerto).toBe(reduzirComBonus(attr, 0) + d + 2);
            expect(acerto >= ca).toBe(d >= 10);
        }
    });

    it('11 dos 20 resultados do d20 acertam: 55%', () => {
        const attr = 316000;
        const ca = calcularCA(fichaIgual(attr), 'evasiva');
        let acertos = 0;
        for (let d = 1; d <= 20; d++) if (acertoComD20(attr, d) >= ca) acertos++;
        expect(acertos).toBe(11);
        expect(acertos / 20).toBeCloseTo(0.55, 5);
    });
});

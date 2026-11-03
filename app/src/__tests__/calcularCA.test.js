import { describe, it, expect } from 'vitest';
import { calcularCA } from '../core/engine.js';

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
    it('retorna 10 quando ficha e null', () => {
        expect(calcularCA(null, 'evasiva')).toBe(10);
    });

    it('retorna 10 quando ficha e undefined', () => {
        expect(calcularCA(undefined, 'resistencia')).toBe(10);
    });

    it('retorna 10 quando ficha e null independente do tipo', () => {
        expect(calcularCA(null, 'resistencia')).toBe(10);
        expect(calcularCA(null, 'evasiva')).toBe(10);
    });
});

// ==========================================
// Happy Path — base value derivation
// ==========================================

describe('calcularCA — valor base a partir de atributos', () => {
    it('evasiva: base = 5 + bonusDeAtributo(destreza.base)', () => {
        const ficha = makeFicha({ destrezaBase: 85 });
        // round(10*log10(85)) = 19 → base = 5 + 19 = 24
        expect(calcularCA(ficha, 'evasiva')).toBe(24);
    });

    it('resistencia: base = 5 + bonusDeAtributo(forca.base)', () => {
        const ficha = makeFicha({ forcaBase: 100 });
        // round(10*log10(100)) = 20 → base = 5 + 20 = 25
        expect(calcularCA(ficha, 'resistencia')).toBe(25);
    });

    it('evasiva: ficha sem destreza resulta em base = 5', () => {
        const ficha = makeFicha({ destrezaBase: null });
        expect(calcularCA(ficha, 'evasiva')).toBe(5);
    });

    it('resistencia: ficha sem forca resulta em base = 5', () => {
        const ficha = makeFicha({ forcaBase: null });
        expect(calcularCA(ficha, 'resistencia')).toBe(5);
    });

    it('evasiva ignora forca, resistencia ignora destreza', () => {
        const fichaAltoForca = makeFicha({ forcaBase: 99, destrezaBase: 10 });
        expect(calcularCA(fichaAltoForca, 'evasiva')).toBe(15);    // 5 + 10 (10*log10(10) = 10)
        expect(calcularCA(fichaAltoForca, 'resistencia')).toBe(25); // 5 + 99
    });

    it('tipo desconhecido produz apenas base = 5 sem bônus de atributo', () => {
        const ficha = makeFicha({ forcaBase: 99, destrezaBase: 99 });
        // nenhum if de tipo casa → base permanece 5, sem bonus de poderes
        expect(calcularCA(ficha, 'defesa_magica')).toBe(5);
    });
});

// ==========================================
// Happy Path — bonusDeAtributo contínuo
// ==========================================

describe('calcularCA — bônus contínuo de atributo (10*log10)', () => {
    it('valor de 1 digito (7) => bonus 8', () => {
        const ficha = makeFicha({ destrezaBase: 7 });
        // round(10*log10(7)) = 8 → base = 13
        expect(calcularCA(ficha, 'evasiva')).toBe(13);
    });

    it('valor de 2 digitos (42) => bonus 16', () => {
        const ficha = makeFicha({ destrezaBase: 42 });
        expect(calcularCA(ficha, 'evasiva')).toBe(21); // 5 + 16
    });

    it('valor de 3 digitos (350) => bonus 25', () => {
        const ficha = makeFicha({ destrezaBase: 350 });
        // round(10*log10(350)) = 25 → base = 30
        expect(calcularCA(ficha, 'evasiva')).toBe(30);
    });

    it('valores acima de 1000 seguem a mesma curva logaritmica (sem divisao por 1000)', () => {
        const ficha = makeFicha({ forcaBase: 1500 });
        // round(10*log10(1500)) = 32 → base = 37
        expect(calcularCA(ficha, 'resistencia')).toBe(37);
    });

    it('valor como string numerica e aceito', () => {
        const ficha = makeFicha({ destrezaBase: '75' });
        expect(calcularCA(ficha, 'evasiva')).toBe(24); // 5 + 19
    });

    it('valor zero resulta em base = 5', () => {
        const ficha = makeFicha({ destrezaBase: 0 });
        // bonusDeAtributo(0) = 0 → base = 5
        expect(calcularCA(ficha, 'evasiva')).toBe(5);
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
        const ficha = makeFicha({ destrezaBase: 50, poderes: [poder] });
        // base = 5 + 17 = 22, bonus = 10 → total = 32
        expect(calcularCA(ficha, 'evasiva')).toBe(32);
    });

    it('poder passivo (ativa=false) nao soma efeitos ativos', () => {
        const poder = makePoder({
            ativa: false,
            efeitos: [makeEfeito('evasiva', 'base', 10)],
        });
        const ficha = makeFicha({ destrezaBase: 50, poderes: [poder] });
        // efeitos ativos só são somados quando p.ativa === true
        expect(calcularCA(ficha, 'evasiva')).toBe(22);
    });

    it('efeitosPassivos de poder sempre somam, independente de ativa', () => {
        const poder = makePoder({
            ativa: false,
            efeitosPassivos: [makeEfeito('evasiva', 'base', 8)],
        });
        const ficha = makeFicha({ destrezaBase: 50, poderes: [poder] });
        // efeitosPassivos são sempre somados
        expect(calcularCA(ficha, 'evasiva')).toBe(30); // 22 + 8
    });

    it('poder ativo soma tanto efeitos quanto efeitosPassivos', () => {
        const poder = makePoder({
            ativa: true,
            efeitos: [makeEfeito('evasiva', 'base', 5)],
            efeitosPassivos: [makeEfeito('evasiva', 'base', 3)],
        });
        const ficha = makeFicha({ destrezaBase: 50, poderes: [poder] });
        // 22 + 5 + 3 = 30
        expect(calcularCA(ficha, 'evasiva')).toBe(30);
    });

    it('efeito de atributo diferente do tipo nao e somado', () => {
        const poder = makePoder({
            ativa: true,
            efeitos: [makeEfeito('resistencia', 'base', 20)],
        });
        const ficha = makeFicha({ destrezaBase: 50, poderes: [poder] });
        // efeito atributo='resistencia' não bate com tipo='evasiva'
        expect(calcularCA(ficha, 'evasiva')).toBe(22);
    });

    it('efeito com propriedade diferente de base nao e somado', () => {
        const poder = makePoder({
            ativa: true,
            efeitos: [makeEfeito('evasiva', 'mbase', 20)],
        });
        const ficha = makeFicha({ destrezaBase: 50, poderes: [poder] });
        expect(calcularCA(ficha, 'evasiva')).toBe(22);
    });

    it('multiplos poderes com efeitos validos somam todos os bonus', () => {
        const p1 = makePoder({ ativa: true, efeitos: [makeEfeito('resistencia', 'base', 5)] });
        const p2 = makePoder({ ativa: true, efeitos: [makeEfeito('resistencia', 'base', 7)] });
        const ficha = makeFicha({ forcaBase: 80, poderes: [p1, p2] });
        // base = 5 + 19 = 24, bonus = 5 + 7 = 12 → 36
        expect(calcularCA(ficha, 'resistencia')).toBe(36);
    });
});

// ==========================================
// Happy Path — bonus de passivas
// ==========================================

describe('calcularCA — bônus de passivas', () => {
    it('passiva com efeito correto soma bonus', () => {
        const passiva = { efeitos: [makeEfeito('evasiva', 'base', 6)] };
        const ficha = makeFicha({ destrezaBase: 50, passivas: [passiva] });
        expect(calcularCA(ficha, 'evasiva')).toBe(28); // 22 + 6
    });

    it('passiva com atributo diferente nao soma', () => {
        const passiva = { efeitos: [makeEfeito('resistencia', 'base', 6)] };
        const ficha = makeFicha({ destrezaBase: 50, passivas: [passiva] });
        expect(calcularCA(ficha, 'evasiva')).toBe(22);
    });

    it('multiplas passivas somam todos os bonus validos', () => {
        const p1 = { efeitos: [makeEfeito('evasiva', 'base', 4)] };
        const p2 = { efeitos: [makeEfeito('evasiva', 'base', 6)] };
        const ficha = makeFicha({ destrezaBase: 50, passivas: [p1, p2] });
        expect(calcularCA(ficha, 'evasiva')).toBe(32); // 22 + 4 + 6
    });
});

// ==========================================
// Happy Path — bonus de inventario
// ==========================================

describe('calcularCA — bônus de inventário equipado', () => {
    it('item equipado com efeito correto soma bonus', () => {
        const item = makeItem({ equipado: true, efeitos: [makeEfeito('evasiva', 'base', 12)] });
        const ficha = makeFicha({ destrezaBase: 50, inventario: [item] });
        expect(calcularCA(ficha, 'evasiva')).toBe(34); // 22 + 12
    });

    it('item nao equipado nao soma bonus', () => {
        const item = makeItem({ equipado: false, efeitos: [makeEfeito('evasiva', 'base', 12)] });
        const ficha = makeFicha({ destrezaBase: 50, inventario: [item] });
        expect(calcularCA(ficha, 'evasiva')).toBe(22);
    });

    it('efeitosPassivos de item equipado somam', () => {
        const item = makeItem({ equipado: true, efeitosPassivos: [makeEfeito('resistencia', 'base', 9)] });
        const ficha = makeFicha({ forcaBase: 80, inventario: [item] });
        // base = 5 + 19 = 24, bonus = 9 → 33
        expect(calcularCA(ficha, 'resistencia')).toBe(33);
    });

    it('item equipado com atributo diferente nao soma', () => {
        const item = makeItem({ equipado: true, efeitos: [makeEfeito('forca', 'base', 99)] });
        const ficha = makeFicha({ destrezaBase: 50, inventario: [item] });
        expect(calcularCA(ficha, 'evasiva')).toBe(22);
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
            destrezaBase: 50,
            poderes: [poder],
            passivas: [passiva],
            inventario: [item],
        });
        // base = 22, bonus = 5 + 3 + 4 + 6 = 18 → total = 40
        expect(calcularCA(ficha, 'evasiva')).toBe(40);
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
        const ficha = makeFicha({ destrezaBase: 50, poderes: [poder] });
        // resolved.efeitos = [base(5), forma(10)], p.ativa = true → bonus = 15
        // base = 22 + 15 = 37
        expect(calcularCA(ficha, 'evasiva')).toBe(37);
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
        const ficha = makeFicha({ destrezaBase: 50, poderes: [poder] });
        // resolved.efeitos = [forma(20)] apenas → bonus = 20
        // base = 22 + 20 = 42
        expect(calcularCA(ficha, 'evasiva')).toBe(42);
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
        const ficha = makeFicha({ forcaBase: 80, inventario: [item] });
        // resolved.efeitos = [base(3), forma(7)] → bonus = 10
        // base = 5 + 19 = 24 + 10 = 34
        expect(calcularCA(ficha, 'resistencia')).toBe(34);
    });
});

// ==========================================
// Edge Cases — valores nulos / indefinidos em sub-campos
// ==========================================

describe('calcularCA — edge cases de sub-campos', () => {
    it('ficha com destreza = undefined usa base = 5 para evasiva', () => {
        const ficha = { forca: undefined, destreza: undefined, poderes: [], passivas: [], inventario: [] };
        expect(calcularCA(ficha, 'evasiva')).toBe(5);
    });

    it('ficha com forca = undefined usa base = 5 para resistencia', () => {
        const ficha = { forca: undefined, destreza: undefined, poderes: [], passivas: [], inventario: [] };
        expect(calcularCA(ficha, 'resistencia')).toBe(5);
    });

    it('destreza.base = null → bonus 0 → base = 5', () => {
        const ficha = makeFicha({ destrezaBase: null });
        ficha.destreza = { base: null };
        expect(calcularCA(ficha, 'evasiva')).toBe(5);
    });

    it('destreza.base = string vazia → base = 5', () => {
        const ficha = { ...makeFicha(), destreza: { base: '' } };
        expect(calcularCA(ficha, 'evasiva')).toBe(5);
    });

    it('destreza.base = string nao numerica → base = 5', () => {
        const ficha = { ...makeFicha(), destreza: { base: 'abc' } };
        expect(calcularCA(ficha, 'evasiva')).toBe(5);
    });

    it('poderes = undefined nao lanca excecao', () => {
        const ficha = makeFicha({ destrezaBase: 50 });
        ficha.poderes = undefined;
        expect(() => calcularCA(ficha, 'evasiva')).not.toThrow();
        expect(calcularCA(ficha, 'evasiva')).toBe(22);
    });

    it('passivas = undefined nao lanca excecao', () => {
        const ficha = makeFicha({ destrezaBase: 50 });
        ficha.passivas = undefined;
        expect(() => calcularCA(ficha, 'evasiva')).not.toThrow();
        expect(calcularCA(ficha, 'evasiva')).toBe(22);
    });

    it('inventario = undefined nao lanca excecao', () => {
        const ficha = makeFicha({ destrezaBase: 50 });
        ficha.inventario = undefined;
        expect(() => calcularCA(ficha, 'evasiva')).not.toThrow();
        expect(calcularCA(ficha, 'evasiva')).toBe(22);
    });

    it('efeito com valor nao numerico nao contribui (parseFloat retorna NaN → 0)', () => {
        const poder = makePoder({
            ativa: true,
            efeitos: [{ atributo: 'evasiva', propriedade: 'base', valor: 'abc' }],
        });
        const ficha = makeFicha({ destrezaBase: 50, poderes: [poder] });
        expect(calcularCA(ficha, 'evasiva')).toBe(22);
    });

    it('efeito com valor null nao contribui', () => {
        const poder = makePoder({
            ativa: true,
            efeitos: [{ atributo: 'evasiva', propriedade: 'base', valor: null }],
        });
        const ficha = makeFicha({ destrezaBase: 50, poderes: [poder] });
        expect(calcularCA(ficha, 'evasiva')).toBe(22);
    });

    it('efeito null dentro do array e ignorado graciosamente', () => {
        const poder = makePoder({ ativa: true, efeitos: [null] });
        const ficha = makeFicha({ destrezaBase: 50, poderes: [poder] });
        expect(() => calcularCA(ficha, 'evasiva')).not.toThrow();
        expect(calcularCA(ficha, 'evasiva')).toBe(22);
    });

    it('passiva sem campo efeitos nao lanca excecao', () => {
        const ficha = makeFicha({ destrezaBase: 50, passivas: [{}] });
        expect(() => calcularCA(ficha, 'evasiva')).not.toThrow();
        expect(calcularCA(ficha, 'evasiva')).toBe(22);
    });
});

// ==========================================
// Edge Cases — valores de borda
// ==========================================

describe('calcularCA — valores de borda', () => {
    it('destreza.base = 1 → bonus 0 → base = 5', () => {
        const ficha = makeFicha({ destrezaBase: 1 });
        expect(calcularCA(ficha, 'evasiva')).toBe(5);
    });

    it('destreza.base = 99 → bonus 20 → base = 25', () => {
        const ficha = makeFicha({ destrezaBase: 99 });
        expect(calcularCA(ficha, 'evasiva')).toBe(25);
    });

    it('destreza.base = 9999 → bonus 40 → base = 45', () => {
        const ficha = makeFicha({ destrezaBase: 9999 });
        expect(calcularCA(ficha, 'evasiva')).toBe(45);
    });

    it('bonus flutuante e truncado por Math.floor', () => {
        const poder = makePoder({
            ativa: true,
            efeitos: [makeEfeito('evasiva', 'base', '3.9')],
        });
        const ficha = makeFicha({ destrezaBase: 50, poderes: [poder] });
        // base = 22, bonus = 3.9 → Math.floor(25.9) = 25
        expect(calcularCA(ficha, 'evasiva')).toBe(25);
    });

    it('bonus negativo reduz o valor final', () => {
        const poder = makePoder({
            ativa: true,
            efeitos: [makeEfeito('evasiva', 'base', -10)],
        });
        const ficha = makeFicha({ destrezaBase: 50, poderes: [poder] });
        // base = 22, bonus = -10 → 12
        expect(calcularCA(ficha, 'evasiva')).toBe(12);
    });

    it('sem poderes, passivas ou inventario retorna apenas o base', () => {
        const ficha = makeFicha({ destrezaBase: 60 });
        expect(calcularCA(ficha, 'evasiva')).toBe(23); // 5 + 18
    });

    it('ficha completamente vazia (sem atributos nem coleções) retorna 5', () => {
        expect(calcularCA({}, 'evasiva')).toBe(5);
        expect(calcularCA({}, 'resistencia')).toBe(5);
    });
});

// ==========================================
// Error Cases — entradas inválidas
// ==========================================

describe('calcularCA — entradas inválidas', () => {
    it('tipo = null nao lanca excecao e retorna apenas base', () => {
        const ficha = makeFicha({ forcaBase: 80, destrezaBase: 50 });
        expect(() => calcularCA(ficha, null)).not.toThrow();
        // null não bate em nenhum if → base = 5
        expect(calcularCA(ficha, null)).toBe(5);
    });

    it('tipo = undefined nao lanca excecao e retorna apenas base', () => {
        const ficha = makeFicha({ forcaBase: 80, destrezaBase: 50 });
        expect(() => calcularCA(ficha, undefined)).not.toThrow();
        expect(calcularCA(ficha, undefined)).toBe(5);
    });

    it('tipo = numero nao lanca excecao e retorna apenas base', () => {
        const ficha = makeFicha({ forcaBase: 80, destrezaBase: 50 });
        expect(() => calcularCA(ficha, 42)).not.toThrow();
        expect(calcularCA(ficha, 42)).toBe(5);
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

    it('ficha = 0 (falsy) retorna 10', () => {
        expect(calcularCA(0, 'evasiva')).toBe(10);
    });

    it('ficha = false (falsy) retorna 10', () => {
        expect(calcularCA(false, 'evasiva')).toBe(10);
    });

    it('ficha = string vazia (falsy) retorna 10', () => {
        expect(calcularCA('', 'evasiva')).toBe(10);
    });
});

describe('calcularCA — Ascensao nao entra na CA', () => {
    it('Ascensao e multiplicador de Ascensao nao mudam Evasiva nem Resistencia', () => {
        const semAsc = makeFicha({ destrezaBase: 50, forcaBase: 40 });
        const comAsc = makeFicha({ destrezaBase: 50, forcaBase: 40 });
        comAsc.ascensaoBase = 8;
        comAsc.multiplicadorForcaAscensao = 3;
        expect(calcularCA(comAsc, 'evasiva')).toBe(calcularCA(semAsc, 'evasiva'));
        expect(calcularCA(comAsc, 'resistencia')).toBe(calcularCA(semAsc, 'resistencia'));
        expect(calcularCA(comAsc, 'evasiva')).toBe(22);
        expect(calcularCA(comAsc, 'resistencia')).toBe(21);
    });
});

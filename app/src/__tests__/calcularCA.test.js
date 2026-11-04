import { describe, it, expect } from 'vitest';
import { calcularCA } from '../core/engine.js';
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
    it('evasiva: CA = reduzirComBonus(5 + destreza.base, 0)', () => {
        const ficha = makeFicha({ destrezaBase: 85 });
        // reduzirComBonus(90, 0) = round(4*log10(90)) = 8
        expect(calcularCA(ficha, 'evasiva')).toBe(8);
    });

    it('resistencia: CA = reduzirComBonus(5 + forca.base, 0)', () => {
        const ficha = makeFicha({ forcaBase: 100 });
        // reduzirComBonus(105, 0) = 8
        expect(calcularCA(ficha, 'resistencia')).toBe(8);
    });

    it('evasiva: ficha sem destreza resulta em reduzirComBonus(5, 0) = 3', () => {
        const ficha = makeFicha({ destrezaBase: null });
        expect(calcularCA(ficha, 'evasiva')).toBe(3);
    });

    it('resistencia: ficha sem forca resulta em reduzirComBonus(5, 0) = 3', () => {
        const ficha = makeFicha({ forcaBase: null });
        expect(calcularCA(ficha, 'resistencia')).toBe(3);
    });

    it('evasiva ignora forca, resistencia ignora destreza', () => {
        const fichaAltoForca = makeFicha({ forcaBase: 99, destrezaBase: 10 });
        expect(calcularCA(fichaAltoForca, 'evasiva')).toBe(5);    // reduzirComBonus(5 + 10, 0) = reduzirComBonus(15, 0) = 5
        expect(calcularCA(fichaAltoForca, 'resistencia')).toBe(8); // reduzirComBonus(5 + 99, 0) = reduzirComBonus(104, 0) = 8
    });

    it('tipo desconhecido produz apenas reduzirComBonus(5, 0) = 3 sem atributo', () => {
        const ficha = makeFicha({ forcaBase: 99, destrezaBase: 99 });
        // nenhum if de tipo casa → só o 5 entra na redução, sem bonus de poderes
        expect(calcularCA(ficha, 'defesa_magica')).toBe(3);
    });
});

// ==========================================
// Happy Path — bonusDeAtributo contínuo
// ==========================================

describe('calcularCA — redução contínua do total (MULTIPLICADOR_ATRIBUTO*log10)', () => {
    it('valor de 1 digito (7) => reduzirComBonus(12, 0) = 4', () => {
        const ficha = makeFicha({ destrezaBase: 7 });
        expect(calcularCA(ficha, 'evasiva')).toBe(4);
    });

    it('valor de 2 digitos (42) => reduzirComBonus(47, 0) = 7', () => {
        const ficha = makeFicha({ destrezaBase: 42 });
        expect(calcularCA(ficha, 'evasiva')).toBe(7);
    });

    it('valor de 3 digitos (350) => reduzirComBonus(355, 0) = 10', () => {
        const ficha = makeFicha({ destrezaBase: 350 });
        expect(calcularCA(ficha, 'evasiva')).toBe(10);
    });

    it('valores acima de 1000 seguem a mesma curva logaritmica (sem divisao por 1000)', () => {
        const ficha = makeFicha({ forcaBase: 1500 });
        // reduzirComBonus(1505, 0) = 13
        expect(calcularCA(ficha, 'resistencia')).toBe(13);
    });

    it('valor como string numerica e aceito', () => {
        const ficha = makeFicha({ destrezaBase: '75' });
        expect(calcularCA(ficha, 'evasiva')).toBe(8); // reduzirComBonus(80, 0)
    });

    it('valor zero resulta em reduzirComBonus(5, 0) = 3', () => {
        const ficha = makeFicha({ destrezaBase: 0 });
        expect(calcularCA(ficha, 'evasiva')).toBe(3);
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
        // reduzirComBonus(5, 10) = 9 (sem bônus seria 3)
        expect(calcularCA(ficha, 'evasiva')).toBe(9);
    });

    it('poder passivo (ativa=false) nao soma efeitos ativos', () => {
        const poder = makePoder({
            ativa: false,
            efeitos: [makeEfeito('evasiva', 'base', 10)],
        });
        const ficha = makeFicha({ destrezaBase: 0, poderes: [poder] });
        // efeitos ativos só são somados quando p.ativa === true
        expect(calcularCA(ficha, 'evasiva')).toBe(3);
    });

    it('efeitosPassivos de poder sempre somam, independente de ativa', () => {
        const poder = makePoder({
            ativa: false,
            efeitosPassivos: [makeEfeito('evasiva', 'base', 8)],
        });
        const ficha = makeFicha({ destrezaBase: 0, poderes: [poder] });
        // efeitosPassivos são sempre somados
        expect(calcularCA(ficha, 'evasiva')).toBe(8); // reduzirComBonus(5, 8)
    });

    it('poder ativo soma tanto efeitos quanto efeitosPassivos', () => {
        const poder = makePoder({
            ativa: true,
            efeitos: [makeEfeito('evasiva', 'base', 5)],
            efeitosPassivos: [makeEfeito('evasiva', 'base', 3)],
        });
        const ficha = makeFicha({ destrezaBase: 0, poderes: [poder] });
        // bônus 5 + 3 = 8 => reduzirComBonus(5, 8) = 8
        expect(calcularCA(ficha, 'evasiva')).toBe(8);
    });

    it('efeito de atributo diferente do tipo nao e somado', () => {
        const poder = makePoder({
            ativa: true,
            efeitos: [makeEfeito('resistencia', 'base', 20)],
        });
        const ficha = makeFicha({ destrezaBase: 0, poderes: [poder] });
        // efeito atributo='resistencia' não bate com tipo='evasiva'
        expect(calcularCA(ficha, 'evasiva')).toBe(3);
    });

    it('efeito com propriedade diferente de base nao e somado', () => {
        const poder = makePoder({
            ativa: true,
            efeitos: [makeEfeito('evasiva', 'mbase', 20)],
        });
        const ficha = makeFicha({ destrezaBase: 0, poderes: [poder] });
        expect(calcularCA(ficha, 'evasiva')).toBe(3);
    });

    it('multiplos poderes com efeitos validos somam todos os bonus', () => {
        const p1 = makePoder({ ativa: true, efeitos: [makeEfeito('resistencia', 'base', 5)] });
        const p2 = makePoder({ ativa: true, efeitos: [makeEfeito('resistencia', 'base', 7)] });
        const ficha = makeFicha({ forcaBase: 0, poderes: [p1, p2] });
        // bônus 5 + 7 = 12 => reduzirComBonus(5, 12) = 9
        expect(calcularCA(ficha, 'resistencia')).toBe(9);
    });
});

// ==========================================
// Happy Path — bonus de passivas
// ==========================================

describe('calcularCA — bônus de passivas', () => {
    it('passiva com efeito correto soma bonus', () => {
        const passiva = { efeitos: [makeEfeito('evasiva', 'base', 6)] };
        const ficha = makeFicha({ destrezaBase: 0, passivas: [passiva] });
        expect(calcularCA(ficha, 'evasiva')).toBe(8); // reduzirComBonus(5, 6)
    });

    it('passiva com atributo diferente nao soma', () => {
        const passiva = { efeitos: [makeEfeito('resistencia', 'base', 6)] };
        const ficha = makeFicha({ destrezaBase: 0, passivas: [passiva] });
        expect(calcularCA(ficha, 'evasiva')).toBe(3);
    });

    it('multiplas passivas somam todos os bonus validos', () => {
        const p1 = { efeitos: [makeEfeito('evasiva', 'base', 4)] };
        const p2 = { efeitos: [makeEfeito('evasiva', 'base', 6)] };
        const ficha = makeFicha({ destrezaBase: 0, passivas: [p1, p2] });
        expect(calcularCA(ficha, 'evasiva')).toBe(9); // reduzirComBonus(5, 10)
    });
});

// ==========================================
// Happy Path — bonus de inventario
// ==========================================

describe('calcularCA — bônus de inventário equipado', () => {
    it('item equipado com efeito correto soma bonus', () => {
        const item = makeItem({ equipado: true, efeitos: [makeEfeito('evasiva', 'base', 12)] });
        const ficha = makeFicha({ destrezaBase: 0, inventario: [item] });
        expect(calcularCA(ficha, 'evasiva')).toBe(9); // reduzirComBonus(5, 12)
    });

    it('item nao equipado nao soma bonus', () => {
        const item = makeItem({ equipado: false, efeitos: [makeEfeito('evasiva', 'base', 12)] });
        const ficha = makeFicha({ destrezaBase: 0, inventario: [item] });
        expect(calcularCA(ficha, 'evasiva')).toBe(3);
    });

    it('efeitosPassivos de item equipado somam', () => {
        const item = makeItem({ equipado: true, efeitosPassivos: [makeEfeito('resistencia', 'base', 9)] });
        const ficha = makeFicha({ forcaBase: 0, inventario: [item] });
        // reduzirComBonus(5, 9) = 9
        expect(calcularCA(ficha, 'resistencia')).toBe(9);
    });

    it('item equipado com atributo diferente nao soma', () => {
        const item = makeItem({ equipado: true, efeitos: [makeEfeito('forca', 'base', 99)] });
        const ficha = makeFicha({ destrezaBase: 0, inventario: [item] });
        expect(calcularCA(ficha, 'evasiva')).toBe(3);
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
        // bônus = 5 + 3 + 4 + 6 = 18 => reduzirComBonus(5, 18) = 10
        expect(calcularCA(ficha, 'evasiva')).toBe(10);
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
        // resolved.efeitos = [base(5), forma(10)], p.ativa = true → bonus = 15 => reduzirComBonus(5, 15) = 9
        expect(calcularCA(ficha, 'evasiva')).toBe(9);
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
        // reduzirComBonus(5, 20) = 10 (com acumulação seria 9 só para 15)
        expect(calcularCA(ficha, 'evasiva')).toBe(10);
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
        // reduzirComBonus(5, 10) = 9
        expect(calcularCA(ficha, 'resistencia')).toBe(9);
    });
});

// ==========================================
// Edge Cases — valores nulos / indefinidos em sub-campos
// ==========================================

describe('calcularCA — edge cases de sub-campos', () => {
    it('ficha com destreza = undefined usa reduzirComBonus(5, 0) = 3 para evasiva', () => {
        const ficha = { forca: undefined, destreza: undefined, poderes: [], passivas: [], inventario: [] };
        expect(calcularCA(ficha, 'evasiva')).toBe(3);
    });

    it('ficha com forca = undefined usa reduzirComBonus(5, 0) = 3 para resistencia', () => {
        const ficha = { forca: undefined, destreza: undefined, poderes: [], passivas: [], inventario: [] };
        expect(calcularCA(ficha, 'resistencia')).toBe(3);
    });

    it('destreza.base = null → bonus 0 → reduzirComBonus(5, 0) = 3', () => {
        const ficha = makeFicha({ destrezaBase: null });
        ficha.destreza = { base: null };
        expect(calcularCA(ficha, 'evasiva')).toBe(3);
    });

    it('destreza.base = string vazia → reduzirComBonus(5, 0) = 3', () => {
        const ficha = { ...makeFicha(), destreza: { base: '' } };
        expect(calcularCA(ficha, 'evasiva')).toBe(3);
    });

    it('destreza.base = string nao numerica → reduzirComBonus(5, 0) = 3', () => {
        const ficha = { ...makeFicha(), destreza: { base: 'abc' } };
        expect(calcularCA(ficha, 'evasiva')).toBe(3);
    });

    it('poderes = undefined nao lanca excecao', () => {
        const ficha = makeFicha({ destrezaBase: 50 });
        ficha.poderes = undefined;
        expect(() => calcularCA(ficha, 'evasiva')).not.toThrow();
        expect(calcularCA(ficha, 'evasiva')).toBe(7);
    });

    it('passivas = undefined nao lanca excecao', () => {
        const ficha = makeFicha({ destrezaBase: 50 });
        ficha.passivas = undefined;
        expect(() => calcularCA(ficha, 'evasiva')).not.toThrow();
        expect(calcularCA(ficha, 'evasiva')).toBe(7);
    });

    it('inventario = undefined nao lanca excecao', () => {
        const ficha = makeFicha({ destrezaBase: 50 });
        ficha.inventario = undefined;
        expect(() => calcularCA(ficha, 'evasiva')).not.toThrow();
        expect(calcularCA(ficha, 'evasiva')).toBe(7);
    });

    it('efeito com valor nao numerico nao contribui (parseFloat retorna NaN → 0)', () => {
        const poder = makePoder({
            ativa: true,
            efeitos: [{ atributo: 'evasiva', propriedade: 'base', valor: 'abc' }],
        });
        const ficha = makeFicha({ destrezaBase: 50, poderes: [poder] });
        expect(calcularCA(ficha, 'evasiva')).toBe(7);
    });

    it('efeito com valor null nao contribui', () => {
        const poder = makePoder({
            ativa: true,
            efeitos: [{ atributo: 'evasiva', propriedade: 'base', valor: null }],
        });
        const ficha = makeFicha({ destrezaBase: 50, poderes: [poder] });
        expect(calcularCA(ficha, 'evasiva')).toBe(7);
    });

    it('efeito null dentro do array e ignorado graciosamente', () => {
        const poder = makePoder({ ativa: true, efeitos: [null] });
        const ficha = makeFicha({ destrezaBase: 50, poderes: [poder] });
        expect(() => calcularCA(ficha, 'evasiva')).not.toThrow();
        expect(calcularCA(ficha, 'evasiva')).toBe(7);
    });

    it('passiva sem campo efeitos nao lanca excecao', () => {
        const ficha = makeFicha({ destrezaBase: 50, passivas: [{}] });
        expect(() => calcularCA(ficha, 'evasiva')).not.toThrow();
        expect(calcularCA(ficha, 'evasiva')).toBe(7);
    });
});

// ==========================================
// Edge Cases — valores de borda
// ==========================================

describe('calcularCA — valores de borda', () => {
    it('destreza.base = 1 → reduzirComBonus(6, 0) = 3', () => {
        const ficha = makeFicha({ destrezaBase: 1 });
        expect(calcularCA(ficha, 'evasiva')).toBe(3);
    });

    it('destreza.base = 99 → reduzirComBonus(104, 0) = 8', () => {
        const ficha = makeFicha({ destrezaBase: 99 });
        expect(calcularCA(ficha, 'evasiva')).toBe(8);
    });

    it('destreza.base = 9999 → reduzirComBonus(10004, 0) = 16', () => {
        const ficha = makeFicha({ destrezaBase: 9999 });
        expect(calcularCA(ficha, 'evasiva')).toBe(16);
    });

    it('bonus flutuante entra sem truncar', () => {
        const poder = makePoder({
            ativa: true,
            efeitos: [makeEfeito('evasiva', 'base', '1.9')],
        });
        const ficha = makeFicha({ destrezaBase: 5, poderes: [poder] });
        // reduzirComBonus(10, 1.9) = 7 (truncado para 1 daria 6)
        expect(calcularCA(ficha, 'evasiva')).toBe(7);
        expect(calcularCA(ficha, 'evasiva')).toBe(reduzirComBonus(10, 1.9));
    });

    it('bonus negativo reduz o valor final', () => {
        const poder = makePoder({
            ativa: true,
            efeitos: [makeEfeito('evasiva', 'base', -40)],
        });
        const ficha = makeFicha({ destrezaBase: 50, poderes: [poder] });
        // reduzirComBonus(55, -40) = -1 (sem o bônus negativo seria 7)
        expect(calcularCA(ficha, 'evasiva')).toBe(reduzirComBonus(55, -40));
        expect(calcularCA(ficha, 'evasiva')).toBe(-1);
    });

    it('sem poderes, passivas ou inventario retorna apenas reduzirComBonus(5 + atributo, 0)', () => {
        const ficha = makeFicha({ destrezaBase: 60 });
        expect(calcularCA(ficha, 'evasiva')).toBe(7); // 5 + 7
    });

    it('ficha completamente vazia (sem atributos nem coleções) retorna 3', () => {
        expect(calcularCA({}, 'evasiva')).toBe(3);
        expect(calcularCA({}, 'resistencia')).toBe(3);
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
        expect(calcularCA(ficha, null)).toBe(3);
    });

    it('tipo = undefined nao lanca excecao e retorna apenas base', () => {
        const ficha = makeFicha({ forcaBase: 80, destrezaBase: 50 });
        expect(() => calcularCA(ficha, undefined)).not.toThrow();
        expect(calcularCA(ficha, undefined)).toBe(3);
    });

    it('tipo = numero nao lanca excecao e retorna apenas base', () => {
        const ficha = makeFicha({ forcaBase: 80, destrezaBase: 50 });
        expect(() => calcularCA(ficha, 42)).not.toThrow();
        expect(calcularCA(ficha, 42)).toBe(3);
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
        const semAsc = makeFicha({ destrezaBase: 50, forcaBase: 400 });
        const comAsc = makeFicha({ destrezaBase: 50, forcaBase: 400 });
        comAsc.ascensaoBase = 8;
        comAsc.multiplicadorForcaAscensao = 3;
        expect(calcularCA(comAsc, 'evasiva')).toBe(calcularCA(semAsc, 'evasiva'));
        expect(calcularCA(comAsc, 'resistencia')).toBe(calcularCA(semAsc, 'resistencia'));
        expect(calcularCA(comAsc, 'evasiva')).toBe(7);
        expect(calcularCA(comAsc, 'resistencia')).toBe(10);
    });
});

describe('calcularCA — bônus pesa em proporção ao atributo (decisão do usuário)', () => {
    const passivaPoder = (atributo, valor) => makePoder({ ativa: false, efeitosPassivos: [makeEfeito(atributo, 'base', valor)] });

    it('destreza ~316000 com bônus +5 em evasiva: CA 27 (sem bônus: 22)', () => {
        const sem = makeFicha({ destrezaBase: 316000 });
        const com = makeFicha({ destrezaBase: 316000, poderes: [passivaPoder('evasiva', 5)] });
        expect(calcularCA(sem, 'evasiva')).toBe(22);
        expect(calcularCA(com, 'evasiva')).toBe(27);
    });

    it('efeitos passivos EVASIVA +50 base e RESISTENCIA +50 base mudam a CA de 22 para 31', () => {
        const poderes = [passivaPoder('evasiva', 50), passivaPoder('resistencia', 50)];
        const sem = makeFicha({ destrezaBase: 316000, forcaBase: 316000 });
        const com = makeFicha({ destrezaBase: 316000, forcaBase: 316000, poderes });
        expect(calcularCA(sem, 'evasiva')).toBe(22);
        expect(calcularCA(sem, 'resistencia')).toBe(22);
        expect(calcularCA(com, 'evasiva')).toBe(31);
        expect(calcularCA(com, 'resistencia')).toBe(31);
    });

    it('o bônus de uma defesa não vaza para a outra', () => {
        const f = makeFicha({ destrezaBase: 316000, forcaBase: 316000, poderes: [passivaPoder('evasiva', 50)] });
        expect(calcularCA(f, 'evasiva')).toBe(31);
        expect(calcularCA(f, 'resistencia')).toBe(22);
    });

    it('o mesmo bônus soma o mesmo tanto com atributo fraco e forte', () => {
        const ganho = (attr) => calcularCA(makeFicha({ destrezaBase: attr, poderes: [passivaPoder('evasiva', 50)] }), 'evasiva')
            - calcularCA(makeFicha({ destrezaBase: attr }), 'evasiva');
        expect(ganho(1e7 - 5)).toBe(ganho(995));
    });
});

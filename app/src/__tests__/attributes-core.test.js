import { describe, it, expect } from 'vitest';
import {
    getBuffs,
    getPoderesDefesa,
    getPoderTotalDaAbaPoderes,
    isStatBuffed,
    getRawBase,
    getEfetivoBase,
    getMultiplicadorTotal,
    getMaximo,
} from '../core/attributes.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fichaBase(overrides = {}) {
    return {
        forca: { base: 1000, mBase: '1.0', mGeral: '1.0', mFormas: '1.0', mAbsoluto: '1.0', mUnico: '1.0' },
        destreza: { base: 500, mBase: '1.0', mGeral: '1.0', mFormas: '1.0', mAbsoluto: '1.0', mUnico: '1.0' },
        mana: { base: 5000, mBase: '1.0', mGeral: '1.0', mFormas: '1.0', mAbsoluto: '1.0', mUnico: '1.0' },
        vida: { base: 100000, mBase: '1.0', mGeral: '1.0', mFormas: '1.0', mAbsoluto: '1.0', mUnico: '1.0' },
        dano: { base: 200, mBase: '1.0', mGeral: '1.0', mFormas: '1.0', mAbsoluto: '1.0', mUnico: '1.0' },
        inventario: [],
        poderes: [],
        passivas: [],
        ...overrides,
    };
}

function poderAtivo(efeitos = [], efeitosPassivos = []) {
    return { ativa: true, efeitos, efeitosPassivos };
}

function poderInativo(efeitos = [], efeitosPassivos = []) {
    return { ativa: false, efeitos, efeitosPassivos };
}

function efeito(propriedade, atributo, valor) {
    return { propriedade, atributo, valor: String(valor) };
}

function itemEquipado(efeitos = [], efeitosPassivos = []) {
    return { equipado: true, efeitos, efeitosPassivos };
}

// ---------------------------------------------------------------------------
// getBuffs — null / undefined guards
// ---------------------------------------------------------------------------

describe('getBuffs — guards para entrada invalida', () => {
    it('retorna defaults quando ficha e null', () => {
        const b = getBuffs(null, 'forca');
        expect(b.base).toBe(0);
        expect(b.mbase).toBe(1.0);
        expect(b.mgeral).toBe(1.0);
        expect(b.mformas).toBe(1.0);
        expect(b.mabs).toBe(1.0);
        expect(b.munico).toEqual([]);
    });

    it('retorna defaults quando statKey e null', () => {
        const b = getBuffs(fichaBase(), null);
        expect(b.mbase).toBe(1.0);
        expect(b.mgeral).toBe(1.0);
    });

    it('retorna defaults quando ficha e undefined', () => {
        const b = getBuffs(undefined, 'forca');
        expect(b.mbase).toBe(1.0);
    });

    it('retorna defaults com inventario e poderes ausentes na ficha', () => {
        const fichaMinima = { forca: { base: 100 } };
        const b = getBuffs(fichaMinima, 'forca');
        expect(b.base).toBe(0);
        expect(b.mbase).toBe(1.0);
    });
});

// ---------------------------------------------------------------------------
// getBuffs — Poderes (ativa)
// ---------------------------------------------------------------------------

describe('getBuffs — poderes ativos e inativos', () => {
    it('poder ativo contribui com buff base', () => {
        const ficha = fichaBase({
            poderes: [poderAtivo([efeito('base', 'forca', 300)])],
        });
        expect(getBuffs(ficha, 'forca').base).toBe(300);
    });

    it('poder inativo NAO contribui com buff', () => {
        const ficha = fichaBase({
            poderes: [poderInativo([efeito('base', 'forca', 9000)])],
        });
        expect(getBuffs(ficha, 'forca').base).toBe(0);
    });

    it('efeitosPassivos de poder sao processados mesmo quando ativa=false', () => {
        const ficha = fichaBase({
            poderes: [poderInativo([], [efeito('base', 'forca', 150)])],
        });
        // efeitosPassivos sempre processados independente de ativa
        expect(getBuffs(ficha, 'forca').base).toBe(150);
    });

    it('poder null dentro do array nao lanca erro', () => {
        const ficha = fichaBase({ poderes: [null, poderAtivo([efeito('base', 'forca', 50)])] });
        expect(() => getBuffs(ficha, 'forca')).not.toThrow();
        expect(getBuffs(ficha, 'forca').base).toBe(50);
    });

    it('acumula buffs de multiplos poderes ativos', () => {
        const ficha = fichaBase({
            poderes: [
                poderAtivo([efeito('base', 'forca', 100)]),
                poderAtivo([efeito('base', 'forca', 200)]),
            ],
        });
        expect(getBuffs(ficha, 'forca').base).toBe(300);
    });
});

// ---------------------------------------------------------------------------
// getBuffs — Passivas
// ---------------------------------------------------------------------------

describe('getBuffs — passivas', () => {
    it('passivas contribuem com buff quando ignorarPassivas=false', () => {
        const ficha = fichaBase({
            passivas: [{ efeitos: [efeito('base', 'forca', 999)] }],
        });
        expect(getBuffs(ficha, 'forca', false).base).toBe(999);
    });

    it('passivas sao ignoradas quando ignorarPassivas=true', () => {
        const ficha = fichaBase({
            passivas: [{ efeitos: [efeito('base', 'forca', 999)] }],
        });
        expect(getBuffs(ficha, 'forca', true).base).toBe(0);
    });

    it('passiva null dentro do array nao lanca erro', () => {
        const ficha = fichaBase({ passivas: [null, { efeitos: [efeito('base', 'forca', 10)] }] });
        expect(() => getBuffs(ficha, 'forca')).not.toThrow();
        expect(getBuffs(ficha, 'forca').base).toBe(10);
    });
});

// ---------------------------------------------------------------------------
// getPoderesDefesa
// ---------------------------------------------------------------------------

describe('getPoderesDefesa', () => {
    it('retorna 0 quando ficha e null', () => {
        expect(getPoderesDefesa(null, 'escudo')).toBe(0);
    });

    it('retorna 0 quando ficha nao tem poderes', () => {
        expect(getPoderesDefesa({}, 'escudo')).toBe(0);
    });

    it('soma valores do tipo correto de poderes ativos', () => {
        const ficha = fichaBase({
            poderes: [
                poderAtivo([{ propriedade: 'escudo', valor: '50' }]),
                poderAtivo([{ propriedade: 'escudo', valor: '30' }]),
            ],
        });
        expect(getPoderesDefesa(ficha, 'escudo')).toBe(80);
    });

    it('ignora poderes inativos', () => {
        const ficha = fichaBase({
            poderes: [
                poderInativo([{ propriedade: 'escudo', valor: '9999' }]),
                poderAtivo([{ propriedade: 'escudo', valor: '20' }]),
            ],
        });
        expect(getPoderesDefesa(ficha, 'escudo')).toBe(20);
    });

    it('ignora efeitos de tipo diferente', () => {
        const ficha = fichaBase({
            poderes: [
                poderAtivo([{ propriedade: 'barreira', valor: '100' }]),
            ],
        });
        expect(getPoderesDefesa(ficha, 'escudo')).toBe(0);
    });

    it('retorna 0 quando valor e nao-numerico', () => {
        const ficha = fichaBase({
            poderes: [
                poderAtivo([{ propriedade: 'escudo', valor: 'abc' }]),
            ],
        });
        expect(getPoderesDefesa(ficha, 'escudo')).toBe(0);
    });

    it('ignora efeito null dentro do array de efeitos', () => {
        const ficha = fichaBase({
            poderes: [
                { ativa: true, efeitos: [null, { propriedade: 'escudo', valor: '40' }] },
            ],
        });
        expect(getPoderesDefesa(ficha, 'escudo')).toBe(40);
    });

    it('a comparacao de tipo e case-insensitive', () => {
        const ficha = fichaBase({
            poderes: [
                poderAtivo([{ propriedade: 'ESCUDO', valor: '10' }]),
            ],
        });
        expect(getPoderesDefesa(ficha, 'escudo')).toBe(10);
    });
});

// ---------------------------------------------------------------------------
// getPoderTotalDaAbaPoderes
// ---------------------------------------------------------------------------

describe('getPoderTotalDaAbaPoderes', () => {
    it('retorna 1.0 quando nenhum buff esta ativo', () => {
        const ficha = fichaBase();
        expect(getPoderTotalDaAbaPoderes(ficha, 'forca')).toBe(1.0);
    });

    it('calcula produto de mbase * mgeral * mformas * mabs', () => {
        const ficha = fichaBase({
            poderes: [
                poderAtivo([
                    efeito('mbase', 'forca', 2.0),
                    efeito('mgeral', 'forca', 3.0),
                ]),
            ],
        });
        const total = getPoderTotalDaAbaPoderes(ficha, 'forca');
        expect(total).toBe(6.0);
    });

    it('munico e multiplicado no produto final', () => {
        const ficha = fichaBase({
            poderes: [
                poderAtivo([
                    efeito('mbase', 'forca', 2.0),
                    efeito('munico', 'forca', 3.0),
                ]),
            ],
        });
        const total = getPoderTotalDaAbaPoderes(ficha, 'forca');
        expect(total).toBe(6.0);
    });

    it('multiplos munico sao multiplicados entre si', () => {
        const ficha = fichaBase({
            poderes: [
                poderAtivo([
                    efeito('munico', 'forca', 2.0),
                    efeito('munico', 'forca', 4.0),
                ]),
            ],
        });
        const total = getPoderTotalDaAbaPoderes(ficha, 'forca');
        expect(total).toBe(8.0);
    });
});

// ---------------------------------------------------------------------------
// isStatBuffed
// ---------------------------------------------------------------------------

describe('isStatBuffed', () => {
    it('retorna false quando nenhum buff esta ativo para o stat', () => {
        const ficha = fichaBase();
        expect(isStatBuffed(ficha, 'forca')).toBe(false);
    });

    it('retorna true quando multiplicador total > 1.0 para o stat', () => {
        const ficha = fichaBase({
            poderes: [poderAtivo([efeito('mbase', 'forca', 2.0)])],
        });
        expect(isStatBuffed(ficha, 'forca')).toBe(true);
    });

    it('retorna false para stat diferente do buffado', () => {
        const ficha = fichaBase({
            poderes: [poderAtivo([efeito('mbase', 'forca', 2.0)])],
        });
        expect(isStatBuffed(ficha, 'destreza')).toBe(false);
    });

    it('statKey "status" retorna true se qualquer status fisico estiver buffado', () => {
        const ficha = fichaBase({
            poderes: [poderAtivo([efeito('mbase', 'destreza', 2.0)])],
        });
        expect(isStatBuffed(ficha, 'status')).toBe(true);
    });

    it('statKey "status" retorna false quando nenhum status fisico esta buffado', () => {
        const ficha = fichaBase();
        expect(isStatBuffed(ficha, 'status')).toBe(false);
    });

    it('statKey "status" NAO e afetado apenas por buff de mana (energia)', () => {
        const ficha = fichaBase({
            poderes: [poderAtivo([efeito('mbase', 'mana', 2.0)])],
        });
        expect(isStatBuffed(ficha, 'status')).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// getRawBase
// ---------------------------------------------------------------------------

describe('getRawBase', () => {
    it('retorna o valor base da ficha para o stat correto', () => {
        const ficha = fichaBase();
        expect(getRawBase(ficha, 'forca')).toBe(1000);
    });

    it('retorna 0 quando ficha e null', () => {
        expect(getRawBase(null, 'forca')).toBe(0);
    });

    it('retorna 0 quando statKey e null', () => {
        expect(getRawBase(fichaBase(), null)).toBe(0);
    });

    it('retorna 0 quando stat nao existe na ficha', () => {
        expect(getRawBase(fichaBase(), 'estatInexistente')).toBe(0);
    });

    it('retorna 0 quando stat existe mas base e undefined', () => {
        const ficha = fichaBase({ forca: { mBase: '1.0' } }); // sem base
        expect(getRawBase(ficha, 'forca')).toBe(0);
    });

    it('converte base para float corretamente', () => {
        const ficha = fichaBase({ forca: { base: '2500' } });
        expect(getRawBase(ficha, 'forca')).toBe(2500);
    });

    it('remove pontos de milhar de strings formatadas em pt-BR sem truncar', () => {
        const ficha = fichaBase({ forca: { base: '260.000.000' } });
        expect(getRawBase(ficha, 'forca')).toBe(260000000);
    });

    it('nao altera valores numericos ja limpos (mesmo com muitos digitos)', () => {
        const ficha = fichaBase({ forca: { base: 260000000 } });
        expect(getRawBase(ficha, 'forca')).toBe(260000000);
    });

    it('trata string numerica com um unico ponto de milhar', () => {
        const ficha = fichaBase({ forca: { base: '1.500' } });
        expect(getRawBase(ficha, 'forca')).toBe(1500);
    });

    it('retorna 0 para string invalida (nao numerica)', () => {
        const ficha = fichaBase({ forca: { base: 'abc' } });
        expect(getRawBase(ficha, 'forca')).toBe(0);
    });

    it('retorna 0 quando base e string vazia', () => {
        const ficha = fichaBase({ forca: { base: '' } });
        expect(getRawBase(ficha, 'forca')).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// getEfetivoBase
// ---------------------------------------------------------------------------

describe('getEfetivoBase', () => {
    it('retorna rawBase quando nao ha buffs de base', () => {
        const ficha = fichaBase();
        expect(getEfetivoBase(ficha, 'forca')).toBe(1000);
    });

    it('soma buffs de base ao rawBase', () => {
        const ficha = fichaBase({
            poderes: [poderAtivo([efeito('base', 'forca', 500)])],
        });
        expect(getEfetivoBase(ficha, 'forca')).toBe(1500);
    });

    it('soma buffs de base de itens equipados ao rawBase', () => {
        const ficha = fichaBase({
            inventario: [itemEquipado([efeito('base', 'forca', 200)])],
        });
        expect(getEfetivoBase(ficha, 'forca')).toBe(1200);
    });

    it('trata rawBase NaN como 0', () => {
        const ficha = fichaBase({ forca: { base: 'invalido' } });
        const b = getEfetivoBase(ficha, 'forca');
        expect(isNaN(b)).toBe(false);
        expect(b).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// getMultiplicadorTotal
// ---------------------------------------------------------------------------

describe('getMultiplicadorTotal', () => {
    it('retorna 1.0 para ficha sem multiplicadores customizados', () => {
        const ficha = fichaBase();
        expect(getMultiplicadorTotal(ficha, 'forca')).toBe(1.0);
    });

    it('retorna 1.0 quando ficha ou k sao nulos', () => {
        expect(getMultiplicadorTotal(null, 'forca')).toBe(1.0);
        expect(getMultiplicadorTotal(fichaBase(), null)).toBe(1.0);
    });

    it('usa mBase da ficha quando nao ha buff de mbase', () => {
        const ficha = fichaBase({
            forca: { base: 1000, mBase: '2.0', mGeral: '1.0', mFormas: '1.0', mAbsoluto: '1.0', mUnico: '1.0' },
        });
        expect(getMultiplicadorTotal(ficha, 'forca')).toBe(2.0);
    });

    it('combina mBase, mGeral, mFormas, mAbsoluto da ficha', () => {
        const ficha = fichaBase({
            forca: { base: 1000, mBase: '2.0', mGeral: '3.0', mFormas: '4.0', mAbsoluto: '5.0', mUnico: '1.0' },
        });
        // 2 * 3 * 4 * 5 = 120
        expect(getMultiplicadorTotal(ficha, 'forca')).toBe(120.0);
    });

    it('processa mUnico como string separada por virgula', () => {
        const ficha = fichaBase({
            forca: { base: 1000, mBase: '1.0', mGeral: '1.0', mFormas: '1.0', mAbsoluto: '1.0', mUnico: '2.0,3.0' },
        });
        // 1 * 1 * 1 * 1 * (2*3) = 6
        expect(getMultiplicadorTotal(ficha, 'forca')).toBe(6.0);
    });

    it('quando buff de mbase existe, soma ficha + buff (tratando 1.0 da ficha como 0)', () => {
        // ficha.mBase = '1.0' (default) + buff de 2.0 => (0) + 2.0 = 2.0
        const ficha = fichaBase({
            poderes: [poderAtivo([efeito('mbase', 'forca', 2.0)])],
        });
        expect(getMultiplicadorTotal(ficha, 'forca')).toBe(2.0);
    });

    it('quando buff de mbase existe e ficha tem mBase customizado, soma ficha + buff', () => {
        // ficha.mBase = '3.0' (nao default) + buff de 2.0 => 3.0 + 2.0 = 5.0
        const ficha = fichaBase({
            forca: { base: 1000, mBase: '3.0', mGeral: '1.0', mFormas: '1.0', mAbsoluto: '1.0', mUnico: '1.0' },
            poderes: [poderAtivo([efeito('mbase', 'forca', 2.0)])],
        });
        expect(getMultiplicadorTotal(ficha, 'forca')).toBe(5.0);
    });

    it('retorna 1.0 para stat que nao existe na ficha', () => {
        expect(getMultiplicadorTotal(fichaBase(), 'estatInexistente')).toBe(1.0);
    });
});

// ---------------------------------------------------------------------------
// getMaximo
// ---------------------------------------------------------------------------

describe('getMaximo', () => {
    it('calcula maximo como floor(base * multiplicador)', () => {
        const ficha = fichaBase(); // forca.base = 1000, tudo 1.0
        expect(getMaximo(ficha, 'forca')).toBe(1000);
    });

    it('inclui buffs de base nos calculos', () => {
        const ficha = fichaBase({
            poderes: [poderAtivo([efeito('base', 'forca', 500)])],
        });
        // base = 1000 + 500 = 1500, mult = 1.0 => 1500
        expect(getMaximo(ficha, 'forca')).toBe(1500);
    });

    it('inclui multiplicadores nos calculos', () => {
        const ficha = fichaBase({
            poderes: [poderAtivo([efeito('mbase', 'forca', 2.0)])],
        });
        // base = 1000, mult = 2.0 => 2000
        expect(getMaximo(ficha, 'forca')).toBe(2000);
    });

    it('aplica floor no resultado final', () => {
        // base 1000 * mBase 1.5 = 1500.0 (floor nao afeta este caso)
        const ficha = fichaBase({
            forca: { base: 1000, mBase: '1.5', mGeral: '1.0', mFormas: '1.0', mAbsoluto: '1.0', mUnico: '1.0' },
        });
        expect(getMaximo(ficha, 'forca')).toBe(1500);
    });

    it('aplica floor quando resultado tem decimais', () => {
        // base 1000 * mBase 1.3 = 1300.0 (floor nao afeta)
        // base 3 * mBase 2.0 = 6; base 1 * mGeral 3.0 = 3
        // Para testar floor: base 1 com mUnico='3.0,2.0' => 1 * 6 = 6
        const ficha = fichaBase({
            forca: { base: 10, mBase: '1.0', mGeral: '1.0', mFormas: '1.0', mAbsoluto: '1.0', mUnico: '1.5' },
        });
        // 10 * 1.5 = 15.0 => floor = 15
        expect(getMaximo(ficha, 'forca')).toBe(15);
    });

    it('retorna 0 quando base e 0', () => {
        const ficha = fichaBase({
            forca: { base: 0, mBase: '99.0', mGeral: '1.0', mFormas: '1.0', mAbsoluto: '1.0', mUnico: '1.0' },
        });
        expect(getMaximo(ficha, 'forca')).toBe(0);
    });

    it('retorna 0 quando resultado seria NaN', () => {
        // ficha sem o stat requisitado
        const ficha = fichaBase();
        expect(getMaximo(ficha, 'statInexistente')).toBe(0);
    });

    it('funciona com mana (stat de energia)', () => {
        const ficha = fichaBase(); // mana.base = 5000
        expect(getMaximo(ficha, 'mana')).toBe(5000);
    });

    it('buff geral via item equipado afeta o maximo', () => {
        const ficha = fichaBase({
            inventario: [itemEquipado([efeito('mbase', 'geral', 2.0)])],
        });
        // forca.base = 1000 * 2.0 = 2000
        expect(getMaximo(ficha, 'forca')).toBe(2000);
    });
});

// ---------------------------------------------------------------------------
// Integracao: getBuffs + getMaximo interagindo com passivas e poderes
// ---------------------------------------------------------------------------

describe('integracao — passivas, poderes e inventario juntos', () => {
    it('todos os tres contribuem para getMaximo quando ativos/equipados', () => {
        const ficha = fichaBase({
            forca: { base: 1000, mBase: '1.0', mGeral: '1.0', mFormas: '1.0', mAbsoluto: '1.0', mUnico: '1.0' },
            poderes: [poderAtivo([efeito('base', 'forca', 500)])],
            inventario: [itemEquipado([efeito('base', 'forca', 300)])],
            passivas: [{ efeitos: [efeito('base', 'forca', 200)] }],
        });
        // base = 1000 + 500 + 300 + 200 = 2000, mult = 1.0
        expect(getMaximo(ficha, 'forca')).toBe(2000);
    });

    it('ignorarPassivas=true em getEfetivoBase exclui passivas do base', () => {
        const ficha = fichaBase({
            poderes: [poderAtivo([efeito('base', 'forca', 100)])],
            passivas: [{ efeitos: [efeito('base', 'forca', 9000)] }],
        });
        const buffsComPassivas = getBuffs(ficha, 'forca', false);
        const buffsSemPassivas = getBuffs(ficha, 'forca', true);
        expect(buffsComPassivas.base).toBe(9100);
        expect(buffsSemPassivas.base).toBe(100);
    });

    it('buff de todos_status via poder ativo afeta todos os status fisicos', () => {
        const ficha = fichaBase({
            poderes: [poderAtivo([efeito('mbase', 'todos_status', 3.0)])],
        });
        expect(getBuffs(ficha, 'forca').mbase).toBe(3.0);
        expect(getBuffs(ficha, 'destreza').mbase).toBe(3.0);
        // nao afeta mana (energia)
        expect(getBuffs(ficha, 'mana').mbase).toBe(1.0);
    });
});

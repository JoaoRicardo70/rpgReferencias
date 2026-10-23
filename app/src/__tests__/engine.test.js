import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { calcularDano, rolarDadosComVantagem } from '../core/engine.js';

// ==========================================
// Helpers
// ==========================================

function buildFicha({ poderes = [], inventario = [], ataquesElementais = [] } = {}) {
    return {
        forca: { base: 100, nome: 'Forca', mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', reducaoCusto: 0, regeneracao: 0 },
        destreza: { base: 80, nome: 'Destreza', mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', reducaoCusto: 0, regeneracao: 0 },
        mana: { base: 50, nome: 'Mana', atual: 1000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', reducaoCusto: 0, regeneracao: 0 },
        aura: { base: 50, nome: 'Aura', atual: 1000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', reducaoCusto: 0, regeneracao: 0 },
        dano: { base: 0, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mPotencial: 1.0, mUnico: '1.0', reducaoCusto: 0, regeneracao: 0 },
        poderes,
        inventario,
        ataquesElementais,
    };
}

function callCalcDano(overrides = {}) {
    return calcularDano({
        minhaFicha: buildFicha(),
        configArma: { statusUsados: ['forca'], energiaCombustao: 'mana', percEnergia: 0 },
        configHabilidades: [],
        itensEquipados: [],
        ...overrides,
    });
}

function makeArma({ id = 'arma1', nome = 'Espada', dadosQtd = 2, dadosFaces = 6, bonusTipo = null, bonusValor = '0', elemento = 'Neutro', equipado = true } = {}) {
    return { id, nome, tipo: 'arma', dadosQtd, dadosFaces, bonusTipo, bonusValor, elemento, equipado };
}

function makeHabConfig({ id = 'p1', nome = 'Golpe', dadosQtd = 3, dadosFaces = 8, custoPercentual = 0, armaVinculada = '', statusUsados = ['forca'], energiaCombustao = 'mana', efeitos = [] } = {}) {
    return { id, nome, dadosQtd, dadosFaces, custoPercentual, armaVinculada, statusUsados, energiaCombustao, efeitos };
}

// ==========================================
// New system tests
// ==========================================

describe('calcularDano — novo sistema', () => {
    let randomSpy;

    beforeEach(() => {
        randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    });

    afterEach(() => {
        randomSpy.mockRestore();
    });

    it('arma 2d6 only, no skills, no energy', () => {
        // d6 roll = floor(0.5*6)+1 = 4, 2d6 = 8
        // Dano = soma dos dados + Status: 8 + Forca (100) = 108 (nada de dado x status)
        const arma = makeArma({ dadosQtd: 2, dadosFaces: 6 });
        const result = callCalcDano({ itensEquipados: [arma] });

        expect(result.erro).toBeUndefined();
        expect(result.dano).toBe(108);
        expect(result.letalidade).toBe(0);
        expect(result.drenos).toEqual([]);
    });

    it('arma 2d6 + habilidade vinculada 3d8', () => {
        // dados: 2d6=8 + 3d8=15 = 23; Status: Forca uma vez so = 100 -> 123
        const arma = makeArma({ dadosQtd: 2, dadosFaces: 6 });
        const hab = makeHabConfig({ dadosQtd: 3, dadosFaces: 8, armaVinculada: 'arma1' });

        const result = callCalcDano({
            itensEquipados: [arma],
            configHabilidades: [hab],
        });

        expect(result.erro).toBeUndefined();
        expect(result.dano).toBe(123);
    });

    it('arma 2d6 + habilidade livre 1d10', () => {
        // dados: 8 + 6 = 14; Status: Forca (contada uma vez) = 100 -> 114
        const arma = makeArma({ dadosQtd: 2, dadosFaces: 6 });
        const hab = makeHabConfig({ id: 'p2', dadosQtd: 1, dadosFaces: 10, armaVinculada: '' });

        const result = callCalcDano({
            itensEquipados: [arma],
            configHabilidades: [hab],
        });

        expect(result.erro).toBeUndefined();
        expect(result.dano).toBe(114);
    });

    it('no weapon, only free skill with dice', () => {
        // habLivre 2d6: 8 + Forca 100 = 108
        const hab = makeHabConfig({ dadosQtd: 2, dadosFaces: 6 });
        const result = callCalcDano({ configHabilidades: [hab] });

        expect(result.erro).toBeUndefined();
        expect(result.dano).toBe(108);
    });

    it('weapon energy combustion', () => {
        // configArma.percEnergia=10, energiaCombustao=mana
        // mana max=50, combustao=floor(50*10/100)=5, dreno=5
        // O Custo nao entra no dano (vai pro Poder Calculado): 8 + 100 = 108
        const arma = makeArma({ dadosQtd: 2, dadosFaces: 6 });
        const result = callCalcDano({
            itensEquipados: [arma],
            configArma: { statusUsados: ['forca'], energiaCombustao: 'mana', percEnergia: 10 },
        });

        expect(result.dano).toBe(108);
        expect(result.drenos).toEqual([{ key: 'mana', valor: 5 }]);
    });

    it('skill energy combustion (per-skill)', () => {
        // hab custoPercentual=20, energiaCombustao=mana
        // mana max=50, combustao=floor(50*20/100)=10
        // O Custo nao entra no dano: 8 + 100 = 108
        const hab = makeHabConfig({ dadosQtd: 2, dadosFaces: 6, custoPercentual: 20, energiaCombustao: 'mana' });
        const result = callCalcDano({ configHabilidades: [hab] });

        expect(result.dano).toBe(108);
        expect(result.drenos).toEqual([{ key: 'mana', valor: 10 }]);
    });

    it('per-skill status selection', () => {
        // hab uses destreza instead of forca
        // getMaximo(destreza) = 80
        // 8 + Destreza 80 = 88
        const hab = makeHabConfig({ dadosQtd: 2, dadosFaces: 6, statusUsados: ['destreza'] });
        const result = callCalcDano({ configHabilidades: [hab] });

        expect(result.dano).toBe(88);
    });

    it('multiplicadores de ficha.dano NAO sao aplicados (valem so no Poder Calculado)', () => {
        const arma = makeArma({ dadosQtd: 2, dadosFaces: 6 });
        const base = callCalcDano({ itensEquipados: [arma] }).dano;
        const ficha = buildFicha();
        ficha.dano.mBase = 3.0;
        ficha.dano.mGeral = 2.0;
        ficha.dano.mFormas = 2.0;
        ficha.dano.mAbsoluto = 2.0;

        const result = callCalcDano({ itensEquipados: [arma], minhaFicha: ficha });
        expect(result.dano).toBe(base);
        expect(base).toBeGreaterThan(0);
    });

    it('mPotencial de ficha.dano NAO multiplica o dano total', () => {
        const arma = makeArma({ dadosQtd: 2, dadosFaces: 6 });
        const base = callCalcDano({ itensEquipados: [arma] }).dano;
        const ficha = buildFicha();
        ficha.dano.mPotencial = 2.0;

        const result = callCalcDano({ itensEquipados: [arma], minhaFicha: ficha });
        expect(result.dano).toBe(base);
    });

    it('mPotencial nao altera o dano de habilidade com combustao de energia', () => {
        const hab = makeHabConfig({ dadosQtd: 2, dadosFaces: 6, custoPercentual: 20, energiaCombustao: 'mana' });
        const base = callCalcDano({ configHabilidades: [hab] }).dano;
        const ficha = buildFicha();
        ficha.dano.mPotencial = 2.0;

        const result = callCalcDano({ minhaFicha: ficha, configHabilidades: [hab] });
        expect(result.dano).toBe(base);
    });

    it('mUnico de ficha.dano NAO e aplicado nem por termo nem globalmente', () => {
        const arma = makeArma({ dadosQtd: 2, dadosFaces: 6 });
        const base = callCalcDano({ itensEquipados: [arma] }).dano;
        const ficha = buildFicha();
        ficha.dano.mUnico = '2.0';

        const result = callCalcDano({ itensEquipados: [arma], minhaFicha: ficha });
        expect(result.dano).toBe(base);
        expect(result.detalheConta).not.toContain('Uni(');
    });

    it('critico continua multiplicando o dano e os outros multiplicadores seguem ignorados', () => {
        const arma = makeArma({ dadosQtd: 2, dadosFaces: 6 });
        const ficha = buildFicha();
        ficha.dano.mGeral = 5.0;
        const normal = callCalcDano({ itensEquipados: [arma] }).dano;
        const critico = callCalcDano({ itensEquipados: [arma], minhaFicha: ficha, isCriticoNormal: true }).dano;
        const criticoSemMult = callCalcDano({ itensEquipados: [arma], isCriticoNormal: true }).dano;
        expect(critico).toBeGreaterThan(normal);
        expect(critico).toBe(criticoSemMult);
    });

    it('result contains expected keys', () => {
        const arma = makeArma({ dadosQtd: 2, dadosFaces: 6 });
        const result = callCalcDano({ itensEquipados: [arma] });

        expect(result).toHaveProperty('dano');
        expect(result).toHaveProperty('letalidade');
        expect(result).toHaveProperty('rolagem');
        expect(result).toHaveProperty('atributosUsados');
        expect(result).toHaveProperty('detalheConta');
        expect(result).toHaveProperty('drenos');
        expect(result).toHaveProperty('energiaDrenada');
    });

    it('weapon name appears in armaStr', () => {
        const arma = makeArma({ nome: 'Katana Lendaria', dadosQtd: 2, dadosFaces: 6 });
        const result = callCalcDano({ itensEquipados: [arma] });
        expect(result.armaStr).toContain('Katana Lendaria');
    });

    it('detalheConta contains MAQUINA DE CALCULO', () => {
        const arma = makeArma({ dadosQtd: 2, dadosFaces: 6 });
        const result = callCalcDano({ itensEquipados: [arma] });
        expect(result.detalheConta).toContain('MÁQUINA DE CÁLCULO');
    });

    it('letalidade reduces dano for 9+ digit totals', () => {
        // Chega em 9+ digitos pelo atributo (sem multiplicadores, que nao existem mais no dano)
        const ficha = buildFicha();
        ficha.forca.base = 1e9;
        const arma = makeArma({ dadosQtd: 2, dadosFaces: 6 });

        const result = callCalcDano({ itensEquipados: [arma], minhaFicha: ficha });
        expect(result.letalidade).toBeGreaterThan(0);
    });
});

// ==========================================
// Edge cases
// ==========================================
describe('calcularDano — edge cases', () => {
    let randomSpy;

    beforeEach(() => {
        randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    });

    afterEach(() => {
        randomSpy.mockRestore();
    });

    it('no weapon no skills returns error', () => {
        const result = callCalcDano({ itensEquipados: [] });
        expect(result.erro).toBeDefined();
    });

    it('skill with dadosQtd=0 does not contribute damage', () => {
        const arma = makeArma({ dadosQtd: 2, dadosFaces: 6 });
        const hab = makeHabConfig({ dadosQtd: 0 });
        const result = callCalcDano({ itensEquipados: [arma], configHabilidades: [hab] });
        // Only weapon contributes: 8 + 100 = 108
        expect(result.dano).toBe(108);
    });

    it('returns error when energy insufficient', () => {
        const ficha = buildFicha();
        ficha.mana.atual = 0;
        const hab = makeHabConfig({ dadosQtd: 2, dadosFaces: 6, custoPercentual: 50, energiaCombustao: 'mana' });

        const result = callCalcDano({ minhaFicha: ficha, configHabilidades: [hab] });
        expect(result.erro).toBeDefined();
        expect(result.erro).toContain('MANA');
    });

    it('iDanoBruto from item is added to somaDanos', () => {
        const arma = makeArma({ dadosQtd: 2, dadosFaces: 6 });
        const item = { tipo: 'acessorio', bonusTipo: 'dano_bruto', bonusValor: '200', nome: 'Anel' };
        const result = callCalcDano({ itensEquipados: [arma, item] });
        expect(result.dano).toBe(308);
    });

    it('mult_dano de item NAO multiplica o dano final', () => {
        const arma = makeArma({ dadosQtd: 2, dadosFaces: 6 });
        const base = callCalcDano({ itensEquipados: [arma] }).dano;
        const item = { tipo: 'acessorio', bonusTipo: 'mult_dano', bonusValor: '2', nome: 'Colar' };
        const result = callCalcDano({ itensEquipados: [arma, item] });
        expect(result.dano).toBe(base);
    });

    it('mult_dano de magia equipada NAO multiplica o dano final', () => {
        const arma = makeArma({ dadosQtd: 2, dadosFaces: 6 });
        const base = callCalcDano({ itensEquipados: [arma] }).dano;
        const ficha = buildFicha({ ataquesElementais: [{ nome: 'Bola', equipado: true, bonusTipo: 'mult_dano', bonusValor: '3' }] });
        const result = callCalcDano({ itensEquipados: [arma], minhaFicha: ficha });
        expect(result.dano).toBe(base);
    });

    it('letalidade bonus from item adds to letal count', () => {
        const arma = makeArma({ dadosQtd: 2, dadosFaces: 6 });
        const item = { tipo: 'acessorio', bonusTipo: 'letalidade', bonusValor: '5', nome: 'Garras' };
        const result = callCalcDano({ itensEquipados: [arma, item] });
        expect(result.letalidade).toBe(5);
    });

    it('linked skill is not treated as free skill', () => {
        const arma = makeArma({ dadosQtd: 2, dadosFaces: 6 });
        const hab = makeHabConfig({ dadosQtd: 3, dadosFaces: 8, armaVinculada: 'arma1' });
        const result = callCalcDano({ itensEquipados: [arma], configHabilidades: [hab] });
        // dados 8+15 = 23, Forca uma vez = 100
        expect(result.dano).toBe(123);
    });

    it('skill linked to different weapon stays as free', () => {
        const arma = makeArma({ id: 'arma1', dadosQtd: 2, dadosFaces: 6 });
        const hab = makeHabConfig({ dadosQtd: 1, dadosFaces: 10, armaVinculada: 'arma2' });
        const result = callCalcDano({ itensEquipados: [arma], configHabilidades: [hab] });
        // dados 8+6 = 14, Forca uma vez = 100
        expect(result.dano).toBe(114);
    });

    it('zero dice result does not produce NaN', () => {
        randomSpy.mockReturnValue(0);
        const arma = makeArma({ dadosQtd: 2, dadosFaces: 6 });
        const result = callCalcDano({ itensEquipados: [arma] });
        expect(isNaN(result.dano)).toBe(false);
    });

    it('multiple skills drain different energies', () => {
        const hab1 = makeHabConfig({ id: 'p1', dadosQtd: 1, dadosFaces: 6, custoPercentual: 10, energiaCombustao: 'mana' });
        const hab2 = makeHabConfig({ id: 'p2', nome: 'Golpe2', dadosQtd: 1, dadosFaces: 6, custoPercentual: 10, energiaCombustao: 'aura' });
        const result = callCalcDano({ configHabilidades: [hab1, hab2] });

        expect(result.erro).toBeUndefined();
        expect(result.drenos.length).toBe(2);
        expect(result.drenos.find(d => d.key === 'mana')).toBeDefined();
        expect(result.drenos.find(d => d.key === 'aura')).toBeDefined();
    });
});

// ==========================================
// rolarDadosComVantagem
// ==========================================
describe('rolarDadosComVantagem', () => {
    let randomSpy;

    afterEach(() => {
        if (randomSpy) randomSpy.mockRestore();
    });

    it('neutral — rolls exactly qD dice and returns sum', () => {
        randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
        const { sD } = rolarDadosComVantagem(2, 20, 0, 0);
        expect(sD).toBe(22);
    });

    it('vantagem — keeps the highest qD dice', () => {
        let calls = 0;
        const vals = [0.9, 0.1, 0.5];
        randomSpy = vi.spyOn(Math, 'random').mockImplementation(() => vals[calls++] ?? 0.5);
        const { sD } = rolarDadosComVantagem(2, 20, 1, 0);
        expect(sD).toBe(30);
    });

    it('desvantagem — keeps the lowest qD dice', () => {
        let calls = 0;
        const vals = [0.9, 0.1, 0.5];
        randomSpy = vi.spyOn(Math, 'random').mockImplementation(() => vals[calls++] ?? 0.5);
        const { sD } = rolarDadosComVantagem(2, 20, 0, 1);
        expect(sD).toBe(14);
    });

    it('includes prefix [VANTAGEM] in rolagemTexto', () => {
        randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
        const { rolagemTexto } = rolarDadosComVantagem(1, 20, 1, 0);
        expect(rolagemTexto).toContain('VANTAGEM');
    });

    it('includes prefix [DESVANTAGEM] in rolagemTexto', () => {
        randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
        const { rolagemTexto } = rolarDadosComVantagem(1, 20, 0, 1);
        expect(rolagemTexto).toContain('DESVANTAGEM');
    });

    it('net vantagem cancels desvantagem', () => {
        randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
        const { sD } = rolarDadosComVantagem(2, 20, 2, 2);
        expect(sD).toBe(22);
    });
});

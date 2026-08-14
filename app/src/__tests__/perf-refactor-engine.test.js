/**
 * QA — Regression tests for the performance refactor of app/src/core/engine.js
 *
 * The refactor reordered `calcularDano` (helper `calcularDreno`) and
 * `calcularReducao` so getBuffs() is computed once per energy key and reused
 * (via getMaximo's new buffsCache param) instead of being called twice
 * (once implicitly inside getMaximo, once explicitly for reducaoCusto).
 *
 * These tests validate the resulting numeric outputs (energy drain, damage,
 * shield reduction) against manually pre-computed expected values, so that
 * any accidental behavior change introduced by the reordering would be caught.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { calcularDano, calcularReducao } from '../core/engine.js';
import { getMaximo, getBuffs } from '../core/attributes.js';

function buildFicha({ poderes = [] } = {}) {
    return {
        forca: { base: 100, nome: 'Forca', mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', reducaoCusto: 0, regeneracao: 0 },
        destreza: { base: 80, nome: 'Destreza', mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', reducaoCusto: 0, regeneracao: 0 },
        mana: { base: 1000, nome: 'Mana', atual: 100000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', reducaoCusto: 0, regeneracao: 0 },
        aura: { base: 1000, nome: 'Aura', atual: 100000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', reducaoCusto: 0, regeneracao: 0 },
        chakra: { base: 1000, nome: 'Chakra', atual: 100000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', reducaoCusto: 0, regeneracao: 0 },
        dano: { base: 0, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mPotencial: 1.0, mUnico: '1.0', reducaoCusto: 0, regeneracao: 0 },
        poderes,
        inventario: [],
        ataquesElementais: [],
    };
}

function makeArma({ id = 'arma1', nome = 'Espada', dadosQtd = 2, dadosFaces = 6, elemento = 'Neutro', equipado = true } = {}) {
    return { id, nome, tipo: 'arma', dadosQtd, dadosFaces, bonusTipo: null, bonusValor: '0', elemento, equipado };
}

function makeHabConfig({ id = 'p1', nome = 'Golpe', dadosQtd = 2, dadosFaces = 6, custoPercentual = 0, armaVinculada = '', statusUsados = ['forca'], energiaCombustao = 'mana', efeitos = [] } = {}) {
    return { id, nome, dadosQtd, dadosFaces, custoPercentual, armaVinculada, statusUsados, energiaCombustao, efeitos };
}

// ==========================================
// calcularDano — energy drain (calcularDreno helper)
// ==========================================
describe('perf refactor — calcularDano energy drain matches manual calculation', () => {
    let randomSpy;

    beforeEach(() => {
        randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    });

    afterEach(() => {
        randomSpy.mockRestore();
    });

    it('drain (dreno) equals a manual getMaximo/getBuffs computation, no buffs', () => {
        const ficha = buildFicha();
        const hab = makeHabConfig({ dadosQtd: 2, dadosFaces: 6, custoPercentual: 15, energiaCombustao: 'mana' });

        const result = calcularDano({
            minhaFicha: ficha,
            configArma: { statusUsados: ['forca'], energiaCombustao: 'mana', percEnergia: 0 },
            configHabilidades: [hab],
            itensEquipados: [],
        });

        // Manual expected computation, independent of internal caching order
        const mx = getMaximo(ficha, 'mana');
        const combustao = Math.floor(mx * (15 / 100));
        const bEnergia = getBuffs(ficha, 'mana');
        const red = Math.min(100, 0 + bEnergia.reducaoCusto);
        const expectedDreno = Math.floor(combustao * (1 - red / 100));

        expect(result.drenos).toEqual([{ key: 'mana', valor: expectedDreno }]);
    });

    it('drain applies reducaoCusto buff correctly (poder reduces cost)', () => {
        const ficha = buildFicha({
            poderes: [{
                ativa: true,
                efeitos: [{ propriedade: 'reducaocusto', atributo: 'mana', valor: '30' }],
            }],
        });
        const hab = makeHabConfig({ dadosQtd: 2, dadosFaces: 6, custoPercentual: 20, energiaCombustao: 'mana' });

        const result = calcularDano({
            minhaFicha: ficha,
            configArma: { statusUsados: ['forca'], energiaCombustao: 'mana', percEnergia: 0 },
            configHabilidades: [hab],
            itensEquipados: [],
        });

        const mx = getMaximo(ficha, 'mana');
        const combustao = Math.floor(mx * (20 / 100));
        const bEnergia = getBuffs(ficha, 'mana');
        expect(bEnergia.reducaoCusto).toBe(30);
        const red = Math.min(100, 0 + 30);
        const expectedDreno = Math.floor(combustao * (1 - red / 100));

        expect(result.drenos).toEqual([{ key: 'mana', valor: expectedDreno }]);
        expect(expectedDreno).toBeLessThan(combustao);
    });

    it('drain reflects a buffed max-energy (mgeral buff on mana) consistently', () => {
        const ficha = buildFicha({
            poderes: [{
                ativa: true,
                efeitos: [{ propriedade: 'mgeral', atributo: 'todas_energias', valor: '4.0' }],
            }],
        });
        const hab = makeHabConfig({ dadosQtd: 1, dadosFaces: 6, custoPercentual: 10, energiaCombustao: 'mana' });

        const result = calcularDano({
            minhaFicha: ficha,
            configArma: { statusUsados: ['forca'], energiaCombustao: 'mana', percEnergia: 0 },
            configHabilidades: [hab],
            itensEquipados: [],
        });

        const mx = getMaximo(ficha, 'mana'); // should reflect the mgeral=4.0 buff
        expect(mx).toBeGreaterThan(1000); // sanity: base(1000) * mgeral(4.0) => 4000 (approx, before rounding rules)
        const combustao = Math.floor(mx * (10 / 100));
        const bEnergia = getBuffs(ficha, 'mana');
        const red = Math.min(100, 0 + bEnergia.reducaoCusto);
        const expectedDreno = Math.floor(combustao * (1 - red / 100));

        expect(result.drenos).toEqual([{ key: 'mana', valor: expectedDreno }]);
    });

    it('produces the same dreno regardless of whether reducaoCusto and mgeral buffs are combined', () => {
        const ficha = buildFicha({
            poderes: [{
                ativa: true,
                efeitos: [
                    { propriedade: 'reducaocusto', atributo: 'mana', valor: '25' },
                    { propriedade: 'mgeral', atributo: 'todas_energias', valor: '2.0' },
                ],
            }],
        });
        const hab = makeHabConfig({ dadosQtd: 1, dadosFaces: 6, custoPercentual: 40, energiaCombustao: 'mana' });

        const result = calcularDano({
            minhaFicha: ficha,
            configArma: { statusUsados: ['forca'], energiaCombustao: 'mana', percEnergia: 0 },
            configHabilidades: [hab],
            itensEquipados: [],
        });

        const mx = getMaximo(ficha, 'mana');
        const combustao = Math.floor(mx * (40 / 100));
        const bEnergia = getBuffs(ficha, 'mana');
        const red = Math.min(100, 0 + bEnergia.reducaoCusto);
        const expectedDreno = Math.floor(combustao * (1 - red / 100));

        expect(result.drenos).toEqual([{ key: 'mana', valor: expectedDreno }]);
    });
});

// ==========================================
// calcularReducao
// ==========================================
describe('perf refactor — calcularReducao matches manual calculation', () => {
    it('single energy key, no buffs', () => {
        const ficha = buildFicha();
        const result = calcularReducao({
            energiaKey: 'mana',
            perc: 20,
            multBase: 1.0,
            minhaFicha: ficha,
            itensEquipados: [],
            rE: null,
        });

        const mMax = getMaximo(ficha, 'mana');
        const gt = Math.floor(mMax * (20 / 100));
        const bEnergia = getBuffs(ficha, 'mana');
        const red = Math.min(100, 0 + bEnergia.reducaoCusto);
        const cr = Math.floor(gt * (1 - red / 100));

        expect(result.erro).toBeUndefined();
        expect(result.drenos).toEqual([{ key: 'mana', valor: cr }]);
        expect(result.escudoReduzido).toBe(Math.floor(gt * 1.0));
    });

    it('"poder" energyKey aggregates mana+aura+chakra, each drain matches manual per-key computation', () => {
        const ficha = buildFicha();
        const result = calcularReducao({
            energiaKey: 'poder',
            perc: 10,
            multBase: 1.0,
            minhaFicha: ficha,
            itensEquipados: [],
            rE: null,
        });

        expect(result.erro).toBeUndefined();
        ['mana', 'aura', 'chakra'].forEach((e) => {
            const mMax = getMaximo(ficha, e);
            const gt = Math.floor(mMax * (10 / 100));
            const bEnergia = getBuffs(ficha, e);
            const red = Math.min(100, 0 + bEnergia.reducaoCusto);
            const cr = Math.floor(gt * (1 - red / 100));
            const found = result.drenos.find(d => d.key === e);
            expect(found).toBeDefined();
            expect(found.valor).toBe(cr);
        });
    });

    it('applies reducaoCusto buff to shield-reduction drain', () => {
        const ficha = buildFicha({
            poderes: [{
                ativa: true,
                efeitos: [{ propriedade: 'reducaocusto', atributo: 'mana', valor: '50' }],
            }],
        });
        const result = calcularReducao({
            energiaKey: 'mana',
            perc: 30,
            multBase: 1.0,
            minhaFicha: ficha,
            itensEquipados: [],
            rE: null,
        });

        const mMax = getMaximo(ficha, 'mana');
        const gt = Math.floor(mMax * (30 / 100));
        const bEnergia = getBuffs(ficha, 'mana');
        expect(bEnergia.reducaoCusto).toBe(50);
        const red = Math.min(100, 0 + 50);
        const cr = Math.floor(gt * (1 - red / 100));

        expect(result.drenos).toEqual([{ key: 'mana', valor: cr }]);
    });

    it('returns erro when energy is insufficient', () => {
        const ficha = buildFicha();
        ficha.mana.atual = 0;
        const result = calcularReducao({
            energiaKey: 'mana',
            perc: 50,
            multBase: 1.0,
            minhaFicha: ficha,
            itensEquipados: [],
            rE: null,
        });
        expect(result.erro).toBe('Sem energia!');
    });
});

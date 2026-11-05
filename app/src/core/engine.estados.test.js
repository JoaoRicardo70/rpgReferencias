import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { calcularCA, calcularEficaciaCura, calcularAcerto, calcularReducao, processarDefesaComCondicoes } from './engine';

const base = (condicoes) => ({
    forca: { base: 1000000, nome: 'Força' },
    destreza: { base: 1000000, nome: 'Destreza' },
    mana: { base: 1000000, atual: 1000000 },
    ...(condicoes ? { condicoes } : {})
});
const c = (id, stacks) => ({ id, stacks });

describe('engine - calcularCA com estados', () => {
    const evBase = calcularCA(base(), 'evasiva');
    const resBase = calcularCA(base(), 'resistencia');
    it('ha um valor base positivo', () => {
        expect(evBase).toBeGreaterThan(0);
        expect(resBase).toBeGreaterThan(0);
    });
    it('Lento: evasiva pela metade, resistencia intacta', () => {
        expect(calcularCA(base([c('lento', 1)]), 'evasiva')).toBe(Math.floor(evBase / 2));
        expect(calcularCA(base([c('lento', 1)]), 'resistencia')).toBe(resBase);
    });
    it('Exausto 2 = Lento', () => {
        expect(calcularCA(base([c('exausto', 2)]), 'evasiva')).toBe(Math.floor(evBase / 2));
    });
    it('Imobilizado e Incapacitado zeram evasiva', () => {
        expect(calcularCA(base([c('imobilizado', 1)]), 'evasiva')).toBe(0);
        expect(calcularCA(base([c('incapacitado', 1)]), 'evasiva')).toBe(0);
        expect(calcularCA(base([c('exausto', 5)]), 'evasiva')).toBe(0);
    });
    it('Vulneravel e Queimado 4+ cortam resistencia pela metade', () => {
        expect(calcularCA(base([c('vulneravel', 1)]), 'resistencia')).toBe(Math.floor(resBase / 2));
        expect(calcularCA(base([c('queimado', 4)]), 'resistencia')).toBe(Math.floor(resBase / 2));
        expect(calcularCA(base([c('queimado', 3)]), 'resistencia')).toBe(resBase);
        expect(calcularCA(base([c('queimado', 4)]), 'evasiva')).toBe(evBase);
    });
    it('Petrificado por estagios', () => {
        expect(calcularCA(base([c('petrificado', 1)]), 'evasiva')).toBe(Math.floor(evBase / 2));
        expect(calcularCA(base([c('petrificado', 2)]), 'resistencia')).toBe(Math.floor(resBase / 2));
        expect(calcularCA(base([c('petrificado', 3)]), 'evasiva')).toBe(0);
        expect(calcularCA(base([c('petrificado', 4)]), 'evasiva')).toBe(0);
    });
    it('ficha nula e condicoes vazias', () => {
        expect(calcularCA(null, 'evasiva')).toBe(12);
        expect(calcularCA(base([]), 'evasiva')).toBe(evBase);
    });
    it('processarDefesaComCondicoes: tipo desconhecido nao muda e sem condicoes devolve o valor', () => {
        expect(processarDefesaComCondicoes(base([c('lento', 1)]), 'outro', 40)).toBe(40);
        expect(processarDefesaComCondicoes(base(), 'evasiva', 40)).toBe(40);
        expect(processarDefesaComCondicoes(base([c('lento', 1)]), 'evasiva', 41)).toBe(20);
    });
});

describe('engine - calcularEficaciaCura com estados', () => {
    it('neutra', () => { expect(calcularEficaciaCura(base())).toBe(1); expect(calcularEficaciaCura(null)).toBe(1); });
    it('Sangrando 2 = 25%', () => { expect(calcularEficaciaCura(base([c('sangrando', 2)]))).toBe(0.25); });
    it('Exausto 4 corta 50%, 3 nao', () => {
        expect(calcularEficaciaCura(base([c('exausto', 4)]))).toBe(0.5);
        expect(calcularEficaciaCura(base([c('exausto', 3)]))).toBe(1);
    });
    it('Sangrando 3 = 12,5%', () => {
        expect(calcularEficaciaCura(base([c('sangrando', 3)]))).toBe(0.125);
    });
    it('Sangrando 6 + Exausto 3 chega a Exaustao 5 (>=4): 0.5^6 x 0.5', () => {
        expect(calcularEficaciaCura(base([c('sangrando', 6), c('exausto', 3)]))).toBeCloseTo(Math.pow(0.5, 7), 12);
    });
    it('buff de efetividade_cura soma por cima', () => {
        const f = base([c('queimado', 1)]);
        f.passivas = [{ efeitos: [{ propriedade: 'efetividade_cura', valor: 1 }] }];
        expect(calcularEficaciaCura(f)).toBe(0.5 * 2);
    });
});

describe('engine - calcularAcerto com desvantagem de estados', () => {
    let spy;
    beforeEach(() => { spy = vi.spyOn(Math, 'random').mockReturnValue(0.5); });
    afterEach(() => { vi.restoreAllMocks(); });
    const acerto = (f, extra = {}) => calcularAcerto({ qD: 1, fD: 20, prof: 0, bonus: 0, sels: [], minhaFicha: f, itensEquipados: [], ...extra });

    it('sem estados rola so um d20', () => {
        acerto(base());
        expect(spy).toHaveBeenCalledTimes(1);
    });
    it('Exausto 3 adiciona 1 dado (desvantagem) e fica com o menor', () => {
        spy.mockReturnValueOnce(0.9).mockReturnValueOnce(0.0);
        const r = acerto(base([c('exausto', 3)]));
        expect(spy).toHaveBeenCalledTimes(2);
        expect(r.acertoTotal).toBe(1);
        expect(r.rolagem).toContain('DESVANTAGEM');
    });
    it('Cego/Surdo = 2 desvantagens (3 dados)', () => {
        acerto(base([c('cegosurdo', 1)]));
        expect(spy).toHaveBeenCalledTimes(3);
    });
    it('desvantagem do jogador soma com a de estados', () => {
        acerto(base([c('exausto', 3)]), { desvantagens: 2 });
        expect(spy).toHaveBeenCalledTimes(4);
    });
    it('vantagem do jogador cancela a desvantagem de estados', () => {
        const r = acerto(base([c('exausto', 3)]), { vantagens: 1 });
        expect(spy).toHaveBeenCalledTimes(1);
        expect(r.acertoTotal).toBe(11);
    });
    it('Exausto 2 nao afeta ataque', () => {
        acerto(base([c('exausto', 2)]));
        expect(spy).toHaveBeenCalledTimes(1);
    });
});

describe('engine - calcularReducao com custo de defesa por estados', () => {
    const rodar = (f) => calcularReducao({ energiaKey: 'mana', perc: 10, multBase: 1, minhaFicha: f, itensEquipados: [], rE: 0 });
    const custo = (f) => rodar(f).drenos[0].valor;
    it('sem estados e referencia', () => { expect(custo(base())).toBeGreaterThan(0); });
    it('Queimado 3 custa +30%', () => {
        const b = custo(base());
        expect(Math.abs(custo(base([c('queimado', 3)])) - b * 1.3)).toBeLessThanOrEqual(1);
    });
    it('Sangrando + Queimado somam stacks (2+2 = +40%)', () => {
        const b = custo(base());
        const v = custo(base([c('queimado', 2), c('sangrando', 2)]));
        expect(v).toBeGreaterThan(b);
        expect(Math.abs(v - b * 1.4)).toBeLessThanOrEqual(2);
    });
    it('outros estados nao encarecem', () => {
        expect(custo(base([c('lento', 3), c('criogenia', 3)]))).toBe(custo(base()));
    });
    it('sem energia para o custo encarecido: erro', () => {
        const f = base([c('queimado', 6)]);
        f.mana.atual = custo(base());
        expect(rodar(f).erro).toBe('Sem energia!');
    });
    it('sem estados com energia exata passa', () => {
        const f = base();
        f.mana.atual = custo(base());
        expect(rodar(f).erro).toBeUndefined();
    });
});

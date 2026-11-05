import { describe, it, expect, vi, afterEach } from 'vitest';
import { somarBonusBase, calcularCA, calcularAcerto } from './engine.js';
import { ATRIBUTOS_AGRUPADOS, getPropriedadesDoAtributo } from './efeitos-constants.js';
import { afetaPoderCalculado } from './acaoPoder.js';

const ef = (atributo, valor, propriedade = 'base') => ({ atributo, propriedade, valor });
const ficha = (extra = {}) => ({ destreza: { base: 316000 }, forca: { base: 316000 }, poderes: [], passivas: [], inventario: [], seresSelados: [], ...extra });

afterEach(() => vi.restoreAllMocks());

describe('somarBonusBase - poderes', () => {
    it('poder ativo soma efeitos ativos e passivos', () => {
        const f = ficha({ poderes: [{ ativa: true, efeitos: [ef('evasiva', 10)], efeitosPassivos: [ef('evasiva', 5)] }] });
        expect(somarBonusBase(f, 'evasiva')).toBe(15);
    });
    it('poder inativo soma so os passivos', () => {
        const f = ficha({ poderes: [{ ativa: false, efeitos: [ef('evasiva', 10)], efeitosPassivos: [ef('evasiva', 5)] }] });
        expect(somarBonusBase(f, 'evasiva')).toBe(5);
    });
    it('passivas da ficha somam', () => {
        expect(somarBonusBase(ficha({ passivas: [{ efeitos: [ef('resistencia', 4)] }] }), 'resistencia')).toBe(4);
    });
    it('propriedade diferente de base nao soma', () => {
        const f = ficha({ poderes: [{ ativa: true, efeitos: [ef('evasiva', 2, 'mbase')] }] });
        expect(somarBonusBase(f, 'evasiva')).toBe(0);
    });
});

describe('somarBonusBase - isolamento de atributos', () => {
    const f = ficha({ poderes: [{ ativa: true, efeitos: [ef('evasiva', 1), ef('resistencia', 10), ef('acerto', 100)] }] });
    it('cada atributo soma so o seu', () => {
        expect(somarBonusBase(f, 'evasiva')).toBe(1);
        expect(somarBonusBase(f, 'resistencia')).toBe(10);
        expect(somarBonusBase(f, 'acerto')).toBe(100);
        expect(somarBonusBase(f, 'dano')).toBe(0);
    });
});

describe('somarBonusBase - Pactos', () => {
    it('Pacto ativo soma buffs ativos e passivos', () => {
        const f = ficha({ seresSelados: [{ ativo: true, efeitos: [ef('evasiva', 10)], efeitosPassivos: [ef('evasiva', 5)] }] });
        expect(somarBonusBase(f, 'evasiva')).toBe(15);
    });
    it('Pacto inativo ou sem campo ativo nao soma', () => {
        const f = ficha({ seresSelados: [
            { ativo: false, efeitos: [ef('evasiva', 10)] },
            { efeitos: [ef('evasiva', 10)], efeitosPassivos: [ef('evasiva', 3)] },
            null,
        ] });
        expect(somarBonusBase(f, 'evasiva')).toBe(0);
    });
    it('Forma do Pacto sem config soma uma vez (efeitos da forma)', () => {
        const f = ficha({ seresSelados: [{ ativo: true, formaAtivaId: 1, formas: [{ id: 1, efeitos: [ef('evasiva', 7)], efeitosPassivos: [ef('evasiva', 2)] }] }] });
        expect(somarBonusBase(f, 'evasiva')).toBe(9);
    });
    it('Forma do Pacto com config ativa por id usa essa config', () => {
        const f = ficha({ seresSelados: [{ ativo: true, formaAtivaId: 1, configAtivaId: 'b', formas: [{ id: 1, configs: [
            { id: 'a', efeitos: [ef('evasiva', 1)] }, { id: 'b', efeitos: [ef('evasiva', 20)], efeitosPassivos: [ef('evasiva', 3)] },
        ] }] }] });
        expect(somarBonusBase(f, 'evasiva')).toBe(23);
    });
    it('Forma do Pacto usa a primeira config por padrao', () => {
        const f = ficha({ seresSelados: [{ ativo: true, formaAtivaId: 1, formas: [{ id: 1, configs: [
            { id: 'a', efeitos: [ef('evasiva', 1)] }, { id: 'b', efeitos: [ef('evasiva', 20)] },
        ] }] }] });
        expect(somarBonusBase(f, 'evasiva')).toBe(1);
    });
    it('formaAtivaId inexistente ignora a forma', () => {
        const f = ficha({ seresSelados: [{ ativo: true, formaAtivaId: 99, efeitos: [ef('evasiva', 4)], formas: [{ id: 1, efeitos: [ef('evasiva', 50)] }] }] });
        expect(somarBonusBase(f, 'evasiva')).toBe(4);
    });
});

describe('somarBonusBase - Configuracao da Forma (uma vez cada)', () => {
    it('Pacto: Forma (resolver) + config ativa somam uma vez cada', () => {
        const f = ficha({ seresSelados: [{ ativo: true, formaAtivaId: 1, configAtivaId: 'b', formas: [{ id: 1, efeitos: [ef('evasiva', 7)], configs: [
            { id: 'a', efeitos: [ef('evasiva', 1)] }, { id: 'b', efeitos: [ef('evasiva', 20)], efeitosPassivos: [ef('evasiva', 3)] }] }] }] });
        expect(somarBonusBase(f, 'evasiva')).toBe(30);
    });
    it('Pacto: acumulaFormaBase false substitui base mas a config continua somando', () => {
        const f = ficha({ seresSelados: [{ ativo: true, efeitos: [ef('evasiva', 100)], formaAtivaId: 1, formas: [{ id: 1, acumulaFormaBase: false, efeitos: [ef('evasiva', 7)], configs: [{ id: 'a', efeitos: [ef('evasiva', 1)] }] }] }] });
        expect(somarBonusBase(f, 'evasiva')).toBe(8);
    });
    it('Poder inativo com config de Forma ativa conta a config (como getBuffs)', () => {
        const f = ficha({ poderes: [{ ativa: false, formaAtivaId: 1, formas: [{ id: 1, configs: [{ id: 'a', efeitos: [ef('evasiva', 6)] }] }] }] });
        expect(somarBonusBase(f, 'evasiva')).toBe(6);
    });
    it('Item equipado com config conta; nao equipado nao', () => {
        const mk = (equipado) => ({ equipado, formaAtivaId: 1, formas: [{ id: 1, configs: [{ id: 'a', efeitosPassivos: [ef('resistencia', 6)] }] }] });
        expect(somarBonusBase(ficha({ inventario: [mk(true)] }), 'resistencia')).toBe(6);
        expect(somarBonusBase(ficha({ inventario: [mk(false)] }), 'resistencia')).toBe(0);
    });
    it('sem Forma ativa a config nao soma', () => {
        const f = ficha({ seresSelados: [{ ativo: true, formas: [{ id: 1, configs: [{ id: 'a', efeitos: [ef('evasiva', 6)] }] }] }] });
        expect(somarBonusBase(f, 'evasiva')).toBe(0);
    });
});

describe('somarBonusBase - itens', () => {
    const item = (acumula, equipado = true) => ({
        equipado, efeitos: [ef('resistencia', 3)], formaAtivaId: 1,
        formas: [{ id: 1, acumulaFormaBase: acumula, efeitos: [ef('resistencia', 7)] }],
    });
    it('Forma que acumula soma item + forma (sem contar a forma duas vezes)', () => {
        expect(somarBonusBase(ficha({ inventario: [item(true)] }), 'resistencia')).toBe(10);
    });
    it('Forma sem a flag acumulaFormaBase acumula por padrao', () => {
        expect(somarBonusBase(ficha({ inventario: [item(undefined)] }), 'resistencia')).toBe(10);
    });
    it('acumulaFormaBase false: so os efeitos da forma', () => {
        expect(somarBonusBase(ficha({ inventario: [item(false)] }), 'resistencia')).toBe(7);
    });
    it('item nao equipado e ignorado', () => {
        expect(somarBonusBase(ficha({ inventario: [item(true, false)] }), 'resistencia')).toBe(0);
    });
    it('item com efeitosAtivos false ignora efeitos do item', () => {
        const i = { ...item(true), efeitosAtivos: false, formaAtivaId: null };
        expect(somarBonusBase(ficha({ inventario: [i] }), 'resistencia')).toBe(0);
    });
});

describe('somarBonusBase - entradas invalidas', () => {
    it('ficha null/undefined => 0', () => {
        expect(somarBonusBase(null, 'evasiva')).toBe(0);
        expect(somarBonusBase(undefined, 'acerto')).toBe(0);
    });
    it('ficha vazia => 0', () => {
        expect(somarBonusBase({}, 'evasiva')).toBe(0);
    });
    it('valor string, negativo e NaN', () => {
        const f = ficha({ poderes: [{ ativa: true, efeitos: [ef('evasiva', '12'), ef('evasiva', -4), ef('evasiva', 'abc'), ef('evasiva', undefined), ef('evasiva', '2.5')] }] });
        expect(somarBonusBase(f, 'evasiva')).toBeCloseTo(10.5);
    });
});

describe('fluxo do usuario - CA', () => {
    it('Pacto com efeito passivo EVASIVA+BASE 50 leva CA de 34 para 43', () => {
        expect(calcularCA(ficha(), 'evasiva')).toBe(34);
        const f = ficha({ seresSelados: [{ ativo: true, efeitosPassivos: [ef('evasiva', 50)] }] });
        expect(calcularCA(f, 'evasiva')).toBe(43);
    });
    it('Pacto inativo nao muda a CA', () => {
        const f = ficha({ seresSelados: [{ ativo: false, efeitosPassivos: [ef('evasiva', 50)] }] });
        expect(calcularCA(f, 'evasiva')).toBe(34);
    });
});

describe('fluxo do usuario - Acerto', () => {
    const chamar = (f, extra = {}) => calcularAcerto({ qD: 1, fD: 20, prof: 0, bonus: 0, sels: ['destreza'], minhaFicha: f, itensEquipados: [], ...extra });
    // random 0.5 => d20 = 11; 1 natural/20 natural nao se aplicam
    const fixarDado = () => vi.spyOn(Math, 'random').mockReturnValue(0.5);

    it('sem efeito: 22 + dado', () => {
        fixarDado();
        expect(chamar(ficha()).acertoTotal).toBe(22 + 11);
    });
    it('poder ativo ACERTO+BASE 5 entra na reducao (27)', () => {
        fixarDado();
        const f = ficha({ poderes: [{ ativa: true, efeitos: [ef('acerto', 5)] }] });
        const r = chamar(f);
        expect(r.acertoTotal).toBe(27 + 11);
        expect(r.profBonusTexto).toContain('Efeitos: +5');
    });
    it('poder inativo com efeito ativo nao conta', () => {
        fixarDado();
        const f = ficha({ poderes: [{ ativa: false, efeitos: [ef('acerto', 5)] }] });
        expect(chamar(f).acertoTotal).toBe(22 + 11);
        expect(chamar(f).profBonusTexto).not.toContain('Efeitos');
    });
    it('efeito passivo ACERTO+BASE entra na reducao', () => {
        fixarDado();
        const f = ficha({ poderes: [{ ativa: false, efeitosPassivos: [ef('acerto', 5)] }] });
        expect(chamar(f).acertoTotal).toBe(27 + 11);
    });
    it('Pacto ativo com ACERTO+BASE conta; inativo nao', () => {
        fixarDado();
        const on = ficha({ seresSelados: [{ ativo: true, efeitosPassivos: [ef('acerto', 5)] }] });
        const off = ficha({ seresSelados: [{ ativo: false, efeitosPassivos: [ef('acerto', 5)] }] });
        expect(chamar(on).acertoTotal).toBe(27 + 11);
        expect(chamar(off).acertoTotal).toBe(22 + 11);
    });
    it('Prof entra fora da reducao e efeitos de evasiva nao vazam', () => {
        fixarDado();
        const f = ficha({ poderes: [{ ativa: true, efeitos: [ef('acerto', 5), ef('evasiva', 500)] }] });
        expect(chamar(f, { prof: 3 }).acertoTotal).toBe(27 + 11 + 3);
    });
    it('Maestria (proficiencia_arma) nao entra no bonus de efeitos', () => {
        fixarDado();
        const f = ficha({ poderes: [{ ativa: true, efeitos: [{ atributo: 'espada', propriedade: 'proficiencia_arma', valor: 4 }] }] });
        expect(somarBonusBase(f, 'acerto')).toBe(0);
        expect(chamar(f).acertoTotal).toBe(22 + 11);
        expect(chamar(f).profBonusTexto).not.toContain('Efeitos');
    });
    it('acerto negativo reduz', () => {
        fixarDado();
        const f = ficha({ poderes: [{ ativa: true, efeitos: [ef('acerto', -5)] }] });
        expect(chamar(f).acertoTotal).toBeLessThan(22 + 11);
        expect(chamar(f).profBonusTexto).toContain('Efeitos: -5');
    });
});

describe('efeitos-constants e acaoPoder', () => {
    it("'acerto' esta no grupo COMBATE", () => {
        const g = ATRIBUTOS_AGRUPADOS.find(x => x.label === 'COMBATE' || /COMBATE/i.test(x.label));
        expect(g).toBeTruthy();
        expect(g.options).toContain('acerto');
        expect(g.options).toContain('dano');
    });
    it("getPropriedadesDoAtributo('acerto') === ['base']", () => {
        expect(getPropriedadesDoAtributo('acerto')).toEqual(['base']);
    });
    it('afetaPoderCalculado com acerto+base e false', () => {
        expect(afetaPoderCalculado({ efeitos: [ef('acerto', 5)] })).toBe(false);
    });
});

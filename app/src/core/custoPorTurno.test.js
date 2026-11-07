import { describe, it, expect } from 'vitest';
import { lerCustoPorTurno, normalizarCustoPorTurno, calcularCustosPorTurno, aplicarCustosPorTurno, fotoDosPoderes, camposDePoderesAlterados, descreverCustoPorTurno } from './custoPorTurno';
import { FATOR_EXIBICAO_VITAIS, getTetoExibidoComFator } from './vitals';

const energia = (atual) => ({ base: 100000000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual, regeneracao: 0 });
const poder = (id, extra = {}) => ({ id, nome: `P${id}`, ativa: true, efeitos: [], efeitosPassivos: [], ...extra });
const fixo = (valor, en = 'mana') => ({ modo: 'fixo', valor, energia: en });

describe('lerCustoPorTurno / normalizarCustoPorTurno', () => {
    it('aceita fixo e percMax validos', () => {
        expect(normalizarCustoPorTurno(fixo(12))).toEqual({ modo: 'fixo', valor: 12, energia: 'mana' });
        expect(normalizarCustoPorTurno({ modo: 'percMax', valor: '5', energia: 'chakra' })).toEqual({ modo: 'percMax', valor: 5, energia: 'chakra' });
    });
    it('ausente, vazio ou valor 0 = sem custo e sem aviso', () => {
        [undefined, null, '', fixo(0), { modo: 'fixo', energia: 'mana' }].forEach(v => {
            expect(lerCustoPorTurno(v)).toEqual({ custo: null, aviso: '' });
        });
    });
    it('invalidos sao ignorados com aviso', () => {
        expect(lerCustoPorTurno(fixo(-1)).aviso).toMatch(/valor inválido/);
        expect(lerCustoPorTurno(fixo(2e12)).custo).toBeNull();
        expect(lerCustoPorTurno({ modo: 'xis', valor: 1, energia: 'mana' }).aviso).toMatch(/modo/);
        expect(lerCustoPorTurno({ modo: 'fixo', valor: 1, energia: 'vida' }).aviso).toMatch(/energia/);
        expect(lerCustoPorTurno({ modo: 'percMax', valor: 150, energia: 'mana' }).custo).toBeNull();
        expect(lerCustoPorTurno('texto').aviso).toMatch(/formato/);
        expect(lerCustoPorTurno(fixo('abc')).custo).toBeNull();
    });
    it('descreve para o cartao', () => {
        expect(descreverCustoPorTurno({ custoPorTurno: { modo: 'percMax', valor: 5, energia: 'chakra' } })).toBe('5% de chakra por turno');
        expect(descreverCustoPorTurno({ custoPorTurno: fixo(12) })).toBe('12 de mana por turno');
        expect(descreverCustoPorTurno({})).toBe('');
    });
});

describe('calcularCustosPorTurno / aplicarCustosPorTurno', () => {
    it('custo fixo desconta valor x fator da energia atual', () => {
        const f = { mana: energia(50000), poderes: [poder(1, { custoPorTurno: fixo(12) })] };
        const r = aplicarCustosPorTurno(f);
        expect(f.mana.atual).toBe(50000 - 12 * FATOR_EXIBICAO_VITAIS);
        expect(r.textos).toEqual(['P1 consumiu 12 de mana']);
        expect(f.poderes[0].ativa).toBe(true);
    });
    it('custo em % usa o maximo atual da energia', () => {
        const f = { chakra: energia(1e12), poderes: [poder(1, { custoPorTurno: { modo: 'percMax', valor: 5, energia: 'chakra' } })] };
        const teto = getTetoExibidoComFator('chakra', f);
        aplicarCustosPorTurno(f);
        expect(f.chakra.atual).toBeCloseTo(1e12 - teto * 0.05, 0);
    });
    it('energia insuficiente desliga sem pagar e avisa', () => {
        const f = { mana: energia(5000), vida: energia(1e6), poderes: [poder(1, { custoPorTurno: fixo(12) })] };
        const r = aplicarCustosPorTurno(f);
        expect(f.poderes[0].ativa).toBe(false);
        expect(f.mana.atual).toBe(5000);
        expect(r.textos).toEqual(['P1 desligou: sem mana para o custo por turno']);
        expect(r.desligados).toBe(1);
    });
    it('exatamente a energia que sobra ainda paga', () => {
        const f = { mana: energia(12 * FATOR_EXIBICAO_VITAIS), poderes: [poder(1, { custoPorTurno: fixo(12) })] };
        aplicarCustosPorTurno(f);
        expect(f.poderes[0].ativa).toBe(true);
        expect(f.mana.atual).toBe(0);
    });
    it('Poder desligado nao paga', () => {
        const f = { mana: energia(50000), poderes: [poder(1, { ativa: false, custoPorTurno: fixo(12) })] };
        const r = aplicarCustosPorTurno(f);
        expect(f.mana.atual).toBe(50000);
        expect(r.alterou).toBe(false);
    });
    it('varios poderes na mesma energia pagam em sequencia; o que nao couber desliga', () => {
        const f = { mana: energia(15000), aura: energia(9000), poderes: [
            poder(1, { custoPorTurno: fixo(10) }), poder(2, { custoPorTurno: fixo(10) }), poder(3, { custoPorTurno: fixo(3, 'aura') }),
        ] };
        const { gastos, desligar } = calcularCustosPorTurno(f);
        expect(gastos.map(g => g.id)).toEqual([1, 3]);
        expect(desligar.map(d => d.id)).toEqual([2]);
        aplicarCustosPorTurno(f);
        expect(f.mana.atual).toBe(5000);
        expect(f.aura.atual).toBe(6000);
        expect(f.poderes.map(p => p.ativa)).toEqual([true, false, true]);
    });
    it('ficha sem a energia desliga; sem poderes ou sem custo nao faz nada; sem undefined', () => {
        const f = { poderes: [poder(1, { custoPorTurno: fixo(1) }), poder(2)] };
        aplicarCustosPorTurno(f);
        expect(f.poderes[0].ativa).toBe(false);
        expect(f.poderes[1].ativa).toBe(true);
        expect(calcularCustosPorTurno(null)).toEqual({ gastos: [], desligar: [] });
        expect(calcularCustosPorTurno({}).gastos).toEqual([]);
        expect(JSON.stringify(f)).not.toContain('undefined');
    });
});

describe('camposDePoderesAlterados', () => {
    it('so os campos que mudaram, indice pelo id da lista fresca, null para apagar', () => {
        const f = { poderes: [{ id: 1, ativa: true, recargaRestante: 1 }, { id: 2, ativa: true }, { id: 3, ativa: false }] };
        const antes = fotoDosPoderes(f);
        f.poderes[0].ativa = false; delete f.poderes[0].recargaRestante; f.poderes[2].recargaRestante = 2;
        const campos = camposDePoderesAlterados(antes, fotoDosPoderes(f), [{ id: 3 }, { id: 1 }]);
        expect(campos).toEqual({ 'poderes/1/ativa': false, 'poderes/1/recargaRestante': null, 'poderes/0/recargaRestante': 2 });
    });
    it('id ausente na lista fresca e ignorado', () => {
        const antes = { 5: { ativa: true } };
        expect(camposDePoderesAlterados(antes, { 5: { ativa: false } }, [{ id: 1 }])).toEqual({});
        expect(camposDePoderesAlterados(antes, { 5: { ativa: false } }, undefined)).toEqual({});
    });
});

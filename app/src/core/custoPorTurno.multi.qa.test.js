import { describe, it, expect } from 'vitest';
import { lerCustosPorTurno, custoPorTurnoParaSalvar, calcularCustosPorTurno, descreverCustoPorTurno, LIMITE_CUSTOS_POR_TURNO } from './custoPorTurno';

const F = 1000;
const vital = (atual) => ({ base: 100000000, mBase: 1, mGeral: 1, mFormas: 1, mAbsoluto: 1, mUnico: '1.0', atual });
const c = (energia, valor, modo = 'percMax') => ({ modo, valor, energia });
const ficha = (poderes, atuais = {}) => ({ vida: vital(100 * F), mana: vital(atuais.mana ?? 100 * F), aura: vital(atuais.aura ?? 100 * F), chakra: vital(100 * F), corpo: vital(atuais.corpo ?? 100 * F), poderes });
const poder = (custoPorTurno, extra = {}) => ({ id: 1, nome: 'P', ativa: true, custoPorTurno, ...extra });

describe('lerCustosPorTurno', () => {
    it('objeto antigo vira lista de 1', () => {
        expect(lerCustosPorTurno(c('mana', 5)).custos).toEqual([c('mana', 5)]);
    });
    it('lista valida', () => {
        expect(lerCustosPorTurno([c('corpo', 10), c('aura', 10)]).custos).toHaveLength(2);
    });
    it('null, undefined, vazio e lista vazia = sem custo e sem aviso', () => {
        [null, undefined, '', []].forEach(v => expect(lerCustosPorTurno(v)).toEqual({ custos: [], aviso: '' }));
    });
    it('lixo (string, numero, booleano, array aninhado) = aviso', () => {
        ['abc', 5, true, [[1]]].forEach(v => { const r = lerCustosPorTurno(v); expect(r.custos).toEqual([]); expect(r.aviso).toMatch(/inválido/); });
    });
    it('mais de 4 itens: corta em 4', () => {
        const r = lerCustosPorTurno(Array.from({ length: 7 }, () => c('mana', 1)));
        expect(r.custos).toHaveLength(LIMITE_CUSTOS_POR_TURNO);
        expect(LIMITE_CUSTOS_POR_TURNO).toBe(4);
    });
    it('invalidos: % > 100, negativo, energia e modo ruins geram aviso; valor 0/vazio nao', () => {
        [c('mana', 101), c('mana', -1), c('xx', 5), { modo: 'zz', valor: 5, energia: 'mana' }].forEach(v => expect(lerCustosPorTurno([v]).aviso).not.toBe(''));
        [c('mana', 0), c('mana', ''), { modo: 'fixo', energia: 'mana' }].forEach(v => expect(lerCustosPorTurno([v]).aviso).toBe(''));
    });
    it('virgula decimal aceita; fixo acima de 100 permitido', () => {
        expect(lerCustosPorTurno(c('mana', '2,5')).custos[0].valor).toBe(2.5);
        expect(lerCustosPorTurno(c('mana', 500, 'fixo')).custos).toHaveLength(1);
    });
});

describe('custoPorTurnoParaSalvar', () => {
    it('1 custo = objeto; varios = lista; nenhum = null', () => {
        expect(custoPorTurnoParaSalvar([c('mana', 5)])).toEqual(c('mana', 5));
        expect(custoPorTurnoParaSalvar([c('corpo', 10), c('aura', 10)])).toEqual([c('corpo', 10), c('aura', 10)]);
        expect(custoPorTurnoParaSalvar([c('mana', '')])).toBeNull();
        expect(custoPorTurnoParaSalvar(null)).toBeNull();
    });
    it('custo invalido sinalizado pelo aviso do leitor', () => {
        const lista = [c('mana', 5), c('aura', 500)];
        expect(lerCustosPorTurno(lista).aviso).not.toBe('');
        expect(custoPorTurnoParaSalvar(lista)).toEqual(c('mana', 5));
    });
});

describe('descreverCustoPorTurno', () => {
    it('um, dois e tres custos', () => {
        expect(descreverCustoPorTurno({ custoPorTurno: c('chakra', 5) })).toBe('5% de chakra por turno');
        expect(descreverCustoPorTurno({ custoPorTurno: c('mana', 12, 'fixo') })).toBe('12 de mana por turno');
        expect(descreverCustoPorTurno({ custoPorTurno: [c('corpo', 10), c('aura', 10)] })).toBe('10% de corpo e 10% de aura por turno');
        expect(descreverCustoPorTurno({ custoPorTurno: [c('corpo', 10), c('aura', 5), c('mana', 1, 'fixo')] })).toBe('10% de corpo, 5% de aura e 1 de mana por turno');
    });
    it('sem poder/custo = vazio', () => {
        [null, undefined, {}, { custoPorTurno: null }].forEach(p => expect(descreverCustoPorTurno(p)).toBe(''));
    });
});

describe('calcularCustosPorTurno - tudo ou nada', () => {
    it('paga todas as energias quando ha saldo', () => {
        const r = calcularCustosPorTurno(ficha([poder([c('mana', 10, 'fixo'), c('aura', 10, 'fixo')])]));
        expect(r.desligar).toEqual([]);
        expect(r.gastos.map(g => g.energia)).toEqual(['mana', 'aura']);
    });
    it('falta saldo em uma energia: nao paga nenhuma e desliga', () => {
        const r = calcularCustosPorTurno(ficha([poder([c('mana', 10, 'fixo'), c('aura', 10, 'fixo')])], { aura: 0 }));
        expect(r.gastos).toEqual([]);
        expect(r.desligar).toHaveLength(1);
        expect(r.desligar[0].energia).toBe('aura');
    });
    it('falta na primeira energia tambem nao paga a segunda', () => {
        const r = calcularCustosPorTurno(ficha([poder([c('mana', 10, 'fixo'), c('aura', 10, 'fixo')])], { mana: 0 }));
        expect(r.gastos).toEqual([]);
        expect(r.desligar[0].energia).toBe('mana');
    });
    it('mesma energia repetida soma (60 + 60 com saldo 100 = falta; 40 + 60 = paga)', () => {
        const falta = calcularCustosPorTurno(ficha([poder([c('mana', 60, 'fixo'), c('mana', 60, 'fixo')])]));
        expect(falta.desligar).toHaveLength(1);
        expect(falta.gastos).toEqual([]);
        const ok = calcularCustosPorTurno(ficha([poder([c('mana', 40, 'fixo'), c('mana', 60, 'fixo')])]));
        expect(ok.gastos).toHaveLength(2);
        expect(ok.gastos.reduce((t, g) => t + g.valor, 0)).toBe(100);
    });
    it('poder que desliga nao consome saldo do seguinte; inativo e ignorado', () => {
        const f = ficha([
            poder([c('mana', 80, 'fixo'), c('aura', 999, 'fixo')], { id: 1 }),
            poder(c('mana', 80, 'fixo'), { id: 2 }),
            poder(c('mana', 80, 'fixo'), { id: 3, ativa: false }),
        ]);
        const r = calcularCustosPorTurno(f);
        expect(r.desligar.map(d => d.id)).toEqual([1]);
        expect(r.gastos.map(g => g.id)).toEqual([2]);
    });
    it('entradas invalidas', () => {
        expect(calcularCustosPorTurno(null)).toEqual({ gastos: [], desligar: [] });
        expect(calcularCustosPorTurno({})).toEqual({ gastos: [], desligar: [] });
    });
});

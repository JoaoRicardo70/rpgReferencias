import { describe, it, expect } from 'vitest';
import { custoDoReflexo, normalizarReflexo } from './reflexo.js';
import { getVitalMxDisplay } from './vitals.js';

const vital = (base, atual) => ({ base, nome: 'v', atual, mBase: 1, mGeral: 1, mFormas: 1, mAbsoluto: 1, mUnico: '1.0', reducaoCusto: 0, regeneracao: 0 });
const ficha = (combate = {}) => ({
    vida: vital(1000), corpo: vital(500), mana: vital(1000, 1e9), aura: vital(1000, 1e9), chakra: vital(1000, 1e9),
    poderes: [], inventario: [], ataquesElementais: [], bio: {}, combate
});
const item = (reflexo, extra = {}) => ({ nome: 'Espelho', reflexo: normalizarReflexo({ modo: 'devolver', ...reflexo }), ...extra });

describe('custoDoReflexo', () => {
    it('custo fixo: % do máximo exibido da energia escolhida', () => {
        const f = ficha();
        const mx = getVitalMxDisplay('aura', f);
        expect(mx).toBeGreaterThan(0);
        const r = custoDoReflexo(f, item({ custoPercentual: 10, energia: 'aura' }));
        expect(r).toEqual({ energia: 'aura', valor: Math.floor(mx * 0.1), comoPoder: false });
    });

    it('custo fixo 0% = valor 0', () => {
        expect(custoDoReflexo(ficha(), item({ custoPercentual: 0 })).valor).toBe(0);
    });

    it('custo fixo ignora o custoGolpeTotal', () => {
        const f = ficha();
        expect(custoDoReflexo(f, item({ custoPercentual: 10 }), 999999)).toEqual(custoDoReflexo(f, item({ custoPercentual: 10 }), 0));
    });

    it('custoModo igual: paga o custo total do ataque devolvido', () => {
        const r = custoDoReflexo(ficha(), item({ custoModo: 'igual', custoPercentual: 50, energia: 'chakra' }), 1234);
        expect(r).toEqual({ energia: 'chakra', valor: 1234, comoPoder: false });
    });

    it('custoModo igual: arredonda para baixo e trata valores inválidos/negativos como 0', () => {
        const it1 = item({ custoModo: 'igual' });
        expect(custoDoReflexo(ficha(), it1, 10.9).valor).toBe(10);
        expect(custoDoReflexo(ficha(), it1, -5).valor).toBe(0);
        expect(custoDoReflexo(ficha(), it1, 'abc').valor).toBe(0);
        expect(custoDoReflexo(ficha(), it1, undefined).valor).toBe(0);
    });

    it('comoPoder zera o custo quando a ficha conjura como Poder', () => {
        const r = custoDoReflexo(ficha({ conjuraComoPoder: true }), item({ comoPoder: true, custoPercentual: 20 }));
        expect(r).toEqual({ energia: 'mana', valor: 0, comoPoder: true });
    });

    it('comoPoder zera também no modo igual', () => {
        const r = custoDoReflexo(ficha({ conjuraComoPoder: true }), item({ comoPoder: true, custoModo: 'igual' }), 5000);
        expect(r.valor).toBe(0);
        expect(r.comoPoder).toBe(true);
    });

    it('comoPoder NÃO zera sem a permissão da ficha', () => {
        const f = ficha();
        const r = custoDoReflexo(f, item({ comoPoder: true, custoPercentual: 20 }));
        expect(r.comoPoder).toBe(false);
        expect(r.valor).toBe(Math.floor(getVitalMxDisplay('mana', f) * 0.2));
        expect(r.valor).toBeGreaterThan(0);
        expect(custoDoReflexo(ficha({ conjuraComoPoder: false }), item({ comoPoder: true, custoModo: 'igual' }), 700).valor).toBe(700);
    });

    it('comoPoder NÃO zera quando o item é semComoPoder', () => {
        const r = custoDoReflexo(ficha({ conjuraComoPoder: true }), item({ comoPoder: true, custoModo: 'igual' }, { semComoPoder: true }), 900);
        expect(r).toEqual({ energia: 'mana', valor: 900, comoPoder: false });
    });

    it('permissão sem o reflexo marcar comoPoder: paga normal', () => {
        const r = custoDoReflexo(ficha({ conjuraComoPoder: true }), item({ comoPoder: false, custoModo: 'igual' }), 300);
        expect(r.valor).toBe(300);
        expect(r.comoPoder).toBe(false);
    });
});

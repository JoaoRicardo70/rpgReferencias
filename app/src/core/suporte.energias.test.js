import { describe, it, expect } from 'vitest';
import { normalizarSuporte, curaEnergiasPassivaDoTurno } from './suporte.js';

describe('normalizarSuporte: cura.energias (passivo)', () => {
    it('mantem energias validas, descarta zeros/invalidos e limita a 100', () => {
        const s = normalizarSuporte({ modo: 'passivo', cura: { energias: { mana: 5, aura: 0, chakra: 'x', corpo: 250, xyz: 3 } } });
        expect(s.cura.energias).toEqual({ mana: 5, corpo: 100 });
    });
    it('so energias ja conta como cura (nao vira null)', () => {
        expect(normalizarSuporte({ modo: 'passivo', cura: { energias: { mana: 1 } } })).not.toBeNull();
    });
    it('energias zeradas e sem mais nada: null', () => {
        expect(normalizarSuporte({ modo: 'passivo', cura: { energias: { mana: 0 } } })).toBeNull();
    });
    it('no modo uso as energias sao ignoradas', () => {
        expect(normalizarSuporte({ cura: { energias: { mana: 5 } } })).toBeNull();
        const s = normalizarSuporte({ cura: { fixo: 5, energias: { mana: 5 } } });
        expect(s.cura.energias).toBeUndefined();
    });
});

describe('curaEnergiasPassivaDoTurno', () => {
    it('soma por energia com a lista de fontes, ignora Poder desligado', () => {
        const ficha = { poderes: [
            { nome: 'A', ativa: true, suporte: { modo: 'passivo', cura: { energias: { mana: 5, aura: 2 } } } },
            { nome: 'B', ativa: true, suporte: { modo: 'passivo', cura: { energias: { mana: 3 } } } },
            { nome: 'C', ativa: false, suporte: { modo: 'passivo', cura: { energias: { chakra: 9 } } } }
        ] };
        const r = curaEnergiasPassivaDoTurno(ficha);
        expect(r.vazio).toBe(false);
        expect(r.porEnergia.mana.pct).toBe(8);
        expect(r.porEnergia.mana.fontes.map(f => f.nome)).toEqual(['A', 'B']);
        expect(r.porEnergia.aura.pct).toBe(2);
        expect(r.porEnergia.chakra).toBeUndefined();
    });
    it('ficha vazia: vazio', () => {
        expect(curaEnergiasPassivaDoTurno({})).toEqual({ porEnergia: {}, vazio: true });
    });
});

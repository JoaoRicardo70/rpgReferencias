import { describe, it, expect } from 'vitest';
import { aplicarRegeneracaoDeTurno } from './vitals.js';

// Teto da Vida/Mana = base * multiplicadores; regeneracaoPct em % do teto por turno.
const novaFicha = (condicoes) => ({
    vida: { base: 1000000, mBase: 1, atual: 0, regeneracaoPct: 10 },
    mana: { base: 1000000, mBase: 1, atual: 0, regeneracaoPct: 10 },
    ...(condicoes ? { condicoes } : {})
});

describe('aplicarRegeneracaoDeTurno e estados que cortam a cura', () => {
    it('sem estados: Vida e Mana regeneram igual', () => {
        const f = novaFicha();
        aplicarRegeneracaoDeTurno(f);
        expect(f.vida.atual).toBeGreaterThan(0);
        expect(f.vida.atual).toBe(f.mana.atual);
    });

    it('Sangrando 1 stack corta a Vida a 50% e nao mexe na Mana', () => {
        const livre = novaFicha();
        aplicarRegeneracaoDeTurno(livre);
        const f = novaFicha([{ id: 'sangrando', stacks: 1 }]);
        aplicarRegeneracaoDeTurno(f);
        expect(f.vida.atual).toBeCloseTo(livre.vida.atual * 0.5, 5);
        expect(f.mana.atual).toBe(livre.mana.atual);
    });

    it('Sangrando 2 stacks corta a 25%', () => {
        const livre = novaFicha();
        aplicarRegeneracaoDeTurno(livre);
        const f = novaFicha([{ id: 'sangrando', stacks: 2 }]);
        aplicarRegeneracaoDeTurno(f);
        expect(f.vida.atual).toBeCloseTo(livre.vida.atual * 0.25, 5);
    });

    it('Queimado e Criogenia tambem cortam a Vida', () => {
        const livre = novaFicha();
        aplicarRegeneracaoDeTurno(livre);
        ['queimado', 'criogenia'].forEach((id) => {
            const f = novaFicha([{ id, stacks: 1 }]);
            aplicarRegeneracaoDeTurno(f);
            expect(f.vida.atual).toBeCloseTo(livre.vida.atual * 0.5, 5);
            expect(f.mana.atual).toBe(livre.mana.atual);
        });
    });

    it('estado sem efeito na cura (Envenenado) nao corta', () => {
        const livre = novaFicha();
        aplicarRegeneracaoDeTurno(livre);
        const f = novaFicha([{ id: 'envenenado', stacks: 3 }]);
        aplicarRegeneracaoDeTurno(f);
        expect(f.vida.atual).toBe(livre.vida.atual);
    });

    it('cortada continua sem passar do teto', () => {
        const f = novaFicha([{ id: 'sangrando', stacks: 1 }]);
        for (let i = 0; i < 100; i++) aplicarRegeneracaoDeTurno(f);
        const cheia = novaFicha();
        for (let i = 0; i < 100; i++) aplicarRegeneracaoDeTurno(cheia);
        expect(f.vida.atual).toBeCloseTo(cheia.vida.atual, 3);
    });

    it('condicoes invalidas/stacks 0 nao cortam', () => {
        const livre = novaFicha();
        aplicarRegeneracaoDeTurno(livre);
        const f = novaFicha([{ id: 'sangrando', stacks: 0 }, null, { id: 'inexistente', stacks: 2 }]);
        aplicarRegeneracaoDeTurno(f);
        expect(f.vida.atual).toBe(livre.vida.atual);
    });
});

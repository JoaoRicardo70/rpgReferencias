import { describe, it, expect } from 'vitest';
import { aplicarRegeneracaoDeTurno } from './vitals';

const buff = (fator) => [{ id: 'b', nome: 'Cura reduzida', fonte: 'X', restantes: 2, efeitos: [{ atributo: 'cura', propriedade: 'cura_reduzida', valor: fator }] }];
const ficha = (extra = {}) => ({ vida: { base: 1000000, atual: 0, regeneracaoPct: 10 }, mana: { base: 1000000, atual: 0, regeneracaoPct: 10 }, forca: { base: 1000 }, poderes: [], passivas: [], inventario: [], ...extra });

describe('aplicarRegeneracaoDeTurno com cura reduzida', () => {
    it('so a Vida e cortada', () => {
        const a = ficha(); aplicarRegeneracaoDeTurno(a, 0);
        const b = ficha({ buffsTemporarios: buff(0.5) }); aplicarRegeneracaoDeTurno(b, 0);
        expect(a.vida.atual).toBeGreaterThan(0);
        expect(b.vida.atual).toBeCloseTo(a.vida.atual * 0.5, 5);
        expect(b.mana.atual).toBeCloseTo(a.mana.atual, 5);
    });
    it('combina com Sangrando sem aplicar o corte de estados duas vezes', () => {
        const a = ficha({ condicoes: [{ id: 'sangrando', stacks: 1 }] }); aplicarRegeneracaoDeTurno(a, 0);
        const b = ficha({ condicoes: [{ id: 'sangrando', stacks: 1 }], buffsTemporarios: buff(0.5) }); aplicarRegeneracaoDeTurno(b, 0);
        expect(b.vida.atual).toBeCloseTo(a.vida.atual * 0.5, 5);
    });
});

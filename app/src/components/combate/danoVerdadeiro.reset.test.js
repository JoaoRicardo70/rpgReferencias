import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Regressão: o Dano Verdadeiro vale só para um golpe; os dois caminhos de rolagem e o Dano Rápido do Mestre zeram o flag.
const ler = (rel) => fs.readFileSync(path.resolve(__dirname, rel), 'utf8');

describe('Dano Verdadeiro é zerado depois do golpe', () => {
    it('AtaqueFormContext zera em rolarDanoCustomizado e em executarRolarDano', () => {
        const src = ler('./AtaqueFormContext.jsx');
        expect(src.split('setDanoVerdadeiro(false)').length - 1).toBe(2);
    });
    it('MapaFerramentasMestre repassa o flag à prévia e ao aplicar, e zera', () => {
        const src = ler('../mapa/MapaFerramentasMestre.jsx');
        expect(src).toMatch(/verdadeiro: danoVerdadeiro/);
        expect(src).toMatch(/atacanteAtual, ehDado, danoVerdadeiro\)/);
        expect(src).toMatch(/setDanoVerdadeiro\(false\)/);
    });
});

import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { StatusVitalBar } from './StatusSubComponents';
import * as StatusFormContext from './StatusFormContext';

// ---------------------------------------------------------------------------
// QA — Regressão pega em revisão de código: StatusVitalBar (aba Status, a barra de Vida
// principal) usava "mxDisplay" pra calcular a % preenchida e o texto "atual / máximo" da barra
// de 1 SÓ elemento (numBarras===1) -- desde que calcularBarrasVida (core/vitals.js) passou a
// retornar "mxDisplay" como a constante FIXA LIMIAR_BARRA_VIDA (100 milhões) pra "vida" (em vez
// do teto real da barra), isso inflava artificialmente o "máximo" mostrado pra QUALQUER
// personagem com Vida abaixo de 100 milhões (a esmagadora maioria) -- ex.: Vida bruta de 1.000
// mostrava "1.000 / 100.000.000" com a barra sempre em ~0%. Corrigido lendo barras[0].max (o
// teto REAL daquela barra específica) em vez de mxDisplay.
// ---------------------------------------------------------------------------

vi.mock('./StatusFormContext', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, useStatusForm: vi.fn() };
});

function montarCtx(ficha) {
    StatusFormContext.useStatusForm.mockReturnValue({
        ficha,
        getVitalMax: (key, f) => parseFloat(f[key]?.base) || 0,
        getVitalMaxEstavel: (key, f) => parseFloat(f[key]?.base) || 0,
    });
}

describe('StatusSubComponents - StatusVitalBar: teto exibido de Vida (1 barra só, abaixo do limiar de Break Bars)', () => {
    afterEach(() => {
        cleanup();
        vi.clearAllMocks();
    });

    it('Vida com base bem abaixo de 100 milhões mostra o teto REAL (não a constante fixa de 100.000.000)', () => {
        const ficha = { vida: { base: 1000, atual: 500 } };
        montarCtx(ficha);

        render(<StatusVitalBar vitalKey="vida" label="Vida" color="#ff0000" borderC="#ff0000" />);

        expect(screen.getByText('500 / 1.000')).toBeDefined();
        expect(screen.queryByText(/100\.000\.000/)).toBeNull();
    });

    it('a % preenchida da barra usa o teto real como denominador (50%, não ~0%)', () => {
        const ficha = { vida: { base: 1000, atual: 500 } };
        montarCtx(ficha);

        const { container } = render(<StatusVitalBar vitalKey="vida" label="Vida" color="#ff0000" borderC="#ff0000" />);

        const barFill = container.querySelector('.bar-fill');
        expect(barFill).toBeDefined();
        const match = /width:\s*(\d+(?:\.\d+)?)%/.exec(barFill.getAttribute('style'));
        expect(parseFloat(match[1])).toBeCloseTo(50, 0);
    });

    it('Vida acima do limiar (múltiplas Break Bars) continua intocada -- renderiza o visual empilhado, não a barra única', () => {
        const ficha = { vida: { base: 150000000, atual: 115000000 } };
        montarCtx(ficha);

        const { container } = render(<StatusVitalBar vitalKey="vida" label="Vida" color="#ff0000" borderC="#ff0000" />);

        // 🔥 Eram 2 barras antes de StatusVitalBar passar a aplicar calcularFatorMultiplicadorForca
        // (core/poder.js) ao teto de Vida, igual às outras 4 telas (Marcados/Mestre/Mapa) já
        // faziam. Uma base bruta de 150.000.000 de Vida, mesmo com ascensaoBase=1 (padrão), já
        // ultrapassa o "estouro" de Ascensão/Prestígio de core/poder.js (150 pontos de Prestígio
        // vira +1 nível de Ascensão), resultando num fator 2x aplicado ANTES de calcularBarrasVida
        // -- teto real vira 300.000.000, que é EXATAMENTE 3 barras de 100.000.000 (LIMIAR_BARRA_VIDA),
        // não mais 2. Isso não é uma regressão: é a mesma conta que Marcados.jsx/MestreSubComponents.jsx/
        // MapaCombate.jsx já faziam pra este mesmo personagem -- a Ficha só estava divergindo delas antes.
        expect(container.querySelectorAll('.break-bars-barra').length).toBe(3);
    });

    it('mana (sem Break Bars, sempre 1 barra) continua usando o mesmo teto de sempre, sem regressão', () => {
        const ficha = { mana: { base: 2000, atual: 1000 } };
        montarCtx(ficha);

        render(<StatusVitalBar vitalKey="mana" label="Mana" color="#0000ff" borderC="#0000ff" />);

        expect(screen.getByText('1.000 / 2.000')).toBeDefined();
    });
});

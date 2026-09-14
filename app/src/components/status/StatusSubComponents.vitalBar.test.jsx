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

    it('Vida com base bem abaixo de 1 bilhão mostra o teto REAL (não a constante fixa de 1 bilhão)', () => {
        // 🔥 Reformulação de Vida/Energias: base/atual ×1000 em relação à versão original pra que o
        // texto exibido (já dividido por FATOR_EXIBICAO_VITAIS) continue sendo "500 / 1.000".
        const ficha = { vida: { base: 1000000, atual: 500000 } };
        montarCtx(ficha);

        render(<StatusVitalBar vitalKey="vida" label="Vida" color="#ff0000" borderC="#ff0000" />);

        expect(screen.getByText('500 / 1.000')).toBeDefined();
        expect(screen.queryByText(/1\.000\.000\.000/)).toBeNull();
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
        // 🔥 Reformulação de Vida/Energias: LIMIAR_BARRA_VIDA passou de 100 milhões pra 1 bilhão.
        // base=600.000.000 -> 600 pontos de Prestígio -> bonusAscensao=floor(600/100)=6 ->
        // ascensaoFinal=1+6=7 -> fator=7 (mesma conta de core/poder.js > calcularFatorMultiplicadorForca,
        // independente do limiar de Break Bars). Teto real = 600.000.000*7 = 4.200.000.000 --
        // vitalidade=floor(4,2e9/1e9)=4, resto=200.000.000 -> 5 barras (4 cravadas em 1 bilhão +
        // 1 na frente com o resto de 200 milhões).
        const ficha = { vida: { base: 600000000, atual: 4200000000 } };
        montarCtx(ficha);

        const { container } = render(<StatusVitalBar vitalKey="vida" label="Vida" color="#ff0000" borderC="#ff0000" />);
        expect(container.querySelectorAll('.break-bars-barra').length).toBe(5);
    });

    it('mana (sem Break Bars, sempre 1 barra) continua usando o mesmo teto de sempre, sem regressão', () => {
        // 🔥 Reformulação de Vida/Energias: base/atual ×1000 pra que o texto exibido (já dividido
        // por FATOR_EXIBICAO_VITAIS) continue sendo "1.000 / 2.000".
        const ficha = { mana: { base: 2000000, atual: 1000000 } };
        montarCtx(ficha);

        render(<StatusVitalBar vitalKey="mana" label="Mana" color="#0000ff" borderC="#0000ff" />);

        expect(screen.getByText('1.000 / 2.000')).toBeDefined();
    });
});

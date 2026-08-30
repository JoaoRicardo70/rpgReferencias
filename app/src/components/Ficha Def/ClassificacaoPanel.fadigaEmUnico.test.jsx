import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ClassificacaoPanel from './ClassificacaoPanel';
import useStore from '../../stores/useStore';

// ---------------------------------------------------------------------------
// QA — dois pedidos do mestre da mesa sobre "Marcadores & Adaptação" (Capítulo 2):
//
// 1) injetarBuffAdaptação() (Balança de Adaptação) juntava múltiplas injeções de
//    mUnico na mesma batalha com o separador ' e ' (ex: "1.05 e 1.10"). Todo o
//    resto do sistema que lê ficha.dano.mUnico (tratarUnico em core/utils.js,
//    getGlobalMultipliers em Marcados.jsx e core/poder.js) faz
//    String(mUnico).split(',') — sem vírgula, a string inteira vira UM elemento e
//    parseFloat() só consegue ler o primeiro número antes do espaço, descartando
//    silenciosamente qualquer injeção além da primeira. Corrigido para usar ','
//    como separador, igual a todo o resto do sistema.
//
// 2) Fadiga de Combate: nova seção que acumula desgaste por turno (contagem de
//    turnos x taxa configurável) e reduz o Poder Calculado do Scouter — ver
//    também Marcados.fadigaCombate.test.jsx para a cobertura do lado do Scouter.
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
}));

function montarMockUseStore(ficha, extra = {}) {
    const mockState = {
        minhaFicha: ficha,
        updateFicha: vi.fn((callback) => callback(ficha)),
        isMestre: true,
        ...extra,
    };
    useStore.mockImplementation((selector) => (selector ? selector(mockState) : mockState));
    return mockState;
}

// A "Balança de Adaptação" e a "Fadiga de Combate" vivem no Capítulo 2
// ("Marcadores & Adaptação"), que não é a aba inicial (abaAtual começa em
// 'registros') — navega até lá pelo seletor de capítulos, igual a um jogador
// real usando "FOLHEAR PARA FRENTE"/o dropdown.
function irParaMarcadoresEAdaptacao() {
    const seletor = screen.getByRole('combobox');
    fireEvent.change(seletor, { target: { value: 'acumulativo' } });
}

describe('ClassificacaoPanel — Balança de Adaptação: separador de múltiplas injeções de mUnico', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.alert = vi.fn();
    });

    afterEach(() => {
        cleanup();
    });

    it('primeira injeção (mUnico ainda "1.0") grava só o valor novo, sem separador', () => {
        const ficha = { dano: { mUnico: '1.0' }, combate: { danoAbsorvido: 20000, conversaoAlvo: 10000, conversaoBonus: 5 } };
        montarMockUseStore(ficha);
        render(<ClassificacaoPanel />);
        irParaMarcadoresEAdaptacao();

        fireEvent.click(screen.getByText(/INJETAR BÔNUS MULT/i));

        expect(ficha.dano.mUnico).toBe('1.10');
    });

    it('segunda injeção na mesma batalha usa VÍRGULA como separador (não " e ") — igual ao formato lido por tratarUnico()/getGlobalMultipliers() em todo o resto do sistema', () => {
        const ficha = { dano: { mUnico: '1.05' }, combate: { danoAbsorvido: 20000, conversaoAlvo: 10000, conversaoBonus: 5 } };
        montarMockUseStore(ficha);
        render(<ClassificacaoPanel />);
        irParaMarcadoresEAdaptacao();

        fireEvent.click(screen.getByText(/INJETAR BÔNUS MULT/i));

        expect(ficha.dano.mUnico).toBe('1.05,1.10');
        expect(ficha.dano.mUnico).not.toContain(' e ');

        // Prova que o formato resultante é de fato consumível por quem lê mUnico
        // em outros lugares do sistema (todos fazem split(',') + parseFloat).
        const valores = String(ficha.dano.mUnico).split(',').map(v => parseFloat(v.trim()));
        expect(valores).toEqual([1.05, 1.10]);
    });

    // Cobertura de QA: fichas salvas no Firebase ANTES deste fix ainda têm mUnico no formato
    // antigo (' e '-separado). Este teste documenta o comportamento ATUAL (não corrigido
    // retroativamente) pra esse caso legado — o valor antigo perdido continua perdido, mas o
    // comportamento não piora nem lança erro. Uma normalização de dados legados (trocar ' e '
    // por ',' ao carregar a ficha) fica como melhoria futura, fora do escopo deste fix.
    it('ficha legada com mUnico no formato antigo (" e ") não lança erro ao injetar de novo — o valor antigo continua truncado no split(\',\'), comportamento pré-existente documentado aqui', () => {
        const ficha = { dano: { mUnico: '1.05 e 1.20' }, combate: { danoAbsorvido: 20000, conversaoAlvo: 10000, conversaoBonus: 5 } };
        montarMockUseStore(ficha);
        render(<ClassificacaoPanel />);
        irParaMarcadoresEAdaptacao();

        expect(() => fireEvent.click(screen.getByText(/INJETAR BÔNUS MULT/i))).not.toThrow();

        expect(ficha.dano.mUnico).toBe('1.05 e 1.20,1.10');
        const valores = String(ficha.dano.mUnico).split(',').map(v => parseFloat(v.trim()));
        // O "1.20" legado (antes do ' e ') nunca é recuperado pelo split(',') — comportamento
        // pré-existente à parte deste fix, não introduzido por ele.
        expect(valores).toEqual([1.05, 1.10]);
    });
});

describe('ClassificacaoPanel — Fadiga de Combate: turnos x taxa, clamp e reset', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        cleanup();
    });

    it('clicar "+" nos Turnos Cansativos incrementa combate.fadigaTurnos e a Fadiga Atual exibida reflete turnos x taxa', () => {
        const ficha = { combate: { fadigaTurnos: 0, fadigaPorTurno: 5 } };
        montarMockUseStore(ficha);
        const { rerender } = render(<ClassificacaoPanel />);
        irParaMarcadoresEAdaptacao();

        // "Turnos Cansativos" tem +/- num único elemento <span> por número (ex.: "5" e "%"
        // são nós de texto separados dentro do mesmo <span>{fadigaAtual}%</span>), então a
        // localização usa o texto do card ao redor em vez de getByText('+') isolado.
        const cardTurnos = screen.getByText('Turnos Cansativos').closest('div');
        const incrementar = cardTurnos.querySelector('button:last-of-type');
        fireEvent.click(incrementar);

        expect(ficha.combate.fadigaTurnos).toBe(1);
        // updateFicha (mockado) muta `ficha` direto, sem disparar re-render do React
        // sozinho — mesmo padrão de ClassificacaoPanel.hierarquiaPersistencia.test.jsx,
        // que força um rerender() manual pra observar o efeito da mutação na UI.
        rerender(<ClassificacaoPanel />);
        expect(screen.getByText((_, el) => el?.tagName === 'SPAN' && el.textContent === '5%')).toBeTruthy();
    });

    it('Fadiga Atual nunca passa de 100%, mesmo com muitos turnos acumulados', () => {
        const ficha = { combate: { fadigaTurnos: 50, fadigaPorTurno: 10 } }; // 50*10=500 -> clamp 100
        montarMockUseStore(ficha);
        render(<ClassificacaoPanel />);
        irParaMarcadoresEAdaptacao();

        expect(screen.getByText((_, el) => el?.tagName === 'SPAN' && el.textContent === '100%')).toBeTruthy();
    });

    it('"Zerar Fadiga" zera combate.fadigaTurnos', () => {
        const ficha = { combate: { fadigaTurnos: 7, fadigaPorTurno: 5 } };
        montarMockUseStore(ficha);
        render(<ClassificacaoPanel />);
        irParaMarcadoresEAdaptacao();

        fireEvent.click(screen.getByText(/Zerar Fadiga/i));

        expect(ficha.combate.fadigaTurnos).toBe(0);
    });

    it('ficha sem combate.fadigaTurnos definido (padrão de ficha nova) exibe Fadiga Atual = 0%, sem lançar erro', () => {
        const ficha = {};
        montarMockUseStore(ficha);
        expect(() => render(<ClassificacaoPanel />)).not.toThrow();
        irParaMarcadoresEAdaptacao();

        expect(screen.getByText((_, el) => el?.tagName === 'SPAN' && el.textContent === '0%')).toBeTruthy();
    });
});

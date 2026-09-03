import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MarcadosPanel from './Marcados';
import useStore from '../../stores/useStore';

// ---------------------------------------------------------------------------
// QA — Fadiga de Combate: desgaste acumulado (hoje só combate.fadigaExtra,
// clampado em 100% — ver core/fadiga.js; combate.fadigaTurnos/fadigaPorTurno
// não afetam mais o Poder, são só um contador informativo de turnos em
// combate) reduz proporcionalmente o Poder Calculado do Scouter, aplicado
// logo após o damping de Supressão e antes do Divisor de Poder (ver
// poderGlobal em Marcados.jsx). Uma ficha sem o campo `combate` (ou com
// fadigaExtra=0) precisa continuar produzindo exatamente a mesma leitura de
// antes desta feature — nenhuma ficha existente pode ter o Poder alterado sem
// o jogador interagir com a seção de Fadiga.
//
// A seção de Fadiga morava em ClassificacaoPanel.jsx > PaginaMarcadores
// (Capítulo 2, página 4 da Ficha Definitiva) e foi realocada pro mestre pra
// dentro de MarcadosPanel, na Página 1 (junto do Scouter/Ocultar
// Presença/Divisor de Poder) — ver o segundo describe abaixo pra cobertura da
// UI relocada.
//
// Mesmo padrão de mock/leitura de Marcados.scouterAgrupamento.test.jsx.
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    uploadImagem: vi.fn(),
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
}));

function fichaComFadiga(combateExtra) {
    return {
        vida: { base: 100000000 },
        mana: { base: 1000000000 },
        aura: { base: 1000000000 },
        chakra: { base: 1000000000 },
        corpo: { base: 1000000000 },
        forca: { base: 1000000 },
        destreza: { base: 1000000 },
        inteligencia: { base: 1000000 },
        sabedoria: { base: 1000000 },
        energiaEsp: { base: 1000000 },
        carisma: { base: 1000000 },
        stamina: { base: 1000000 },
        constituicao: { base: 1000000 },
        divisores: {},
        bio: {},
        estetica: {},
        labels: {},
        poderes: [],
        inventario: [],
        seresSelados: [],
        ataquesElementais: [],
        ...(combateExtra !== undefined ? { combate: combateExtra } : {}),
    };
}

function montarMockUseStore(ficha) {
    const mockState = {
        minhaFicha: ficha,
        updateFicha: vi.fn((callback) => callback(ficha)),
        meuNome: 'Testador',
        importarDaAbaStatus: vi.fn(),
    };
    useStore.mockImplementation((selector) => (selector ? selector(mockState) : mockState));
    return mockState;
}

function lerPoderGlobalExibido() {
    const span = screen.getByText((_, el) => el?.tagName === 'SPAN' && /^-?\d+(\.\d+)?E-?\d+$/.test(el.textContent || ''));
    return Number(span.textContent);
}

function renderELerPoderGlobal(combateExtra) {
    montarMockUseStore(fichaComFadiga(combateExtra));
    render(<MarcadosPanel />);
    const valor = lerPoderGlobalExibido();
    cleanup();
    return valor;
}

describe('MarcadosPanel — Fadiga de Combate reduz o Poder Calculado do Scouter', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        window.alert = vi.fn();
    });

    afterEach(() => {
        cleanup();
    });

    it('ficha sem o campo combate produz a MESMA leitura que combate.fadigaExtra=0 (sem fadiga = sem alteração no Poder)', () => {
        const semCombate = renderELerPoderGlobal(undefined);
        const comZeroExtra = renderELerPoderGlobal({ fadigaExtra: 0 });

        expect(comZeroExtra).toBe(semCombate);
    });

    it('combate.fadigaTurnos/fadigaPorTurno alto sozinho NÃO reduz o Poder Calculado — só fadigaExtra conta', () => {
        const semFadiga = renderELerPoderGlobal(undefined);
        const comTurnosAltos = renderELerPoderGlobal({ fadigaTurnos: 999, fadigaPorTurno: 50, fadigaExtra: 0 });

        expect(comTurnosAltos).toBe(semFadiga);
    });

    it('50% de fadigaExtra reduz o Poder Calculado a aproximadamente metade do valor sem fadiga', () => {
        const semFadiga = renderELerPoderGlobal(undefined);
        const com50PorCento = renderELerPoderGlobal({ fadigaExtra: 50 });

        expect(com50PorCento).toBeLessThan(semFadiga);
        const razao = com50PorCento / semFadiga;
        expect(razao).toBeGreaterThan(0.49);
        expect(razao).toBeLessThan(0.51);
    });

    it('fadiga clampa em 100% (nunca ultrapassa) mesmo com fadigaExtra muito acima de 100', () => {
        const com100PorCento = renderELerPoderGlobal({ fadigaExtra: 50000 });
        const comExatos100 = renderELerPoderGlobal({ fadigaExtra: 100 });

        expect(com100PorCento).toBe(comExatos100);
    });
});

describe('MarcadosPanel — Fadiga de Combate: seção visível na Página 1 (sem precisar navegar)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        window.alert = vi.fn();
    });

    afterEach(() => {
        cleanup();
    });

    it('a seção "Fadiga de Combate" já aparece na Página 1 por padrão (paginaAtual inicial), sem precisar clicar em "Próxima"', () => {
        montarMockUseStore(fichaComFadiga({ fadigaTurnos: 0, fadigaPorTurno: 5 }));
        render(<MarcadosPanel />);

        expect(screen.getByText('😮‍💨 Fadiga de Combate')).toBeTruthy();
    });

    it('clicar "+" nos Turnos Cansativos incrementa combate.fadigaTurnos, mas NÃO altera a Fadiga Atual exibida (contador só informativo — quem gera % é fadigaExtra)', () => {
        const ficha = fichaComFadiga({ fadigaTurnos: 0, fadigaPorTurno: 5 });
        montarMockUseStore(ficha);
        const { rerender } = render(<MarcadosPanel />);

        // "Turnos Cansativos" tem +/- num único elemento <span> por número (ex.: "5" e "%"
        // são nós de texto separados dentro do mesmo <span>{fadigaAtual}%</span>), então a
        // localização usa o texto do card ao redor em vez de getByText('+') isolado.
        const cardTurnos = screen.getByText('Turnos Cansativos').closest('div');
        const incrementar = cardTurnos.querySelector('button:last-of-type');
        fireEvent.click(incrementar);

        expect(ficha.combate.fadigaTurnos).toBe(1);
        // updateFicha (mockado) muta `ficha` direto, sem disparar re-render do React
        // sozinho — força um rerender() manual pra observar o efeito da mutação na UI.
        rerender(<MarcadosPanel />);
        expect(screen.getByText((_, el) => el?.tagName === 'SPAN' && el.textContent === '0%')).toBeTruthy();
    });

    it('"Zerar Fadiga" zera combate.fadigaTurnos', () => {
        const ficha = fichaComFadiga({ fadigaTurnos: 7, fadigaPorTurno: 5 });
        montarMockUseStore(ficha);
        render(<MarcadosPanel />);

        fireEvent.click(screen.getByText(/Zerar Fadiga/i));

        expect(ficha.combate.fadigaTurnos).toBe(0);
    });

    it('"Descansar" (handleRegenerarTudo) também zera combate.fadigaTurnos', () => {
        const ficha = fichaComFadiga({ fadigaTurnos: 12, fadigaPorTurno: 5 });
        montarMockUseStore(ficha);
        render(<MarcadosPanel />);

        fireEvent.click(screen.getByText(/Descansar/i));

        expect(ficha.combate.fadigaTurnos).toBe(0);
    });

    it('ficha sem combate.fadigaTurnos definido (padrão de ficha nova) exibe Fadiga Atual = 0%, sem lançar erro', () => {
        montarMockUseStore(fichaComFadiga(undefined));
        expect(() => render(<MarcadosPanel />)).not.toThrow();

        expect(screen.getByText((_, el) => el?.tagName === 'SPAN' && el.textContent === '0%')).toBeTruthy();
    });
});

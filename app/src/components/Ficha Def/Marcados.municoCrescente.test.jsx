import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MarcadosPanel from './Marcados';
import useStore from '../../stores/useStore';

// ---------------------------------------------------------------------------
// QA — mUnico Crescente (Por Turno): pra Infinities tipo Adaptação, cujo mUnico
// deve crescer sozinho a cada turno de combate (mesmo padrão de contador da
// Fadiga — turnos x taxa configurável — só que multiplicando o Poder pra cima
// em vez de reduzir). Guardado em combate.municoTurnos/combate.municoPorTurno,
// lido dentro de getGlobalMultipliers() em Marcados.jsx (empurrado pro array
// `unicos`, junto com qualquer mUnico manual em ficha.dano.mUnico — os dois
// se multiplicam entre si, igual a qualquer outra fonte de mUnico no sistema).
//
// A UI (contador de turnos, taxa, "Zerar mUnico") mora em ClassificacaoPanel.jsx
// > PaginaMarcadores — ver ClassificacaoPanel.mUnicoAdaptacao.test.jsx pra
// cobertura da interação da UI. Este arquivo cobre só o lado do Scouter.
//
// Mesmo padrão de mock/leitura de Marcados.scouterAgrupamento.test.jsx /
// Marcados.fadigaCombate.test.jsx.
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    uploadImagem: vi.fn(),
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
}));

function fichaComMunico(combateExtra) {
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
    montarMockUseStore(fichaComMunico(combateExtra));
    render(<MarcadosPanel />);
    const valor = lerPoderGlobalExibido();
    cleanup();
    return valor;
}

// Lê o Poder de uma ficha com ficha.dano.mUnico setado manualmente (sem
// combate.municoTurnos) — usado como "vara de medir" independente pra
// comparação EXATA. Necessário porque a leitura final do Scouter injeta a
// Ascensão via magnitude de log10 (ver Marcados.scouterAgrupamento.test.jsx),
// o que NÃO escala proporcionalmente ao multiplicador — comparar RAZÕES entre
// leituras finais não é confiável, só comparar leituras EXATAS entre fichas
// com o mesmo Poder_Multiplicado esperado (mesmo mUnico total, fontes
// diferentes) é 100% robusto.
function renderELerPoderGlobalComMUnicoManual(mUnicoStr, combateExtra) {
    montarMockUseStore({ ...fichaComMunico(combateExtra), dano: { mUnico: mUnicoStr } });
    render(<MarcadosPanel />);
    const valor = lerPoderGlobalExibido();
    cleanup();
    return valor;
}

describe('MarcadosPanel — mUnico Crescente multiplica o Poder Calculado do Scouter', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        window.alert = vi.fn();
    });

    afterEach(() => {
        cleanup();
    });

    it('ficha sem o campo combate produz a MESMA leitura que combate.municoTurnos=0 (0 turnos = sem alteração no Poder)', () => {
        const semCombate = renderELerPoderGlobal(undefined);
        const comZeroTurnos = renderELerPoderGlobal({ municoTurnos: 0, municoPorTurno: 5 });

        expect(comZeroTurnos).toBe(semCombate);
    });

    it('10 turnos x 5%/turno produz o mesmo Poder Calculado que um mUnico manual equivalente de x1.50 (mesmo Poder_Multiplicado, fontes diferentes)', () => {
        const semMunico = renderELerPoderGlobal(undefined);
        const comMunicoCrescente = renderELerPoderGlobal({ municoTurnos: 10, municoPorTurno: 5 }); // mUnico = 1 + 0.5 = 1.5
        const comMUnicoManualEquivalente = renderELerPoderGlobalComMUnicoManual('1.5');

        expect(comMunicoCrescente).toBeGreaterThan(semMunico);
        expect(comMunicoCrescente).toBe(comMUnicoManualEquivalente);
    });

    it('NÃO clampa em 100% (diferente da Fadiga) — 40 turnos x 10%/turno (mUnico x5.00) produz o mesmo Poder Calculado que um mUnico manual de x5.00', () => {
        const comMunicoCrescente = renderELerPoderGlobal({ municoTurnos: 40, municoPorTurno: 10 }); // mUnico = 1 + 4.0 = 5.0
        const comMUnicoManualEquivalente = renderELerPoderGlobalComMUnicoManual('5.0');

        expect(comMunicoCrescente).toBe(comMUnicoManualEquivalente);
    });

    it('municoPorTurno ausente usa o padrão de 5%/turno (mesmo padrão do card em PaginaMarcadores)', () => {
        const comPadraoExplicito = renderELerPoderGlobal({ municoTurnos: 4 }); // municoPorTurno ausente -> default 5 -> x1.20
        const com20PorCentoExplicito = renderELerPoderGlobal({ municoTurnos: 4, municoPorTurno: 5 });

        expect(comPadraoExplicito).toBe(com20PorCentoExplicito);
    });

    it('municoTurnos negativo é clampado em 0 (sem alteração no Poder), não lança erro', () => {
        const semMunico = renderELerPoderGlobal(undefined);
        const comTurnosNegativos = renderELerPoderGlobal({ municoTurnos: -5, municoPorTurno: 5 });

        expect(comTurnosNegativos).toBe(semMunico);
    });

    it('municoPorTurno negativo nunca REDUZ o Poder (o multiplicador nunca cai abaixo de x1.00, mesmo com taxa negativa)', () => {
        const semMunico = renderELerPoderGlobal(undefined);
        const comTaxaNegativa = renderELerPoderGlobal({ municoTurnos: 10, municoPorTurno: -50 }); // 1 + 10*(-0.5) = -4 -> clampado em 1

        expect(comTaxaNegativa).toBe(semMunico);
    });

    it('combina multiplicativamente com um mUnico manual já existente em ficha.dano.mUnico (ex: injetado pela Balança de Adaptação)', () => {
        // municoTurnos:10 x municoPorTurno:5% -> mUnico Crescente = x1.5; combinado com
        // dano.mUnico='2.0' manual -> total esperado x1.5 * x2.0 = x3.0 (mesmo
        // Poder_Multiplicado que um único mUnico manual de x3.0 puro).
        montarMockUseStore({ ...fichaComMunico({ municoTurnos: 10, municoPorTurno: 5 }), dano: { mUnico: '2.0' } });
        render(<MarcadosPanel />);
        const comAmbos = lerPoderGlobalExibido();
        cleanup();

        const equivalenteComMUnicoUnicoDe3 = renderELerPoderGlobalComMUnicoManual('3.0');

        expect(comAmbos).toBe(equivalenteComMUnicoUnicoDe3);
    });

    it('"Descansar" (handleRegenerarTudo) zera combate.municoTurnos', () => {
        const ficha = fichaComMunico({ municoTurnos: 12, municoPorTurno: 5 });
        montarMockUseStore(ficha);
        render(<MarcadosPanel />);

        fireEvent.click(screen.getByText(/Descansar/i));

        expect(ficha.combate.municoTurnos).toBe(0);
    });
});

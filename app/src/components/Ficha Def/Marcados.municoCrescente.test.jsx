import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MarcadosPanel from './Marcados';
import useStore from '../../stores/useStore';

// ---------------------------------------------------------------------------
// QA — mUnico Crescente (Por Turno): pra Infinities tipo Adaptação, cujo mUnico
// deve crescer sozinho a cada turno de combate (mesmo padrão de contador da
// Fadiga — turnos x taxa configurável — só que multiplicando o Poder pra cima
// em vez de reduzir). Guardado em combate.municoTurnos/combate.municoPorTurno.
//
// 🔥 REGRESSÃO CORRIGIDA (em duas rodadas): mUnico SEMPRE multiplica mUnico,
// nunca soma — não importa a fonte. A primeira versão desta feature empurrava
// o multiplicador pro array `unicos` de getGlobalMultipliers() (alimentando
// glob.totalDano), que era consumido ANTES da injeção ADITIVA de Ascensão via
// magnitude de log10 dentro de poderGlobal (poderComAscensao = poderMultiplicado
// + ascensaoSegura * 10^(magnitude+1) — ver Marcados.scouterAgrupamento.test.jsx).
// Nesse estágio, o efeito multiplicativo do mUnico Crescente era "diluído" pela
// injeção de Ascensão logo depois — enquanto mUnicos passivos vindos de Poderes
// (poder_direto/munico) já multiplicavam DEPOIS dessa injeção, via
// multiplicadorPoderDireto, e por isso pareciam "somar" em vez de multiplicar.
//
// A 1ª correção moveu só o mUnico Crescente pro estágio de multiplicadorPoderDireto
// — resolvia o cenário relatado, mas introduzia a MESMA diluição pra quem combina
// mUnico Crescente com ficha.dano.mUnico (a Balança de Adaptação, que continuava
// no estágio antigo). A 2ª correção resolve isso de vez: glob.finalUni (mUnico da
// Balança de Adaptação/buffs/texto de habilidades) saiu de dentro de totalDano e
// passou a ser multiplicado junto de multiplicadorPoderDireto e
// multiplicadorMunicoCrescente no MESMO estágio final — agora TODA fonte de
// mUnico multiplica com todas as outras, sem exceção.
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

function fichaComMunico(combateExtra, extra = {}) {
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
        ...extra,
    };
}

// Um mUnico PASSIVO vindo de Poderes (efeito poder_direto/munico) — o mesmo tipo
// de fonte que o personagem do amigo do usuário já tinha quando notou o bug
// (mUnicos passivos "diluídos" pelo mUnico Crescente). Processado por
// getPoderDiretoMultiplier() em Marcados.jsx, no MESMO estágio (pós-injeção de
// Ascensão) que getMunicoCrescenteMultiplier() — a "vara de medir" correta pra
// verificar que os dois multiplicam entre si de verdade.
function poderesComMUnicoPassivo(valor) {
    return [{ efeitosPassivos: [{ atributo: 'poder_direto', propriedade: 'munico', valor: String(valor) }] }];
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

function renderELerPoderGlobal(combateExtra, extra = {}) {
    montarMockUseStore(fichaComMunico(combateExtra, extra));
    render(<MarcadosPanel />);
    const valor = lerPoderGlobalExibido();
    cleanup();
    return valor;
}

// Lê o Poder de uma ficha com um mUnico PASSIVO equivalente via Poderes
// (poder_direto), sem combate.municoTurnos — usado como "vara de medir"
// independente pra comparação EXATA no MESMO estágio do pipeline que o mUnico
// Crescente agora ocupa. Necessário porque a leitura final do Scouter injeta a
// Ascensão via magnitude de log10 (ver Marcados.scouterAgrupamento.test.jsx),
// o que NÃO escala proporcionalmente ao multiplicador — comparar RAZÕES entre
// leituras finais não é confiável, só comparar leituras EXATAS entre fichas
// com o mesmo Poder_Multiplicado esperado (mesmo mUnico total, fontes
// diferentes) é 100% robusto.
function renderELerPoderGlobalComMUnicoPassivoManual(valor) {
    return renderELerPoderGlobal(undefined, { poderes: poderesComMUnicoPassivo(valor) });
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

    it('10 turnos x 5%/turno produz o mesmo Poder Calculado que um mUnico PASSIVO equivalente de x1.50 vindo de Poderes (mesmo Poder_Multiplicado, mesmo estágio do pipeline)', () => {
        const semMunico = renderELerPoderGlobal(undefined);
        const comMunicoCrescente = renderELerPoderGlobal({ municoTurnos: 10, municoPorTurno: 5 }); // mUnico = 1 + 0.5 = 1.5
        const comMUnicoPassivoEquivalente = renderELerPoderGlobalComMUnicoPassivoManual('1.5');

        expect(comMunicoCrescente).toBeGreaterThan(semMunico);
        expect(comMunicoCrescente).toBe(comMUnicoPassivoEquivalente);
    });

    it('NÃO clampa em 100% (diferente da Fadiga) — 40 turnos x 10%/turno (mUnico x5.00) produz o mesmo Poder Calculado que um mUnico passivo de x5.00', () => {
        const comMunicoCrescente = renderELerPoderGlobal({ municoTurnos: 40, municoPorTurno: 10 }); // mUnico = 1 + 4.0 = 5.0
        const comMUnicoPassivoEquivalente = renderELerPoderGlobalComMUnicoPassivoManual('5.0');

        expect(comMunicoCrescente).toBe(comMUnicoPassivoEquivalente);
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

    // 🔥 Este é o teste que teria pego a regressão original: um personagem com um
    // mUnico PASSIVO já existente vindo de Poderes (o cenário real relatado —
    // "personagem com mUnicos passivos") precisa MULTIPLICAR (não diluir/somar)
    // com o mUnico Crescente. 10 turnos x 5%/turno = x1.5; combinado com um
    // mUnico passivo de x2.0 -> total esperado x1.5 * x2.0 = x3.0 (mesma leitura
    // que um único mUnico passivo de x3.0 puro).
    it('combina multiplicativamente com um mUnico PASSIVO já existente vindo de Poderes (poder_direto) — cenário que ficava diluído antes do fix', () => {
        const comAmbos = renderELerPoderGlobal({ municoTurnos: 10, municoPorTurno: 5 }, { poderes: poderesComMUnicoPassivo('2.0') });
        const equivalenteComMUnicoPassivoDe3 = renderELerPoderGlobalComMUnicoPassivoManual('3.0');

        expect(comAmbos).toBe(equivalenteComMUnicoPassivoDe3);
    });

    // 🔥 Segunda ponta da mesma regressão: mUnico Crescente também precisa
    // multiplicar corretamente com ficha.dano.mUnico (a "Balança de Adaptação",
    // que continua no seu próprio estágio pré-injeção via glob.finalUni — mas
    // finalUni agora é multiplicado FORA de totalDano, no mesmo estágio final
    // que multiplicadorPoderDireto/multiplicadorMunicoCrescente, então os três
    // se juntam sem diluição nenhuma). 10 turnos x 5%/turno = x1.5; combinado
    // com dano.mUnico='2.0' manual -> total esperado x1.5 * x2.0 = x3.0.
    it('combina multiplicativamente com um mUnico manual em ficha.dano.mUnico (Balança de Adaptação) — mesma correção, outra fonte de mUnico', () => {
        montarMockUseStore({ ...fichaComMunico({ municoTurnos: 10, municoPorTurno: 5 }), dano: { mUnico: '2.0' } });
        render(<MarcadosPanel />);
        const comAmbos = lerPoderGlobalExibido();
        cleanup();

        const equivalenteComMUnicoPassivoDe3 = renderELerPoderGlobalComMUnicoPassivoManual('3.0');

        expect(comAmbos).toBe(equivalenteComMUnicoPassivoDe3);
    });

    it('"Descansar" (handleRegenerarTudo) zera combate.municoTurnos', () => {
        const ficha = fichaComMunico({ municoTurnos: 12, municoPorTurno: 5 });
        montarMockUseStore(ficha);
        render(<MarcadosPanel />);

        fireEvent.click(screen.getByText(/Descansar/i));

        expect(ficha.combate.municoTurnos).toBe(0);
    });
});

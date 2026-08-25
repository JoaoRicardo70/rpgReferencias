import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MarcadosPanel from './Marcados';
import useStore from '../../stores/useStore';

// ---------------------------------------------------------------------------
// QA — Novo campo "Divisor de Poder" (exclusivo do Mestre): divide o resultado
// FINAL do Poder do Scouter (depois de Supressão) por um valor numérico.
//
// Dois níveis:
//   - ficha.divisorPoder: valor POR PERSONAGEM, definido nesta Ficha. Qualquer
//     valor > 0 é um override explícito (inclusive 1, para forçar "sem
//     divisão" mesmo que o padrão da mesa seja outro); <= 0 ou inválido é
//     tratado como "sem override" (ver Marcados.jsx, useMemo de poderGlobal).
//   - divisorPoderMesa (store global, ver useStore.js/App.jsx/firebase-sync.js):
//     o padrão que o Mestre pode aplicar de uma vez a TODOS os jogadores da
//     mesa. Só entra em jogo quando ficha.divisorPoder não tem override.
//
// Ambos os campos só aparecem na UI quando isMestre é verdadeiro.
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    uploadImagem: vi.fn(),
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
    salvarDivisorPoderMesa: vi.fn(),
}));

// vida=600, ascensaoBase padrão=1 (sem overflow) -> Poder_Base=(600*10)/6=1000,
// multiplicadorAscensao=2^1=2, poderMultiplicado=2000, magnitude=3,
// poderComAscensao=2000+1*10^4=12000 — mesmo baseline usado nos outros
// arquivos de teste do Scouter (Marcados.poderDiretoGrimorio.test.jsx etc).
function fichaMinimaScouter(overrides = {}) {
    return {
        vida: { base: 600 },
        mana: { base: 0 },
        aura: { base: 0 },
        chakra: { base: 0 },
        corpo: { base: 0 },
        forca: { base: 0 },
        destreza: { base: 0 },
        inteligencia: { base: 0 },
        sabedoria: { base: 0 },
        energiaEsp: { base: 0 },
        carisma: { base: 0 },
        stamina: { base: 0 },
        constituicao: { base: 0 },
        divisores: {},
        bio: {},
        estetica: {},
        labels: {},
        poderes: [],
        inventario: [],
        seresSelados: [],
        ...overrides,
    };
}

function montarMockUseStore(ficha, extra = {}) {
    const mockState = {
        minhaFicha: ficha,
        updateFicha: vi.fn((callback) => callback(ficha)),
        meuNome: 'Testador',
        importarDaAbaStatus: vi.fn(),
        isMestre: false,
        divisorPoderMesa: 1,
        setDivisorPoderMesa: vi.fn(),
        ...extra,
    };
    useStore.mockImplementation((selector) => (selector ? selector(mockState) : mockState));
    return mockState;
}

function lerPoderGlobalExibido() {
    const span = screen.getByText((_, el) => el?.tagName === 'SPAN' && /^-?\d+(\.\d+)?E-?\d+$/.test(el.textContent || ''));
    return Number(span.textContent);
}

function renderELerPoderGlobal(overrides, extra) {
    montarMockUseStore(fichaMinimaScouter(overrides), extra);
    render(<MarcadosPanel />);
    const valor = lerPoderGlobalExibido();
    cleanup();
    return valor;
}

describe('MarcadosPanel — Divisor de Poder por personagem (ficha.divisorPoder)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        window.alert = vi.fn();
    });

    afterEach(() => {
        cleanup();
    });

    it('sem nenhum divisor definido (divisorPoder=0, divisorPoderMesa=1) o Poder não é afetado (12000)', () => {
        const leitura = renderELerPoderGlobal({ divisorPoder: 0 });
        expect(leitura).toBe(12000);
    });

    it('ficha.divisorPoder=2 divide o resultado final do Poder por 2 (12000/2=6000)', () => {
        const leitura = renderELerPoderGlobal({ divisorPoder: 2 });
        expect(leitura).toBe(6000);
    });

    // salvar() (o helper usado pelo input real na UI) não converte o valor pra Number antes
    // de gravar na ficha — grava a string bruta do <input type="number">. divisorEfetivo usa
    // parseFloat, então uma string numérica precisa funcionar igual a um número.
    it('ficha.divisorPoder como STRING numérica ("2", como vem do input real) funciona igual a um number', () => {
        const leitura = renderELerPoderGlobal({ divisorPoder: '2' });
        expect(leitura).toBe(6000);
    });

    it('ficha.divisorPoder=1 explicito força "sem divisão" mesmo com um padrão de mesa diferente (12000/1=12000, ignora divisorPoderMesa=5)', () => {
        const leitura = renderELerPoderGlobal({ divisorPoder: 1 }, { divisorPoderMesa: 5 });
        expect(leitura).toBe(12000);
    });

    it('valor negativo ou inválido em ficha.divisorPoder é tratado como "sem override" (cai pro padrão de 1, sem afetar o Poder)', () => {
        const leituraNegativo = renderELerPoderGlobal({ divisorPoder: -5 });
        expect(leituraNegativo).toBe(12000);

        const leituraNaN = renderELerPoderGlobal({ divisorPoder: 'abc' });
        expect(leituraNaN).toBe(12000);
    });
});

describe('MarcadosPanel — Divisor de Poder padrão da mesa (divisorPoderMesa)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        window.alert = vi.fn();
    });

    afterEach(() => {
        cleanup();
    });

    it('divisorPoderMesa=4 sem override individual (divisorPoder=0) divide o Poder de TODOS os jogadores por 4 (12000/4=3000)', () => {
        const leitura = renderELerPoderGlobal({ divisorPoder: 0 }, { divisorPoderMesa: 4 });
        expect(leitura).toBe(3000);
    });

    it('override individual (divisorPoder=3) tem PRIORIDADE sobre divisorPoderMesa=5 (12000/3=4000, não 12000/5)', () => {
        const leitura = renderELerPoderGlobal({ divisorPoder: 3 }, { divisorPoderMesa: 5 });
        expect(leitura).toBe(4000);
    });

    it('divisorPoderMesa inválido/negativo é tratado como "sem padrão" (Poder não é afetado)', () => {
        const leitura = renderELerPoderGlobal({ divisorPoder: 0 }, { divisorPoderMesa: -3 });
        expect(leitura).toBe(12000);
    });
});

describe('MarcadosPanel — Divisor de Poder com Poder final já negativo (sinal preservado)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        window.alert = vi.fn();
    });

    afterEach(() => {
        cleanup();
    });

    // "PODER (Direto)" do Grimório (atributo:'poder_direto') permite fatores negativos: um
    // efeito ativo com propriedade:'mgeral' valor=-2 dá grupos.mgeral=-2 -> fator (1+(-2))=-1,
    // então multiplicadorPoderDireto=-1 vira o Poder final negativo ANTES do Divisor de Poder
    // entrar em jogo (12000 * -1 = -12000) — cenário real (não hipotético) de "power" negativo
    // chegando na nova etapa de divisão.
    const poderesComEfeitoNegativo = [{
        nome: 'Efeito Negativo',
        ativa: true,
        efeitos: [{ atributo: 'poder_direto', propriedade: 'mgeral', valor: -2 }],
    }];

    it('confirma o baseline negativo (-12000) sem nenhum Divisor de Poder aplicado', () => {
        const leitura = renderELerPoderGlobal({ divisorPoder: 0, poderes: poderesComEfeitoNegativo });
        expect(leitura).toBe(-12000);
    });

    it('ficha.divisorPoder=3 divide um Poder NEGATIVO mantendo o sinal (-12000/3=-4000, não 4000)', () => {
        const leitura = renderELerPoderGlobal({ divisorPoder: 3, poderes: poderesComEfeitoNegativo });
        expect(leitura).toBe(-4000);
        expect(leitura).toBeLessThan(0);
    });

    it('divisorPoderMesa também divide um Poder NEGATIVO mantendo o sinal (-12000/4=-3000)', () => {
        const leitura = renderELerPoderGlobal(
            { divisorPoder: 0, poderes: poderesComEfeitoNegativo },
            { divisorPoderMesa: 4 }
        );
        expect(leitura).toBe(-3000);
    });
});

describe('MarcadosPanel — Divisor de Poder extremo (próximo de zero) não escapa da blindagem contra overflow', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        window.alert = vi.fn();
    });

    afterEach(() => {
        cleanup();
    });

    // Um divisorPoder extremamente pequeno (mas > 0, portanto um override "válido") AMPLIFICA o
    // Poder em vez de dividir — o oposto da intenção do campo, mas ainda assim precisa continuar
    // blindado pelo MESMO clampFinito/SATURACAO_SEGURA (1e308) que protege os outros passos da
    // fórmula, e nunca vazar como Infinity/NaN na leitura do Scouter. 12000 / 1e-305 = 1.2e309,
    // que estoura Number.MAX_VALUE (~1.7976931348623157e308) e vira +Infinity antes do clamp.
    it('divisorPoder=1e-305 amplifica o Poder até estourar Infinity, mas clampFinito satura em +1e308 (nunca Infinity/NaN)', () => {
        const leitura = renderELerPoderGlobal({ divisorPoder: 1e-305 });
        expect(Number.isFinite(leitura)).toBe(true);
        expect(leitura).toBe(1e308);
    });

    // Mesmo teste, mas com o Poder final negativo antes da divisão (ver describe acima) — o sinal
    // precisa ser preservado também na saturação: -Infinity deve saturar em -1e308, não em +1e308.
    it('divisorPoder=1e-305 aplicado a um Poder já NEGATIVO satura em -1e308, preservando o sinal', () => {
        const leitura = renderELerPoderGlobal({
            divisorPoder: 1e-305,
            poderes: [{ nome: 'Efeito Negativo', ativa: true, efeitos: [{ atributo: 'poder_direto', propriedade: 'mgeral', valor: -2 }] }],
        });
        expect(leitura).toBe(-1e308);
    });
});

describe('MarcadosPanel — divisorPoderMesa é lido reativamente da store (propaga sem remontar o componente)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        window.alert = vi.fn();
    });

    afterEach(() => {
        cleanup();
    });

    // Mesmo padrão de "mock reativo" usado em Marcados.scouterFormaReatividade.test.jsx, mas
    // aqui a variável que muda entre renders não é a ficha (updateFicha) — é divisorPoderMesa,
    // um campo GLOBAL da store (não por-personagem). O objetivo é provar que um MarcadosPanel já
    // renderizado para um personagem que NUNCA teve seu próprio divisorPoder (override) reage ao
    // Mestre mudando o padrão da mesa em tempo real (via listener do Firebase -> setDivisorPoderMesa
    // -> store global), sem precisar desmontar/remontar o painel — a store real dispara esse
    // re-render sozinha; aqui simulamos o mesmo efeito via rerender() explícito.
    function montarMockUseStoreReativo(fichaInicial, divisorPoderMesaInicial = 1) {
        const mockState = {
            minhaFicha: fichaInicial,
            updateFicha: vi.fn((callback) => callback(fichaInicial)),
            meuNome: 'Testador',
            importarDaAbaStatus: vi.fn(),
            isMestre: false,
            divisorPoderMesa: divisorPoderMesaInicial,
            setDivisorPoderMesa: vi.fn(),
        };
        useStore.mockImplementation((selector) => (selector ? selector(mockState) : mockState));
        return mockState;
    }

    it('mudar divisorPoderMesa e chamar rerender() (sem tocar na ficha) atualiza a leitura do Poder já exibida (12000 -> 3000 -> 12000)', () => {
        const ficha = fichaMinimaScouter({ divisorPoder: 0 });
        const mockState = montarMockUseStoreReativo(ficha, 1);

        const { rerender } = render(<MarcadosPanel />);
        expect(lerPoderGlobalExibido()).toBe(12000);

        mockState.divisorPoderMesa = 4;
        rerender(<MarcadosPanel />);
        expect(lerPoderGlobalExibido()).toBe(3000);

        mockState.divisorPoderMesa = 1;
        rerender(<MarcadosPanel />);
        expect(lerPoderGlobalExibido()).toBe(12000);
    });
});

describe('MarcadosPanel — os campos de Divisor de Poder são exclusivos do Mestre', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        window.alert = vi.fn();
    });

    afterEach(() => {
        cleanup();
    });

    it('jogador comum (isMestre=false) NÃO vê os campos de Divisor de Poder nem o de Limite de Ocultação', () => {
        montarMockUseStore(fichaMinimaScouter(), { isMestre: false });
        render(<MarcadosPanel />);

        expect(screen.queryByText(/Divisor de Poder \(Este Personagem\)/i)).toBeNull();
        expect(screen.queryByText(/Divisor de Poder Padrão \(Todos os Jogadores\)/i)).toBeNull();
        expect(screen.queryByText(/Controle do GM \(Limite de Ocultação\)/i)).toBeNull();
    });

    it('Mestre (isMestre=true) VÊ os dois campos de Divisor de Poder', () => {
        montarMockUseStore(fichaMinimaScouter(), { isMestre: true });
        render(<MarcadosPanel />);

        expect(screen.getByText(/Divisor de Poder \(Este Personagem\)/i)).toBeDefined();
        expect(screen.getByText(/Divisor de Poder Padrão \(Todos os Jogadores\)/i)).toBeDefined();
    });
});

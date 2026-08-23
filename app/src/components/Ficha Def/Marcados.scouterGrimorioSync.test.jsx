import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MarcadosPanel from './Marcados';
import useStore from '../../stores/useStore';

// ---------------------------------------------------------------------------
// QA — Sincronização Grimório -> Scouter (ficha.ataquesElementais) +
// failsafe de log10 para poderMultiplicado negativo
//
// Antes da correção, getGlobalMultipliers() em Marcados.jsx nunca vasculhava
// ficha.ataquesElementais — a lista de "Afinidades & Elementos" escrita pelo
// painel Grimorio.jsx (ElementosFormContext), que usa `equipado` (não
// `ativo`) como flag de ativação e `descricao` (não `desc`) como campo de
// texto livre onde tags MBASE/MGERAL/MFORMAS/MABS/MUNICO podem aparecer.
// Agora existe um scanCategory('ataquesElementais', 'equipado', ['descricao',
// 'efeitos', 'desc']) adicional, seguindo a MESMA regra de agrupamento
// aditivo por tipo (1 + soma) já usada pelas outras categorias, e respeitando
// o guard compartilhado `!item.deletado`.
//
// Mesmos padrões de mock de Marcados.scouterTempoReal.test.jsx e
// Marcados.scouterAgrupamento.test.jsx.
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    uploadImagem: vi.fn(),
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
}));

// Ficha "base" com valores grandes em todas as 6 categorias — mesmo padrão de
// Marcados.scouterTempoReal.test.jsx — para que multiplicadores globais
// produzam variações de ordem de grandeza claras na leitura do Scouter.
function fichaBaseScouter(overrides = {}) {
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
        ...overrides,
    };
}

// Mock de useStore que gera uma NOVA referência de ficha a cada updateFicha,
// espelhando o Immer real — necessário para que o useMemo do Scouter
// recalcule em um re-render normal via `rerender()`.
function montarMockUseStoreReativo(fichaInicial) {
    const mockState = {
        minhaFicha: fichaInicial,
        updateFicha: null,
        meuNome: 'Testador',
        importarDaAbaStatus: vi.fn(),
    };
    mockState.updateFicha = vi.fn((callback) => {
        const nova = { ...mockState.minhaFicha };
        callback(nova);
        mockState.minhaFicha = nova;
    });
    useStore.mockImplementation((selector) => (selector ? selector(mockState) : mockState));
    return mockState;
}

// Mock de useStore "estático" (sem reatividade via rerender) — usado quando
// cada cenário é renderizado do zero, mesmo padrão de
// Marcados.scouterAgrupamento.test.jsx.
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

// Localiza o span da leitura auxiliar em notação científica do Scouter
// (ex: "1.37E9") — mesmo helper dos outros arquivos de teste do Scouter.
function lerPoderGlobalExibido() {
    const span = screen.getByText((_, el) => el?.tagName === 'SPAN' && /^-?\d+(\.\d+)?E-?\d+$/.test(el.textContent || ''));
    return Number(span.textContent);
}

// Renderiza uma ficha e devolve a leitura numérica do Scouter, já limpando o
// DOM em seguida — mesmo padrão de renderELerPoderGlobal em
// Marcados.scouterAgrupamento.test.jsx.
function renderELerPoderGlobal(overrides) {
    montarMockUseStore(fichaBaseScouter(overrides));
    render(<MarcadosPanel />);
    const valor = lerPoderGlobalExibido();
    cleanup();
    return valor;
}

describe('MarcadosPanel — Sincronização Grimório -> Scouter: ficha.ataquesElementais (equipado + descricao)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        window.alert = vi.fn();
    });

    afterEach(() => {
        cleanup();
    });

    it('equipado=false NÃO afeta o Scouter; equipar (true) AUMENTA a leitura; desequipar (false) REVERTE ao valor original', () => {
        const ficha = fichaBaseScouter({
            ataquesElementais: [{ nome: 'Bola de Fogo', equipado: false, descricao: 'Uma explosão ígneo-mágica. MGERAL: +8' }],
        });
        const mockState = montarMockUseStoreReativo(ficha);

        const { rerender } = render(<MarcadosPanel />);
        const valorDesequipado = lerPoderGlobalExibido();

        mockState.updateFicha((f) => { f.ataquesElementais[0].equipado = true; });
        rerender(<MarcadosPanel />);
        const valorEquipado = lerPoderGlobalExibido();
        expect(valorEquipado).toBeGreaterThan(valorDesequipado);

        mockState.updateFicha((f) => { f.ataquesElementais[0].equipado = false; });
        rerender(<MarcadosPanel />);
        const valorRevertido = lerPoderGlobalExibido();
        expect(valorRevertido).toBe(valorDesequipado);
    });

    it('duas entradas equipadas com "MGERAL: +8" cada resultam no MESMO valor do Scouter que uma única entrada com "MGERAL: +16" (agrupamento aditivo, mesma regra das outras categorias)', () => {
        const comDuasEntradas = renderELerPoderGlobal({
            ataquesElementais: [
                { nome: 'Ataque A', equipado: true, descricao: 'MGERAL: +8' },
                { nome: 'Ataque B', equipado: true, descricao: 'MGERAL: +8' },
            ],
        });
        const comUmaEntradaSomada = renderELerPoderGlobal({
            ataquesElementais: [
                { nome: 'Ataque Único', equipado: true, descricao: 'MGERAL: +16' },
            ],
        });

        expect(comDuasEntradas).toBe(comUmaEntradaSomada);
    });

    it('uma entrada equipada de ataquesElementais (MBASE: +5) combinada com um poder ativo estruturado (mgeral: +8) soma corretamente nos totais compartilhados de getGlobalMultipliers', () => {
        const apenasAtaque = renderELerPoderGlobal({
            ataquesElementais: [{ nome: 'Ataque MBASE', equipado: true, descricao: 'MBASE: +5' }],
        });
        const apenasPoder = renderELerPoderGlobal({
            poderes: [{ nome: 'Poder MGERAL', ativa: true, efeitos: [{ atributo: 'geral', propriedade: 'mgeral', valor: 8 }] }],
        });
        const combinacaoAtaqueEPoder = renderELerPoderGlobal({
            ataquesElementais: [{ nome: 'Ataque MBASE', equipado: true, descricao: 'MBASE: +5' }],
            poderes: [{ nome: 'Poder MGERAL', ativa: true, efeitos: [{ atributo: 'geral', propriedade: 'mgeral', valor: 8 }] }],
        });
        // Equivalente combinando as MESMAS quantidades (MBASE:+5 e MGERAL:+8), mas com
        // as duas fontes vindo inteiramente de poderes[] — prova que o agrupamento por
        // TIPO soma através de categorias diferentes (ataquesElementais + poderes) de
        // forma idêntica a somar dentro de uma única categoria.
        const equivalenteTudoViaPoderes = renderELerPoderGlobal({
            poderes: [
                { nome: 'Poder MBASE', ativa: true, efeitos: [{ atributo: 'geral', propriedade: 'mbase', valor: 5 }] },
                { nome: 'Poder MGERAL', ativa: true, efeitos: [{ atributo: 'geral', propriedade: 'mgeral', valor: 8 }] },
            ],
        });

        expect(combinacaoAtaqueEPoder).toBeGreaterThan(apenasAtaque);
        expect(combinacaoAtaqueEPoder).toBeGreaterThan(apenasPoder);
        expect(combinacaoAtaqueEPoder).toBe(equivalenteTudoViaPoderes);
    });

    it('deletado=true numa entrada equipada de ataquesElementais EXCLUI a entrada do cálculo (mesmo guard !item.deletado compartilhado por todas as categorias)', () => {
        const comEntradaDeletada = renderELerPoderGlobal({
            ataquesElementais: [{ nome: 'Ataque Fantasma', equipado: true, deletado: true, descricao: 'MGERAL: +8' }],
        });
        const semNenhumaEntrada = renderELerPoderGlobal({
            ataquesElementais: [],
        });
        const comEntradaAtivaNaoDeletada = renderELerPoderGlobal({
            ataquesElementais: [{ nome: 'Ataque Real', equipado: true, deletado: false, descricao: 'MGERAL: +8' }],
        });

        expect(comEntradaDeletada).toBe(semNenhumaEntrada);
        expect(comEntradaAtivaNaoDeletada).toBeGreaterThan(semNenhumaEntrada);
    });
});

describe('MarcadosPanel — Failsafe de log10 (poderComAscensao): poderMultiplicado negativo', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        window.alert = vi.fn();
    });

    afterEach(() => {
        cleanup();
    });

    // poderMultiplicado <= 0 (aqui, estritamente negativo) NUNCA pode entrar no ramo do
    // logaritmo (Math.log10 de número <= 0 é NaN/-Infinity). Um valor de Vida negativo
    // (permitido por sanitizarBaseNumerica, que devolve números já numéricos sem alteração)
    // com todas as outras 5 categorias zeradas produz Poder_Base = (vida*10)/6 = -10 (< 0).
    // O bônus de overflow de Ascensão por categoria usa Math.max(0, ...), então uma
    // prestigioBruto negativo/nulo em Vida não muda ascensaoGeralEfetiva em relação ao
    // cenário de referência com vida=0 (ascensaoBase=4, sem overflow) já coberto em
    // Marcados.scouterFormulaAscensao.test.jsx, que também vale aqui: ascensaoGeralEfetiva=4.
    // Ascensão agora também multiplica o Poder Base (mesmo negativo), com a curva
    // exponencial atual (2^ascensaoGeralEfetiva):
    //   multiplicadorAscensao = 2^4 = 16 -> poderMultiplicado = -10*16 = -160 (<= 0) -> ramo else:
    //   poderComAscensao = ascensaoSegura(4)*10 + (-160) = 40 - 160 = -120
    it('poderMultiplicado negativo usa o ramo else do failsafe (ascensaoSegura*10 + poderMultiplicado), sem tocar Math.log10 e sem gerar NaN na leitura', () => {
        const ficha = fichaBaseScouter({
            vida: { base: -6 },
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
            ascensaoBase: 4,
        });
        montarMockUseStore(ficha);
        render(<MarcadosPanel />);

        const leitura = lerPoderGlobalExibido();
        expect(leitura).not.toBeNaN();
        expect(Number.isFinite(leitura)).toBe(true);
        expect(leitura).toBe(-120);
    });
});

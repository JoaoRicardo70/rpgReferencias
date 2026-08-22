import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MarcadosPanel from './Marcados';
import useStore from '../../stores/useStore';

// ---------------------------------------------------------------------------
// QA — Scouter Holográfico (poderGlobal / vitalidadeGlobal) EM TEMPO REAL
//
// Marcados.jsx foi revertido de um cálculo de "potencial máximo" de volta para
// uma leitura AO VIVO: o número do Scouter deve refletir SOMENTE o que o
// jogador tem ligado/equipado/ativo agora, seguindo exatamente a regra de
// getBuffs() em core/attributes.js:
//   - ficha.poderes[i]  -> `efeitos` só entram se p.ativa === true
//                        -> `efeitosPassivos` entram SEMPRE, ativa ou não
//   - ficha.inventario[i] -> `efeitos`/efeitos de forma só entram se item.equipado === true
//   - ficha.seresSelados[i] -> `efeitos`/efeitos de forma só entram se ser.ativo === true
//
// O useMemo que calcula { poderGlobal, vitalidadeGlobal, ... } (linhas ~656-698
// de Marcados.jsx) é uma closure local do componente, não exportada — a
// validação é feita renderizando o MarcadosPanel real e lendo a leitura
// auxiliar em notação científica do Scouter:
//   {Number(poderGlobal || 0).toExponential(2).replace('+', '').toUpperCase()}
// que é o único span do componente que casa com o padrão /^-?\d+(\.\d+)?E-?\d+$/,
// tornando a leitura robusta independente da escala (Milhões/Bilhões/etc. do
// formatarPoderCosmico, que trunca dígitos e usaria sufixos por extenso).
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    uploadImagem: vi.fn(),
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
}));

// Ficha "base" com valores não-nulos em todas as 6 categorias (vida, mana,
// aura, chakra, corpo, status via os 8 atributos físicos), grandes o
// suficiente para que um multiplicador mgeral (x8) produza uma variação de
// ordem de grandeza clara na leitura do Scouter, mesmo com o "ghost ascension
// bonus" fixo que getGhostAscensionBonus soma incondicionalmente (não depende
// de nenhum toggle testado aqui, então não interfere nas comparações
// relativas maior/menor/igual).
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
        ...overrides,
    };
}

// Mock de useStore que gera uma NOVA referência de ficha a cada updateFicha,
// espelhando o comportamento real do Immer em stores/useStore.js. Necessário
// porque o useMemo do Scouter depende de `[minhaFicha]` por referência: sem
// uma nova referência, o React não recalcularia o memo em um re-render real.
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

// Localiza o span da leitura auxiliar em notação científica do Scouter
// (ex: "1.37E9") — é o único texto do componente que casa com esse padrão,
// então a busca é estável independente da escala/formatação do número
// principal (que usa sufixos por extenso via formatarPoderCosmico).
function lerPoderGlobalExibido() {
    const span = screen.getByText((_, el) => el?.tagName === 'SPAN' && /^-?\d+(\.\d+)?E-?\d+$/.test(el.textContent || ''));
    return Number(span.textContent);
}

describe('MarcadosPanel — Scouter Holográfico (poderGlobal) reage em TEMPO REAL aos toggles ativa/equipado/ativo', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        window.alert = vi.fn();
    });

    afterEach(() => {
        cleanup();
    });

    it('poderes[].efeitos: ligar ativa=true AUMENTA o Scouter (efeitos só contam quando ativa)', () => {
        const ficha = fichaBaseScouter({
            poderes: [{ nome: 'Explosão de Ki', ativa: false, efeitos: [{ atributo: 'geral', propriedade: 'mgeral', valor: 8 }] }],
        });
        const mockState = montarMockUseStoreReativo(ficha);

        const { rerender } = render(<MarcadosPanel />);
        const valorDesligado = lerPoderGlobalExibido();

        mockState.updateFicha((f) => { f.poderes[0].ativa = true; });
        rerender(<MarcadosPanel />);
        const valorLigado = lerPoderGlobalExibido();

        expect(valorLigado).toBeGreaterThan(valorDesligado);
    });

    it('poderes[].efeitos: desligar ativa=false DIMINUI o Scouter (inverso do teste anterior)', () => {
        const ficha = fichaBaseScouter({
            poderes: [{ nome: 'Explosão de Ki', ativa: true, efeitos: [{ atributo: 'geral', propriedade: 'mgeral', valor: 8 }] }],
        });
        const mockState = montarMockUseStoreReativo(ficha);

        const { rerender } = render(<MarcadosPanel />);
        const valorLigado = lerPoderGlobalExibido();

        mockState.updateFicha((f) => { f.poderes[0].ativa = false; });
        rerender(<MarcadosPanel />);
        const valorDesligado = lerPoderGlobalExibido();

        expect(valorDesligado).toBeLessThan(valorLigado);
    });

    it('inventario[].equipado: equipar o item AUMENTA o Scouter (efeitos só contam quando equipado)', () => {
        const ficha = fichaBaseScouter({
            inventario: [{ nome: 'Espada Amaldiçoada', equipado: false, efeitos: [{ atributo: 'geral', propriedade: 'mgeral', valor: 8 }] }],
        });
        const mockState = montarMockUseStoreReativo(ficha);

        const { rerender } = render(<MarcadosPanel />);
        const valorDesequipado = lerPoderGlobalExibido();

        mockState.updateFicha((f) => { f.inventario[0].equipado = true; });
        rerender(<MarcadosPanel />);
        const valorEquipado = lerPoderGlobalExibido();

        expect(valorEquipado).toBeGreaterThan(valorDesequipado);
    });

    it('inventario[].equipado: desequipar o item DIMINUI o Scouter (inverso do teste anterior)', () => {
        const ficha = fichaBaseScouter({
            inventario: [{ nome: 'Espada Amaldiçoada', equipado: true, efeitos: [{ atributo: 'geral', propriedade: 'mgeral', valor: 8 }] }],
        });
        const mockState = montarMockUseStoreReativo(ficha);

        const { rerender } = render(<MarcadosPanel />);
        const valorEquipado = lerPoderGlobalExibido();

        mockState.updateFicha((f) => { f.inventario[0].equipado = false; });
        rerender(<MarcadosPanel />);
        const valorDesequipado = lerPoderGlobalExibido();

        expect(valorDesequipado).toBeLessThan(valorEquipado);
    });

    it('seresSelados[].ativo: ativar o ser selado AUMENTA o Scouter (efeitos só contam quando ativo)', () => {
        const ficha = fichaBaseScouter({
            seresSelados: [{ nome: 'Bijuu Selado', ativo: false, efeitos: [{ atributo: 'geral', propriedade: 'mgeral', valor: 8 }] }],
        });
        const mockState = montarMockUseStoreReativo(ficha);

        const { rerender } = render(<MarcadosPanel />);
        const valorInativo = lerPoderGlobalExibido();

        mockState.updateFicha((f) => { f.seresSelados[0].ativo = true; });
        rerender(<MarcadosPanel />);
        const valorAtivo = lerPoderGlobalExibido();

        expect(valorAtivo).toBeGreaterThan(valorInativo);
    });

    it('seresSelados[].ativo: desativar o ser selado DIMINUI o Scouter (inverso do teste anterior)', () => {
        const ficha = fichaBaseScouter({
            seresSelados: [{ nome: 'Bijuu Selado', ativo: true, efeitos: [{ atributo: 'geral', propriedade: 'mgeral', valor: 8 }] }],
        });
        const mockState = montarMockUseStoreReativo(ficha);

        const { rerender } = render(<MarcadosPanel />);
        const valorAtivo = lerPoderGlobalExibido();

        mockState.updateFicha((f) => { f.seresSelados[0].ativo = false; });
        rerender(<MarcadosPanel />);
        const valorInativo = lerPoderGlobalExibido();

        expect(valorInativo).toBeLessThan(valorAtivo);
    });

    it('poderes[].efeitosPassivos: contam SEMPRE, com ativa=true ou ativa=false o Scouter mostra o MESMO número (passivas são incondicionais)', () => {
        const passivo = [{ atributo: 'geral', propriedade: 'mgeral', valor: 8 }];

        const fichaDesligada = fichaBaseScouter({
            poderes: [{ nome: 'Instinto Amaldiçoado', ativa: false, efeitosPassivos: passivo }],
        });
        montarMockUseStoreReativo(fichaDesligada);
        const { unmount } = render(<MarcadosPanel />);
        const valorComAtivaFalse = lerPoderGlobalExibido();
        unmount();

        const fichaLigada = fichaBaseScouter({
            poderes: [{ nome: 'Instinto Amaldiçoado', ativa: true, efeitosPassivos: passivo }],
        });
        montarMockUseStoreReativo(fichaLigada);
        render(<MarcadosPanel />);
        const valorComAtivaTrue = lerPoderGlobalExibido();

        expect(valorComAtivaTrue).toBe(valorComAtivaFalse);
        // Confere que o passivo realmente teve efeito (não é só "os dois deram 0 por acaso"):
        // comparado com uma ficha idêntica mas SEM nenhum poder, ambos os casos acima devem
        // estar acima do baseline sem buff — provando que efeitosPassivos entrou no cálculo
        // independentemente do valor de ativa.
        const fichaSemPoder = fichaBaseScouter({ poderes: [] });
        montarMockUseStoreReativo(fichaSemPoder);
        cleanup();
        render(<MarcadosPanel />);
        const valorBaseline = lerPoderGlobalExibido();

        expect(valorComAtivaTrue).toBeGreaterThan(valorBaseline);
        expect(valorComAtivaFalse).toBeGreaterThan(valorBaseline);
    });

    it('reatividade real: o useMemo recalcula via re-render normal do React com uma nova referência de ficha (simulando o Immer), não via chamada manual de função interna', () => {
        // Combina os três toggles em sequência sobre a MESMA instância renderizada,
        // usando sempre rerender() — nunca acessando funções internas do componente.
        const ficha = fichaBaseScouter({
            poderes: [{ nome: 'Poder A', ativa: false, efeitos: [{ atributo: 'geral', propriedade: 'mgeral', valor: 3 }] }],
            inventario: [{ nome: 'Item B', equipado: false, efeitos: [{ atributo: 'geral', propriedade: 'mgeral', valor: 3 }] }],
            seresSelados: [{ nome: 'Ser C', ativo: false, efeitos: [{ atributo: 'geral', propriedade: 'mgeral', valor: 3 }] }],
        });
        const mockState = montarMockUseStoreReativo(ficha);

        const { rerender } = render(<MarcadosPanel />);
        const valorInicial = lerPoderGlobalExibido();

        mockState.updateFicha((f) => { f.poderes[0].ativa = true; });
        rerender(<MarcadosPanel />);
        const valorAposPoder = lerPoderGlobalExibido();
        expect(valorAposPoder).toBeGreaterThan(valorInicial);

        mockState.updateFicha((f) => { f.inventario[0].equipado = true; });
        rerender(<MarcadosPanel />);
        const valorAposItem = lerPoderGlobalExibido();
        expect(valorAposItem).toBeGreaterThan(valorAposPoder);

        mockState.updateFicha((f) => { f.seresSelados[0].ativo = true; });
        rerender(<MarcadosPanel />);
        const valorAposSer = lerPoderGlobalExibido();
        expect(valorAposSer).toBeGreaterThan(valorAposItem);

        // E desfazendo tudo de volta, o número retorna exatamente ao valor inicial —
        // prova final de que é uma leitura ao vivo, não um "potencial máximo" acumulado.
        mockState.updateFicha((f) => {
            f.poderes[0].ativa = false;
            f.inventario[0].equipado = false;
            f.seresSelados[0].ativo = false;
        });
        rerender(<MarcadosPanel />);
        const valorFinal = lerPoderGlobalExibido();
        expect(valorFinal).toBe(valorInicial);
    });
});

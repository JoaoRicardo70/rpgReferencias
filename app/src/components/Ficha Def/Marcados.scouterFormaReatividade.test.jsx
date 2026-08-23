import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MarcadosPanel from './Marcados';
import useStore from '../../stores/useStore';

// ---------------------------------------------------------------------------
// QA — Regressão: getGlobalMultipliers() (Scouter) precisa refletir os MESMOS
// gatilhos de "Forma ativada" que o Radar (RadarDesenhado) já detectava via
// getEfetivoMFormas(ficha, eixo) para cada uma das 6 categorias
// (vida/mana/aura/chakra/corpo/status).
//
// Bug corrigido: getGlobalMultipliers() antes só lia o campo estático
// ficha.forca.mFormas e NUNCA os buffs dinâmicos mformas vindos de
// poderes[]/inventario[]/seresSelados[] — mesmo quando esses buffs eram
// tageados numa categoria específica (ex.: atributo:'vida'), não só 'geral'.
// Isso fazia o Radar reagir a uma Forma ativada, mas o Scouter (poderGlobal)
// permanecer parado.
//
// Fix: getGlobalMultipliers() agora soma, para cada um dos 6 eixos, o bônus
// (getEfetivoMFormas(ficha, eixo) - 1) ao grupo MFORMAS, na mesma convenção
// "1 + soma" já usada pelas outras categorias (MBASE/MGERAL/MABS).
//
// Como getGlobalMultipliers/getEfetivoMFormas não são exportadas, a
// validação é feita renderizando o MarcadosPanel real e lendo a leitura
// auxiliar em notação científica do Scouter (mesmo padrão dos demais
// arquivos de teste do Scouter, ex.: Marcados.scouterFormulaAscensao.test.jsx).
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    uploadImagem: vi.fn(),
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
}));

// Ficha minimalista com todas as 6 categorias (vida/mana/aura/chakra/corpo/
// status) zeradas por padrão. Bases mantidas bem abaixo dos divisores de
// prestígio de cada categoria (vida: 1e6, status: 1e3 por atributo médio)
// para garantir prestígio = 0 em todas elas — isso mantém a Ascensão Geral
// Efetiva presa em 1 (ascensaoBase=1 * multiplicadorForcaAscensao=1, sem
// overflow), o que isola a variável sob teste (glob.finalF, via mFormas) do
// resto da fórmula do Scouter (poderComAscensao).
function fichaMinimaScouter(overrides = {}) {
    return {
        vida: { base: 0 },
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

// Localiza o span da leitura auxiliar em notação científica do Scouter
// (ex: "1.10E4") — único texto do componente que casa com esse padrão.
function lerPoderGlobalExibido() {
    const span = screen.getByText((_, el) => el?.tagName === 'SPAN' && /^-?\d+(\.\d+)?E-?\d+$/.test(el.textContent || ''));
    return Number(span.textContent);
}

describe('MarcadosPanel — regressão: buff mformas tageado num eixo específico (não "geral") move o Scouter', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        window.alert = vi.fn();
    });

    afterEach(() => {
        cleanup();
    });

    // Poder_Base = (vida*10)/6 = (600*10)/6 = 1000 (todo o resto zerado).
    // Com o poder DESLIGADO (ativa: false): glob.finalF = 1 (nenhum buff
    // aplicado, já que getBuffs só processa `efeitos` de poderes com
    // `ativa: true`), então poderMultiplicado = 1000. magnitude =
    // floor(log10(1000)) = 3, poderComAscensao = 1000 + 1*10^4 = 11000.
    //
    // Com o poder LIGADO: getEfetivoMFormas(ficha, 'vida') passa a enxergar
    // o buff mformas tageado em atributo:'vida' (v padrão 1.0 + buff 2 = 2),
    // então grupos.MFORMAS.Eixo_vida = (2-1) = 1 -> glob.finalF = 1+1 = 2.
    // poderMultiplicado = 1000*2 = 2000, poderComAscensao = 2000 + 10000 =
    // 12000 — ANTES do fix, esse buff (atributo:'vida', não 'forca'/'geral')
    // era completamente ignorado pelo Scouter e a leitura JAMAIS mudaria.
    it('ativar uma Forma via poderes[] com efeito atributo:"vida"/propriedade:"mformas" AUMENTA a leitura do Scouter; desativar REVERTE', () => {
        const ficha = fichaMinimaScouter({
            vida: { base: 600 },
            poderes: [{ nome: 'Forma Vital', ativa: false, efeitos: [{ atributo: 'vida', propriedade: 'mformas', valor: 2 }] }],
        });
        const mockState = montarMockUseStoreReativo(ficha);

        const { rerender } = render(<MarcadosPanel />);
        const valorDesligado = lerPoderGlobalExibido();
        expect(valorDesligado).toBe(11000);

        mockState.updateFicha((f) => { f.poderes[0].ativa = true; });
        rerender(<MarcadosPanel />);
        const valorLigado = lerPoderGlobalExibido();
        expect(valorLigado).toBe(12000);
        expect(valorLigado).toBeGreaterThan(valorDesligado);

        mockState.updateFicha((f) => { f.poderes[0].ativa = false; });
        rerender(<MarcadosPanel />);
        const valorRevertido = lerPoderGlobalExibido();
        expect(valorRevertido).toBe(11000);
        expect(valorRevertido).toBeLessThan(valorLigado);
    });
});

describe('MarcadosPanel — cobertura multi-eixo: o fix não é específico de "vida" (eixo status, âncora "forca")', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        window.alert = vi.fn();
    });

    afterEach(() => {
        cleanup();
    });

    // getEfetivoMFormas(ficha, 'status') usa a âncora 'forca' (anchor =
    // k==='status' ? 'forca' : k), então um buff tageado diretamente em
    // atributo:'forca' (statKey passado a getBuffs é 'forca', e
    // atr===sK casa direto) afeta o eixo 'status' do Scouter.
    //
    // Poder_Base = (statusEfetivo*100)/6, com statusEfetivo = somaStatus/8 e
    // apenas forca.base=480 setado (demais 7 atributos físicos = 0):
    //   statusEfetivo = 480/8 = 60  =>  Poder_Base = (60*100)/6 = 1000
    // (mesmo Poder_Base do teste do eixo vida acima, por simetria).
    it('ativar uma Forma via poderes[] com efeito atributo:"forca"/propriedade:"mformas" AUMENTA a leitura do Scouter (eixo status); desativar REVERTE', () => {
        const ficha = fichaMinimaScouter({
            forca: { base: 480 },
            poderes: [{ nome: 'Forma de Combate', ativa: false, efeitos: [{ atributo: 'forca', propriedade: 'mformas', valor: 2 }] }],
        });
        const mockState = montarMockUseStoreReativo(ficha);

        const { rerender } = render(<MarcadosPanel />);
        const valorDesligado = lerPoderGlobalExibido();
        expect(valorDesligado).toBe(11000);

        mockState.updateFicha((f) => { f.poderes[0].ativa = true; });
        rerender(<MarcadosPanel />);
        const valorLigado = lerPoderGlobalExibido();
        expect(valorLigado).toBe(12000);
        expect(valorLigado).toBeGreaterThan(valorDesligado);

        mockState.updateFicha((f) => { f.poderes[0].ativa = false; });
        rerender(<MarcadosPanel />);
        const valorRevertido = lerPoderGlobalExibido();
        expect(valorRevertido).toBe(11000);
        expect(valorRevertido).toBeLessThan(valorLigado);
    });
});

describe('MarcadosPanel — sem dupla contagem entre o campo estático mFormas e o buff dinâmico', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        window.alert = vi.fn();
    });

    afterEach(() => {
        cleanup();
    });

    // getEfetivoMFormas retorna `v` direto quando NÃO há buff, ou
    // `(v===1.0 ? 0 : v) + buff` quando há. Duas rotas diferentes até o
    // MESMO mF efetivo = 3:
    //   Rota A (campo estático): ficha.forca.mFormas = 3, sem buffs
    //     -> v=3, sem buff -> retorna v = 3 diretamente.
    //   Rota B (buff dinâmico): ficha.forca.mFormas ausente (v padrão =
    //     1.0), poderes[] com efeito atributo:'forca'/mformas/valor:3
    //     -> v===1.0 então soma parte de 0 -> (0) + 3 = 3.
    // Se houvesse dupla contagem (ex.: somar v + buff sem a lógica
    // "v===1.0 ? 0 : v"), a Rota B daria mF=4, não 3, e as duas leituras
    // do Scouter divergiriam.
    it('campo estático mFormas=3 (sem buff) produz a MESMA leitura que v padrão(1.0)+buff mformas=3 (mesmo mF efetivo)', () => {
        const fichaEstatica = fichaMinimaScouter({
            vida: { base: 600 },
            forca: { base: 0, mFormas: 3 },
        });
        montarMockUseStoreReativo(fichaEstatica);
        const { unmount } = render(<MarcadosPanel />);
        const leituraEstatica = lerPoderGlobalExibido();
        unmount();

        const fichaBuff = fichaMinimaScouter({
            vida: { base: 600 },
            forca: { base: 0 },
            poderes: [{ nome: 'Forma de Combate III', ativa: true, efeitos: [{ atributo: 'forca', propriedade: 'mformas', valor: 3 }] }],
        });
        montarMockUseStoreReativo(fichaBuff);
        render(<MarcadosPanel />);
        const leituraBuff = lerPoderGlobalExibido();

        // Poder_Base = 1000 (só vida=600), glob.finalF = 1 + (3-1) = 3 nas
        // duas rotas -> poderMultiplicado = 3000 -> magnitude = 3 ->
        // poderComAscensao = 3000 + 1*10^4 = 13000.
        expect(leituraEstatica).toBe(13000);
        expect(leituraBuff).toBe(13000);
        expect(leituraEstatica).toBe(leituraBuff);
    });
});

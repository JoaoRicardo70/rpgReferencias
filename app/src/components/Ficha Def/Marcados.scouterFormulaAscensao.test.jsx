import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MarcadosPanel from './Marcados';
import useStore from '../../stores/useStore';

// ---------------------------------------------------------------------------
// QA — Nova fórmula "Poder Base" do Scouter + Injeção de Magnitude da Ascensão
// + desacoplamento da lista de atributos (Página 2) do gargalo do Radar.
//
// calcPoderBase() (useMemo local, não exportado, em Marcados.jsx) substitui o
// antigo calcTrueAverage() por:
//   Poder_Base = ((Vida_ef*10) + Chakra_ef + Mana_ef + Corpo_ef + Aura_ef + (Status_ef*100)) / 6
// onde cada `_ef` vem de safeGetEfetivoBase (rawBase + buffs.base aditivos,
// SEM a pilha de multiplicadores mBase/mGeral/mFormas/mAbsoluto/mUnico) e
// Status_ef é a média efetiva dos 8 atributos físicos.
//
// Como nenhuma dessas funções é exportada, a validação é feita renderizando o
// MarcadosPanel real e lendo a leitura auxiliar em notação científica do
// Scouter (mesmo padrão de Marcados.scouterTempoReal.test.jsx):
//   {Number(poderGlobal || 0).toExponential(2).replace('+', '').toUpperCase()}
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    uploadImagem: vi.fn(),
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
}));

// Ficha minimalista com TODAS as 6 categorias (vida/mana/aura/chakra/corpo/
// status) zeradas por padrão. Mantendo os valores brutos bem abaixo dos
// divisores de prestígio de cada categoria (vida: 1e6, chakra/mana/aura/
// corpo: 1e7, status: 1e3 por atributo médio) garante prestígio = 0 em todas
// elas, o que mantém a Ascensão Geral Efetiva presa em
// (ascensaoBase * multiplicadorForcaAscensao) — sem nenhum "bônus fantasma"
// de overflow contaminando as comparações de peso da fórmula.
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

describe('MarcadosPanel — calcPoderBase(): peso relativo Vida (x10) vs Chakra/Mana/Corpo/Aura (x1)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        window.alert = vi.fn();
    });

    afterEach(() => {
        cleanup();
    });

    // Com todo o resto zerado, Poder_Base(vida=600) = (600*10)/6 = 1000 e
    // Poder_Base(chakra=600) = 600/6 = 100 — uma razão de exatamente 10x,
    // refletindo o peso x10 de Vida contra o peso x1 de Chakra/Mana/Corpo/
    // Aura, ambos divididos pelo mesmo /6. Ascensão Geral Efetiva fica presa
    // em 1 (ascensaoBase padrão=1, sem overflow) -> multiplicadorAscensao =
    // 1+1 = 2, aplicado igualmente aos dois casos (não afeta a razão). Como
    // glob.finalF e glob.totalDano ficam em 1 (nenhum buff de dano/forma nas
    // duas fichas), a injeção de magnitude (Math.floor(log10(...))) cai numa
    // casa decimal a mais em exatamente uma unidade (3 vs 2) para o caso da
    // Vida — o que faz o termo injetado escalar pela MESMA razão 10x,
    // preservando a razão final observável no Scouter mesmo após a injeção.
    it('alterar SOMENTE Vida move a leitura do Scouter 10x mais que alterar Chakra pelo mesmo delta', () => {
        montarMockUseStoreReativo(fichaMinimaScouter({ vida: { base: 600 } }));
        const { unmount } = render(<MarcadosPanel />);
        const leituraVida = lerPoderGlobalExibido();
        unmount();

        montarMockUseStoreReativo(fichaMinimaScouter({ chakra: { base: 600 } }));
        render(<MarcadosPanel />);
        const leituraChakra = lerPoderGlobalExibido();

        expect(leituraVida).toBe(12000);
        expect(leituraChakra).toBe(1200);
        expect(leituraVida / leituraChakra).toBeCloseTo(10, 5);
    });

    it('alterar SOMENTE Vida move a leitura 10x mais que alterar Mana pelo mesmo delta (peso x1 confirmado numa segunda categoria)', () => {
        montarMockUseStoreReativo(fichaMinimaScouter({ vida: { base: 600 } }));
        const { unmount } = render(<MarcadosPanel />);
        const leituraVida = lerPoderGlobalExibido();
        unmount();

        montarMockUseStoreReativo(fichaMinimaScouter({ mana: { base: 600 } }));
        render(<MarcadosPanel />);
        const leituraMana = lerPoderGlobalExibido();

        expect(leituraVida).toBe(12000);
        expect(leituraMana).toBe(1200);
        expect(leituraVida / leituraMana).toBeCloseTo(10, 5);
    });
});

describe('MarcadosPanel — calcPoderBase() ignora buffs "propriedade: base" vindos do Grimório (ficha.poderes)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        window.alert = vi.fn();
    });

    afterEach(() => {
        cleanup();
    });

    // 🔥 Mudança de comportamento intencional: calcPoderBase() agora chama
    // safeGetEfetivoBase(ficha, k, /*ignorarPoderes*/ true), que descarta os
    // buffs de 'base' vindos de ficha.poderes (Habilidades/Formas/Poderes do
    // Grimório) — essas entradas continuam alterando Vida/Mana/Status/etc
    // normalmente no resto da Ficha, só não influenciam mais o Poder Base do
    // Scouter. Ativar/desativar a habilidade abaixo, portanto, NÃO move mais
    // a leitura do Scouter (permanece em 10 nos dois estados, pelo mesmo
    // failsafe de ascensão com poderMultiplicado<=0 documentado abaixo). Quem
    // quiser que uma entrada do Grimório afete o Poder do Scouter usa agora o
    // campo dedicado "PODER (Direto)" (atributo:'poder_direto').
    it('poderes[].efeitos com propriedade "base" NÃO altera mais a leitura do Scouter, ativo ou não', () => {
        const ficha = fichaMinimaScouter({
            poderes: [{ nome: 'Bênção Vital', ativa: false, efeitos: [{ atributo: 'vida', propriedade: 'base', valor: 600 }] }],
        });
        const mockState = montarMockUseStoreReativo(ficha);

        const { rerender } = render(<MarcadosPanel />);
        const valorDesligado = lerPoderGlobalExibido();
        // poderMultiplicado=0 (nenhum buff ativo) cai no ramo <= 0 do failsafe de
        // ascensão: poderComAscensao = ascensaoSegura(1) * 10 + 0 = 10.
        expect(valorDesligado).toBe(10);

        mockState.updateFicha((f) => { f.poderes[0].ativa = true; });
        rerender(<MarcadosPanel />);
        const valorLigado = lerPoderGlobalExibido();
        expect(valorLigado).toBe(10);
        expect(valorLigado).toBe(valorDesligado);

        mockState.updateFicha((f) => { f.poderes[0].ativa = false; });
        rerender(<MarcadosPanel />);
        const valorRevertido = lerPoderGlobalExibido();
        expect(valorRevertido).toBe(10);
    });
});

describe('MarcadosPanel — Injeção de Magnitude da Ascensão (poderComAscensao)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        window.alert = vi.fn();
    });

    afterEach(() => {
        cleanup();
    });

    // Caso de referência: Poder_Base = (vida*10)/6 = 3.2e10, com
    // ascensaoGeralEfetiva = 4 (via ascensaoBase = 4, sem overflow de
    // prestígio contaminando o bônus geral) e supressão = 100 (sem suprimir).
    // 🔥 divisores.vida MINÚSCULO (correção desta sessão): Vida (1.92e10)
    // sozinha é grande o bastante pra gerar overflow real de Prestígio
    // (pAtual=19200 >> 100), e a sessão que trocou nivelCompletos de
    // Math.min(...) pela MÉDIA das 6 categorias (ver core/poder.js/
    // Marcados.jsx, comentário "🔥 CORREÇÃO") faz esse overflow SOZINHO
    // contar pro bônus geral — antes, só contava se TODAS as 6 categorias
    // overflowassem. `divisores.vida` multiplica pAtual (não poderBase, que
    // usa o valor bruto de `base` diretamente) — um divisor minúsculo (1e-12)
    // zera pAtual e neutraliza esse overflow, preservando ascensaoGeralEfetiva=4
    // exato e os valores hand-computed abaixo exatamente como antes desta sessão.
    // Ascensão agora também multiplica o Poder Base diretamente (curva
    // exponencial: 2^ascensaoGeralEfetiva, dobrando por nível de Ascensão):
    //   multiplicadorAscensao = 2^4 = 16
    //   poderMultiplicado = 3.2e10 * 16 = 5.12e11
    //   magnitude = floor(log10(5.12e11)) = 11
    //   poderComAscensao = 5.12e11 + 4 * 10^12 = 4.512e12, que a leitura do
    //   Scouter (toExponential(2)) arredonda para 4.51E12 (4.510.000.000.000)
    it('injeta a Ascensão Geral Efetiva exatamente uma ordem de magnitude acima do poder multiplicado (já com Ascensão como multiplicador exponencial do Poder Base)', () => {
        // Poder_Base = (vida*10)/6 = 3.2e10  =>  vida = 1.92e10
        const ficha = fichaMinimaScouter({
            vida: { base: 19200000000 },
            ascensaoBase: 4,
            divisores: { vida: 0.000000000001 },
        });
        montarMockUseStoreReativo(ficha);
        render(<MarcadosPanel />);

        const leitura = lerPoderGlobalExibido();
        expect(leitura).toBe(4510000000000);
    });

    // Failsafe do log10: poderMultiplicado > 0 (mesmo fracionário, < 1) usa o ramo
    // do logaritmo normalmente — magnitude fica negativa (ex.: floor(log10(2.5))=0),
    // o que apenas encolhe a potência de 10 do termo injetado, sem gerar
    // -Infinity/NaN. Só poderMultiplicado <= 0 (nunca > 0) cai no ramo `else`.
    it('poderMultiplicado fracionário (0 < x < 1 ANTES do multiplicador de Ascensão) usa o ramo do logaritmo normalmente', () => {
        // Poder_Base = (vida*10)/6 com vida=0.3 => 0.5. multiplicadorAscensao = 2^4 = 16
        // (ascensaoBase=4, sem overflow) -> poderMultiplicado = 0.5*16 = 8 (>0, ramo do log).
        // magnitude = floor(log10(8)) = 0
        // poderComAscensao = 8 + ascensaoGeralEfetiva(4) * 10^(0+1) = 8 + 40 = 48.
        const ficha = fichaMinimaScouter({
            vida: { base: 0.3 },
            ascensaoBase: 4,
        });
        montarMockUseStoreReativo(ficha);
        render(<MarcadosPanel />);

        const leitura = lerPoderGlobalExibido();
        expect(leitura).toBe(48);
    });

    it('poderMultiplicado = 0 (todos os atributos zerados) usa o ramo else do failsafe: ascensaoSegura*10 + poderMultiplicado, sem tocar Math.log10', () => {
        // Nenhum atributo com valor -> Poder_Base = 0 -> poderMultiplicado = 0 (não
        // entra no ramo do log, que daria Math.log10(0) = -Infinity).
        // poderComAscensao = ascensaoGeralEfetiva(4) * 10 + 0 = 40.
        const ficha = fichaMinimaScouter({ ascensaoBase: 4 });
        montarMockUseStoreReativo(ficha);
        render(<MarcadosPanel />);

        const leitura = lerPoderGlobalExibido();
        expect(leitura).toBe(40);
    });
});

describe('MarcadosPanel — Página 2: lista de atributos (Força/Destreza/...) usa fatorAtributosBase (eixo STATUS), não o gargalo fatorCrescimentoBase (Radar)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        window.alert = vi.fn();
    });

    afterEach(() => {
        cleanup();
    });

    it('com vida/mana/aura/chakra/corpo travados em 0 (gargalo do fator antigo = 1) e Status com overflow próprio (via statusPrestigioAplicado) + multiplicadorForcaAscensao > 1, a lista de atributos escala pelo fator do eixo STATUS, não pelo gargalo', () => {
        // ascensaoBase = 1, multiplicadorForcaAscensao = 3. O Rank/Ascensão do
        // eixo STATUS agora vem de ficha.statusPrestigioAplicado (Prestígio
        // REALMENTE concedido via o campo editável "STATUS"), não mais da
        // média ao vivo dos 8 atributos físicos — então a ficha de teste
        // define esse campo com o valor equivalente ao que a média dos 8
        // atributos (400.000 cada) representaria:
        //   prestigioBruto(status) = floor((400000/1000)) = 400  =>  statusPrestigioAplicado = 400
        //   ascensaoBaseEfetiva = 1 * 3 = 3
        //   bonusAscensao(status) = floor(400/100) = 4  =>  ascensaoFinal = 7
        //   fatorAtributosBase (NOVO, só status) = 7 / 1 = 7
        //
        // Os 8 atributos físicos continuam com `base: 400.000` cada só para
        // verificar que a lista de atributos exibidos escala pelo fator do
        // eixo STATUS (derivado de statusPrestigioAplicado) e não pela média
        // ao vivo desses mesmos atributos.
        //
        // Enquanto isso, vida/mana/aura/chakra/corpo (base 0) têm
        // ascensaoFinal = ascensaoBaseEfetiva = 3 cada, então bonus = 0 em
        // TODAS elas -> nivelCompletos = min(0,0,0,0,0,4) = 0 ->
        //   fatorCrescimentoBase (ANTIGO, gargalo/Radar) = (1+0)*3 / 1 = 3
        //
        // Fatores diferentes (7 vs 3): a lista de atributos deve refletir o
        // fator NOVO (7), não o antigo (3).
        const statusVal = 400000;
        const ficha = fichaMinimaScouter({
            forca: { base: statusVal },
            destreza: { base: statusVal },
            inteligencia: { base: statusVal },
            sabedoria: { base: statusVal },
            energiaEsp: { base: statusVal },
            carisma: { base: statusVal },
            stamina: { base: statusVal },
            constituicao: { base: statusVal },
            statusPrestigioAplicado: 400,
            ascensaoBase: 1,
            multiplicadorForcaAscensao: 3,
            multiplicadorForcaPrestigio: 1,
        });
        montarMockUseStoreReativo(ficha);
        render(<MarcadosPanel />);

        fireEvent.click(screen.getByText('Próxima ⮞'));

        // Valor esperado com o fator NOVO (status-only): floor(400000 * 7) = 2.800.000
        const valorEsperadoNovoFator = (400000 * 7).toLocaleString('pt-BR');
        // Valor que apareceria se ainda estivesse usando o gargalo ANTIGO: floor(400000 * 3) = 1.200.000
        const valorGargaloAntigo = (400000 * 3).toLocaleString('pt-BR');

        const camposComNovoFator = screen.getAllByDisplayValue(valorEsperadoNovoFator);
        // Um input de "Base" por atributo físico (Força, Destreza, Inteligência,
        // Sabedoria, Energia Espiritual, Carisma, Stamina, Constituição) = 8.
        expect(camposComNovoFator.length).toBe(8);

        expect(screen.queryAllByDisplayValue(valorGargaloAntigo).length).toBe(0);
    });
});

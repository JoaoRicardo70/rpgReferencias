// Nota: onde o teste só precisa variar a Ascensão Geral (expoente do Poder), ela é variada por
// multiplicadorForcaAscensao — uma Ascensão Base > 1 agora também repõe a Base de Prestígio
// equivalente (core/poder.js > getBaseEquivalenteAscensao), o que mudaria o poderBase esperado.
import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MarcadosPanel from './Marcados';
import useStore from '../../stores/useStore';
import { ESCALA_PODER_CALCULADO } from '../../core/poder.js';

// ---------------------------------------------------------------------------
// QA — Correção "Ascensão como Multiplicador Real" no useMemo de poderGlobal
// (Marcados.jsx).
//
// Bug reportado (via prints do usuário): um personagem com Ascensão Geral
// Efetiva MUITO maior lia um Poder do Scouter MENOR que outro com Ascensão
// bem menor mas atributos crus muito maiores — porque a Ascensão só entrava
// no cálculo via a "injeção de magnitude" (log10, "+1 casa decimal"), nunca
// como multiplicador de verdade, então não conseguia compensar uma lacuna
// grande na ORDEM DE GRANDEZA dos atributos crus entre os dois personagens
// (a injeção de um personagem escala com a MAGNITUDE DELE PRÓPRIO, não com
// a do rival — um personagem com atributos muito maiores automaticamente
// injeta um termo muito maior mesmo com Ascensão baixa).
//
// A correção introduz:
//   multiplicadorAscensao = Math.pow(BASE, Math.max(0, ascensaoSegura))
//   poderMultiplicado = poderBase * multiplicadorAscensao * glob.finalF * glob.totalDano
// aplicado ANTES da injeção de magnitude (que continua por cima, inalterada,
// como "flourish" visual, não mais a única fonte do efeito da Ascensão).
// (Uma primeira versão usava um multiplicador LINEAR, 1+ascensaoSegura — mas
// verificado com os dois personagens reais reportados pelo usuário, o linear
// não bastava: x2 vs x5 não superava uma vantagem de ~4.7x nos atributos
// crus do personagem de Ascensão menor. A versão EXPONENCIAL resolve isso —
// ver Teste 1.)
//
// 🔥 CURVA DO PODER (opção "E" + base 1,1, pedido do usuário): base do
// expoente reduzida de 2 -> 1.5 -> 1.25 -> 1.1 — o crescimento exponencial da Ascensão sobre o
// Poder Calculado estava "bastante considerável" demais na prática, mesmo já em 1.25 — a
// mecânica continua exponencial (Ascensão ainda domina qualquer disputa de Poder dado
// vantagem suficiente, ver Teste 1 abaixo), só a curva ficou ainda menos brusca. Junto com a
// base do expoente, MAIS DOIS pesos mudaram: (1) o Poder Base bruto agora é
// amortecido por poderBase^0,9 (amortecerPoderBruto) ANTES de qualquer multiplicador; (2) a
// "injeção de Ascensão" deixou de ser a soma de magnitude (log10, "+1 casa decimal") e virou
// um multiplicador suave: Poder × (1 + Ascensão) (injetarAscensaoNoPoder).
// O Math.max(0, ...) protege o multiplicador exponencial: uma Ascensão negativa (ascensaoBase
// ou multiplicadorForcaAscensao negativos, digitados por engano — campos sem `min` na UI) não
// pode virar um expoente negativo (fração) que reduziria o Poder Base ao invés de mantê-lo
// neutro.
// 🔥 A NOVA injeção suave (injetarAscensaoNoPoder) também usa Math.max(0, ascensao) quando
// poderMultiplicado > 0 — ao contrário da injeção antiga por magnitude, que usava
// `ascensaoSegura` SEM clamp ali. Isso significa que, com poderMultiplicado > 0, uma Ascensão
// negativa não reduz mais nem o multiplicador nem a injeção (os dois ficam presos em "sem
// efeito"); só o ramo `else` (poderMultiplicado <= 0) continua usando `ascensaoSegura` sem
// clamp — ver Teste 3 abaixo.
//
// 🔽 ESCALA (core/poder.js): Poder Calculado é dividido por ESCALA_PODER_CALCULADO no fim do
// pipeline (aplicarEscalaPoderCalculado) — o valor já mudou de 1 (sem escala) -> 1000 ->
// 100.000 em pedidos sucessivos do usuário. Este arquivo deriva TODAS as leituras esperadas de
// ESCALA_PODER_CALCULADO (importado direto de core/poder.js) via exibirPoder(), a partir dos
// valores "poderComAscensao" EXATOS (pré-escala, PODER_COM_ASCENSAO_* abaixo, conferidos em
// Node) — uma futura mudança de escala só exige rodar os testes de novo, não reescrever cada
// valor.
function escalarPoder(valorBruto) {
    return Math.floor(valorBruto / ESCALA_PODER_CALCULADO);
}
function exibirPoder(valorBruto) {
    return Number(Number(escalarPoder(valorBruto)).toExponential(2));
}
//
// Nenhuma das funções internas (calcPoderBase, getGlobalMultipliers) é
// exportada — validamos renderizando o MarcadosPanel real e lendo a leitura
// auxiliar em notação científica do Scouter, mesmo padrão de
// Marcados.scouterFormulaAscensao.test.jsx. Todos os valores abaixo foram
// conferidos batendo a fórmula exata em Node (via os helpers exportados de
// core/poder.js) antes de escrever as asserções — nenhum valor é aproximado.
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    uploadImagem: vi.fn(),
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
}));

// Ficha minimalista com TODAS as 6 categorias (vida/mana/aura/chakra/corpo/
// status) zeradas por padrão — mesmo helper de
// Marcados.scouterFormulaAscensao.test.jsx. Manter as outras 5 categorias
// zeradas (mesmo quando Vida sozinha é grande o bastante para gerar overflow
// de prestígio) é o que trava nivelCompletos em 0 no useMemo de
// ascensaoGeralEfetiva: o "gargalo" é um Math.min(...) entre as 6
// categorias, então basta UMA categoria zerada para zerar o bônus de
// overflow inteiro, mantendo ascensaoGeralEfetiva presa em
// (ascensaoBase * multiplicadorForcaAscensao) — sem nenhum "bônus fantasma"
// de overflow contaminando os valores hand-computed abaixo.
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
// recalcule em um re-render normal via `rerender()` (mesmo padrão de
// Marcados.scouterFormulaAscensao.test.jsx).
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

// Mock não-reativo, para casos que não precisam de rerender() — mesmo
// padrão de Marcados.scouterAgrupamento.test.jsx.
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
// (ex: "1.20E11") — único texto do componente que casa com esse padrão.
function lerPoderGlobalExibido() {
    const span = screen.getByText((_, el) => el?.tagName === 'SPAN' && /^-?\d+(\.\d+)?E-?\d+$/.test(el.textContent || ''));
    return Number(span.textContent);
}

describe('MarcadosPanel — Ascensão como multiplicador real: corrige o bug reportado (Ascensão alta perdendo de investimento bruto grande)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        window.alert = vi.fn();
    });

    afterEach(() => {
        cleanup();
    });

    // Personagem A: Ascensão MODESTA (ascensaoBase=1, padrão — sem overflow,
    // já que as outras 5 categorias ficam zeradas), mas investimento bruto
    // GRANDE em Vida (peso x10 na fórmula do Poder Base).
    //   🔥 divisores.vida MINÚSCULO: Vida (6e9) sozinha é grande o bastante pra gerar
    //   overflow real de Prestígio (pAtual=6000 >> 100), e a média das 6 categorias (ver
    //   core/poder.js, comentário "🔥 CORREÇÃO") faz esse overflow SOZINHO contar pro bônus
    //   geral — antes, só contava se TODAS as 6 categorias overflowassem. `divisores.vida`
    //   multiplica pAtual (não poderBase, que usa o valor bruto de `base` diretamente) — um
    //   divisor minúsculo (1e-12) zera pAtual e neutraliza esse overflow.
    //   Poder_Base_A = (6.000.000.000*10)/6 = 1e10, amortecido (^0,9) = 1e9
    //   multiplicadorAscensao_A = 1.1^1 = 1.1 -> poderMultiplicado_A = 1e9*1.1 = 1,1e9
    //   injeção suave ×(1+1) -> poderComAscensao_A = 2,2e9 (PODER_COM_ASCENSAO_A, valor
    //   EXATO conferido em Node)
    //
    // Personagem B: Ascensão bem MAIOR (ascensaoBase=99 — 99x a de A), mas
    // investimento bruto bem MENOR em Vida (100x menor que A) — pequeno o
    // bastante (pAtual=60 < 100) pra não precisar de divisores.vida.
    //   Poder_Base_B = (60.000.000*10)/6 = 1e8, amortecido (^0,9) ≈ 15.848.931,92
    //   multiplicadorAscensao_B(mfa99) = 1.1^99 ≈ 12.527,83 -> poderMultiplicado ≈
    //   198.552.715.321,18 (aproximado) -> injeção suave ×(1+99)=×100 -> poderComAscensao ≈
    //   19.855.271.532.118,29 (PODER_COM_ASCENSAO_B_MFA99, valor EXATO conferido em Node)
    //   multiplicadorAscensao_B(asc1, sem mfa) = 1.1^1 = 1.1 -> poderComAscensao ≈
    //   34.867.650,23 (PODER_COM_ASCENSAO_B_ASC1, valor EXATO conferido em Node)
    //
    // Sob a fórmula ANTIGA (Ascensão só entrando via injeção de log10, sem
    // multiplicador — poderMultiplicado = Poder_Base, sem *multiplicadorAscensao, sem
    // amortecimento, sem escala): A_antigo = 1e10 + 1*10^11 = 1.1e11 = 110.000.000.000;
    // B_antigo = 1e8 + 99*10^9 = 9.91e10 = 99.100.000.000 — A_antigo (110B) >
    // B_antigo (99,1B), o BUG original: B tinha 99x mais Ascensão que A e ainda
    // assim lia MENOS, porque a injeção de B fica presa na magnitude do PRÓPRIO
    // poder base de B (bem menor que o de A).
    // Sob a fórmula ATUAL, B continua superando A por uma margem grande — a Ascensão 99x
    // maior de B continua dominando, mesmo com a base do expoente reduzida sucessivas vezes
    // (a margem em si encolheu bastante frente às bases anteriores — é exatamente o efeito
    // pretendido pela redução: menos "explosivo", mas ainda longe de virar irrelevante; a
    // escala divide os dois lados igualmente, então não afeta essa margem).
    const PODER_COM_ASCENSAO_A = 2200000000;
    const PODER_COM_ASCENSAO_B_MFA99 = 19855271532118.285;
    const PODER_COM_ASCENSAO_B_ASC1 = 34867650.23414452;

    it('Personagem B (Ascensão 99x maior, atributos 100x menores) agora supera o Personagem A (Ascensão modesta, atributos brutos enormes) — o bug reportado está corrigido', () => {
        montarMockUseStoreReativo(fichaMinimaScouter({ vida: { base: 6000000000 }, ascensaoBase: 1, divisores: { vida: 0.000000000001 } }));
        const { unmount } = render(<MarcadosPanel />);
        const leituraA = lerPoderGlobalExibido();
        unmount();

        montarMockUseStoreReativo(fichaMinimaScouter({ vida: { base: 60000000 }, multiplicadorForcaAscensao: 99 }));
        render(<MarcadosPanel />);
        const leituraB = lerPoderGlobalExibido();

        expect(leituraA).toBe(exibirPoder(PODER_COM_ASCENSAO_A));
        expect(leituraB).toBe(exibirPoder(PODER_COM_ASCENSAO_B_MFA99));
        expect(leituraB).toBeGreaterThan(leituraA);
    });

    // Prova qualitativa complementar: com os atributos do Personagem B
    // travados (vida=60.000.000, Poder_Base_B=1e8, igual ao teste acima),
    // aumentar SOMENTE a Ascensão Geral Efetiva de B (via ascensaoBase, de 1
    // para 99) vira a comparação de "B perde de A" para "B vence A" — a
    // mesma inversão do teste anterior, mas agora observada como uma
    // transição reativa (rerender) na MESMA instância de componente, isolando
    // a Ascensão como a única variável que mudou.
    it('aumentar SOMENTE a Ascensão Geral Efetiva do Personagem B (atributos fixos) inverte a comparação de B<A para B>A', () => {
        montarMockUseStoreReativo(fichaMinimaScouter({ vida: { base: 6000000000 }, ascensaoBase: 1, divisores: { vida: 0.000000000001 } }));
        const { unmount } = render(<MarcadosPanel />);
        const leituraA = lerPoderGlobalExibido();
        unmount();

        const mockB = montarMockUseStoreReativo(fichaMinimaScouter({ vida: { base: 60000000 }, ascensaoBase: 1 }));
        const { rerender } = render(<MarcadosPanel />);
        const leituraB_antes = lerPoderGlobalExibido();
        expect(leituraB_antes).toBe(exibirPoder(PODER_COM_ASCENSAO_B_ASC1));
        expect(leituraB_antes).toBeLessThan(leituraA);

        mockB.updateFicha((f) => { f.multiplicadorForcaAscensao = 99; });
        rerender(<MarcadosPanel />);
        const leituraB_depois = lerPoderGlobalExibido();
        expect(leituraB_depois).toBe(exibirPoder(PODER_COM_ASCENSAO_B_MFA99));
        expect(leituraB_depois).toBeGreaterThan(leituraA);
    });
});

describe('MarcadosPanel — multiplicadorAscensao (1.1^ascensaoSegura) é um multiplicador exponencial real do Poder Base', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        window.alert = vi.fn();
    });

    afterEach(() => {
        cleanup();
    });

    // Mesma ficha base (vida=60.000.000.000 -> Poder_Base=1e11, amortecido (^0,9) ≈
    // 7.943.282.347,24, glob.finalF=glob.totalDano=1 em ambos os casos), variando SÓ
    // ascensaoBase entre 2 e 5:
    //   ascensaoBase=2: poderComAscensao ≈ 28.834.114.920,49 (PODER_COM_ASCENSAO_ASC2)
    //   ascensaoBase=5: poderComAscensao ≈ 76.756.413.918,35 (PODER_COM_ASCENSAO_ASC5)
    // 🔽 vida bumped em sessões sucessivas (600.000 -> 600.000.000 -> 60.000.000.000,
    // acompanhando os aumentos de ESCALA_PODER_CALCULADO) pra manter dígitos suficientes
    // depois da divisão.
    // 🔥 divisores.vida MINÚSCULO (necessário por causa do bump): vida=60.000.000.000
    // sozinha já é grande o bastante pra gerar overflow real de Prestígio, que a média das 6
    // categorias (ver core/poder.js, comentário "🔥 CORREÇÃO") injetaria como um bônus extra
    // em ascensaoGeralEfetiva ALÉM do ascensaoBase puro — contaminando a comparação de
    // exponente isolado que este teste quer fazer. O divisor minúsculo (1e-12) neutraliza
    // esse overflow, preservando ascensaoGeralEfetiva=mfa exato.
    // A razão entre os dois multiplicadores é EXATAMENTE 1.1^5/1.1^2 = 1.1^3 = 1,331, e
    // o poderMultiplicado (pré-injeção) escala pela MESMA razão exata — prova que o
    // multiplicador é exponencial de verdade (não uma injeção de dígito). (A leitura final
    // não escala por exatamente essa razão porque a injeção suave ×(1+Ascensão) multiplica
    // por um fator DIFERENTE em cada caso — ×3 vs ×6 —, não porque haja qualquer "soma de
    // magnitude" residual como na fórmula antiga.)
    const PODER_COM_ASCENSAO_ASC2 = 28834114920.49144;
    const PODER_COM_ASCENSAO_ASC5 = 76756413918.34824;

    it('ascensaoGeralEfetiva=2 vs ascensaoGeralEfetiva=5 na mesma ficha: poderMultiplicado escala exatamente por 1.1^5/1.1^2=1,331', () => {
        montarMockUseStoreReativo(fichaMinimaScouter({ vida: { base: 60000000000 }, multiplicadorForcaAscensao: 2, divisores: { vida: 0.000000000001 } }));
        const { unmount } = render(<MarcadosPanel />);
        const leitura2 = lerPoderGlobalExibido();
        unmount();

        montarMockUseStoreReativo(fichaMinimaScouter({ vida: { base: 60000000000 }, multiplicadorForcaAscensao: 5, divisores: { vida: 0.000000000001 } }));
        render(<MarcadosPanel />);
        const leitura5 = lerPoderGlobalExibido();

        expect(leitura2).toBe(exibirPoder(PODER_COM_ASCENSAO_ASC2));
        expect(leitura5).toBe(exibirPoder(PODER_COM_ASCENSAO_ASC5));
        expect(leitura5).toBeGreaterThan(leitura2);
    });
});

describe('MarcadosPanel — Math.max(0, ascensaoSegura) protege o multiplicador SEMPRE, e também a injeção suave quando poderMultiplicado > 0', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        window.alert = vi.fn();
    });

    afterEach(() => {
        cleanup();
    });

    // ascensaoBase=-5 com multiplicadorForcaAscensao=0.01 (campo numérico livre, sem `min` na
    // UI) produz ascensaoGeralEfetiva = -5*0.01 = -0.05.
    //   multiplicadorAscensao = 1.1^Math.max(0, ascensaoSegura) = 1.1^0 = 1  <- CLAMPADO para 1
    //   poderMultiplicado = poderBase_amortecido * 1 (> 0)
    //   injeção suave: poderMultiplicado * (1 + Math.max(0, ascensaoSegura)) = poderMultiplicado
    //   * 1 (a injeção TAMBÉM fica clampada em "sem efeito" aqui, ao contrário da fórmula
    //   antiga) -> poderComAscensao = poderBase_amortecido ≈ 8.654.727.864,16
    //   (PODER_COM_ASCENSAO_CLAMP_MODESTO, valor EXATO conferido em Node).
    // 🔽 vida bumped em sessões sucessivas (660.000 -> 660.000.000 -> 66.000.000.000,
    // acompanhando os aumentos de ESCALA_PODER_CALCULADO) pra manter dígitos suficientes
    // depois da divisão.
    // 🔥 divisores.vida MINÚSCULO (necessário por causa do bump acima): ao contrário do bump
    // anterior (660.000.000), vida=66.000.000.000 já é grande o bastante pra gerar um overflow
    // de Prestígio grande o bastante pra virar o SINAL de ascensaoGeralEfetiva (de -0,05 pra
    // ≈+1,05 pela média das 6 categorias — ver core/poder.js, comentário "🔥 CORREÇÃO"), o que
    // mudaria completamente o cenário que este teste quer cobrir (Ascensão continua NEGATIVA
    // mesmo com o overflow). O divisor minúsculo (1e-12) neutraliza esse overflow, preservando
    // ascensaoGeralEfetiva=-0,05 exato.
    const PODER_COM_ASCENSAO_CLAMP_MODESTO = 8654727864.1645;

    it('Ascensão negativa modesta: com poderMultiplicado > 0, NEM o multiplicador NEM a injeção reduzem o Poder — leitura final continua positiva e finita', () => {
        const ficha = fichaMinimaScouter({
            vida: { base: 66000000000 },
            divisores: { vida: 0.000000000001 },
            ascensaoBase: -5,
            multiplicadorForcaAscensao: 0.01,
        });
        montarMockUseStore(ficha);
        render(<MarcadosPanel />);

        const leitura = lerPoderGlobalExibido();
        expect(leitura).toBe(exibirPoder(PODER_COM_ASCENSAO_CLAMP_MODESTO));
        expect(Number.isFinite(leitura)).toBe(true);
        expect(leitura).toBeGreaterThanOrEqual(0);
    });

    // Documenta explicitamente o limite do clamp: com TODOS os atributos
    // zerados (Poder_Base=0 -> poderMultiplicado=0, que NÃO é > 0, cai no ramo `else` de
    // injetarAscensaoNoPoder), a fórmula é:
    //   multiplicadorAscensao = 1.1^Math.max(0, ascensaoSegura) = 1.1^0 = 1 (clampado, mas
    //   como poderMultiplicado = Poder_Base(0) * 1 = 0 de qualquer forma, o clamp não tem
    //   efeito prático aqui)
    //   poderComAscensao = ascensaoSegura*10 + poderMultiplicado = ascensaoSegura*10
    // 🔽 ascensaoBase derivado de ESCALA_PODER_CALCULADO nesta sessão: pra que
    // poderComAscensao=ascensaoSegura*10 sobreviva à escala com um valor exato e
    // determinístico SEJA QUAL FOR o tamanho de ESCALA_PODER_CALCULADO, ascensaoBase é
    // escolhida como -(ESCALA_PODER_CALCULADO*100), garantindo poderComAscensao =
    // -(ESCALA*1000) -> escalarPoder(...) = -1000 * ... na verdade floor(-(ESCALA*1000)/ESCALA)
    // = -1000 SEMPRE.
    // A leitura final NEGATIVA prova, com um valor exato e determinístico, que o clamp
    // (Math.max(0, ...)) SÓ deixa de proteger o resultado final no ramo `else`
    // (poderMultiplicado <= 0), que continua usando `ascensaoSegura` sem clamp — exatamente
    // como o comentário no código-fonte descreve. Isso não é uma regressão: é o
    // comportamento documentado e deliberado (o clamp existe para o multiplicador/injeção
    // não inverterem o sinal do cálculo quando há Poder Base real, não para blindar 100%
    // contra Ascensões negativas extremas quando não há Poder Base nenhum).
    const ASCENSAO_BASE_DOC_ZERO = -(ESCALA_PODER_CALCULADO * 100);
    const PODER_COM_ASCENSAO_DOC_ZERO = ASCENSAO_BASE_DOC_ZERO * 10;

    it('[documentação] com Poder Base zerado, uma Ascensão negativa extrema ainda produz leitura negativa exata via o ramo `else` (não-clampado) — só o multiplicador é protegido', () => {
        const ficha = fichaMinimaScouter({ ascensaoBase: ASCENSAO_BASE_DOC_ZERO });
        montarMockUseStore(ficha);
        render(<MarcadosPanel />);

        const leitura = lerPoderGlobalExibido();
        expect(leitura).toBe(exibirPoder(PODER_COM_ASCENSAO_DOC_ZERO));
        expect(leitura).toBeLessThan(0);
        expect(Number.isNaN(leitura)).toBe(false);
    });
});

describe('MarcadosPanel — multiplicadorAscensao compõe multiplicativamente com glob.finalF (Formas) e glob.totalDano (mgeral)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        window.alert = vi.fn();
    });

    afterEach(() => {
        cleanup();
    });

    // Ficha com vida=60.000.000.000 (Poder_Base=1e11, amortecido (^0,9) ≈ 7.943.282.347,24),
    // ascensaoBase=3, forma ativa em Vida (vida.mFormas=2, campo ESTÁTICO, fora
    // do Grimório — soma (2-1)=1 ao grupo MFORMAS -> glob.finalF=1+1=2). O
    // buff MGERAL:+5 vem de ficha.poderes (Grimório), que agora é IGNORADO
    // pelo cálculo do Scouter (ver Marcados.scouterFormaReatividade.test.jsx)
    // -> glob.totalDano fica em 1 (finalB=finalG=finalA=finalUni=1, sem mais
    // nenhuma fonte).
    // 🔽 vida bumped em sessões sucessivas (600.000 -> 600.000.000 -> 60.000.000.000,
    // acompanhando os aumentos de ESCALA_PODER_CALCULADO) pra manter dígitos suficientes
    // depois da divisão — e divisores.vida MINÚSCULO (1e-12) adicionado pela mesma razão dos
    // outros testes deste arquivo.
    //   multiplicadorAscensao = 1.1^3 = 1,331 -> poderComAscensao ≈ 84.580.070.433,44
    //   (PODER_COM_ASCENSAO_COMBINADO, valor EXATO conferido em Node)
    //
    // Comparado com a MESMA ficha mas ascensaoBase=1 (multiplicadorAscensao=1.1^1=1.1,
    // 1/1,21 do valor acima), com a Forma estática inalterada:
    //   poderComAscensao_baseline ≈ 34.950.442.327,87 (PODER_COM_ASCENSAO_BASELINE_FORMA)
    // poderMultiplicado escala EXATAMENTE pela mesma razão de multiplicadorAscensao
    // (1.1^3/1.1^1=1.1^2=1,21) — prova que o multiplicador de Ascensão se combina
    // multiplicativamente com finalF (que ficou fixo em 2 nos dois casos), em vez de
    // interferir ou ser sobrescrito por ele. O buff MGERAL do Grimório fica de fora da conta
    // nos dois casos (totalDano=1), confirmando a exclusão do Grimório do cálculo do Scouter.
    const PODER_COM_ASCENSAO_BASELINE_FORMA = 34950442327.86841;
    const PODER_COM_ASCENSAO_COMBINADO = 84580070433.44157;

    it('combina Ascensão (multiplicadorAscensao=1,331) com Forma estática ativa (finalF=2); o buff MGERAL:+5 do Grimório é ignorado', () => {
        const fichaBase = () => fichaMinimaScouter({
            vida: { base: 60000000000, mFormas: 2 },
            divisores: { vida: 0.000000000001 },
            poderes: [{ nome: 'Buff Geral', ativa: true, efeitos: [{ atributo: 'geral', propriedade: 'mgeral', valor: 5 }] }],
        });

        montarMockUseStoreReativo({ ...fichaBase(), ascensaoBase: 1 });
        const { unmount } = render(<MarcadosPanel />);
        const leituraBaseline = lerPoderGlobalExibido();
        unmount();

        montarMockUseStoreReativo({ ...fichaBase(), multiplicadorForcaAscensao: 3 });
        render(<MarcadosPanel />);
        const leituraCombinada = lerPoderGlobalExibido();

        expect(leituraBaseline).toBe(exibirPoder(PODER_COM_ASCENSAO_BASELINE_FORMA));
        expect(leituraCombinada).toBe(exibirPoder(PODER_COM_ASCENSAO_COMBINADO));
        expect(leituraCombinada).toBeGreaterThan(leituraBaseline);
    });
});

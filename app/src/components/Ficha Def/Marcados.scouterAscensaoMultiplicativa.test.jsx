// Nota: onde o teste só precisa variar a Ascensão Geral (expoente do Poder), ela é variada por
// multiplicadorForcaAscensao — uma Ascensão Base > 1 agora também repõe a Base de Prestígio
// equivalente (core/poder.js > getBaseEquivalenteAscensao), o que mudaria o poderBase esperado.
import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MarcadosPanel from './Marcados';
import useStore from '../../stores/useStore';

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
// 🔥 CURVA DO PODER (opção "E" + base 1,1, pedido do usuário, sessão mais recente): base do
// expoente reduzida de 2 -> 1.5 -> 1.25 -> 1.1 — o crescimento exponencial da Ascensão sobre o
// Poder Calculado estava "bastante considerável" demais na prática, mesmo já em 1.25 — a
// mecânica continua exponencial (Ascensão ainda domina qualquer disputa de Poder dado
// vantagem suficiente, ver Teste 1 abaixo), só a curva ficou ainda menos brusca. Junto com a
// base do expoente, MAIS DOIS pesos mudaram nesta sessão: (1) o Poder Base bruto agora é
// amortecido por poderBase^0,9 (amortecerPoderBruto) ANTES de qualquer multiplicador; (2) a
// "injeção de Ascensão" deixou de ser a soma de magnitude (log10, "+1 casa decimal") e virou
// um multiplicador suave: Poder × (1 + Ascensão) (injetarAscensaoNoPoder). Todos os valores
// hand-computed deste arquivo foram recalculados com essa curva (helpers exportados de
// core/poder.js: amortecerPoderBruto, getMultiplicadorAscensaoPoder, injetarAscensaoNoPoder).
// O Math.max(0, ...) protege o multiplicador exponencial: uma Ascensão negativa (ascensaoBase
// ou multiplicadorForcaAscensao negativos, digitados por engano — campos sem `min` na UI) não
// pode virar um expoente negativo (fração) que reduziria o Poder Base ao invés de mantê-lo
// neutro.
// 🔥 Mudança de comportamento desta sessão: a NOVA injeção suave (injetarAscensaoNoPoder)
// também usa Math.max(0, ascensao) quando poderMultiplicado > 0 — ao contrário da injeção
// antiga por magnitude, que usava `ascensaoSegura` SEM clamp ali. Isso significa que, com
// poderMultiplicado > 0, uma Ascensão negativa não reduz mais nem o multiplicador nem a
// injeção (os dois ficam presos em "sem efeito"); só o ramo `else` (poderMultiplicado <= 0)
// continua usando `ascensaoSegura` sem clamp — ver Teste 3 abaixo.
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
    //   🔥 divisores.vida MINÚSCULO (correção de uma sessão anterior): Vida (6e9) sozinha
    //   é grande o bastante pra gerar overflow real de Prestígio (pAtual=6000
    //   >> 100), e a sessão que trocou nivelCompletos de Math.min(...) pela
    //   MÉDIA das 6 categorias (ver core/poder.js/Marcados.jsx, comentário "🔥
    //   CORREÇÃO") faz esse overflow SOZINHO contar pro bônus geral — antes,
    //   só contava se TODAS as 6 categorias overflowassem. `divisores.vida`
    //   multiplica pAtual (não poderBase, que usa o valor bruto de `base`
    //   diretamente) — um divisor minúsculo (1e-12) zera pAtual e neutraliza
    //   esse overflow, preservando o Poder Base (e portanto os valores
    //   hand-computed abaixo) exatamente como antes dessa sessão.
    //   Poder_Base_A = (6.000.000.000*10)/6 = 1e10, amortecido (^0,9) = 1e9
    //   multiplicadorAscensao_A = 1.1^1 = 1.1
    //   poderMultiplicado_A = 1e9 * 1.1 = 1,1e9
    //   injeção suave ×(1+1) -> poderComAscensao_A = 2,2e9, exibido 2.200.000.000
    //
    // Personagem B: Ascensão bem MAIOR (ascensaoBase=99 — 99x a de A), mas
    // investimento bruto bem MENOR em Vida (100x menor que A) — pequeno o
    // bastante (pAtual=60 < 100) pra não precisar de divisores.vida.
    //   Poder_Base_B = (60.000.000*10)/6 = 1e8, amortecido (^0,9) ≈ 15.848.931,92
    //   multiplicadorAscensao_B = 1.1^99 ≈ 12.527,83
    //   poderMultiplicado_B ≈ 15.848.931,92 * 12.527,83 ≈ 198.552.715.321,18
    //   injeção suave ×(1+99)=×100 -> poderComAscensao_B ≈ 19.855.271.532.118,29,
    //   que a leitura do Scouter (toExponential(2)) arredonda para 1.99E13
    //
    // Sob a fórmula ANTIGA (Ascensão só entrando via injeção de log10, sem
    // multiplicador — poderMultiplicado = Poder_Base, sem *multiplicadorAscensao, sem
    // amortecimento): A_antigo = 1e10 + 1*10^11 = 1.1e11 = 110.000.000.000;
    // B_antigo = 1e8 + 99*10^9 = 9.91e10 = 99.100.000.000 — A_antigo (110B) >
    // B_antigo (99,1B), o BUG original: B tinha 99x mais Ascensão que A e ainda
    // assim lia MENOS, porque a injeção de B fica presa na magnitude do PRÓPRIO
    // poder base de B (bem menor que o de A).
    // Sob a fórmula ATUAL (multiplicador exponencial, BASE=1.1, com amortecimento e
    // injeção suave), B (≈1,99e13) > A (2,2 bilhões) por uma margem grande (≈9000x) — a
    // Ascensão 99x maior de B continua dominando, mesmo com a base do expoente reduzida
    // sucessivas vezes (a margem em si encolheu bastante frente às bases anteriores — é
    // exatamente o efeito pretendido pela redução: menos "explosivo", mas ainda longe de
    // virar irrelevante).
    it('Personagem B (Ascensão 99x maior, atributos 100x menores) agora supera o Personagem A (Ascensão modesta, atributos brutos enormes) — o bug reportado está corrigido', () => {
        montarMockUseStoreReativo(fichaMinimaScouter({ vida: { base: 6000000000 }, ascensaoBase: 1, divisores: { vida: 0.000000000001 } }));
        const { unmount } = render(<MarcadosPanel />);
        const leituraA = lerPoderGlobalExibido();
        unmount();

        montarMockUseStoreReativo(fichaMinimaScouter({ vida: { base: 60000000 }, multiplicadorForcaAscensao: 99 }));
        render(<MarcadosPanel />);
        const leituraB = lerPoderGlobalExibido();

        expect(leituraA).toBe(2200000000);
        expect(leituraB).toBe(1.99e13);
        expect(leituraB).toBeGreaterThan(leituraA);
    });

    // Prova qualitativa complementar: com os atributos do Personagem B
    // travados (vida=60.000.000, Poder_Base_B=1e8, igual ao teste acima),
    // aumentar SOMENTE a Ascensão Geral Efetiva de B (via ascensaoBase, de 1
    // para 99) vira a comparação de "B perde de A" para "B vence A" — a
    // mesma inversão do teste anterior, mas agora observada como uma
    // transição reativa (rerender) na MESMA instância de componente, isolando
    // a Ascensão como a única variável que mudou.
    //   B com ascensaoBase=1: multiplicadorAscensao=1.1^1=1.1, poderMultiplicado≈15.848.931,92*1.1
    //   ≈17.433.825,11, injeção suave ×(1+1) -> poderComAscensao≈34.867.650,23, exibido
    //   34.900.000 (menor que A = 2.200.000.000).
    //   B com ascensaoBase=99 (calculado acima): ≈1,99e13 (maior que A).
    it('aumentar SOMENTE a Ascensão Geral Efetiva do Personagem B (atributos fixos) inverte a comparação de B<A para B>A', () => {
        montarMockUseStoreReativo(fichaMinimaScouter({ vida: { base: 6000000000 }, ascensaoBase: 1, divisores: { vida: 0.000000000001 } }));
        const { unmount } = render(<MarcadosPanel />);
        const leituraA = lerPoderGlobalExibido();
        unmount();

        const mockB = montarMockUseStoreReativo(fichaMinimaScouter({ vida: { base: 60000000 }, ascensaoBase: 1 }));
        const { rerender } = render(<MarcadosPanel />);
        const leituraB_antes = lerPoderGlobalExibido();
        expect(leituraB_antes).toBe(34900000);
        expect(leituraB_antes).toBeLessThan(leituraA);

        mockB.updateFicha((f) => { f.multiplicadorForcaAscensao = 99; });
        rerender(<MarcadosPanel />);
        const leituraB_depois = lerPoderGlobalExibido();
        expect(leituraB_depois).toBe(1.99e13);
        expect(leituraB_depois).toBeGreaterThan(leituraA);
    });
});

describe('MarcadosPanel — multiplicadorAscensao (1.25^ascensaoSegura) é um multiplicador exponencial real do Poder Base', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        window.alert = vi.fn();
    });

    afterEach(() => {
        cleanup();
    });

    // Mesma ficha base (vida=600.000 -> Poder_Base=1e6, amortecido (^0,9) ≈ 251.188,64,
    // glob.finalF=glob.totalDano=1 em ambos os casos), variando SÓ ascensaoBase entre 2 e 5:
    //   ascensaoBase=2: multiplicadorAscensao=1.1^2=1,21, poderMultiplicado≈251.188,64*1,21≈303.938,25
    //     injeção suave ×(1+2)=×3 -> poderComAscensao≈911.814,74, exibido 912.000
    //   ascensaoBase=5: multiplicadorAscensao=1.1^5≈1,61051, poderMultiplicado≈251.188,64*1,61051≈404.541,58
    //     injeção suave ×(1+5)=×6 -> poderComAscensao≈2.427.249,48, exibido 2.430.000
    // A razão entre os dois multiplicadores é EXATAMENTE 1.1^5/1.1^2 = 1.1^3 = 1,331, e
    // o poderMultiplicado (pré-injeção) escala pela MESMA razão exata — prova que o
    // multiplicador é exponencial de verdade (não uma injeção de dígito). (A leitura final
    // não escala por exatamente essa razão porque a injeção suave ×(1+Ascensão) multiplica
    // por um fator DIFERENTE em cada caso — ×3 vs ×6 —, não porque haja qualquer "soma de
    // magnitude" residual como na fórmula antiga.)
    it('ascensaoGeralEfetiva=2 vs ascensaoGeralEfetiva=5 na mesma ficha: poderMultiplicado escala exatamente por 1.1^5/1.1^2=1,331, refletido nas leituras finais 912.000 e 2.430.000', () => {
        montarMockUseStoreReativo(fichaMinimaScouter({ vida: { base: 600000 }, multiplicadorForcaAscensao: 2 }));
        const { unmount } = render(<MarcadosPanel />);
        const leitura2 = lerPoderGlobalExibido();
        unmount();

        montarMockUseStoreReativo(fichaMinimaScouter({ vida: { base: 600000 }, multiplicadorForcaAscensao: 5 }));
        render(<MarcadosPanel />);
        const leitura5 = lerPoderGlobalExibido();

        expect(leitura2).toBe(912000);
        expect(leitura5).toBe(2430000);
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

    // 🔥 Mudança de comportamento desta sessão: com a antiga injeção por magnitude de log10,
    // o Math.max(0, ...) protegia SÓ o multiplicador — a injeção usava `ascensaoSegura` sem
    // clamp e ainda conseguia subtrair do resultado numa Ascensão negativa. A NOVA injeção
    // suave (injetarAscensaoNoPoder) usa Math.max(0, ascensao) TAMBÉM quando poderMultiplicado
    // > 0 — então agora uma Ascensão negativa modesta não reduz mais NADA (nem o multiplicador
    // nem a injeção) enquanto o Poder Base amortecido continuar positivo.
    //
    // ascensaoBase=-5 com multiplicadorForcaAscensao=0.01 (campo numérico livre, sem `min` na
    // UI) produz ascensaoGeralEfetiva = -5*0.01 = -0.05 (sem overflow: vida=660.000 < divisor
    // 1.000.000 -> prestígio bruto=0, e as outras 5 categorias ficam zeradas — nivelCompletos
    // permanece 0).
    //   ascensaoSegura = -0.05
    //   multiplicadorAscensao = 1.1^Math.max(0, -0.05) = 1.1^0 = 1  <- CLAMPADO para 1
    //   Poder_Base = (660.000*10)/6 = 1.100.000, amortecido (^0,9) ≈ 273.686,53
    //   poderMultiplicado = 273.686,53 * 1 = 273.686,53 (> 0)
    //   injeção suave: poderMultiplicado * (1 + Math.max(0, -0.05)) = 273.686,53 * 1 =
    //   273.686,53 (a injeção TAMBÉM fica clampada em "sem efeito" aqui, ao contrário da
    //   fórmula antiga) -> poderGlobal (floor) 273.686, exibido 274.000.
    it('Ascensão negativa modesta: com poderMultiplicado > 0, NEM o multiplicador NEM a injeção reduzem o Poder — leitura final continua positiva e finita', () => {
        const ficha = fichaMinimaScouter({
            vida: { base: 660000 },
            ascensaoBase: -5,
            multiplicadorForcaAscensao: 0.01,
        });
        montarMockUseStore(ficha);
        render(<MarcadosPanel />);

        const leitura = lerPoderGlobalExibido();
        expect(leitura).toBe(274000);
        expect(Number.isFinite(leitura)).toBe(true);
        expect(leitura).toBeGreaterThanOrEqual(0);
    });

    // Documenta explicitamente o limite do clamp: com TODOS os atributos
    // zerados (Poder_Base=0 -> poderMultiplicado=0, que NÃO é > 0, cai no ramo `else` de
    // injetarAscensaoNoPoder) e ascensaoBase=-5 (multiplicador padrão=1 ->
    // ascensaoGeralEfetiva=-5 EXATO, sem clamp possível vindo do useMemo de cima), a
    // fórmula é:
    //   multiplicadorAscensao = 1.1^Math.max(0, -5) = 1.1^0 = 1 (clampado, mas
    //   como poderMultiplicado = Poder_Base(0) * 1 = 0 de qualquer forma, o
    //   clamp não tem efeito prático aqui)
    //   poderComAscensao = ascensaoSegura*10 + poderMultiplicado = -5*10+0 = -50
    // A leitura final de -50 é NEGATIVA — prova, com um valor exato e determinístico, que
    // o clamp (Math.max(0, ...)) SÓ deixa de proteger o resultado final no ramo `else`
    // (poderMultiplicado <= 0), que continua usando `ascensaoSegura` sem clamp — exatamente
    // como o comentário no código-fonte descreve. Isso não é uma regressão: é o
    // comportamento documentado e deliberado (o clamp existe para o multiplicador/injeção
    // não inverterem o sinal do cálculo quando há Poder Base real, não para blindar 100%
    // contra Ascensões negativas extremas quando não há Poder Base nenhum).
    it('[documentação] com Poder Base zerado, uma Ascensão negativa extrema ainda produz leitura negativa exata via o ramo `else` (não-clampado) — só o multiplicador é protegido', () => {
        const ficha = fichaMinimaScouter({ ascensaoBase: -5 });
        montarMockUseStore(ficha);
        render(<MarcadosPanel />);

        const leitura = lerPoderGlobalExibido();
        expect(leitura).toBe(-50);
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

    // Ficha com vida=600.000 (Poder_Base=1e6, amortecido (^0,9) ≈ 251.188,64), ascensaoBase=3
    // (sem overflow: vida=600.000 < divisor 1e6 -> prestígio bruto=0 -> ascensaoGeralEfetiva
    // = 3 exato), forma ativa em Vida (vida.mFormas=2, campo ESTÁTICO, fora
    // do Grimório — soma (2-1)=1 ao grupo MFORMAS -> glob.finalF=1+1=2). O
    // buff MGERAL:+5 vem de ficha.poderes (Grimório), que agora é IGNORADO
    // pelo cálculo do Scouter (ver Marcados.scouterFormaReatividade.test.jsx)
    // -> glob.totalDano fica em 1 (finalB=finalG=finalA=finalUni=1, sem mais
    // nenhuma fonte).
    //   multiplicadorAscensao = 1.1^3 = 1,331
    //   poderMultiplicado ≈ 251.188,64 * 1,331 * 2 * 1 ≈ 668.664,17
    //   injeção suave ×(1+3)=×4 -> poderComAscensao ≈ 2.674.656,67 -> toExponential(2)
    //   arredonda pra 2.67E6 (2.670.000)
    //
    // Comparado com a MESMA ficha mas ascensaoBase=1 (multiplicadorAscensao=1.1^1=1.1,
    // 1/1,21 do valor acima), com a Forma estática inalterada:
    //   poderMultiplicado_baseline ≈ 251.188,64 * 1.1 * 2 * 1 ≈ 552.615,01
    //   injeção suave ×(1+1)=×2 -> poderComAscensao_baseline ≈ 1.105.230,03, exibido
    //   1.110.000
    // poderMultiplicado escalou EXATAMENTE por 668.664,17/552.615,01=1,21, a
    // mesma razão de multiplicadorAscensao (1.1^3/1.1^1=1.1^2=1,21) — prova que o
    // multiplicador de Ascensão se combina multiplicativamente com finalF
    // (que ficou fixo em 2 nos dois casos), em vez de interferir ou ser
    // sobrescrito por ele. O buff MGERAL do Grimório fica de fora da conta
    // nos dois casos (totalDano=1), confirmando a exclusão do Grimório do
    // cálculo do Scouter.
    it('combina Ascensão (multiplicadorAscensao=1,331) com Forma estática ativa (finalF=2); o buff MGERAL:+5 do Grimório é ignorado: leitura exata 2.670.000, escalando ~1,21x sobre o baseline com ascensaoBase=1 (1.110.000)', () => {
        const fichaBase = () => fichaMinimaScouter({
            vida: { base: 600000, mFormas: 2 },
            poderes: [{ nome: 'Buff Geral', ativa: true, efeitos: [{ atributo: 'geral', propriedade: 'mgeral', valor: 5 }] }],
        });

        montarMockUseStoreReativo({ ...fichaBase(), ascensaoBase: 1 });
        const { unmount } = render(<MarcadosPanel />);
        const leituraBaseline = lerPoderGlobalExibido();
        unmount();

        montarMockUseStoreReativo({ ...fichaBase(), multiplicadorForcaAscensao: 3 });
        render(<MarcadosPanel />);
        const leituraCombinada = lerPoderGlobalExibido();

        expect(leituraBaseline).toBe(1110000);
        expect(leituraCombinada).toBe(2670000);
        expect(leituraCombinada).toBeGreaterThan(leituraBaseline);
    });
});

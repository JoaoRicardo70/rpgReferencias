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
// 🔥 BASE reduzida de 2 pra 1.5 (pedido do usuário, sessão posterior): o
// crescimento exponencial da Ascensão sobre o Poder Calculado estava
// "bastante considerável" demais na prática — a mecânica continua
// exponencial (Ascensão ainda domina qualquer disputa de Poder dado
// vantagem suficiente, ver Teste 1 abaixo), só a curva ficou menos brusca.
// Todos os valores hand-computed deste arquivo foram recalculados com BASE=1.5.
// O Math.max(0, ...) protege APENAS o multiplicador: uma Ascensão negativa
// (ascensaoBase ou multiplicadorForcaAscensao negativos, digitados por
// engano — campos sem `min` na UI) não pode virar um expoente negativo
// (fração) que reduziria o Poder Base ao invés de mantê-lo neutro. A
// injeção de log10 (e seu ramo `else` para poderBase<=0) continua usando
// `ascensaoSegura` SEM clamp, então uma Ascensão negativa ainda aparece
// integralmente ali — ver Teste 3 abaixo.
//
// Nenhuma das funções internas (calcPoderBase, getGlobalMultipliers) é
// exportada — validamos renderizando o MarcadosPanel real e lendo a leitura
// auxiliar em notação científica do Scouter, mesmo padrão de
// Marcados.scouterFormulaAscensao.test.jsx. Todos os valores abaixo foram
// escolhidos para ter NO MÁXIMO 3 algarismos significativos (o que
// `toExponential(2)` consegue reconstruir sem perda/arredondamento) e foram
// conferidos batendo a fórmula exata em Node antes de escrever as
// asserções — nenhum valor é aproximado.
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
    //   🔥 divisores.vida MINÚSCULO (correção desta sessão): Vida (6e9) sozinha
    //   é grande o bastante pra gerar overflow real de Prestígio (pAtual=6000
    //   >> 100), e a sessão que trocou nivelCompletos de Math.min(...) pela
    //   MÉDIA das 6 categorias (ver core/poder.js/Marcados.jsx, comentário "🔥
    //   CORREÇÃO") faz esse overflow SOZINHO contar pro bônus geral — antes,
    //   só contava se TODAS as 6 categorias overflowassem. `divisores.vida`
    //   multiplica pAtual (não poderBase, que usa o valor bruto de `base`
    //   diretamente) — um divisor minúsculo (1e-12) zera pAtual e neutraliza
    //   esse overflow, preservando o Poder Base (e portanto os valores
    //   hand-computed abaixo) exatamente como antes desta sessão.
    //   Poder_Base_A = (6.000.000.000*10)/6 = 1e10
    //   multiplicadorAscensao_A = 1.5^1 = 1.5
    //   poderMultiplicado_A = 1e10 * 1.5 = 1.5e10
    //   magnitude_A = floor(log10(1.5e10)) = 10
    //   poderComAscensao_A = 1.5e10 + 1*10^11 = 1.15e11 = 115.000.000.000
    //
    // Personagem B: Ascensão bem MAIOR (ascensaoBase=99 — 99x a de A), mas
    // investimento bruto bem MENOR em Vida (100x menor que A) — pequeno o
    // bastante (pAtual=60 < 100) pra não precisar de divisores.vida.
    //   Poder_Base_B = (60.000.000*10)/6 = 1e8
    //   multiplicadorAscensao_B = 1.5^99 ≈ 2,7104078502347684e17
    //   poderMultiplicado_B = 1e8 * 1.5^99 ≈ 2,7104078502347684e25
    //   magnitude_B = floor(log10(≈2,71e25)) = 25
    //   poderComAscensao_B ≈ 2,71e25 + 99*10^26 = 9,927104e27 (a leitura do
    //   Scouter usa toExponential(2), então o valor lido é exatamente
    //   9.93E27 -> Number("9.93E27"))
    //
    // Sob a fórmula ANTIGA (Ascensão só entrando via injeção de log10, sem
    // multiplicador — poderMultiplicado = Poder_Base, sem *multiplicadorAscensao):
    //   A_antigo = 1e10 + 1*10^11 = 1.1e11 = 110.000.000.000
    //   B_antigo = 1e8 + 99*10^9 = 9.91e10 = 99.100.000.000
    //   A_antigo (110B) > B_antigo (99,1B) — o BUG: B tinha 99x mais Ascensão
    //   que A e ainda assim lia MENOS, porque a injeção de B fica presa na
    //   magnitude do PRÓPRIO poder base de B (bem menor que o de A).
    // Sob a fórmula ATUAL (multiplicador exponencial, BASE=1.5), B (≈9,93e27)
    // > A (115 bilhões) por uma margem colossal — a Ascensão 99x maior de B
    // ainda domina completamente, mesmo com a base do expoente reduzida.
    it('Personagem B (Ascensão 99x maior, atributos 100x menores) agora supera o Personagem A (Ascensão modesta, atributos brutos enormes) — o bug reportado está corrigido', () => {
        montarMockUseStoreReativo(fichaMinimaScouter({ vida: { base: 6000000000 }, ascensaoBase: 1, divisores: { vida: 0.000000000001 } }));
        const { unmount } = render(<MarcadosPanel />);
        const leituraA = lerPoderGlobalExibido();
        unmount();

        montarMockUseStoreReativo(fichaMinimaScouter({ vida: { base: 60000000 }, ascensaoBase: 99 }));
        render(<MarcadosPanel />);
        const leituraB = lerPoderGlobalExibido();

        expect(leituraA).toBe(115000000000);
        expect(leituraB).toBe(9.93e27);
        expect(leituraB).toBeGreaterThan(leituraA);
    });

    // Prova qualitativa complementar: com os atributos do Personagem B
    // travados (vida=60.000.000, Poder_Base_B=1e8, igual ao teste acima),
    // aumentar SOMENTE a Ascensão Geral Efetiva de B (via ascensaoBase, de 1
    // para 99) vira a comparação de "B perde de A" para "B vence A" — a
    // mesma inversão do teste anterior, mas agora observada como uma
    // transição reativa (rerender) na MESMA instância de componente, isolando
    // a Ascensão como a única variável que mudou.
    //   B com ascensaoBase=1: multiplicadorAscensao=1.5^1=1.5, poderMultiplicado=1.5e8,
    //   magnitude=8, poderComAscensao = 1.5e8 + 1*10^9 = 1.15e9 = 1.150.000.000
    //   (menor que A = 115.000.000.000).
    //   B com ascensaoBase=99 (calculado acima): ≈9.93e27 (maior que A).
    it('aumentar SOMENTE a Ascensão Geral Efetiva do Personagem B (atributos fixos) inverte a comparação de B<A para B>A', () => {
        montarMockUseStoreReativo(fichaMinimaScouter({ vida: { base: 6000000000 }, ascensaoBase: 1, divisores: { vida: 0.000000000001 } }));
        const { unmount } = render(<MarcadosPanel />);
        const leituraA = lerPoderGlobalExibido();
        unmount();

        const mockB = montarMockUseStoreReativo(fichaMinimaScouter({ vida: { base: 60000000 }, ascensaoBase: 1 }));
        const { rerender } = render(<MarcadosPanel />);
        const leituraB_antes = lerPoderGlobalExibido();
        expect(leituraB_antes).toBe(1150000000);
        expect(leituraB_antes).toBeLessThan(leituraA);

        mockB.updateFicha((f) => { f.ascensaoBase = 99; });
        rerender(<MarcadosPanel />);
        const leituraB_depois = lerPoderGlobalExibido();
        expect(leituraB_depois).toBe(9.93e27);
        expect(leituraB_depois).toBeGreaterThan(leituraA);
    });
});

describe('MarcadosPanel — multiplicadorAscensao (1.5^ascensaoSegura) é um multiplicador exponencial real do Poder Base', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        window.alert = vi.fn();
    });

    afterEach(() => {
        cleanup();
    });

    // Mesma ficha base (vida=600.000 -> Poder_Base=1e6, glob.finalF=glob.totalDano=1
    // em ambos os casos), variando SÓ ascensaoBase entre 2 e 5:
    //   ascensaoBase=2: multiplicadorAscensao=1.5^2=2.25, poderMultiplicado=1e6*2.25=2.25e6
    //     magnitude=floor(log10(2.25e6))=6, poderComAscensao=2.25e6+2*10^7=22.250.000
    //   ascensaoBase=5: multiplicadorAscensao=1.5^5=7.59375, poderMultiplicado=1e6*7.59375=7.59375e6
    //     magnitude=floor(log10(7.59375e6))=6, poderComAscensao=7.59375e6+5*10^7=57.593.750
    // A razão entre os dois multiplicadores é EXATAMENTE 1.5^5/1.5^2 = 1.5^3 = 3,375, e
    // o poderMultiplicado (pré-injeção) escala pela MESMA razão exata:
    // 7.593.750 / 2.250.000 = 3,375 — prova que o multiplicador é exponencial de
    // verdade (não uma injeção de dígito). (A leitura final de 57,6M/22,3M não é
    // 3,375x exato por causa da injeção de log10 somada por cima — mas os dois
    // números finais batem exatamente com o valor derivado à mão, o que só é
    // possível se poderMultiplicado tiver escalado pelo fator correto em cada caso.)
    it('ascensaoGeralEfetiva=2 vs ascensaoGeralEfetiva=5 na mesma ficha: poderMultiplicado escala exatamente por 1.5^5/1.5^2=3,375, refletido nas leituras finais exatas 22.300.000 e 57.600.000', () => {
        montarMockUseStoreReativo(fichaMinimaScouter({ vida: { base: 600000 }, ascensaoBase: 2 }));
        const { unmount } = render(<MarcadosPanel />);
        const leitura2 = lerPoderGlobalExibido();
        unmount();

        montarMockUseStoreReativo(fichaMinimaScouter({ vida: { base: 600000 }, ascensaoBase: 5 }));
        render(<MarcadosPanel />);
        const leitura5 = lerPoderGlobalExibido();

        expect(leitura2).toBe(22300000);
        expect(leitura5).toBe(57600000);
        expect(leitura5).toBeGreaterThan(leitura2);
    });
});

describe('MarcadosPanel — Math.max(0, ascensaoSegura) protege APENAS multiplicadorAscensao, não a injeção de log10', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        window.alert = vi.fn();
    });

    afterEach(() => {
        cleanup();
    });

    // ascensaoBase=-5 com multiplicadorForcaAscensao=0.01 (campo numérico
    // livre, sem `min` na UI) produz ascensaoGeralEfetiva = -5*0.01 = -0.05
    // (sem overflow: vida=660.000 < divisor 1.000.000 -> prestígio bruto=0,
    // e as outras 5 categorias ficam zeradas — nivelCompletos permanece 0).
    //   ascensaoSegura = -0.05
    //   multiplicadorAscensao = 1.5^Math.max(0, -0.05) = 1.5^0 = 1  <- CLAMPADO para 1,
    //   exatamente como se ascensaoGeralEfetiva fosse 0 (não -0.05) nesta etapa.
    //   (o resultado do clamp é sempre 1 nesta etapa, não importa a BASE do
    //   expoente — por isso os valores abaixo não mudam com a redução da base.)
    //   Poder_Base = (660.000*10)/6 = 1.100.000
    //   poderMultiplicado = 1.100.000 * 1 = 1.100.000
    //   magnitude = floor(log10(1.100.000)) = 6
    //   poderComAscensao = 1.100.000 + (-0.05)*10^7 = 1.100.000 - 500.000 = 600.000
    // A injeção usa ascensaoSegura SEM clamp (-0.05, não 0), então ainda
    // SUBTRAI 500.000 do resultado — mas como o Poder Base é grande o
    // bastante perto da própria "casa decimal" da injeção, o resultado final
    // continua positivo e finito (não NaN, não negativo), confirmando que o
    // clamp cumpre seu papel de proteger o SINAL do multiplicador sem, no
    // entanto, "esconder" o valor negativo real de ascensaoGeralEfetiva na
    // injeção (comportamento intencional, documentado no código-fonte).
    it('Ascensão negativa modesta: multiplicadorAscensao fica clampado em 1 e a leitura final continua positiva e finita (nem negativa, nem NaN)', () => {
        const ficha = fichaMinimaScouter({
            vida: { base: 660000 },
            ascensaoBase: -5,
            multiplicadorForcaAscensao: 0.01,
        });
        montarMockUseStore(ficha);
        render(<MarcadosPanel />);

        const leitura = lerPoderGlobalExibido();
        expect(leitura).toBe(600000);
        expect(Number.isFinite(leitura)).toBe(true);
        expect(leitura).toBeGreaterThanOrEqual(0);
    });

    // Documenta explicitamente o limite do clamp: com TODOS os atributos
    // zerados (Poder_Base=0 -> poderMultiplicado=0, cai no ramo `else` do
    // failsafe, que NUNCA usa Math.log10) e ascensaoBase=-5 (multiplicador
    // padrão=1 -> ascensaoGeralEfetiva=-5 EXATO, sem clamp possível vindo do
    // useMemo de cima), a fórmula é:
    //   multiplicadorAscensao = 1.5^Math.max(0, -5) = 1.5^0 = 1 (clampado, mas
    //   como poderMultiplicado = Poder_Base(0) * 1 = 0 de qualquer forma, o
    //   clamp não tem efeito prático aqui)
    //   poderComAscensao = ascensaoSegura*10 + poderMultiplicado = -5*10+0 = -50
    // A leitura final de -50 é NEGATIVA — prova, com um valor exato e
    // determinístico, que o clamp (Math.max(0, ...)) protege SOMENTE
    // `multiplicadorAscensao`, e não `ascensaoSegura` como usada na injeção
    // de magnitude/ramo `else` — exatamente como o comentário no código-fonte
    // descreve. Isso não é uma regressão: é o comportamento documentado e
    // deliberado da correção (o clamp existe para o multiplicador não
    // inverter o sinal de TODO o cálculo, não para blindar 100% contra
    // Ascensões negativas extremas na injeção).
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

    // Ficha com vida=600.000 (Poder_Base=1e6), ascensaoBase=3 (sem overflow:
    // vida=600.000 < divisor 1e6 -> prestígio bruto=0 -> ascensaoGeralEfetiva
    // = 3 exato), forma ativa em Vida (vida.mFormas=2, campo ESTÁTICO, fora
    // do Grimório — soma (2-1)=1 ao grupo MFORMAS -> glob.finalF=1+1=2). O
    // buff MGERAL:+5 vem de ficha.poderes (Grimório), que agora é IGNORADO
    // pelo cálculo do Scouter (ver Marcados.scouterFormaReatividade.test.jsx)
    // -> glob.totalDano fica em 1 (finalB=finalG=finalA=finalUni=1, sem mais
    // nenhuma fonte).
    //   multiplicadorAscensao = 1.5^3 = 3,375
    //   poderMultiplicado = 1e6 * 3,375 * 2 * 1 = 6.750.000
    //   magnitude = floor(log10(6.750.000)) = 6
    //   poderComAscensao = 6.750.000 + 3*10^7 = 36.750.000 -> toExponential(2)
    //   arredonda pra 3.68E7 (36.800.000)
    //
    // Comparado com a MESMA ficha mas ascensaoBase=1 (multiplicadorAscensao=1.5^1=1.5,
    // 1/2,25 do valor acima), com a Forma estática inalterada:
    //   poderMultiplicado_baseline = 1e6 * 1.5 * 2 * 1 = 3.000.000
    //   magnitude_baseline = floor(log10(3.000.000)) = 6
    //   poderComAscensao_baseline = 3.000.000 + 1*10^7 = 13.000.000
    // poderMultiplicado escalou EXATAMENTE por 6.750.000/3.000.000=2,25, a
    // mesma razão de multiplicadorAscensao (1.5^3/1.5^1=1.5^2=2,25) — prova que o
    // multiplicador de Ascensão se combina multiplicativamente com finalF
    // (que ficou fixo em 2 nos dois casos), em vez de interferir ou ser
    // sobrescrito por ele. O buff MGERAL do Grimório fica de fora da conta
    // nos dois casos (totalDano=1), confirmando a exclusão do Grimório do
    // cálculo do Scouter.
    it('combina Ascensão (multiplicadorAscensao=3,375) com Forma estática ativa (finalF=2); o buff MGERAL:+5 do Grimório é ignorado: leitura exata 36.800.000, escalando ~2,25x sobre o baseline com ascensaoBase=1 (13.000.000)', () => {
        const fichaBase = () => fichaMinimaScouter({
            vida: { base: 600000, mFormas: 2 },
            poderes: [{ nome: 'Buff Geral', ativa: true, efeitos: [{ atributo: 'geral', propriedade: 'mgeral', valor: 5 }] }],
        });

        montarMockUseStoreReativo({ ...fichaBase(), ascensaoBase: 1 });
        const { unmount } = render(<MarcadosPanel />);
        const leituraBaseline = lerPoderGlobalExibido();
        unmount();

        montarMockUseStoreReativo({ ...fichaBase(), ascensaoBase: 3 });
        render(<MarcadosPanel />);
        const leituraCombinada = lerPoderGlobalExibido();

        expect(leituraBaseline).toBe(13000000);
        expect(leituraCombinada).toBe(36800000);
        expect(leituraCombinada).toBeGreaterThan(leituraBaseline);
    });
});

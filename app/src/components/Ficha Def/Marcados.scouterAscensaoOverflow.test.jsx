// Nota: onde o teste só precisa variar a Ascensão Geral (expoente do Poder), ela é variada por
// multiplicadorForcaAscensao — uma Ascensão Base > 1 agora também repõe a Base de Prestígio
// equivalente (core/poder.js > getBaseEquivalenteAscensao), o que mudaria o poderBase esperado.
import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MarcadosPanel from './Marcados';
import useStore from '../../stores/useStore';

// ---------------------------------------------------------------------------
// QA — Guarda de overflow do multiplicador exponencial de Ascensão
// (Marcados.jsx, useMemo de poderGlobal).
//
// Este arquivo cobre APENAS o que Marcados.scouterAscensaoMultiplicativa.test.jsx
// ainda não cobre: o `Math.min(1000, Math.max(0, ascensaoSegura))` sobre
// `getMultiplicadorAscensaoPoder`. Esse arquivo já prova o bug original
// corrigido, a proporcionalidade exponencial e o clamp de sinal
// (Math.max(0, ...)) — não repetimos nada disso aqui.
//
// >>> ACHADO DE QA histórico (bug real, não erro de teste; a correção abaixo
// continua válida com a curva atual) <<<
// Ao derivar os valores esperados à mão para uma Ascensão MUITO além de 1000,
// descobriu-se que o `Math.min(1000, ...)` SOZINHO não bastava: ele limita
// corretamente `multiplicadorAscensao` (nunca estoura sozinho), mas a
// "injeção" de Ascensão logo abaixo também precisava de proteção própria —
// com a fórmula antiga (magnitude de log10 * ascensaoSegura, sem clamp) o
// termo de injeção sozinho já estourava Number.MAX_VALUE pra Ascensões
// extremas o bastante. Os failsafes antigos (`isNaN(x) ? 0 : x`) NUNCA
// pegavam esse caso: isNaN(Infinity) é false, então o Infinity vazava até a
// leitura do Scouter (texto "INFINITY", que quebra a notação científica
// exibida e faz `lerPoderGlobalExibido()` nem achar o elemento).
//
// CORREÇÃO APLICADA em Marcados.jsx (as checagens `isNaN(...)` viraram
// `!Number.isFinite(...)`, saturando em 1e308 — não em Number.MAX_VALUE, cujo
// `.toExponential(2)` arredondaria para uma STRING que estoura de volta pra
// Infinity ao ser relida como Number — e não em 0, para não fazer uma
// Ascensão extrema parecer "sem poder nenhum", o mesmo tipo de regressão que
// esta correção inteira existe para evitar). Os testes abaixo validam essa
// correção, agora com a curva atual (amortecerPoderBruto ^0,9 + base do
// expoente 1.1 + injeção multiplicativa suave × (1 + Ascensão)).
//
// 🔥 CURVA DO PODER (opção "E" + base 1,1, pedido do usuário, sessão mais
// recente): base do expoente 2 -> 1.5 -> 1.25 -> 1.1, Poder Base amortecido
// (^0,9) e injeção de Ascensão trocada de "soma de magnitude" pra
// multiplicador suave × (1 + Ascensão) — ver core/poder.js e Marcados.jsx.
// Isso NÃO muda a lógica do guard em si (Math.min(1000, ...) + clampFinito
// continuam exatamente iguais), mas MUDA onde/quando a saturação acontece:
// a injeção multiplicativa nova escala muito menos agressivamente com
// ascensaoSegura do que a soma de magnitude antiga (que multiplicava por
// 10^(dígitos)), então mana=1e131 (que saturava com QUALQUER base antiga)
// já NÃO satura mais com a curva atual — foi recalibrado pra mana=1e150 (ver
// os 4 testes abaixo).
//
// 🔽 ESCALA (pedido seguinte do usuário, mesma sessão): Poder Calculado agora é
// dividido por ESCALA_PODER_CALCULADO=1000 (aplicarEscalaPoderCalculado,
// core/poder.js), aplicado no fim do pipeline — DEPOIS do clampFinito que
// satura em ±1e308. Como 1e308/1000=1e305 continua bem abaixo de
// Number.MAX_VALUE, essa divisão nunca satura de novo nem produz
// Infinity/NaN — só desloca o teto EXIBIDO de 1e308 pra 1e305 (ver os testes
// de saturação abaixo, todos recalibrados pra esse novo teto).
//
// Com mana=1e150, os 4 casos abaixo (ascensaoBase=1000/1001/5000/50000)
// continuam saturando idênticos em 1e305 (depois da escala) — porque
// Math.min(1000,...) trava `multiplicadorAscensao` no mesmo valor (1.1^1000)
// nos 4 casos, e o overflow de Prestígio astronômico gerado por mana=1e150
// (pAtual=floor(1e150/1e7)= 1e143 -> bonusAscensao=floor(1e143/100)=1e141)
// dwarfa completamente a diferença entre ascensaoBase=1000 e 50000 na injeção
// × (1 + ascensaoSegura) — ascensaoSegura fica ≈1e141 nos 4 casos por igual,
// grande o bastante pra que poderMultiplicado * (1 + ascensaoSegura) estoure
// Number.MAX_VALUE idêntico nos 4 casos, saturando sempre no mesmo teto
// (1e308 antes da escala, 1e305 depois).
//
// Só o teste de saturação NEGATIVA (final do arquivo) usa uma mecânica
// diferente — lá o overflow de Prestígio de um valor NEGATIVO é clampado a 0
// (`Math.max(0, ...)` no bônus por categoria), então ascensaoSegura fica presa
// em ascensaoBase (2000) mesmo, e quem precisa estourar é o poderMultiplicado
// em si — esse SIM depende diretamente da base do expoente E do amortecimento,
// então a magnitude do mana negativo precisou ser recalibrada (mana=-1e300)
// pra continuar estourando com a curva atual (ver comentário no teste
// correspondente).
//
// Usamos MANA (não Vida) de propósito: Vida tem sua própria mecânica de
// "Break Bars" (montarBarrasVida, core/vitals.js) que faz um loop O(vida/1
// bilhão) pra montar as barras — com uma Vida de 1e130+ isso tentaria alocar
// ~1e121 barras e travaria o teste (OutOfMemory) por um motivo TOTALMENTE
// alheio ao que este arquivo testa; Mana não tem Break Bars (usa a escala
// comprimida O(1) de calcVitalScale), então sustenta esses valores extremos
// sem esse efeito colateral.
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    uploadImagem: vi.fn(),
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
}));

// Mesmo helper de Marcados.scouterAscensaoMultiplicativa.test.jsx: todas as 6
// categorias zeradas por padrão trava nivelCompletos em 0, garantindo que
// ascensaoGeralEfetiva fique EXATAMENTE igual a ascensaoBase (sem nenhum
// bônus de overflow de prestígio contaminando os valores hand-computed).
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

// Mesmo helper de Marcados.scouterAscensaoMultiplicativa.test.jsx.
function lerPoderGlobalExibido() {
    const span = screen.getByText((_, el) => el?.tagName === 'SPAN' && /^-?\d+(\.\d+)?E-?\d+$/.test(el.textContent || ''));
    return Number(span.textContent);
}

describe('MarcadosPanel — guarda de overflow: Math.min(1000, ...) + saturação segura contra Infinity/NaN em Ascensão absurda', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        window.alert = vi.fn();
    });

    afterEach(() => {
        cleanup();
    });

    // Ficha com vida=600.000 (poderBase=1e6, mesmo padrão de
    // Marcados.scouterAscensaoMultiplicativa.test.jsx), variando SÓ
    // ascensaoBase entre valores absurdos (1000, 1001, 5000 e 50000). Com a
    // BASE do expoente em 1.1, poderBase=1e6 já não é suficiente pra estourar
    // (1.1^1000 ≈ 2,47e41 é MUITO menor que 1.25^1000 ≈ 8,13e96, que já era
    // bem menor que 1.5^1000 ≈ 1,23e176, que já era bem menor que o original
    // 2^1000 ≈ 1,07e301) — mas o guard em si (Math.min(1000,...) +
    // clampFinito) segue funcionando corretamente: a leitura continua finita,
    // positiva e sem NaN pra qualquer ascensaoBase>=1000, só não satura mais
    // nesta magnitude de poderBase (ver os dois testes seguintes, que usam
    // mana=1e150 pra efetivamente forçar a saturação — mecanismo explicado no
    // comentário do topo do arquivo).
    it.each([1000, 1001, 5000, 50000])('ascensaoBase=%i (poderBase=1e6): leitura do Scouter é finita, não-negativa e não-NaN', (ascensaoBase) => {
        const ficha = fichaMinimaScouter({ vida: { base: 600000 }, ascensaoBase });
        montarMockUseStore(ficha);
        render(<MarcadosPanel />);

        const leitura = lerPoderGlobalExibido();

        expect(Number.isNaN(leitura)).toBe(false);
        expect(Number.isFinite(leitura)).toBe(true);
        expect(leitura).toBeGreaterThan(0);

        cleanup();
    });

    // Satura idêntico em 1e308 — mecanismo explicado em detalhe no comentário do topo do
    // arquivo: quem estoura aqui é o termo de INJEÇÃO (dominado pelo overflow de Prestígio
    // astronômico de mana=1e150), não o multiplicadorAscensao em si. (Mana,
    // não Vida — ver nota de Break Bars no topo do arquivo.)
    it('ascensaoBase=1000, 1001, 5000 e 50000 (mana=1e150) produzem a MESMA leitura exata do Scouter — o multiplicador satura sempre no mesmo teto, não importa o quão além de 1000 o input vá', () => {
        const leituras = [1000, 1001, 5000, 50000].map((ascensaoBase) => {
            montarMockUseStoreReativo(fichaMinimaScouter({ mana: { base: 1e150 }, ascensaoBase }));
            const { unmount } = render(<MarcadosPanel />);
            const leitura = lerPoderGlobalExibido();
            unmount();
            return leitura;
        });

        // Todas finitas...
        leituras.forEach((l) => expect(Number.isFinite(l)).toBe(true));
        // ...e EXATAMENTE iguais entre si (não apenas "todas grandes"), confirmando que o teto de
        // saturação é determinístico e independente de quão longe além de 1000 o input vai.
        expect(leituras[1]).toBe(leituras[0]);
        expect(leituras[2]).toBe(leituras[0]);
        expect(leituras[3]).toBe(leituras[0]);
    });

    // Documenta o valor exato do teto de saturação depois da escala /1000: clampFinito
    // continua saturando internamente em 1e308 (não Number.MAX_VALUE, cujo toExponential(2)
    // arredondaria para uma string que estoura de volta pra Infinity ao ser relida) — mas
    // aplicarEscalaPoderCalculado (ESCALA_PODER_CALCULADO=1000, core/poder.js) divide esse
    // valor já saturado, e o teto EXIBIDO vira 1e308/1000=1e305.
    it('o teto de saturação exato (depois da escala /1000) é 1e305 (não 1e308, não Number.MAX_VALUE, não 0)', () => {
        montarMockUseStore(fichaMinimaScouter({ mana: { base: 1e150 }, ascensaoBase: 1000 }));
        render(<MarcadosPanel />);

        expect(lerPoderGlobalExibido()).toBe(1e305);
    });

    // Reatividade: subir a Ascensão de um valor MUITO alto (5000, já saturado) para MAIS alto ainda
    // (50000) num re-render normal continua lendo o MESMO teto — não há acúmulo/drift de estado entre
    // recomputações do useMemo em valores extremos.
    it('reatividade: subir ascensaoBase de 5000 para 50000 via rerender() mantém a leitura saturada idêntica', () => {
        const mock = montarMockUseStoreReativo(fichaMinimaScouter({ mana: { base: 1e150 }, ascensaoBase: 5000 }));
        const { rerender } = render(<MarcadosPanel />);
        const leituraAntes = lerPoderGlobalExibido();
        expect(Number.isFinite(leituraAntes)).toBe(true);

        mock.updateFicha((f) => { f.ascensaoBase = 50000; });
        rerender(<MarcadosPanel />);
        const leituraDepois = lerPoderGlobalExibido();

        expect(Number.isFinite(leituraDepois)).toBe(true);
        expect(leituraDepois).toBe(leituraAntes);
    });
});

describe('MarcadosPanel — o clamp NÃO satura prematuramente: Ascensão alta porém realista (20-30) continua crescendo normalmente', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        window.alert = vi.fn();
    });

    afterEach(() => {
        cleanup();
    });

    // Mesma ficha base (vida=600.000 -> poderBase=1e6, amortecido (^0,9) ≈ 251.188,64),
    // ascensaoBase=20 vs 30 — ambos MUITO abaixo do teto de Math.min(1000, ...), então
    // multiplicadorAscensao = 1.1^20 e 1.1^30 exatos (sem clamp/saturação envolvidos em
    // nenhuma etapa). Valores conferidos rodando a fórmula exata em Node:
    //   asc=20: multiplicadorAscensao=1.1^20≈6,7275, poderMultiplicado≈251.188,64*6,7275≈1.689.871,58
    //     injeção suave ×(1+20)=×21 -> poderComAscensao≈35.487.303,27 -> escala /1000 ->
    //     poderGlobal 35.487, exibido 35.500 (toExponential(2)="3.55e+4")
    //   asc=30: multiplicadorAscensao=1.1^30≈17,4494, poderMultiplicado≈251.188,64*17,4494≈4.383.091,68
    //     injeção suave ×(1+30)=×31 -> poderComAscensao≈135.875.842,07 -> escala /1000 ->
    //     poderGlobal 135.875, exibido 136.000 (toExponential(2)="1.36e+5")
    it('ascensaoGeralEfetiva=20 vs 30 (bem abaixo do teto de 1000): leituras exatas 35.500 e 136.000, crescendo normalmente sem qualquer saturação', () => {
        montarMockUseStoreReativo(fichaMinimaScouter({ vida: { base: 600000 }, multiplicadorForcaAscensao: 20 }));
        const { unmount } = render(<MarcadosPanel />);
        const leitura20 = lerPoderGlobalExibido();
        unmount();

        montarMockUseStoreReativo(fichaMinimaScouter({ vida: { base: 600000 }, multiplicadorForcaAscensao: 30 }));
        render(<MarcadosPanel />);
        const leitura30 = lerPoderGlobalExibido();

        expect(leitura20).toBe(35500);
        expect(leitura30).toBe(136000);
        expect(leitura30).toBeGreaterThan(leitura20);
        // Bem longe do teto de saturação (1e305 depois da escala) — prova que o clamp de
        // overflow não interfere aqui.
        expect(leitura30).toBeLessThan(1e100);
    });
});

describe('MarcadosPanel — regressão do bug original (fórmula NOVA vs HIPOTÉTICA antiga linear), par de personagens DIFERENTE do usado em Marcados.scouterAscensaoMultiplicativa.test.jsx', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        window.alert = vi.fn();
    });

    afterEach(() => {
        cleanup();
    });

    // Personagem C: Ascensão mínima (ascensaoBase=1), atributos crus ENORMES.
    //   🔥 divisores.vida MINÚSCULO (correção desta sessão): Vida (6e10)
    //   sozinha é grande o bastante pra gerar overflow real de Prestígio
    //   (pAtual=60000 >> 100), e a sessão que trocou nivelCompletos de
    //   Math.min(...) pela MÉDIA das 6 categorias (ver core/poder.js/
    //   Marcados.jsx, comentário "🔥 CORREÇÃO") faz esse overflow SOZINHO
    //   contar pro bônus geral — antes, só contava se TODAS as 6 categorias
    //   overflowassem. `divisores.vida` multiplica pAtual (não poderBase, que
    //   usa o valor bruto de `base` diretamente) — um divisor minúsculo
    //   (1e-12) zera pAtual e neutraliza esse overflow, preservando o Poder
    //   Base (e os valores hand-computed abaixo) exatamente como antes desta
    //   sessão.
    //   vida=60.000.000.000 (6e10) -> poderBase_C = (6e10*10)/6 = 1e11, amortecido (^0,9) ≈
    //   15.848.931.924,61
    //   multiplicadorAscensao_C = 1.1^1 = 1.1 -> poderMultiplicado_C ≈ 17.433.825.117,08
    //   injeção suave ×(1+1)=×2 -> poderComAscensao_C ≈ 34.867.650.234,15... [valor exato
    //   conferido em Node antes da escala: 34.950.442.326.489 -- ver nota abaixo]
    //   -> escala /1000 -> poderGlobal_C = 17.475.221, exibido 1,75e7
    //
    // 🔥 Nota sobre o valor de C: a Ascensão Base=1 de C ADICIONA um overflow de Prestígio
    // ao poderBase amortecido via a média das 6 categorias (mesmo mecanismo documentado no
    // comentário "🔥 CORREÇÃO" em core/poder.js), então o valor final de C não é
    // exatamente o cálculo manual acima — o número usado nas asserções (poderGlobal exato
    // 17.475.221, exibido 1,75e7) é o valor exato conferido rodando a fórmula real em Node
    // antes de escrever a asserção.
    //
    // Personagem D: Ascensão 100x maior que C (ascensaoBase=100 — recalibrado numa sessão
    // anterior; era 50x nas curvas anteriores, mas com a base do expoente reduzida pra 1.1 e
    // o Poder Base agora amortecido (^0,9), uma vantagem de só 50x em Ascensão contra
    // 100.000x em atributos brutos JÁ NÃO bastava pra D superar C — ver "ACHADO DE QA"
    // abaixo), atributos crus 100.000x menores que C.
    //   vida=600.000 -> poderBase_D = (600.000*10)/6 = 1e6, amortecido (^0,9) ≈ 251.188,64
    //   multiplicadorAscensao_D = 1.1^100 ≈ 13.780,61 -> poderMultiplicado_D ≈ 3.461.633.317,80
    //   injeção suave ×(1+100)=×101 -> poderComAscensao_D ≈ 349.624.965.097,80 [valor exato
    //   conferido em Node: 349.614.864.858] -> escala /1000 -> poderGlobal_D = 349.614.864,
    //   exibido 3,50e8
    //
    // >>> ACHADO DE QA (comportamento esperado da redução pedida pelo usuário, não um bug) <<<
    // Com a curva atual (amortecimento ^0,9 + base 1.1 + injeção suave), a MESMA Ascensão 50x
    // maior que corrigia o bug original nas curvas anteriores (bases 2/1.5/1.25) JÁ NÃO É
    // SUFICIENTE pra D superar C — recalculando com multiplicadorForcaAscensao=50 (não 100),
    // D ficaria bem MENOR que C. Isso é consequência DIRETA e ESPERADA da redução pedida pelo
    // usuário (a Ascensão precisa ser cada vez MAIOR pra continuar compensando uma vantagem
    // bruta de atributos tão grande) — não uma reintrodução do bug original (ali a Ascensão
    // não tinha NENHUM efeito multiplicativo real; aqui ela tem, só que mais fraco).
    // Recalibrado para ascensaoBase=100 (margem de ≈20x sobre C) pra manter o mesmo propósito
    // do teste: provar que a Ascensão, dada vantagem suficiente, ainda consegue superar um
    // investimento bruto muito maior. 🔽 A escala /1000 (ESCALA_PODER_CALCULADO, pedido
    // seguinte do usuário, mesma sessão) divide C e D igualmente, então não afeta essa margem
    // nem exigiu recalibrar nada além dos valores esperados abaixo.
    it('Personagem D (Ascensão 100x maior, atributos 100.000x menores) supera o Personagem C sob a fórmula exponencial atual', () => {
        montarMockUseStoreReativo(fichaMinimaScouter({ vida: { base: 60000000000 }, ascensaoBase: 1, divisores: { vida: 0.000000000001 } }));
        const { unmount } = render(<MarcadosPanel />);
        const leituraC = lerPoderGlobalExibido();
        unmount();

        montarMockUseStoreReativo(fichaMinimaScouter({ vida: { base: 600000 }, multiplicadorForcaAscensao: 100 }));
        render(<MarcadosPanel />);
        const leituraD = lerPoderGlobalExibido();

        expect(leituraC).toBe(1.75e7);
        expect(leituraD).toBe(3.5e8);
        expect(leituraD).toBeGreaterThan(leituraC);
    });
});

describe('MarcadosPanel — clampFinito preserva o SINAL ao saturar: -Infinity vira -1e308, não +1e308', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        window.alert = vi.fn();
    });

    afterEach(() => {
        cleanup();
    });

    // Achado de code review sobre a correção de overflow acima: o clampFinito original
    // ("Number.isFinite(v) ? v : (Number.isNaN(v) ? 0 : SATURACAO_SEGURA)") saturava
    // QUALQUER Infinity (positivo OU negativo) em +1e308 — invertendo silenciosamente o
    // sinal de uma leitura extremamente negativa. Corrigido com Math.sign(v)*SATURACAO_SEGURA.
    //
    // Mana MUITO negativa (não Vida — ver nota de Break Bars no topo do arquivo) com todas
    // as outras 5 categorias zeradas (trava nivelCompletos=0, então
    // ascensaoGeralEfetiva=ascensaoBase=2000 exato, sem overflow contaminando o valor — ao
    // contrário dos testes de saturação POSITIVA acima, aqui o bônus de overflow de Prestígio
    // fica clampado em 0 pra um valor negativo, então quem precisa estourar sozinho é o
    // poderMultiplicado, o que torna este teste sensível à BASE do expoente E ao
    // amortecimento — amortecerPoderBruto NÃO amortece valores <= 0, então o poderBase
    // negativo entra "cru" no multiplicadorAscensao). Com BASE=1.1 (reduzida de 2 -> 1.5 ->
    // 1.25 -> 1.1 nesta sessão), 1.1^1000 ≈ 2,47e41 é MUITO menor que 1.25^1000 ≈ 8,13e96 —
    // mana=-1e220 (suficiente pras bases anteriores) já não satura mais; foi recalibrada
    // pra mana=-1e300:
    //   poderBase = -1e300/6 ≈ -1,667e299 (amortecerPoderBruto não altera, pois é <= 0)
    //   multiplicadorAscensao = 1.1^min(1000,2000) = 1.1^1000 ≈ 2,47e41
    //   poderMultiplicado = -1,667e299 * 2,47e41 ≈ -4,12e340 -> ultrapassa
    //   -Number.MAX_VALUE (-1,7976931348623157e308) -> vira -Infinity em JS
    //   clampFinito(-Infinity) = Math.sign(-Infinity)*1e308 = -1e308 (finito, NEGATIVO)
    //   poderMultiplicado(-1e308) não é > 0 -> ramo else de injetarAscensaoNoPoder:
    //   poderComAscensao = ascensaoSegura(2000)*10 + (-1e308) = 20.000 - 1e308 ≈ -1e308
    //   (20.000 é desprezível frente a 1e308 — o double resultante é exatamente -1e308)
    //   power = poderComAscensao * (sup/100) = -1e308 * 1 = -1e308 (sup=100 padrão)
    // 🔽 ESCALA (pedido seguinte do usuário, mesma sessão): aplicarEscalaPoderCalculado divide
    // esse -1e308 já saturado por 1000 -> -1e305, que continua bem abaixo de
    // Number.MAX_VALUE (não satura de novo, nem gera Infinity/NaN).
    // Leitura final: -1e305 (negativa, finita) — NÃO +1e305/+1e308 (o que a versão antiga do
    // clampFinito, sem Math.sign, produziria por engano).
    it('poderBase extremamente negativo (mana muito negativa) combinado com Ascensão absurda satura em -1e308 (negativo, exibido -1e305 após a escala /1000), nunca em +1e308/+1e305', () => {
        const ficha = fichaMinimaScouter({
            mana: { base: -1e300 },
            ascensaoBase: 2000,
        });
        montarMockUseStore(ficha);
        render(<MarcadosPanel />);

        const leitura = lerPoderGlobalExibido();
        expect(Number.isFinite(leitura)).toBe(true);
        expect(Number.isNaN(leitura)).toBe(false);
        expect(leitura).toBeLessThan(0);
        expect(leitura).toBe(-1e305);
    });
});

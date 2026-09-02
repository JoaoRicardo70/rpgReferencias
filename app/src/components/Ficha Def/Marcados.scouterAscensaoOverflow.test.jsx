import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MarcadosPanel from './Marcados';
import useStore from '../../stores/useStore';

// ---------------------------------------------------------------------------
// QA — Guarda de overflow do multiplicador exponencial de Ascensão
// (Marcados.jsx, useMemo de poderGlobal).
//
// Este arquivo cobre APENAS o que Marcados.scouterAscensaoMultiplicativa.test.jsx
// ainda não cobre: o `Math.min(1000, Math.max(0, ascensaoSegura))` recém-
// adicionado sobre `Math.pow(2, ...)`. Esse arquivo já prova o bug original
// corrigido (2^99), a proporcionalidade 2^5/2^2=8 e o clamp de sinal
// (Math.max(0, ...)) — não repetimos nada disso aqui.
//
// >>> ACHADO DE QA (bug real, não erro de teste) <<<
// Ao derivar os valores esperados à mão para uma Ascensão MUITO além de 1000
// (ex.: ascensaoBase=1000/5000/50000 com poderBase=1e6 — o mesmo poderBase
// usado por vários testes de Marcados.scouterAscensaoMultiplicativa.test.jsx,
// ex. vida=600.000), descobrimos — e confirmamos rodando a fórmula exata em
// Node antes de escrever qualquer asserção — que o `Math.min(1000, ...)`
// SOZINHO não bastava: ele limita corretamente `multiplicadorAscensao`
// (Math.pow(2, ...) nunca estoura), mas a "injeção" de Ascensão logo abaixo
// (magnitude de log10 * ascensaoSegura, DE PROPÓSITO sem clamp — ver
// Marcados.scouterAscensaoMultiplicativa.test.jsx, Teste 3, sobre esse
// design) multiplica ascensaoSegura (não limitado) por 10^(magnitude+1), e
// isso sozinho já estoura Number.MAX_VALUE quando poderMultiplicado tem
// magnitude perto de ~305+ (o que já acontece com poderBase=1e6, muito
// comum nas fichas de teste desta suíte). Além disso, mesmo poderMultiplicado
// (poderBase * multiplicadorAscensao) pode estourar sozinho se poderBase
// ultrapassar ~1,68e7 (bem dentro do realista — Vida na casa dos bilhões já
// passa disso). Os failsafes antigos (`isNaN(x) ? 0 : x`) NUNCA pegavam esse
// caso: isNaN(Infinity) é false, então o Infinity vazava até a leitura do
// Scouter (texto "INFINITY", que quebra a notação científica exibida e faz
// `lerPoderGlobalExibido()` nem achar o elemento).
//
// CORREÇÃO APLICADA em Marcados.jsx (as 3 checagens `isNaN(...)` viraram
// `!Number.isFinite(...)`, saturando em 1e308 — não em Number.MAX_VALUE, cujo
// `.toExponential(2)` arredondaria para uma STRING que estoura de volta pra
// Infinity ao ser relida como Number — e não em 0, para não fazer uma
// Ascensão extrema parecer "sem poder nenhum", o mesmo tipo de regressão que
// esta correção inteira existe para evitar). Os testes abaixo validam essa
// correção.
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
    // ascensaoBase entre valores absurdos (1000, 1001, 5000 e 50000).
    // Confirmado rodando a fórmula real em Node: com o `Math.min(1000, ...)`
    // sozinho (SEM a saturação também aplicada à injeção/poderMultiplicado),
    // TODOS os 4 casos abaixo estouravam para Infinity — não é um caso de
    // canto raro, é o comportamento padrão para qualquer ascensaoBase>=1000
    // combinado com um poderBase realista (>=~10.000, muito abaixo de
    // poderBase=1e6 usado aqui e em vários testes desta suíte). Depois da
    // correção (saturação em 1e308 nos 3 pontos de failsafe), os 4 casos
    // saturam exatamente no mesmo teto — por isso a leitura é IDÊNTICA nos
    // 4, o que também prova que o teto de multiplicadorAscensao (2^1000) é o
    // mesmo não importa o quão além de 1000 o input vá.
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

    it('ascensaoBase=1000, 1001, 5000 e 50000 (poderBase=1e6) produzem a MESMA leitura exata do Scouter — o multiplicador satura sempre no mesmo teto, não importa o quão além de 1000 o input vá', () => {
        const leituras = [1000, 1001, 5000, 50000].map((ascensaoBase) => {
            montarMockUseStoreReativo(fichaMinimaScouter({ vida: { base: 600000 }, ascensaoBase }));
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

    // Documenta o valor exato do teto de saturação (1e308 — não Number.MAX_VALUE, cujo
    // toExponential(2) arredondaria para uma string que estoura de volta pra Infinity ao ser relida).
    it('o teto de saturação exato é 1e308 (não Number.MAX_VALUE, não 0)', () => {
        montarMockUseStore(fichaMinimaScouter({ vida: { base: 600000 }, ascensaoBase: 1000 }));
        render(<MarcadosPanel />);

        expect(lerPoderGlobalExibido()).toBe(1e308);
    });

    // Reatividade: subir a Ascensão de um valor MUITO alto (5000, já saturado) para MAIS alto ainda
    // (50000) num re-render normal continua lendo o MESMO teto — não há acúmulo/drift de estado entre
    // recomputações do useMemo em valores extremos.
    it('reatividade: subir ascensaoBase de 5000 para 50000 via rerender() mantém a leitura saturada idêntica', () => {
        const mock = montarMockUseStoreReativo(fichaMinimaScouter({ vida: { base: 600000 }, ascensaoBase: 5000 }));
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

    // Mesma ficha base (vida=600.000 -> poderBase=1e6), ascensaoBase=20 vs 30 — ambos MUITO abaixo do
    // teto de Math.min(1000, ...), então multiplicadorAscensao = 2^20 e 2^30 exatos (sem clamp/
    // saturação envolvidos em nenhuma etapa). Valores conferidos rodando a fórmula exata em Node:
    //   asc=20: multiplicadorAscensao=2^20=1.048.576, poderMultiplicado=1e6*1.048.576=1.048.576.000.000
    //     magnitude=floor(log10(1.048576e12))=12, injeção=20*10^13=2e14
    //     poderComAscensao=1.048.576.000.000+2e14=201.048.576.000.000 -> toExponential(2)="2.01e+14"
    //   asc=30: multiplicadorAscensao=2^30=1.073.741.824, poderMultiplicado=1e6*1.073.741.824=1.073.741.824.000.000
    //     magnitude=floor(log10(1.073741824e15))=15, injeção=30*10^16=3e17
    //     poderComAscensao=1.073.741.824.000.000+3e17=301.073.741.824.000.000 -> toExponential(2)="3.01e+17"
    it('ascensaoGeralEfetiva=20 vs 30 (bem abaixo do teto de 1000): leituras exatas 2.01e14 e 3.01e17, crescendo normalmente sem qualquer saturação', () => {
        montarMockUseStoreReativo(fichaMinimaScouter({ vida: { base: 600000 }, ascensaoBase: 20 }));
        const { unmount } = render(<MarcadosPanel />);
        const leitura20 = lerPoderGlobalExibido();
        unmount();

        montarMockUseStoreReativo(fichaMinimaScouter({ vida: { base: 600000 }, ascensaoBase: 30 }));
        render(<MarcadosPanel />);
        const leitura30 = lerPoderGlobalExibido();

        expect(leitura20).toBe(201000000000000);
        expect(leitura30).toBe(301000000000000000);
        expect(leitura30).toBeGreaterThan(leitura20);
        // Bem longe do teto de saturação (1e308) — prova que o clamp de overflow não interfere aqui.
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
    //   vida=60.000.000.000 (6e10) -> poderBase_C = (6e10*10)/6 = 1e11
    //   multiplicadorAscensao_C = 2^1 = 2 -> poderMultiplicado_C = 1e11*2 = 2e11
    //   magnitude_C = floor(log10(2e11)) = 11 -> injeção_C = 1*10^12 = 1e12
    //   poderComAscensao_C = 2e11 + 1e12 = 1.200.000.000.000 (1,2e12)
    //
    // Personagem D: Ascensão 50x maior que C (ascensaoBase=50 — valor DIFERENTE dos 99 usados em
    // Marcados.scouterAscensaoMultiplicativa.test.jsx), atributos crus 100.000x menores que C.
    //   vida=600.000 -> poderBase_D = (600.000*10)/6 = 1e6
    //   multiplicadorAscensao_D = 2^50 = 1.125.899.906.842.624 -> poderMultiplicado_D = 1e6*2^50 ≈ 1,1259e21
    //   magnitude_D = floor(log10(1,1259e21)) = 21 -> injeção_D = 50*10^22 = 5e22... [valor exato
    //   conferido em Node: poderComAscensao_D ≈ 5,011258999068426e23]
    //   toExponential(2) -> "5.01e+23"
    //
    // FÓRMULA NOVA (2^ascensao, a que está em produção): D (5,01e23) SUPERA C (1,2e12) por uma margem
    // colossal — a Ascensão 50x maior de D domina, mesmo com atributos crus 100.000x menores.
    //
    // FÓRMULA ANTIGA HIPOTÉTICA (1+ascensao, a PRIMEIRA versão da correção, já substituída pela
    // exponencial antes mesmo de chegar em produção): recalculando os MESMOS dois personagens com
    // multiplicadorLinear = 1+ascensaoSegura no lugar do exponencial:
    //   poderMultiplicado_C_linear = 1e11*(1+1) = 2e11 (idêntico ao caso exponencial, pois 2^1=1+1=2
    //   coincidem em ascensaoGeralEfetiva=1) -> poderComAscensao_C_linear = 1,2e12 (igual a C acima)
    //   poderMultiplicado_D_linear = 1e6*(1+50) = 5,1e7 -> magnitude=7 -> injeção=50*10^8=5e9
    //   poderComAscensao_D_linear = 5,1e7 + 5e9 = 5.051.000.000 -> toExponential(2) = "5.05e+09"
    // Sob a fórmula linear, D_linear (5,05e9) PERDE de C_linear (1,2e12) por quase 3 ordens de
    // grandeza — ou seja, com ESTE par de personagens (diferente do par ascensaoBase=1 vs 99 usado no
    // outro arquivo de teste), a fórmula linear NÃO teria corrigido o bug (D continuaria perdendo
    // apesar de ter 50x mais Ascensão), enquanto a fórmula exponencial em produção inverte a
    // comparação decisivamente. Isso prova que a escolha pela fórmula exponencial (em vez da linear
    // descartada) é necessária também para este par de valores, não só para o par específico do outro
    // arquivo de teste.
    it('Personagem D (Ascensão 50x maior, atributos 100.000x menores) supera o Personagem C sob a fórmula exponencial — a hipotética fórmula linear anterior NÃO teria corrigido este par', () => {
        montarMockUseStoreReativo(fichaMinimaScouter({ vida: { base: 60000000000 }, ascensaoBase: 1, divisores: { vida: 0.000000000001 } }));
        const { unmount } = render(<MarcadosPanel />);
        const leituraC = lerPoderGlobalExibido();
        unmount();

        montarMockUseStoreReativo(fichaMinimaScouter({ vida: { base: 600000 }, ascensaoBase: 50 }));
        render(<MarcadosPanel />);
        const leituraD = lerPoderGlobalExibido();

        expect(leituraC).toBe(1200000000000);
        expect(leituraD).toBe(5.01e23);
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
    // Vida MUITO negativa (base=-6e20) com todas as outras 5 categorias zeradas (trava
    // nivelCompletos=0, então ascensaoGeralEfetiva=ascensaoBase=2000 exato, sem overflow
    // contaminando o valor):
    //   poderBase = (-6e20*10)/6 = -1e21
    //   multiplicadorAscensao = 2^min(1000,2000) = 2^1000 ≈ 1,0715e301
    //   poderMultiplicado = -1e21 * 1,0715e301 ≈ -1,0715e322 -> ultrapassa
    //   -Number.MAX_VALUE (-1,7976931348623157e308) -> vira -Infinity em JS
    //   clampFinito(-Infinity) = Math.sign(-Infinity)*1e308 = -1e308 (finito, NEGATIVO)
    //   poderMultiplicado(-1e308) não é > 0 -> ramo else:
    //   poderComAscensao = ascensaoSegura(2000)*10 + (-1e308) = 20.000 - 1e308 ≈ -1e308
    //   (20.000 é desprezível frente a 1e308 — o double resultante é exatamente -1e308)
    //   power = poderComAscensao * (sup/100) = -1e308 * 1 = -1e308 (sup=100 padrão)
    // Leitura final: -1e308 (negativa, finita) — NÃO +1e308 (o que a versão antiga do
    // clampFinito, sem Math.sign, produziria por engano).
    it('poderBase extremamente negativo (vida muito negativa) combinado com Ascensão absurda satura em -1e308 (negativo), nunca em +1e308', () => {
        const ficha = fichaMinimaScouter({
            vida: { base: -6e20 },
            ascensaoBase: 2000,
        });
        montarMockUseStore(ficha);
        render(<MarcadosPanel />);

        const leitura = lerPoderGlobalExibido();
        expect(Number.isFinite(leitura)).toBe(true);
        expect(Number.isNaN(leitura)).toBe(false);
        expect(leitura).toBeLessThan(0);
        expect(leitura).toBe(-1e308);
    });
});

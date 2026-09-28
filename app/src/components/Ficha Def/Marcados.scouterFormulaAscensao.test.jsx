// Nota: onde o teste só precisa variar a Ascensão Geral (expoente do Poder), ela é variada por
// multiplicadorForcaAscensao — uma Ascensão Base > 1 agora também repõe a Base de Prestígio
// equivalente (core/poder.js > getBaseEquivalenteAscensao), o que mudaria o poderBase esperado.
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MarcadosPanel from './Marcados';
import useStore from '../../stores/useStore';
import { amortecerPoderBruto } from '../../core/poder.js';

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

    // Com todo o resto zerado, Poder_Base(vida=6.000.000) = (6.000.000*10)/6 = 10.000.000 e
    // Poder_Base(chakra=6.000.000) = 6.000.000/6 = 1.000.000 — uma razão de exatamente 10x
    // ANTES do amortecimento, refletindo o peso x10 de Vida contra o peso x1 de
    // Chakra/Mana/Corpo/Aura, ambos divididos pelo mesmo /6.
    // 🔥 CURVA DO PODER (opção "E" + base 1,1, pedido do usuário): o Poder Base agora passa
    // por amortecerPoderBruto (poderBase^0,9) ANTES de qualquer multiplicador — como essa
    // função NÃO é linear, ela já não preserva a razão de 10x entre Vida e Chakra: a razão
    // vira 10^0,9 ≈ 7,943 (amortecer(10.000.000)/amortecer(1.000.000) = 10^0,9), não mais 10
    // exato. O restante do pipeline (multiplicadorAscensao=1.1^1=1.1 e a injeção suave
    // ×(1+Ascensão)=×2) é igual nos dois casos e não afeta essa razão.
    // 🔽 vida/chakra/mana bumped ×10.000 (600 -> 6.000.000) nesta sessão: com o Poder
    // Calculado agora dividido por ESCALA_PODER_CALCULADO=1000 (aplicarEscalaPoderCalculado,
    // core/poder.js), o baseline antigo (poderComAscensao≈1102,61/138,81) viraria 1/0 depois
    // da escala — precisão insuficiente pra manter a comparação de razão deste teste.
    // Poder_Base(vida) amortecido ≈ 1.995.262,31 -> poderComAscensao ≈ 4.389.577,09 -> escala
    // /1000 -> poderGlobal 4389, exibido 4390.
    // Poder_Base(chakra) amortecido ≈ 251.188,64 -> poderComAscensao ≈ 552.615,01 -> escala
    // /1000 -> poderGlobal 552, exibido 552.
    it('alterar SOMENTE Vida move a leitura do Scouter MAIS que alterar Chakra pelo mesmo delta (peso x10, atenuado pelo amortecimento ^0,9 pra ~7,94x)', () => {
        montarMockUseStoreReativo(fichaMinimaScouter({ vida: { base: 6000000 } }));
        const { unmount } = render(<MarcadosPanel />);
        const leituraVida = lerPoderGlobalExibido();
        unmount();

        montarMockUseStoreReativo(fichaMinimaScouter({ chakra: { base: 6000000 } }));
        render(<MarcadosPanel />);
        const leituraChakra = lerPoderGlobalExibido();

        expect(leituraVida).toBe(4390);
        expect(leituraChakra).toBe(552);
        // Já não é 10x exato (amortecerPoderBruto não é linear) — a razão TEÓRICA antes do
        // floor/arredondamento de exibição é exatamente 10^0,9, confirmada usando o próprio
        // helper exportado (amortecerPoderBruto), não um número mágico reinventado aqui.
        expect(amortecerPoderBruto(10000000) / amortecerPoderBruto(1000000)).toBeCloseTo(Math.pow(10, 0.9), 10);
        expect(leituraVida / leituraChakra).toBeGreaterThan(7);
        expect(leituraVida / leituraChakra).toBeLessThan(8);
    });

    it('alterar SOMENTE Vida move a leitura MAIS que alterar Mana pelo mesmo delta (peso x1 confirmado numa segunda categoria, mesma razão ~7,94x de Chakra)', () => {
        montarMockUseStoreReativo(fichaMinimaScouter({ vida: { base: 6000000 } }));
        const { unmount } = render(<MarcadosPanel />);
        const leituraVida = lerPoderGlobalExibido();
        unmount();

        montarMockUseStoreReativo(fichaMinimaScouter({ mana: { base: 6000000 } }));
        render(<MarcadosPanel />);
        const leituraMana = lerPoderGlobalExibido();

        expect(leituraVida).toBe(4390);
        expect(leituraMana).toBe(552);
        expect(leituraVida / leituraMana).toBeGreaterThan(7);
        expect(leituraVida / leituraMana).toBeLessThan(8);
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
    // a leitura do Scouter (permanece constante nos dois estados, pelo mesmo
    // failsafe de ascensão com poderMultiplicado<=0 documentado abaixo). Quem
    // quiser que uma entrada do Grimório afete o Poder do Scouter usa agora o
    // campo dedicado "PODER (Direto)" (atributo:'poder_direto').
    // 🔽 multiplicadorForcaAscensao=100000 bumped nesta sessão: poderMultiplicado=0
    // (nenhum buff ativo) cai no ramo <= 0 do failsafe, que soma
    // ascensaoSegura*10 + 0 — com ascensaoSegura=1 (valor original), isso dá só 10,
    // que a escala /1000 (aplicarEscalaPoderCalculado, core/poder.js) arredondaria pra
    // 0 (pouca precisão pra confirmar a leitura constante). Bumpado pra
    // ascensaoSegura=100000 (via multiplicadorForcaAscensao), o resultado passa a ser
    // 100000*10+0=1.000.000 -> escala /1000 -> poderGlobal 1000.
    it('poderes[].efeitos com propriedade "base" NÃO altera mais a leitura do Scouter, ativo ou não', () => {
        const ficha = fichaMinimaScouter({
            multiplicadorForcaAscensao: 100000,
            poderes: [{ nome: 'Bênção Vital', ativa: false, efeitos: [{ atributo: 'vida', propriedade: 'base', valor: 600 }] }],
        });
        const mockState = montarMockUseStoreReativo(ficha);

        const { rerender } = render(<MarcadosPanel />);
        const valorDesligado = lerPoderGlobalExibido();
        // poderMultiplicado=0 (nenhum buff ativo) cai no ramo <= 0 do failsafe de
        // ascensão: poderComAscensao = ascensaoSegura(100000) * 10 + 0 = 1.000.000,
        // escala /1000 -> poderGlobal 1000.
        expect(valorDesligado).toBe(1000);

        mockState.updateFicha((f) => { f.poderes[0].ativa = true; });
        rerender(<MarcadosPanel />);
        const valorLigado = lerPoderGlobalExibido();
        expect(valorLigado).toBe(1000);
        expect(valorLigado).toBe(valorDesligado);

        mockState.updateFicha((f) => { f.poderes[0].ativa = false; });
        rerender(<MarcadosPanel />);
        const valorRevertido = lerPoderGlobalExibido();
        expect(valorRevertido).toBe(1000);
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
    // exponencial: 1.1^ascensaoGeralEfetiva por nível de Ascensão — base
    // reduzida de 2 -> 1.5 -> 1.25 -> 1.1, pedidos sucessivos do usuário, pra suavizar
    // ainda mais o crescimento), e o Poder Base agora é amortecido (^0,9) ANTES do
    // multiplicador de Ascensão:
    //   poderBase = 3.2e10, amortecido = (3.2e10)^0,9 ≈ 2.848.623.026,2
    //   multiplicadorAscensao = 1.1^4 = 1,4641
    //   poderMultiplicado ≈ 2.848.623.026,2 * 1,4641 ≈ 4.170.668.972,66
    //   injeção suave × (1 + Ascensão) = × 5 -> poderComAscensao ≈ 20.853.344.863,3
    //   -> escala /1000 (aplicarEscalaPoderCalculado, core/poder.js) -> poderGlobal
    //   20.853.344, que a leitura do Scouter (toExponential(2)) arredonda para 2.09E7
    //   (20.900.000)
    it('a Ascensão Geral Efetiva multiplica o Poder Base amortecido e é injetada de forma suave (× (1 + Ascensão))', () => {
        // Poder_Base = (vida*10)/6 = 3.2e10  =>  vida = 1.92e10
        const ficha = fichaMinimaScouter({
            vida: { base: 19200000000 },
            multiplicadorForcaAscensao: 4,
            divisores: { vida: 0.000000000001 },
        });
        montarMockUseStoreReativo(ficha);
        render(<MarcadosPanel />);

        const leitura = lerPoderGlobalExibido();
        expect(leitura).toBe(20900000);
    });

    // Failsafe da injeção: poderMultiplicado > 0 (mesmo fracionário, < 1) usa o ramo
    // multiplicativo normalmente (× (1 + Ascensão)) — amortecerPoderBruto (^0,9) também
    // aceita frações positivas sem gerar NaN/-Infinity. Só poderMultiplicado <= 0 (nunca > 0)
    // cai no ramo `else`.
    it('poderMultiplicado fracionário (0 < x < 1 ANTES do multiplicador de Ascensão) usa o ramo multiplicativo normalmente', () => {
        // Poder_Base = (vida*10)/6 com vida=0.3 => 0.5, amortecido (^0,9) ≈ 0,5359.
        // multiplicadorAscensao = 1.1^4 = 1,4641 (ascensaoBase=4, sem overflow)
        // -> poderMultiplicado ≈ 0,5359*1,4641 ≈ 0,7847 (>0, ramo multiplicativo).
        // poderComAscensao = poderMultiplicado * (1 + ascensaoGeralEfetiva(4)) ≈ 0,7847*5 ≈ 3,9236
        // -> Math.floor(power) = 3 (o piso acontece ANTES do toExponential(2) de exibição).
        // 🔽 ESCALA (mesma sessão): a divisão por ESCALA_PODER_CALCULADO=1000
        // (aplicarEscalaPoderCalculado, core/poder.js) acontece ANTES do floor de exibição
        // -- 3,9236/1000=0,0039236, Math.floor(...)=0. Esse cenário é inerentemente de
        // magnitude minúscula (é exatamente o ponto do teste: 0 < poderMultiplicado < 1
        // ANTES do multiplicador de Ascensão) — não dá pra "bumpar" a ficha e continuar
        // exercitando esse ramo específico (qualquer vida grande o bastante pra sobreviver
        // à escala /1000 faria poderMultiplicado ultrapassar 1, saindo do cenário que este
        // teste quer cobrir). O que importa aqui é que o resultado final continua um número
        // finito e determinístico (0), não NaN/Infinity.
        const ficha = fichaMinimaScouter({
            vida: { base: 0.3 },
            multiplicadorForcaAscensao: 4,
        });
        montarMockUseStoreReativo(ficha);
        render(<MarcadosPanel />);

        const leitura = lerPoderGlobalExibido();
        expect(leitura).not.toBeNaN();
        expect(Number.isFinite(leitura)).toBe(true);
        expect(leitura).toBe(0);
    });

    // 🔽 multiplicadorForcaAscensao bumped de 4 pra 4000 nesta sessão: com o valor original
    // (ascensaoGeralEfetiva=4), poderComAscensao=4*10+0=40, que a escala /1000
    // (aplicarEscalaPoderCalculado) arredondaria pra 0 — sem precisão suficiente pra provar
    // que o ramo `else` (linear, sem tocar o multiplicador exponencial) continua funcionando.
    // Bumpado pra ascensaoGeralEfetiva=4000: poderComAscensao=4000*10+0=40.000 -> escala
    // /1000 -> poderGlobal 40.
    it('poderMultiplicado = 0 (todos os atributos zerados) usa o ramo else do failsafe: ascensaoSegura*10 + poderMultiplicado', () => {
        // Nenhum atributo com valor -> Poder_Base = 0 -> poderMultiplicado = 0 (não
        // entra no ramo multiplicativo).
        // poderComAscensao = ascensaoGeralEfetiva(4000) * 10 + 0 = 40.000 -> escala /1000
        // -> poderGlobal 40.
        const ficha = fichaMinimaScouter({ multiplicadorForcaAscensao: 4000 });
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

        // Valor esperado com o fator NOVO (status-only): floor(400000 * 7 / 1000) = 2.800
        // (dividido por 1000 na exibição — reformulação de Status pedida pelo usuário, ver
        // FATOR_EXIBICAO_STATUS em Marcados.jsx; não afeta o Poder Calculado, que lê o valor
        // bruto por outro caminho.)
        const valorEsperadoNovoFator = Math.floor((400000 * 7) / 1000).toLocaleString('pt-BR');
        // Valor que apareceria se ainda estivesse usando o gargalo ANTIGO: floor(400000 * 3 / 1000) = 1.200
        const valorGargaloAntigo = Math.floor((400000 * 3) / 1000).toLocaleString('pt-BR');

        const camposComNovoFator = screen.getAllByDisplayValue(valorEsperadoNovoFator);
        // Um input de "Base" por atributo físico (Força, Destreza, Inteligência,
        // Sabedoria, Energia Espiritual, Carisma, Stamina, Constituição) = 8.
        expect(camposComNovoFator.length).toBe(8);

        expect(screen.queryAllByDisplayValue(valorGargaloAntigo).length).toBe(0);
    });
});

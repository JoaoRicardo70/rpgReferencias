import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MarcadosPanel from './Marcados';
import useStore from '../../stores/useStore';
import { getRank } from '../../core/prestige.js';

// ---------------------------------------------------------------------------
// QA — Multiplicador de Força (aplicarMultiplicadorForca) em Marcados.jsx
//
// aplicarMultiplicadorForca(prestigioBase, ascensaoBase, multiplicadorForcaPrestigio,
// multiplicadorForcaAscensao) é uma função local, não exportada, que escala o
// Prestígio Base pelo seu próprio multiplicador e a Ascensão Base pelo dela — o
// excesso de Prestígio acima de 100 (após escalado) vira Ascensão extra (overflow),
// somada à Ascensão Base já escalada. getRank() é reusado só para o rótulo/cor
// (l, c) do badge; os números exibidos (Ascensão e Prestígio) vêm sempre de
// prestigioFinal/ascensaoFinal, não de getRank().r/.a diretamente. É uma cópia
// fiel da mesma função em TabelaPrestigio.jsx (ver TabelaPrestigio.forca.test.jsx),
// usada na Página 2 ("Análise de Poder") de Marcados.jsx, no grid
// VIDA/MANA/AURA/CHAKRA/CORPO/STATUS.
//
// Como não é exportada, validamos renderizando o componente real, navegando
// para a Página 2 e lendo o badge de Rank + o número de Prestígio exibidos
// na caixa de cada vital.
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    uploadImagem: vi.fn(),
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
}));

const HEX_TO_RGB = {
    '#ff003c': 'rgb(255, 0, 60)',   // D
    '#ccc': 'rgb(204, 204, 204)',   // C
    '#0088ff': 'rgb(0, 136, 255)',  // B
    '#00ff88': 'rgb(0, 255, 136)',  // A
    '#ffcc00': 'rgb(255, 204, 0)',  // S
    '#f0f': 'rgb(255, 0, 255)',     // EX
};

function fichaComVida({ vidaBase = 0, ascensaoBase = 1, multiplicadorForcaPrestigio, multiplicadorForcaAscensao, forcaBase = 0, destrezaBase = 0 } = {}) {
    const ficha = {
        vida: { base: vidaBase },
        mana: { base: 0 },
        aura: { base: 0 },
        chakra: { base: 0 },
        corpo: { base: 0 },
        forca: { base: forcaBase },
        destreza: { base: destrezaBase },
        inteligencia: { base: 0 },
        sabedoria: { base: 0 },
        energiaEsp: { base: 0 },
        carisma: { base: 0 },
        stamina: { base: 0 },
        constituicao: { base: 0 },
        ascensaoBase,
        divisores: {},
        bio: {},
        estetica: {},
        labels: {},
    };
    if (multiplicadorForcaPrestigio !== undefined) ficha.multiplicadorForcaPrestigio = multiplicadorForcaPrestigio;
    if (multiplicadorForcaAscensao !== undefined) ficha.multiplicadorForcaAscensao = multiplicadorForcaAscensao;
    return ficha;
}

function montarMockUseStore(minhaFicha) {
    const mockState = {
        minhaFicha,
        updateFicha: vi.fn((callback) => callback(minhaFicha)),
        meuNome: 'Testador',
        importarDaAbaStatus: vi.fn(),
    };
    useStore.mockImplementation((selector) => (selector ? selector(mockState) : mockState));
}

function irParaPaginaAnalise() {
    const botaoProxima = screen.getByRole('button', { name: /Próxima/ });
    fireEvent.click(botaoProxima);
}

// Localiza a caixa de rank (badge + número) do vital pela sua sigla exibida
// (ex: "VIDA"). Estrutura por card: [linha do header c/ sigla+divisor],
// [caixa do prestígio bruto], [caixa do rank+número] — nessa ordem.
function lerCaixaVital(container, chave) {
    const spans = Array.from(container.querySelectorAll('span'));
    const labelSpan = spans.find(s => s.textContent === chave.toUpperCase());
    const headerRow = labelSpan.parentElement;
    const cardWrapper = headerRow.parentElement;
    const rankBox = cardWrapper.children[2];
    const rankSpans = rankBox.querySelectorAll('span');
    return {
        rankTexto: rankSpans[0].textContent,
        rankCor: rankSpans[0].style.color,
        numero: rankSpans[1].textContent,
    };
}

describe('Marcados — Multiplicador de Força (aplicarMultiplicadorForca, dois parâmetros)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        window.alert = vi.fn();
    });

    afterEach(() => {
        cleanup();
    });

    it('multiplicadores ausentes (default=1 para ambos) reproduz exatamente getRank(prestigio, ascensao) sem multiplicador', () => {
        // vida.base = 63.000.000 -> prestígio real = 63 (regra de VIDA: /1.000.000)
        // multP=1, multA=1 -> prestigioTotal=63, prestigioFinal=63, ascensaoFinal=4
        const ficha = fichaComVida({ vidaBase: 63000000, ascensaoBase: 4 });
        montarMockUseStore(ficha);

        const { container } = render(<MarcadosPanel />);
        irParaPaginaAnalise();

        const esperado = getRank(63, 4);
        const { rankTexto, rankCor, numero } = lerCaixaVital(container, 'vida');

        expect(numero).toBe(esperado.r.toLocaleString('pt-BR'));
        expect(rankTexto).toBe(`Rank ${esperado.l} [A${esperado.a}]`);
        expect(rankCor).toBe(HEX_TO_RGB[esperado.c]);
        expect(esperado.l).toBe('A');
        expect(esperado.r).toBe(63);
        expect(esperado.a).toBe(4);
    });

    it('só multiplicadorForcaPrestigio > 1: escala apenas o Prestígio, overflow vira Ascensão extra, Ascensão Base não é tocada', () => {
        // prestígio=45, ascensãoBase=2, multP=3, multA=1(ausente)
        // prestigioTotal=135, bonusAscensao=1, prestigioFinal=35
        // ascensaoBaseEfetiva=2*1=2, ascensaoFinal=2+1=3
        const ficha = fichaComVida({ vidaBase: 45000000, ascensaoBase: 2, multiplicadorForcaPrestigio: 3 });
        montarMockUseStore(ficha);

        const { container } = render(<MarcadosPanel />);
        irParaPaginaAnalise();

        const { rankTexto, rankCor, numero } = lerCaixaVital(container, 'vida');

        expect(numero).toBe('35');
        expect(rankTexto).toBe('Rank C [A3]');
        expect(rankCor).toBe(HEX_TO_RGB['#ccc']);
        // Não pode divergir: o número exibido não é o prestígio bruto (45) pré-multiplicador.
        expect(numero).not.toBe('45');
    });

    it('só multiplicadorForcaAscensao > 1: escala apenas a Ascensão Base, Prestígio não é tocado', () => {
        // prestígio=25, ascensãoBase=3, multP=1(ausente), multA=4
        // prestigioTotal=25, bonusAscensao=0, prestigioFinal=25
        // ascensaoBaseEfetiva=3*4=12, ascensaoFinal=12+0=12
        const ficha = fichaComVida({ vidaBase: 25000000, ascensaoBase: 3, multiplicadorForcaAscensao: 4 });
        montarMockUseStore(ficha);

        const { container } = render(<MarcadosPanel />);
        irParaPaginaAnalise();

        const { rankTexto, numero } = lerCaixaVital(container, 'vida');

        expect(numero).toBe('25');
        expect(rankTexto).toBe('Rank C [A12]');
    });

    it('multiplicadorForcaPrestigio e multiplicadorForcaAscensao combinados', () => {
        // prestígio=45, ascensãoBase=2, multP=3, multA=2
        // prestigioTotal=135, bonusAscensao=1, prestigioFinal=35
        // ascensaoBaseEfetiva=2*2=4, ascensaoFinal=4+1=5
        const ficha = fichaComVida({ vidaBase: 45000000, ascensaoBase: 2, multiplicadorForcaPrestigio: 3, multiplicadorForcaAscensao: 2 });
        montarMockUseStore(ficha);

        const { container } = render(<MarcadosPanel />);
        irParaPaginaAnalise();

        const { rankTexto, rankCor, numero } = lerCaixaVital(container, 'vida');

        expect(numero).toBe('35');
        expect(rankTexto).toBe('Rank C [A5]');
        expect(rankCor).toBe(HEX_TO_RGB['#ccc']);
    });

    it('overflow que ultrapassa 100 em mais de um bloco gera Ascensão extra proporcional', () => {
        // prestígio=90, ascensãoBase=1, multP=3, multA=1
        // prestigioTotal=270, bonusAscensao=2, prestigioFinal=70
        // ascensaoBaseEfetiva=1*1=1, ascensaoFinal=1+2=3 -> resto=70 cai no Rank A [60,80)
        const ficha = fichaComVida({ vidaBase: 90000000, ascensaoBase: 1, multiplicadorForcaPrestigio: 3 });
        montarMockUseStore(ficha);

        const { container } = render(<MarcadosPanel />);
        irParaPaginaAnalise();

        const { rankTexto, rankCor, numero } = lerCaixaVital(container, 'vida');

        expect(numero).toBe('70');
        expect(rankTexto).toBe('Rank A [A3]');
        expect(rankCor).toBe(HEX_TO_RGB['#00ff88']);
    });

    it('overflow exato em múltiplo de 100 (fórmula literal): prestigioFinal=0 vira Rank D, NÃO MAIS o antigo Rank EX', () => {
        // prestígio=50, ascensãoBase=1, multP=2, multA=1 -> prestigioTotal=100 exatamente
        // bonusAscensao=floor(100/100)=1, prestigioFinal = 100 % 100 = 0 (JS puro, sem caso especial)
        // ascensaoBaseEfetiva=1*1=1, ascensaoFinal=1+1=2
        // Nota: este é o comportamento aceito da fórmula literal — diferente do getRank()
        // "cru", que trataria resto=0 pós-overflow como caso especial (EX). Aqui o
        // prestigioFinal já chega em 0 ANTES de entrar no getRank(), então vira Rank D.
        const ficha = fichaComVida({ vidaBase: 50000000, ascensaoBase: 1, multiplicadorForcaPrestigio: 2 });
        montarMockUseStore(ficha);

        const { container } = render(<MarcadosPanel />);
        irParaPaginaAnalise();

        const { rankTexto, rankCor, numero } = lerCaixaVital(container, 'vida');

        expect(numero).toBe('0');
        expect(rankTexto).toBe('Rank D [A2]');
        expect(rankCor).toBe(HEX_TO_RGB['#ff003c']);
    });

    it('multiplicadores inválidos (NaN/string e 0) caem no fallback parseFloat(x)||1 = 1 para cada um independentemente', () => {
        // prestígio=25, ascensãoBase=3; multP='abc' -> NaN -> fallback 1; multA=0 -> falsy -> fallback 1
        // Resultado idêntico ao caso "ambos ausentes" com os mesmos prestigio/ascensaoBase.
        const ficha = fichaComVida({ vidaBase: 25000000, ascensaoBase: 3, multiplicadorForcaPrestigio: 'abc', multiplicadorForcaAscensao: 0 });
        montarMockUseStore(ficha);

        const { container } = render(<MarcadosPanel />);
        irParaPaginaAnalise();

        const esperado = getRank(25, 3);
        const { rankTexto, numero } = lerCaixaVital(container, 'vida');

        expect(numero).toBe(esperado.r.toLocaleString('pt-BR'));
        expect(rankTexto).toBe(`Rank ${esperado.l} [A${esperado.a}]`);
        expect(rankTexto).toBe('Rank C [A3]');
        expect(numero).toBe('25');
    });

    it('prestígio negativo com multiplicadores: resto do JS puro pode ficar negativo (não clampado) e ainda assim escora Rank D', () => {
        // vida.base negativo -> prestígio real = -5; multP=4, multA=1
        // prestigioTotal=-20, bonusAscensao=floor(-20/100)=-1, prestigioFinal = -20 % 100 = -20 (JS puro)
        // ascensaoBaseEfetiva=3*1=3, ascensaoFinal=3+(-1)=2
        // getRank(-20, 2): v<0 -> resto=0 -> Rank D; ascTotal=2 (bate com nosso ascensaoFinal)
        const ficha = fichaComVida({ vidaBase: -5000000, ascensaoBase: 3, multiplicadorForcaPrestigio: 4 });
        montarMockUseStore(ficha);

        const { container } = render(<MarcadosPanel />);
        irParaPaginaAnalise();

        const { rankTexto, rankCor, numero } = lerCaixaVital(container, 'vida');

        // O número exibido é o prestigioFinal bruto (variável própria da função), não o
        // "resto" clampado internamente pelo getRank() — por isso pode aparecer negativo.
        expect(numero).toBe('-20');
        expect(rankTexto).toBe('Rank D [A2]');
        expect(rankCor).toBe(HEX_TO_RGB['#ff003c']);
    });

    it('prestígio zero com multiplicadores não gera Ascensão extra nem erro', () => {
        // prestígio=0 * multP=2 = 0; ascensaoBaseEfetiva=5*1=5; ascensaoFinal=5+0=5
        const ficha = fichaComVida({ vidaBase: 0, ascensaoBase: 5, multiplicadorForcaPrestigio: 2 });
        montarMockUseStore(ficha);

        const { container } = render(<MarcadosPanel />);
        irParaPaginaAnalise();

        const { rankTexto, numero } = lerCaixaVital(container, 'vida');

        expect(numero).toBe('0');
        expect(rankTexto).toBe('Rank D [A5]');
    });

    it('badge de Rank (l, c) e número exibido (prestigioFinal, ascensaoFinal) nunca divergem — vêm da mesma chamada', () => {
        const ficha = fichaComVida({ vidaBase: 45000000, ascensaoBase: 2, multiplicadorForcaPrestigio: 3, multiplicadorForcaAscensao: 2 });
        montarMockUseStore(ficha);

        const { container } = render(<MarcadosPanel />);
        irParaPaginaAnalise();

        const { rankTexto, numero } = lerCaixaVital(container, 'vida');
        const numeroExibido = Number(numero.replace(/\./g, ''));

        expect(rankTexto).toContain('Rank C');
        expect(rankTexto).toContain('[A5]');
        expect(numeroExibido).toBeGreaterThanOrEqual(20);
        expect(numeroExibido).toBeLessThan(40);
        expect(numeroExibido).toBe(35);
    });
});

// ---------------------------------------------------------------------------
// QA — Reatividade de LinhaAtributoCru (Multiplicador de Força como Energia)
//
// Regra de negócio (Game Designer): a "Força Mística" é uma Energia, não uma
// Forma — seus dois multiplicadores (multiplicadorForcaPrestigio e
// multiplicadorForcaAscensao) devem escalar IGUALMENTE as duas colunas do
// atributo: a Base (esquerda, editável) e o Poder Atual c/ Formas (direita).
// multiplicadorForcaTotal = multiplicadorForcaPrestigio * multiplicadorForcaAscensao.
//
// Estaca Zero Absoluta: com os dois multiplicadores no padrão (1), o total é 1
// e a tela mostra o valor puro do banco em ambas as colunas, sem nenhuma soma
// ou bônus extra — inclusive ignorando ascensaoBase e o Prestígio/Ascensão do
// grupo STATUS (a via que causou o bug anterior, pois nunca fica realmente
// neutra em multP=multA=1). Quando os multiplicadores sobem, as duas colunas
// escalam proporcionalmente pelo mesmo fator.
//
// A coluna Base continua editável: enquanto desfocada, mostra o preview escalado
// (rawBase * multiplicadorForcaTotal); ao ganhar foco, revela e edita o valor
// PURO do banco (sem escala), e grava exatamente o que foi digitado. Isso evita
// qualquer arredondamento/divisão no save — que perderia dígitos sempre que o
// multiplicador não fosse um divisor exato do valor digitado.
// ---------------------------------------------------------------------------

function fichaComAtributoFisico({ forcaBase, destrezaBase, ascensaoBase, multiplicadorForcaPrestigio, multiplicadorForcaAscensao }) {
    const ficha = {
        vida: { base: 0 },
        mana: { base: 0 },
        aura: { base: 0 },
        chakra: { base: 0 },
        corpo: { base: 0 },
        forca: { base: forcaBase },
        destreza: { base: destrezaBase },
        inteligencia: { base: 0 },
        sabedoria: { base: 0 },
        energiaEsp: { base: 0 },
        carisma: { base: 0 },
        stamina: { base: 0 },
        constituicao: { base: 0 },
        ascensaoBase,
        multiplicadorForcaPrestigio,
        multiplicadorForcaAscensao,
        divisores: {},
        bio: {},
        estetica: {},
        labels: {},
    };
    return ficha;
}

function montarMockUseStoreAtributo(minhaFicha) {
    const mockState = {
        minhaFicha,
        updateFicha: vi.fn((callback) => callback(minhaFicha)),
        meuNome: 'Testador',
        importarDaAbaStatus: vi.fn(),
    };
    useStore.mockImplementation((selector) => (selector ? selector(mockState) : mockState));
}

describe('Marcados — LinhaAtributoCru escala Base e Atual pelo Multiplicador de Força (Energia)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        window.alert = vi.fn();
    });

    afterEach(() => {
        cleanup();
    });

    it('Multiplicadores de Força além de 1 escalam AMBAS as colunas (Base e Poder Atual) pelo mesmo fator, ignorando ascensaoBase', () => {
        // forca.base=40 -> maxVal (safeGetMaximo) = 40 (sem buffs/mFormas).
        // multP=2, multA=1 -> multiplicadorForcaTotal=2. ascensaoBase=2 é um "isca"
        // para provar que NÃO participa dessa fórmula (só multP*multA importam).
        const ficha = fichaComAtributoFisico({
            forcaBase: 40,
            destrezaBase: 503960,
            ascensaoBase: 2,
            multiplicadorForcaPrestigio: 2,
            multiplicadorForcaAscensao: 1,
        });
        montarMockUseStoreAtributo(ficha);

        render(<MarcadosPanel />);
        irParaPaginaAnalise();

        // Há duas linhas "Força" na Página 2: a primeira pertence ao card "Status (Rank
        // Base)" (isAtual=false), a segunda ao card "Poder Atual (c/ Formas)" (isAtual=true) —
        // nessa ordem de renderização no JSX.
        const inputsForca = screen.getAllByDisplayValue('Força');
        expect(inputsForca).toHaveLength(2);

        const linhaBase = inputsForca[0].parentElement;
        const linhaAtual = inputsForca[1].parentElement;

        // Card "Status (Rank Base)" (isAtual=false): 40 * multiplicadorForcaTotal(2) = 80.
        const inputValorBase = linhaBase.children[1];
        expect(inputValorBase.tagName).toBe('INPUT');
        expect(inputValorBase.value).toBe('80');

        // Card "Poder Atual (c/ Formas)" (isAtual=true): maxVal(40) * 2 = 80 — escala igual à Base.
        const spanValorAtual = linhaAtual.children[1];
        expect(spanValorAtual.tagName).toBe('SPAN');
        expect(spanValorAtual.textContent).toBe((80).toLocaleString('pt-BR'));
        expect(inputValorBase.value).toBe(spanValorAtual.textContent);
    });

    it('teste mental da UI: Base=30.000, Mult. Força (Prestígio)=1, Mult. Força (Ascensão)=1 -> DEVE retornar 30.000 em ambas as colunas (Estaca Zero Absoluta)', () => {
        const ficha = fichaComAtributoFisico({
            forcaBase: 30000,
            destrezaBase: 0,
            ascensaoBase: 1,
            multiplicadorForcaPrestigio: 1,
            multiplicadorForcaAscensao: 1,
        });
        montarMockUseStoreAtributo(ficha);

        render(<MarcadosPanel />);
        irParaPaginaAnalise();

        const inputsForca = screen.getAllByDisplayValue('Força');
        const linhaBase = inputsForca[0].parentElement;
        const linhaAtual = inputsForca[1].parentElement;

        expect(linhaBase.children[1].value).toBe((30000).toLocaleString('pt-BR'));
        expect(linhaAtual.children[1].textContent).toBe((30000).toLocaleString('pt-BR'));
    });

    it('sem multiplicadores/ascensão customizados (defaults=1), Base e Poder Atual permanecem no valor puro do banco', () => {
        const ficha = fichaComAtributoFisico({
            forcaBase: 10,
            destrezaBase: 0,
            ascensaoBase: undefined,
            multiplicadorForcaPrestigio: undefined,
            multiplicadorForcaAscensao: undefined,
        });
        montarMockUseStoreAtributo(ficha);

        render(<MarcadosPanel />);
        irParaPaginaAnalise();

        const inputsForca = screen.getAllByDisplayValue('Força');
        const linhaBase = inputsForca[0].parentElement;
        const linhaAtual = inputsForca[1].parentElement;

        expect(linhaBase.children[1].value).toBe('10');
        expect(linhaAtual.children[1].textContent).toBe('10');
    });

    it('atributo com Forma/Passiva ativa (buff real via getBuffs/getMaximo) tem o buff escalado junto pelo Multiplicador de Força — usa attrKey diferente de força/destreza (constituição) para provar que não é específico de atributo', () => {
        // constituicao.base=100; poder ativo concede +50 de "base" -> safeGetMaximo = 150.
        // multP=5, multA=2 -> multiplicadorForcaTotal=10.
        // Base exibida: 100 * 10 = 1000. Poder Atual: 150 * 10 = 1500.
        const ficha = fichaComAtributoFisico({
            forcaBase: 0,
            destrezaBase: 0,
            ascensaoBase: 3,
            multiplicadorForcaPrestigio: 5,
            multiplicadorForcaAscensao: 2,
        });
        ficha.constituicao = { base: 100 };
        ficha.poderes = [{
            nome: 'Couraça Ancestral',
            ativa: true,
            efeitos: [{ atributo: 'constituicao', propriedade: 'base', valor: 50 }],
        }];
        montarMockUseStoreAtributo(ficha);

        render(<MarcadosPanel />);
        irParaPaginaAnalise();

        const inputsConstituicao = screen.getAllByDisplayValue('Constituição');
        expect(inputsConstituicao).toHaveLength(2);

        const linhaBase = inputsConstituicao[0].parentElement;
        const linhaAtual = inputsConstituicao[1].parentElement;

        // Card "Status (Rank Base)" (isAtual=false): 100 * 10 = 1000 (valor bruto, escalado).
        const inputValorBase = linhaBase.children[1];
        expect(inputValorBase.value).toBe((1000).toLocaleString('pt-BR'));

        // Card "Poder Atual (c/ Formas)" (isAtual=true): (100+50) * 10 = 1500.
        const spanValorAtual = linhaAtual.children[1];
        expect(spanValorAtual.textContent).toBe((1500).toLocaleString('pt-BR'));
    });

    it('campo Base revela o valor puro do banco ao ganhar foco (não o preview escalado) e grava exatamente o que o jogador digitar, sem nenhuma divisão pelo multiplicador', () => {
        // multP=3, multA=1 -> multiplicadorForcaTotal=3 (não é divisor exato de valores
        // arbitrários — se houvesse arredondamento no save, dígitos digitados seriam
        // perdidos). Exibido enquanto desfocado: 40*3=120.
        const ficha = fichaComAtributoFisico({
            forcaBase: 40,
            destrezaBase: 0,
            ascensaoBase: 1,
            multiplicadorForcaPrestigio: 3,
            multiplicadorForcaAscensao: 1,
        });
        montarMockUseStoreAtributo(ficha);

        render(<MarcadosPanel />);
        irParaPaginaAnalise();

        const inputsForca = screen.getAllByDisplayValue('Força');
        const inputValorBase = inputsForca[0].parentElement.children[1];
        expect(inputValorBase.value).toBe('120');

        // Ao focar, o campo passa a mostrar o valor PURO (40), não o preview (120) —
        // edição sempre em cima do dado real, nunca do valor escalado.
        fireEvent.focus(inputValorBase);
        expect(inputValorBase.value).toBe('40');

        fireEvent.change(inputValorBase, { target: { value: '101' } });

        // O banco grava exatamente o que foi digitado — sem dividir pelo multiplicador
        // (101 não é múltiplo de 3; qualquer divisão arredondada perderia precisão).
        expect(ficha.forca.base).toBe(101);
    });

    it('ao perder o foco após editar, o campo Base volta a mostrar o preview escalado recalculado com o novo valor puro — não fica travado exibindo o valor cru', () => {
        // multP=3, multA=1 -> multiplicadorForcaTotal=3. Base inicial 40 -> preview 120.
        const ficha = fichaComAtributoFisico({
            forcaBase: 40,
            destrezaBase: 0,
            ascensaoBase: 1,
            multiplicadorForcaPrestigio: 3,
            multiplicadorForcaAscensao: 1,
        });
        montarMockUseStoreAtributo(ficha);

        render(<MarcadosPanel />);
        irParaPaginaAnalise();

        const inputsForca = screen.getAllByDisplayValue('Força');
        const inputValorBase = inputsForca[0].parentElement.children[1];
        expect(inputValorBase.value).toBe('120');

        fireEvent.focus(inputValorBase);
        expect(inputValorBase.value).toBe('40');

        fireEvent.change(inputValorBase, { target: { value: '50' } });
        expect(ficha.forca.base).toBe(50);

        // Ao desfocar, attrBaseFocado volta a null e a linha volta a exibir o preview
        // escalado — recalculado sobre o NOVO valor puro (50), não o antigo (40).
        fireEvent.blur(inputValorBase);
        expect(inputValorBase.value).toBe('150');
    });

    it('attrBaseFocado é um estado global (uma única variável para todas as linhas): focar a Base de Força não deve exibir o valor cru na Base de Destreza, nem afetar a coluna Poder Atual de nenhuma das duas', () => {
        // multP=2, multA=1 -> multiplicadorForcaTotal=2.
        // forca.base=40 -> preview Base=80, Atual(maxVal=40)*2=80.
        // destreza.base=25 -> preview Base=50, Atual(maxVal=25)*2=50.
        const ficha = fichaComAtributoFisico({
            forcaBase: 40,
            destrezaBase: 25,
            ascensaoBase: 1,
            multiplicadorForcaPrestigio: 2,
            multiplicadorForcaAscensao: 1,
        });
        montarMockUseStoreAtributo(ficha);

        render(<MarcadosPanel />);
        irParaPaginaAnalise();

        const inputsForca = screen.getAllByDisplayValue('Força');
        const inputsDestreza = screen.getAllByDisplayValue('Destreza');
        const forcaBaseInput = inputsForca[0].parentElement.children[1];
        const forcaAtualSpan = inputsForca[1].parentElement.children[1];
        const destrezaBaseInput = inputsDestreza[0].parentElement.children[1];
        const destrezaAtualSpan = inputsDestreza[1].parentElement.children[1];

        expect(forcaBaseInput.value).toBe('80');
        expect(destrezaBaseInput.value).toBe('50');

        // Foca apenas a linha de Força.
        fireEvent.focus(forcaBaseInput);

        // Força revela o valor cru (40); Destreza permanece no preview escalado (50) —
        // attrBaseFocado só casa com attrKey='forca', não com 'destreza'.
        expect(forcaBaseInput.value).toBe('40');
        expect(destrezaBaseInput.value).toBe('50');

        // A coluna "Poder Atual" (span, sem noção de foco) nunca é afetada pelo foco
        // do campo Base — nem a da própria Força, nem a de Destreza.
        expect(forcaAtualSpan.textContent).toBe('80');
        expect(destrezaAtualSpan.textContent).toBe('50');

        // Desfoca Força e foca Destreza: Força deve voltar ao preview escalado (não
        // ficar presa exibindo o valor cru), e agora Destreza revela seu valor cru.
        fireEvent.blur(forcaBaseInput);
        fireEvent.focus(destrezaBaseInput);

        expect(forcaBaseInput.value).toBe('80');
        expect(destrezaBaseInput.value).toBe('25');
        expect(forcaAtualSpan.textContent).toBe('80');
        expect(destrezaAtualSpan.textContent).toBe('50');
    });
});

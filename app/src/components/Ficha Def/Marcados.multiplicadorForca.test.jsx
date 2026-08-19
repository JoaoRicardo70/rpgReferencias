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
// QA — Reatividade de LinhaAtributoCru (fix de fórmula)
//
// Bug corrigido: o card "Poder Atual (c/ Formas)" (isAtual=true) estava
// aplicando um bônus passivo indevido, usando o Prestígio/Ascensão do grupo
// 'status' (derivado da soma de TODOS os atributos físicos crus) como um
// multiplicador percentual automático sobre cada atributo — mesmo sem
// nenhuma Forma/Passiva ativa e com os Multiplicadores de Força em 1.
//
// Regra correta: Prestígio/Ascensão são variáveis de referência (cultivação)
// e não inflam o atributo sozinhas. O card "Poder Atual (c/ Formas)" deve
// mostrar exatamente safeGetMaximo(ficha, attrKey) — que já inclui os buffs
// de Formas/Passivas do próprio atributo via getBuffs()/getMaximo(). Ou
// seja: sem formas/passivas ativas, Poder_Atual === Poder_Base sempre,
// independente do valor de ascensaoBase ou dos Multiplicadores de Força.
// O card "Status (Rank Base)" (isAtual=false) continua mostrando o valor
// bruto (safeGetMaximo), sem nenhuma escala — inalterado.
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

describe('Marcados — LinhaAtributoCru NÃO deve escalar por Ascensão/Prestígio do grupo status (bugfix)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        window.alert = vi.fn();
    });

    afterEach(() => {
        cleanup();
    });

    it('card "Poder Atual (c/ Formas)" reflete exatamente o Poder Base (maxVal) quando não há formas/passivas e os Multiplicadores de Força estão além de 1 — Prestígio/Ascensão de STATUS não devem inflar o atributo', () => {
        // forca.base=40 -> maxVal (safeGetMaximo) = 40 (sem buffs/mFormas).
        // ascensaoBase=2, multP=2, multA=1 são variáveis de referência (cultivação);
        // como não há nenhuma Forma/Passiva ativa em 'forca', elas NÃO devem alterar
        // o Poder Atual. Estaca zero: Poder_Atual === Poder_Base.
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

        // Card "Status (Rank Base)" (isAtual=false): valor bruto, sem escala.
        const inputValorBase = linhaBase.children[1];
        expect(inputValorBase.tagName).toBe('INPUT');
        expect(inputValorBase.value).toBe('40');

        // Card "Poder Atual (c/ Formas)" (isAtual=true): sem formas/passivas ativas,
        // deve ser idêntico ao Poder Base — sem bônus automático de Prestígio/Ascensão.
        const spanValorAtual = linhaAtual.children[1];
        expect(spanValorAtual.tagName).toBe('SPAN');
        expect(spanValorAtual.textContent).toBe((40).toLocaleString('pt-BR'));
        expect(inputValorBase.value).toBe(spanValorAtual.textContent);
    });

    it('teste mental da UI: Base=30.000, Mult. Força (Prestígio)=1, Mult. Força (Ascensão)=1 -> Poder Atual DEVE retornar 30.000', () => {
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
        const linhaAtual = inputsForca[1].parentElement;
        const spanValorAtual = linhaAtual.children[1];

        expect(spanValorAtual.textContent).toBe((30000).toLocaleString('pt-BR'));
    });

    it('sem multiplicadores/ascensão customizados (defaults=1), o card "Poder Atual" permanece igual ao Poder Base', () => {
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
        const linhaAtual = inputsForca[1].parentElement;
        const spanValorAtual = linhaAtual.children[1];

        expect(spanValorAtual.textContent).toBe('10');
    });

    it('atributo com Forma/Passiva ativa (buff real via getBuffs/getMaximo) continua refletido no Poder Atual — não é zerado para o base cru, e o teste usa um attrKey diferente de força/destreza (constituição) para provar que o fix não é específico de atributo', () => {
        // constituicao.base=100; poder ativo concede +50 de "base" a 'constituicao'
        // via efeitos (prop='base', atributo='constituicao'). safeGetMaximo deve
        // retornar (100 + 50) * 1 = 150 — o buff real deve aparecer, provando que o
        // fix não força valorAtual para o base bruto (o que zeraria o buff).
        // ascensaoBase e os Multiplicadores de Força ficam em valores "tentadores"
        // para garantir que, mesmo com eles != 1, não há inflação indevida por cima
        // do buff real de Forma.
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

        // Card "Status (Rank Base)" (isAtual=false): valor bruto do campo base, sem buffs.
        const inputValorBase = linhaBase.children[1];
        expect(inputValorBase.value).toBe('100');

        // Card "Poder Atual (c/ Formas)" (isAtual=true): base + buff real da Forma ativa.
        const spanValorAtual = linhaAtual.children[1];
        expect(spanValorAtual.textContent).toBe((150).toLocaleString('pt-BR'));
        expect(spanValorAtual.textContent).not.toBe('100');
    });
});

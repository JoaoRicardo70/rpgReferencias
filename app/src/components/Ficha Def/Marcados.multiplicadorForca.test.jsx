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
// QA — Amarração final: lista de atributos reage ao MESMO fator que os Radares
//
// Regra de negócio (Game Designer): a lista de atributos (Força, Destreza, etc.)
// deve receber a mesma reatividade dos gráficos de radar — a cada 1 Ascensão
// COMPLETA nas 6 categorias (vida/mana/aura/chakra/corpo/status), o personagem
// ganha +1 de Ascensão Geral invisível somada à Base. "Completa" = o MENOR
// overflow de Ascensão (bônus além da Ascensão Base já escalada por
// multiplicadorForcaAscensao) entre as 6 categorias — a categoria mais fraca
// limita o nível geral. `fatorCrescimentoAtributos` (calculado uma vez em
// MarcadosPanel) = ascensaoGeralEfetiva / ascensaoBase do banco, e escala Base e
// Poder Atual da lista de atributos na mesma proporção — SEM multiplicar
// multiplicadorForcaPrestigio/Ascensao diretamente sobre o atributo (isso seria
// double-dipping; eles só entram via a cascata de Prestígio/Ascensão das 6
// categorias, exatamente como no Radar).
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

describe('Marcados — LinhaAtributoCru escala pelo fatorCrescimentoAtributos (mesma cascata dos Radares, sem double-dipping)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        window.alert = vi.fn();
    });

    afterEach(() => {
        cleanup();
    });

    it('teste mental da UI: Base=30.000, Mult. Força (Prestígio)=1, Mult. Força (Ascensão)=1, sem overflow -> DEVE retornar 30.000 em ambas as colunas (Estaca Zero)', () => {
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
        expect(inputsForca[0].parentElement.children[1].value).toBe((30000).toLocaleString('pt-BR'));
        expect(inputsForca[1].parentElement.children[1].textContent).toBe((30000).toLocaleString('pt-BR'));
    });

    it('multiplicadorForcaAscensao > 1 sem overflow escala a lista de atributos exatamente pelo próprio multA (fator = ascensaoBase*multA/ascensaoBase = multA)', () => {
        // ascensaoBase=2, multA=3, forcaBase=40 pequeno o bastante para não gerar overflow
        // em nenhuma das 6 categorias -> nivelCompletos=0 -> geral=(2+0)*3=6 -> fator=6/2=3.
        const ficha = fichaComAtributoFisico({
            forcaBase: 40,
            destrezaBase: 0,
            ascensaoBase: 2,
            multiplicadorForcaPrestigio: 1,
            multiplicadorForcaAscensao: 3,
        });
        montarMockUseStoreAtributo(ficha);

        render(<MarcadosPanel />);
        irParaPaginaAnalise();

        const inputsForca = screen.getAllByDisplayValue('Força');
        expect(inputsForca[0].parentElement.children[1].value).toBe((120).toLocaleString('pt-BR'));
        expect(inputsForca[1].parentElement.children[1].textContent).toBe((120).toLocaleString('pt-BR'));
    });

    it('multiplicadorForcaPrestigio alto SEM causar overflow em nenhuma categoria NÃO altera a lista de atributos (sem double-dipping: só overflow real conta)', () => {
        // forcaBase=40 é pequeno demais para o Prestígio de STATUS estourar 100 mesmo
        // com multP=5 -> nivelCompletos continua 0 -> fator continua 1, mesmo com multP alto.
        const ficha = fichaComAtributoFisico({
            forcaBase: 40,
            destrezaBase: 0,
            ascensaoBase: 1,
            multiplicadorForcaPrestigio: 5,
            multiplicadorForcaAscensao: 1,
        });
        montarMockUseStoreAtributo(ficha);

        render(<MarcadosPanel />);
        irParaPaginaAnalise();

        const inputsForca = screen.getAllByDisplayValue('Força');
        expect(inputsForca[0].parentElement.children[1].value).toBe('40');
        expect(inputsForca[1].parentElement.children[1].textContent).toBe('40');
    });

    it('overflow uniforme nas 6 categorias (100 Prestígios = 1 Ascensão) eleva nivelCompletos e escala a lista de atributos proporcionalmente', () => {
        // Prestígio=150 em TODAS as 6 categorias (vida/mana/aura/chakra/corpo/status),
        // ascensaoBase=1, multP=2 -> prestigioTotal=300, bonusAscensao=3 em cada uma ->
        // nivelCompletos=3 -> geral=(1+3)*1=4 -> fator=4/1=4.
        const ficha = {
            vida: { base: 150000000 },       // floor(150000000/1e6) = 150
            mana: { base: 1500000000 },      // floor(1500000000/1e7) = 150
            aura: { base: 1500000000 },
            chakra: { base: 1500000000 },
            corpo: { base: 1500000000 },
            forca: { base: 1200000 },        // soma dos 8 físicos = 1.200.000 -> média/1000 = 150
            destreza: { base: 0 },
            inteligencia: { base: 0 },
            sabedoria: { base: 0 },
            energiaEsp: { base: 0 },
            carisma: { base: 0 },
            stamina: { base: 0 },
            constituicao: { base: 0 },
            ascensaoBase: 1,
            multiplicadorForcaPrestigio: 2,
            multiplicadorForcaAscensao: 1,
            divisores: {},
            bio: {},
            estetica: {},
            labels: {},
        };
        montarMockUseStoreAtributo(ficha);

        render(<MarcadosPanel />);
        irParaPaginaAnalise();

        const inputsForca = screen.getAllByDisplayValue('Força');
        expect(inputsForca[0].parentElement.children[1].value).toBe((4800000).toLocaleString('pt-BR'));
        expect(inputsForca[1].parentElement.children[1].textContent).toBe((4800000).toLocaleString('pt-BR'));
    });

    it('atributo com Forma/Passiva ativa (buff real via getBuffs/getMaximo) é escalado pelo fatorCrescimentoAtributos junto com a Base', () => {
        // constituicao.base=100; poder ativo concede +50 de "base" -> safeGetMaximo = 150.
        // ascensaoBase=3, multA=2, sem overflow (bases pequenas) -> fator = (3+0)*2/3 = 2.
        const ficha = fichaComAtributoFisico({
            forcaBase: 0,
            destrezaBase: 0,
            ascensaoBase: 3,
            multiplicadorForcaPrestigio: 1,
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

        expect(inputsConstituicao[0].parentElement.children[1].value).toBe((200).toLocaleString('pt-BR'));
        expect(inputsConstituicao[1].parentElement.children[1].textContent).toBe((300).toLocaleString('pt-BR'));
    });

    it('campo Base revela o valor puro do banco ao ganhar foco e grava exatamente o que o jogador digitar, sem nenhuma divisão pelo fator', () => {
        const ficha = fichaComAtributoFisico({
            forcaBase: 40,
            destrezaBase: 0,
            ascensaoBase: 2,
            multiplicadorForcaPrestigio: 1,
            multiplicadorForcaAscensao: 3,
        });
        montarMockUseStoreAtributo(ficha);

        render(<MarcadosPanel />);
        irParaPaginaAnalise();

        const inputValorBase = screen.getAllByDisplayValue('Força')[0].parentElement.children[1];
        // fator=3 (mesma conta do teste de multA isolado acima) -> preview desfocado = 120.
        expect(inputValorBase.value).toBe((120).toLocaleString('pt-BR'));

        fireEvent.focus(inputValorBase);
        expect(inputValorBase.value).toBe('40');

        fireEvent.change(inputValorBase, { target: { value: '101' } });

        expect(ficha.forca.base).toBe(101);
    });

    it('quando uma Forma/Passiva causa overflow extra APENAS na cascata com mFormas, a coluna Base (radar sem Formas) e a coluna Poder Atual (radar com Formas) usam fatores DIFERENTES — não mais um fator único compartilhado', () => {
        // vida.mFormas=2.2 empurra SÓ a cascata "com Formas" da categoria vida de
        // Prestígio=250 (bônus=2) para 250*2.2=550 (bônus=5) — mFormas não é lido nas
        // outras 4 categorias (mana/aura/chakra/corpo), que ficam fixas em bônus=5 (via
        // Prestígio=550), nem em 'status' (via forca, sem mFormas, também bônus=5).
        // Cascata SEM Formas (Base/radar isAtual=false): bônus=[vida=2,mana=5,aura=5,
        //   chakra=5,corpo=5,status=5] -> nivelCompletos=min=2 -> geral=(1+2)*1=3 -> fatorBase=3.
        // Cascata COM Formas (Atual/radar isAtual=true): bônus=[vida=5,mana=5,aura=5,
        //   chakra=5,corpo=5,status=5] -> nivelCompletos=min=5 -> geral=(1+5)*1=6 -> fatorAtual=6.
        // 'vida' não é um atributo físico da lista (Força/Destreza/...), então seu
        // mFormas não interfere no cálculo de safeGetMaximo('forca') — usamos Força
        // (base=4.400.000, sem mFormas próprio) como sonda limpa dessa divergência.
        const ficha = {
            vida: { base: 250000000, mFormas: 2.2 }, // Prestígio bruto=250
            mana: { base: 5500000000 },              // Prestígio=550
            aura: { base: 5500000000 },
            chakra: { base: 5500000000 },
            corpo: { base: 5500000000 },
            forca: { base: 4400000 },                // soma dos 8 físicos=4.400.000 -> média/1000=550
            destreza: { base: 0 },
            inteligencia: { base: 0 },
            sabedoria: { base: 0 },
            energiaEsp: { base: 0 },
            carisma: { base: 0 },
            stamina: { base: 0 },
            constituicao: { base: 0 },
            ascensaoBase: 1,
            multiplicadorForcaPrestigio: 1,
            multiplicadorForcaAscensao: 1,
            divisores: {},
            bio: {},
            estetica: {},
            labels: {},
        };
        montarMockUseStoreAtributo(ficha);

        render(<MarcadosPanel />);
        irParaPaginaAnalise();

        const inputsForca = screen.getAllByDisplayValue('Força');

        // Base (fatorBase=3): 4.400.000 * 3 = 13.200.000.
        expect(inputsForca[0].parentElement.children[1].value).toBe((13200000).toLocaleString('pt-BR'));
        // Atual (fatorAtual=6, maxVal=4.400.000 sem buffs próprios): 4.400.000 * 6 = 26.400.000.
        expect(inputsForca[1].parentElement.children[1].textContent).toBe((26400000).toLocaleString('pt-BR'));

        // O indicador "Ascensão Geral Efetiva" mostra a leitura COM Formas (nível=6).
        expect(screen.getByText('6')).toBeTruthy();
    });
});

// ---------------------------------------------------------------------------
// QA — Reatividade dos Gráficos de Radar (Status Rank Base / Poder Atual)
//
// Os dois radares (isAtual=false = "Status Rank Base", isAtual=true = "Poder
// Atual") plotam as 6 categorias VIDA/MANA/AURA/CHAKRA/CORPO/STATUS usando o
// Prestígio/Ascensão EFETIVO (pós-overflow, já passando por
// aplicarMultiplicadorForca) — não mais o valor bruto. Como a Força Mística
// buffa o personagem como um todo, os dois radares devem reagir igualmente aos
// multiplicadores; sem eles (mult=1), o resultado deve ser idêntico ao cálculo
// original (getRank aplicado direto sobre Prestígio/Ascensão crus).
// ---------------------------------------------------------------------------

function lerTextosRadar(container, label) {
    return Array.from(container.querySelectorAll('text'))
        .filter(t => t.textContent.includes(label))
        .map(t => t.textContent);
}

describe('Marcados — Gráficos de Radar reagem ao Multiplicador de Força (Prestígio/Ascensão efetivos)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        window.alert = vi.fn();
    });

    afterEach(() => {
        cleanup();
    });

    it('Estaca Zero: multiplicadores em 1 (padrão) reproduzem exatamente getRank(prestigioBase, ascensaoBase) em AMBOS os radares', () => {
        // vida.base=63.000.000 -> prestígio real=63; ascensaoBase=4; sem mFormas.
        const ficha = fichaComVida({ vidaBase: 63000000, ascensaoBase: 4 });
        montarMockUseStore(ficha);

        const { container } = render(<MarcadosPanel />);
        irParaPaginaAnalise();

        const esperado = getRank(63, 4);
        const textosVida = lerTextosRadar(container, 'VIDA');

        expect(textosVida).toHaveLength(2);
        textosVida.forEach(texto => {
            expect(texto).toBe(`[${esperado.l}] A${esperado.a} VIDA`);
        });
    });

    it('multiplicadorForcaPrestigio > 1 gera overflow de Ascensão de Categoria e o reflete em AMBOS os radares (Base e Atual reagem igualmente)', () => {
        // prestígio=90, ascensãoBase=1, multP=3 -> prestigioTotal=270, bonusAscensao=2,
        // prestigioFinal=70, ascensaoFinal=3 -> Rank A [A3] (mesmos números já validados
        // no grid VIDA/MANA/.../STATUS para esta mesma combinação).
        const ficha = fichaComVida({ vidaBase: 90000000, ascensaoBase: 1, multiplicadorForcaPrestigio: 3 });
        montarMockUseStore(ficha);

        const { container } = render(<MarcadosPanel />);
        irParaPaginaAnalise();

        const textosVida = lerTextosRadar(container, 'VIDA');
        expect(textosVida).toHaveLength(2);
        textosVida.forEach(texto => {
            expect(texto).toBe('[A] A3 VIDA');
        });
    });

    it('multiplicadorForcaAscensao > 1 escala só a Ascensão Base geral (sem overflow de Prestígio) e reflete em AMBOS os radares', () => {
        // prestígio=25, ascensãoBase=3, multA=4 -> ascensaoBaseEfetiva=12, prestigioFinal=25
        // -> Rank C [A12] (mesmos números já validados no grid de Prestígio).
        const ficha = fichaComVida({ vidaBase: 25000000, ascensaoBase: 3, multiplicadorForcaAscensao: 4 });
        montarMockUseStore(ficha);

        const { container } = render(<MarcadosPanel />);
        irParaPaginaAnalise();

        const textosVida = lerTextosRadar(container, 'VIDA');
        expect(textosVida).toHaveLength(2);
        textosVida.forEach(texto => {
            expect(texto).toBe('[C] A12 VIDA');
        });
    });

    it('STATUS (categoria cujo Rank/Ascensão agora vem de statusPrestigioAplicado, o Prestígio realmente concedido via o campo editável "STATUS", não mais da média ao vivo dos 8 atributos) reage a multiplicadorForcaPrestigio e multiplicadorForcaAscensao COMBINADOS em AMBOS os radares — não há special-casing restrito a VIDA', () => {
        // STATUS usa mults.status=1000. Antes, o Rank vinha da MÉDIA dos 8 atributos físicos
        // crus (getRawBase, sem buffs): soma=400.000 (só forca), /8=50.000, /1000=50 -> baseP=50.
        // Agora o Rank vem de statusPrestigioAplicado (setado abaixo com o valor equivalente
        // a essa mesma média, 50), preservando a intenção original do teste enquanto usa o
        // novo mecanismo de entrada (Prestígio aplicado é a CAUSA, não a consequência da
        // distribuição de pool/edição dos atributos).
        // prestígio=50, ascensaoBase=1, multP=3, multA=2 (ambos ativos ao mesmo tempo)
        // -> prestigioTotal=150, bonusAscensao=1, prestigioFinal=50 (Rank B [40,60))
        // -> ascensaoBaseEfetiva=1*2=2, ascensaoFinal=2+1=3
        const ficha = fichaComVida({
            vidaBase: 0, ascensaoBase: 1,
            multiplicadorForcaPrestigio: 3, multiplicadorForcaAscensao: 2,
            forcaBase: 400000,
        });
        // fichaComVida() não tem parâmetro dedicado pra statusPrestigioAplicado — seta
        // diretamente no objeto, equivalente à média que os 8 atributos (só forca=400.000
        // aqui) representariam.
        ficha.statusPrestigioAplicado = 50;
        montarMockUseStore(ficha);

        const { container } = render(<MarcadosPanel />);
        irParaPaginaAnalise();

        const textosStatus = lerTextosRadar(container, 'STATUS');
        expect(textosStatus).toHaveLength(2);
        textosStatus.forEach(texto => {
            expect(texto).toBe('[B] A3 STATUS');
        });
    });
});

// ---------------------------------------------------------------------------
// QA — Indicador "Ascensão Geral Efetiva": leitura direta, composição real com
// multiplicadorForcaPrestigio + Forma/Passiva simultâneos, reatividade via
// edição do input "Ascensão Base (Nível)" pelo caminho real (salvar/updateFicha)
// e blindagem para ascensaoBase=0.
//
// Gaps identificados nesta rodada de QA independente: os testes anteriores só
// validam ascensaoGeralEfetiva/fatorCrescimento* INDIRETAMENTE, lendo o valor já
// escalado da lista de atributos. Nenhum teste (a) lê o texto do próprio
// indicador "Ascensão Geral Efetiva" e confere a conta para um caso
// claramente diferente do ascensaoBase bruto; (b) ativa multiplicadorForcaPrestigio
// (causando overflow) E um mFormas de Forma/Passiva ao mesmo tempo na MESMA
// categoria, para garantir que os dois se compõem multiplicativamente em vez de
// um sobrescrever o outro silenciosamente; (c) edita de fato o input "Ascensão
// Base (Nível)" pelo caminho real de salvar()/updateFicha() e confere que o
// indicador recalcula; (d) cobre ascensaoBase=0 explicitamente.
// ---------------------------------------------------------------------------

function lerIndicadorAscensaoGeral() {
    return screen.getByText((_, el) => el?.tagName === 'SPAN' && /^Ascensão Geral Efetiva: -?\d+$/.test(el.textContent || ''));
}

// Mock de useStore que, ao contrário de montarMockUseStoreAtributo (que muta o
// MESMO objeto in-place), gera uma NOVA referência de ficha a cada updateFicha —
// espelhando o comportamento real do Immer em stores/useStore.js
// (`set((state) => { callback(state.minhaFicha) })` produz um novo objeto de
// estado). Isso é necessário porque o useMemo que calcula ascensaoGeralEfetiva
// depende de `[minhaFicha]` por referência: sem uma nova referência, o React
// nem recalcularia o memo em um teste de reatividade real.
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

describe('Marcados — Indicador "Ascensão Geral Efetiva": leitura direta, composição e reatividade', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        window.alert = vi.fn();
    });

    afterEach(() => {
        cleanup();
    });

    it('lê o TEXTO do indicador diretamente (não só via escala da lista de atributos) e confere a conta para um valor claramente diferente do ascensaoBase bruto', () => {
        // Mesma cascata do teste "overflow uniforme nas 6 categorias": Prestígio=150 em
        // TODAS as 6 categorias, ascensaoBase=1, multP=2 -> prestigioTotal=300 em cada,
        // bonusAscensao=3 em cada -> nivelCompletos=3 -> geral=(1+3)*1=4.
        // ascensaoBase bruto é 1; o indicador deve mostrar 4 — nitidamente diferente.
        // Prestígio de STATUS não vem mais da média ao vivo dos 8 atributos (forca=1.200.000
        // sozinha daria média=150.000/1000=150) — vem de statusPrestigioAplicado, setado
        // abaixo com esse mesmo valor (150) pra preservar a intenção original do teste.
        const ficha = {
            vida: { base: 150000000 },
            mana: { base: 1500000000 },
            aura: { base: 1500000000 },
            chakra: { base: 1500000000 },
            corpo: { base: 1500000000 },
            forca: { base: 1200000 },
            destreza: { base: 0 },
            inteligencia: { base: 0 },
            sabedoria: { base: 0 },
            energiaEsp: { base: 0 },
            carisma: { base: 0 },
            stamina: { base: 0 },
            constituicao: { base: 0 },
            statusPrestigioAplicado: 150,
            ascensaoBase: 1,
            multiplicadorForcaPrestigio: 2,
            multiplicadorForcaAscensao: 1,
            divisores: {},
            bio: {},
            estetica: {},
            labels: {},
        };
        montarMockUseStoreAtributo(ficha);

        render(<MarcadosPanel />);
        irParaPaginaAnalise();

        expect(lerIndicadorAscensaoGeral().textContent).toBe('Ascensão Geral Efetiva: 4');
    });

    it('multiplicadorForcaPrestigio E mFormas ativos SIMULTANEAMENTE na mesma categoria compõem multiplicativamente dentro do bônus daquela categoria', () => {
        // vida: baseP=30, mFormas=2.5 -> pAtual=floor(30*2.5)=75. Com multP=3: prestigioTotal=
        // 75*3=225 -> bonusAscensao=2 (overflow real, que nem multP=3 sozinho sobre o raw 30
        // (prestigioTotal=90, bonus=0) nem mFormas=2.5 sozinho com multP=1 (prestigioTotal=75,
        // bonus=0) gerariam isoladamente — só multiplicados entre si passam de 100).
        // As outras 5 categorias (mana/aura/chakra/corpo/status), sem mFormas, ficam em
        // baseP=180 -> pAtual=180*3=540 -> bonus=5 cada.
        // nivelCompletos = floor(média(2,5,5,5,5,5)) = floor(27/6) = floor(4.5) = 4 ->
        // geral=(1+4)*1=5. (Antes da correção da trava — Math.min(...) em vez de média — o
        // resultado era 3; ver core/poder.js e o motivo da mudança lá.)
        const ficha = {
            vida: { base: 30000000, mFormas: 2.5 },
            mana: { base: 1800000000 },
            aura: { base: 1800000000 },
            chakra: { base: 1800000000 },
            corpo: { base: 1800000000 },
            forca: { base: 1440000 },
            destreza: { base: 0 },
            inteligencia: { base: 0 },
            sabedoria: { base: 0 },
            energiaEsp: { base: 0 },
            carisma: { base: 0 },
            stamina: { base: 0 },
            constituicao: { base: 0 },
            statusPrestigioAplicado: 180,
            ascensaoBase: 1,
            multiplicadorForcaPrestigio: 3,
            multiplicadorForcaAscensao: 1,
            divisores: {},
            bio: {},
            estetica: {},
            labels: {},
        };
        montarMockUseStoreAtributo(ficha);

        render(<MarcadosPanel />);
        irParaPaginaAnalise();

        expect(lerIndicadorAscensaoGeral().textContent).toBe('Ascensão Geral Efetiva: 5');
    });

    it('editar o input "Ascensão Base (Nível)" pelo caminho real (salvar -> updateFicha) recalcula o indicador (smoke test de reatividade, não uma fixture pré-calculada)', () => {
        const ficha = fichaComAtributoFisico({
            forcaBase: 0,
            destrezaBase: 0,
            ascensaoBase: 2,
            multiplicadorForcaPrestigio: 1,
            multiplicadorForcaAscensao: 1,
        });
        montarMockUseStoreReativo(ficha);

        const { rerender } = render(<MarcadosPanel />);
        irParaPaginaAnalise();

        expect(lerIndicadorAscensaoGeral().textContent).toBe('Ascensão Geral Efetiva: 2');

        const inputAscensaoBase = screen.getByText('Ascensão Base (Nível):').nextElementSibling;
        fireEvent.change(inputAscensaoBase, { target: { value: '7' } });
        rerender(<MarcadosPanel />);

        expect(lerIndicadorAscensaoGeral().textContent).toBe('Ascensão Geral Efetiva: 7');
    });

    it('ascensaoBase=0 cai no fallback (parseInt(0)||1 = 1) em vez de gerar NaN/Infinity no indicador ou no fator', () => {
        const ficha = fichaComAtributoFisico({
            forcaBase: 40,
            destrezaBase: 0,
            ascensaoBase: 0,
            multiplicadorForcaPrestigio: 1,
            multiplicadorForcaAscensao: 1,
        });
        montarMockUseStoreAtributo(ficha);

        render(<MarcadosPanel />);
        irParaPaginaAnalise();

        expect(lerIndicadorAscensaoGeral().textContent).toBe('Ascensão Geral Efetiva: 1');

        // fator=1 (sem overflow, ascensaoBase efetivo=1) -> lista de atributos permanece crua.
        const inputsForca = screen.getAllByDisplayValue('Força');
        expect(inputsForca[0].parentElement.children[1].value).toBe('40');
        expect(inputsForca[1].parentElement.children[1].textContent).toBe('40');
    });
});

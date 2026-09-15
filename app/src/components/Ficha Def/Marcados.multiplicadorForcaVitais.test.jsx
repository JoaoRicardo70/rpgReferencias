import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MarcadosPanel from './Marcados';
import useStore from '../../stores/useStore';

// ---------------------------------------------------------------------------
// QA — Multiplicador de Força aplicado às Vitais (Vida/Mana/Aura/Chakra/Corpo/
// Força), fix do double-dip no badge "Poder" dos 8 sub-atributos, e propagação
// para "Descansar" e getSupremas (forcaMax).
//
// 1) Double-dip fix (LinhaAtributoCru): antes, getPoderVerdadeiro(attrKey, ficha,
//    isAtual, supressao, fatorSeguro) recebia `fatorSeguro` MESMO getPoderAbsolutoAtributo
//    já escalando o Poder do sub-atributo pelo Multiplicador de Força internamente
//    (bloco `isStatus`) — o badge ficava inflado em dobro. Agora o badge chama
//    getPoderVerdadeiro sem `fatorSeguro` (fator default=1).
//
// 2) LinhaVital agora recebe um prop `fator` (fatoresVitaisAtual[key]) e multiplica
//    rawMaximo = safeGetMaximo(ficha, vitalKey) * fatorSeguro ANTES de calcularEscala —
//    antes, o Multiplicador de Força só inflava o badge "Poder" cosmético da barra,
//    nunca o HP/Mana/Aura/Chakra/Corpo REAL exibido/jogável.
//
// 3) handleRegenerarTudo ("💖 Descansar") precisa curar até o NOVO máximo (já
//    escalado pelo fator), não até o máximo antigo sem multiplicador.
//
// 4) getSupremas() -> forcaMax (a 5ª barra "Força"/energiaForca, média das bases
//    de mana/aura/chakra/corpo) agora multiplica pela média dos 4 fatores dessas
//    categorias (fatorForca).
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    uploadImagem: vi.fn(),
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
}));

function fichaBase(overrides = {}) {
    return {
        vida: { base: 0 }, mana: { base: 0 }, aura: { base: 0 }, chakra: { base: 0 }, corpo: { base: 0 },
        forca: { base: 0 }, destreza: { base: 0 }, inteligencia: { base: 0 }, sabedoria: { base: 0 },
        energiaEsp: { base: 0 }, carisma: { base: 0 }, stamina: { base: 0 }, constituicao: { base: 0 },
        ascensaoBase: 1, divisores: {}, bio: {}, estetica: {}, labels: {}, statusPool: 0,
        ...overrides,
    };
}

function montarMockUseStore(minhaFicha) {
    const mockState = {
        minhaFicha,
        updateFicha: vi.fn((callback) => callback(minhaFicha)),
        meuNome: 'Testador',
        importarDaAbaStatus: vi.fn(),
    };
    useStore.mockImplementation((selector) => (selector ? selector(mockState) : mockState));
    return mockState;
}

// Mock reativo: cada updateFicha gera uma NOVA referência de ficha (espelhando o
// Immer real), necessário para testar handleRegenerarTudo + rerender — mesmo padrão
// de montarMockUseStoreReativo em Marcados.multiplicadorForca.test.jsx.
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

function irParaPaginaAnalise() {
    fireEvent.click(screen.getByRole('button', { name: /Próxima/ }));
}

function lerPoderBadge(labelText, indice) {
    const input = screen.getAllByDisplayValue(labelText)[indice];
    const labelDiv = input.parentElement;
    const span = Array.from(labelDiv.querySelectorAll('span')).find(s => s.textContent.startsWith('Poder:'));
    return span.textContent;
}

// Lê o valor MÁXIMO exibido na BarraVital de uma linha (Vida/Mana/Aura/.../Força),
// que fica no segundo filho do wrapper "marginBottom" (irmão da linha de cabeçalho
// label+Poder).
function lerMaximoBarra(labelText) {
    const input = screen.getByDisplayValue(labelText);
    const wrapper = input.parentElement.parentElement.parentElement;
    const barraDiv = wrapper.children[1];
    const spans = barraDiv.querySelectorAll('span');
    return spans[spans.length - 1].textContent;
}

function lerAtualBarra(labelText) {
    const input = screen.getByDisplayValue(labelText);
    const wrapper = input.parentElement.parentElement.parentElement;
    const barraDiv = wrapper.children[1];
    return barraDiv.querySelector('input').value;
}

function parsePtBr(texto) {
    return parseInt(String(texto).replace(/\./g, ''), 10) || 0;
}

// Quando o vital tem 2+ Break Bars empilhadas (core/vitals.js > calcularBarrasVida, ver
// components/shared/BarrasVida.jsx), lerMaximoBarra/lerAtualBarra (pensadas pra 1 barra só) não
// bastam mais -- somam-se os máximos/atuais de TODAS as barras empilhadas pra comparar com o TOTAL
// real (que nunca é maior nem menor que o bruto escalado pelo Multiplicador de Força).
//
// Desde a correção do bug de números sobrepostos (só a barra ATIVA mostra texto agora -- ver
// BarrasVida.jsx), o texto visível não basta mais pra ler o total: as barras não-ativas não têm
// texto nenhum no DOM. Por isso cada .break-bars-barra carrega seu valor real em data-atual/
// data-max (sempre presentes, independente do texto estar visível ou não) -- lê-se DAÍ, não do
// texto renderizado.
function lerTotalMaximoBarras(labelText) {
    const input = screen.getByDisplayValue(labelText);
    const wrapper = input.parentElement.parentElement.parentElement;
    const barraDiv = wrapper.children[1];
    const barras = barraDiv.querySelectorAll('.break-bars-barra');
    let total = 0;
    barras.forEach((b) => { total += Number(b.getAttribute('data-max')) || 0; });
    return total;
}

function lerTotalAtualBarras(labelText) {
    const input = screen.getByDisplayValue(labelText);
    const wrapper = input.parentElement.parentElement.parentElement;
    const barraDiv = wrapper.children[1];
    const barras = barraDiv.querySelectorAll('.break-bars-barra');
    let total = 0;
    barras.forEach((b) => { total += Number(b.getAttribute('data-atual')) || 0; });
    return total;
}

describe('Marcados — Fix do double-dip: badge "Poder" dos 8 sub-atributos NÃO aplica o Multiplicador de Força duas vezes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        window.alert = vi.fn();
    });

    afterEach(() => cleanup());

    it('multiplicadorForcaAscensao > 1 sem overflow: Poder = getPoderAbsolutoAtributo (uma única aplicação), NÃO multiplicado de novo pelo fator de crescimento', () => {
        // forca.base=8000, divisor.status=1, ascensaoBase=1, multA=3, multP=1(ausente).
        // Individual (getPoderAbsolutoAtributo isolado, aplicado no fonte):
        //   prestIndiv=floor(8000/1000*1)=8; aplicarMultiplicadorForca(8,1,1,3):
        //   ascensaoBaseEfetiva=3; prestigioTotal=8; bonusAscensao=0; prestigioFinal=8;
        //   ascensaoFinal=3; pontosTotaisIndiv=308; poderPuro=floor(308/1*1000)=308000.
        // fatorAtributosAtual (fator de crescimento, calculado sobre a categoria "status",
        // NÃO deve ser reaplicado sobre o poderPuro já escalado) = 3 (mesma conta do teste
        // "multiplicadorForcaAscensao > 1 sem overflow escala..." em
        // Marcados.multiplicadorForca.test.jsx). Se o bug de double-dip voltasse, o badge
        // mostraria 308000*3=924000 em vez de 308000.
        const ficha = fichaBase({ forca: { base: 8000 }, multiplicadorForcaAscensao: 3 });
        montarMockUseStore(ficha);

        render(<MarcadosPanel />);
        irParaPaginaAnalise();

        const poderBase = lerPoderBadge('Força', 0); // isAtual=false ("Status Rank Base")
        const poderAtual = lerPoderBadge('Força', 1); // isAtual=true ("Poder Atual")

        expect(poderBase).toBe('Poder: 308.000');
        expect(poderAtual).toBe('Poder: 308.000');
        // Regressão explícita do bug antigo (double-dip): NÃO pode ser 924.000.
        expect(poderBase).not.toBe('Poder: 924.000');
        expect(poderAtual).not.toBe('Poder: 924.000');
    });

    it('multiplicadorForcaPrestigio causando overflow real: badge continua batendo com uma única aplicação do multiplicador (via aplicarMultiplicadorForca)', () => {
        // Todos os 8 físicos = 90000 (equal) -> displayP categoria status = 90 (igual ao
        // prestIndiv individual de 'forca'). ascensaoBase=1, multP=3, multA=1(ausente).
        // prestIndiv=90; prestigioTotal=270; bonusAscensao=2; prestigioFinal=70;
        // ascensaoFinal=3; pontosTotaisIndiv=370; poderPuro=floor(370*1000)=370000.
        // fatorAtributosAtual (categoria status, mesmos números pois todos os 8 são iguais)=3.
        // Double-dip antigo geraria 370000*3=1.110.000.
        const stats8 = ['forca', 'destreza', 'inteligencia', 'sabedoria', 'energiaEsp', 'carisma', 'stamina', 'constituicao'];
        const overrides = {};
        stats8.forEach(s => { overrides[s] = { base: 90000 }; });
        const ficha = fichaBase({ ...overrides, multiplicadorForcaPrestigio: 3 });
        montarMockUseStore(ficha);

        render(<MarcadosPanel />);
        irParaPaginaAnalise();

        const poderBase = lerPoderBadge('Força', 0);
        const poderAtual = lerPoderBadge('Força', 1);

        expect(poderBase).toBe('Poder: 370.000');
        expect(poderAtual).toBe('Poder: 370.000');
        expect(poderBase).not.toBe('Poder: 1.110.000');
    });

    it('multiplicadores ausentes (default=1): badge idêntico ao Poder puro, sem nenhuma escala extra', () => {
        const ficha = fichaBase({ forca: { base: 1000 } });
        montarMockUseStore(ficha);

        render(<MarcadosPanel />);
        irParaPaginaAnalise();

        // prestIndiv=floor(1000/1000)=1; aplicarMultiplicadorForca(1,1,1,1):
        // prestigioTotal=1,bonusAscensao=0,prestigioFinal=1,ascensaoFinal=1;
        // pontosTotaisIndiv=101; poderPuro=101000.
        expect(lerPoderBadge('Força', 0)).toBe('Poder: 101.000');
        expect(lerPoderBadge('Força', 1)).toBe('Poder: 101.000');
    });
});

describe('Marcados — LinhaVital: Multiplicador de Força agora infla o máximo REAL de Vida/Mana/Aura/Chakra/Corpo (não só o badge cosmético)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        window.alert = vi.fn();
    });

    afterEach(() => cleanup());

    it('sem overflow (multiplicadores em 1): máximo de Vida exibido é igual ao valor cru dividido por FATOR_EXIBICAO_VITAIS (fator=1, sem tingimento)', () => {
        // vida.base=50.000.000 fica ABAIXO do limiar de 100 Prestígio (que já geraria 1
        // Ascensão de overflow "de fábrica", independente de qualquer multiplicador — ver
        // o teste seguinte, onde vida.base=100.000.000 sozinho já é o limiar exato).
        const ficha = fichaBase({ vida: { base: 50000000 } });
        montarMockUseStore(ficha);

        render(<MarcadosPanel />);

        // getBasePFor(vida)=50 (50.000.000/1.000.000), sem overflow -> fator=1.
        // pVit=max(0,8-8)=0 -> mxDisplay=floor(50.000.000*1)=50.000.000 -- dividido por
        // FATOR_EXIBICAO_VITAIS (reformulação de Vida/Energias) na exibição = 50.000.
        expect(lerMaximoBarra('Vida (HP)')).toBe((50000).toLocaleString('pt-BR'));
    });

    it('multiplicadorForcaPrestigio causando overflow de Ascensão: máximo REAL de Vida exibido FICA MAIOR (fator=4 > 1)', () => {
        // vida.base=100.000.000 -> displayP=100; multP=3,multA=1 -> prestigioTotal=300,
        // bonusAscensao=3, ascensaoFinal=1+3=4 -> fator=4/1=4.
        // rawMaximo = 100.000.000*4 = 400.000.000 -- abaixo do LIMIAR_BARRA_VIDA (1 bilhão,
        // reformulação de Vida/Energias), então continua 1 barra só; exibido dividido por
        // FATOR_EXIBICAO_VITAIS = 400.000.
        const ficha = fichaBase({ vida: { base: 100000000 }, multiplicadorForcaPrestigio: 3 });
        montarMockUseStore(ficha);

        render(<MarcadosPanel />);

        const maximoExibido = lerMaximoBarra('Vida (HP)');
        expect(maximoExibido).toBe((400000).toLocaleString('pt-BR'));
        expect(maximoExibido).not.toBe((100000).toLocaleString('pt-BR')); // não pode ficar preso no máximo sem multiplicador
    });

    it('cada categoria vital usa o SEU PRÓPRIO fator (Mana escalado diferente de Vida quando os Prestígios divergem)', () => {
        // vida.base pequeno (sem overflow, fator=1); mana.base grande o bastante para
        // causar overflow (fator=4, mesma conta do teste anterior).
        const ficha = fichaBase({
            vida: { base: 1000000 }, // displayP=1, sem overflow -> fator=1
            mana: { base: 1000000000 }, // displayP=100 (1e9/1e7), overflow -> fator=4
            multiplicadorForcaPrestigio: 3,
        });
        montarMockUseStore(ficha);

        render(<MarcadosPanel />);

        // vida: rawMaximo=1.000.000*1=1.000.000 -> pVit=max(0,7-8)=0 -> mxDisplay=1.000.000,
        // exibido/1000 = 1.000.
        expect(lerMaximoBarra('Vida (HP)')).toBe((1000).toLocaleString('pt-BR'));
        // mana: rawMaximo=1.000.000.000*4=4.000.000.000 -> pVit=max(0,10-9)=1 ->
        // mxDisplay=floor(4.000.000.000/10)=400.000.000, exibido/1000 = 400.000.
        expect(lerMaximoBarra('Mana')).toBe((400000).toLocaleString('pt-BR'));
    });
});

describe('Marcados — handleRegenerarTudo ("💖 Descansar") cura até o NOVO máximo escalado pelo Multiplicador de Força', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        window.alert = vi.fn();
    });

    afterEach(() => cleanup());

    it('após Descansar, Vida.atual exibido bate com o NOVO máximo escalado pelo fator (não com o máximo antigo sem multiplicador)', () => {
        const ficha = fichaBase({ vida: { base: 100000000, atual: 0 }, multiplicadorForcaPrestigio: 3 });
        montarMockUseStoreReativo(ficha);

        const { rerender } = render(<MarcadosPanel />);
        expect(lerAtualBarra('Vida (HP)')).toBe('0');

        const botaoDescansar = screen.getByRole('button', { name: /Descansar/ });
        fireEvent.click(botaoDescansar);
        rerender(<MarcadosPanel />);

        // Mesmo cálculo do teste de LinhaVital acima: máximo bruto escalado = 400.000.000 --
        // abaixo do LIMIAR_BARRA_VIDA (1 bilhão), então continua 1 barra só; exibido dividido
        // por FATOR_EXIBICAO_VITAIS = 400.000, nunca o máximo sem multiplicador (100.000).
        expect(lerAtualBarra('Vida (HP)')).toBe((400000).toLocaleString('pt-BR'));
        expect(lerMaximoBarra('Vida (HP)')).toBe((400000).toLocaleString('pt-BR'));
    });
});

describe('Marcados — getSupremas(): forcaMax (5ª barra "Força"/energiaForca) escala pela média dos fatores de mana/aura/chakra/corpo', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        window.alert = vi.fn();
    });

    afterEach(() => cleanup());

    it('sem multiplicador (fator=1 em todas): forcaMax = média crua das 4 bases, igual ao comportamento anterior', () => {
        // 🔥 Reformulação de Vida/Energias: fixtures ×1000 em relação à versão original (bruto,
        // bem abaixo do divisor de prestígio 1e7, então fatorForca continua 1) -- a barra de Força
        // agora divide por FATOR_EXIBICAO_VITAIS na exibição, então o valor exibido esperado
        // permanece o mesmo de antes.
        const ficha = fichaBase({
            mana: { base: 100000 }, aura: { base: 200000 }, chakra: { base: 300000 }, corpo: { base: 400000 },
        });
        montarMockUseStore(ficha);

        render(<MarcadosPanel />);
        // bruto: (100.000+200.000+300.000+400.000)/4 = 250.000, fatorForca=1 -> exibido /1000 = 250.
        expect(lerMaximoBarra('Força')).toBe((250).toLocaleString('pt-BR'));
    });

    it('multiplicadorForcaPrestigio causando overflow igual nas 4 energias: forcaMax é multiplicado pela média dos 4 fatores (fatorForca=2)', () => {
        // mana=aura=chakra=corpo=400.000.000 -> getBasePFor cada = floor(4e8/1e7)=40;
        // multP=3,multA=1 -> prestigioTotal=120, bonusAscensao=1, ascensaoFinal=2 -> fator=2.
        // fatorForca = (2+2+2+2)/4 = 2.
        // Fixture NÃO escalada (precisa cruzar o divisor de prestígio 1e7 pra gerar o overflow) --
        // apenas o valor exibido esperado agora divide por FATOR_EXIBICAO_VITAIS.
        const ficha = fichaBase({
            mana: { base: 400000000 }, aura: { base: 400000000 }, chakra: { base: 400000000 }, corpo: { base: 400000000 },
            multiplicadorForcaPrestigio: 3,
        });
        montarMockUseStore(ficha);

        render(<MarcadosPanel />);

        // média bruta = 400.000.000; * fatorForca(2) = 800.000.000 (bruto) -> exibido /1000 = 800.000.
        const maximoExibido = lerMaximoBarra('Força');
        expect(maximoExibido).toBe((800000).toLocaleString('pt-BR'));
        expect(maximoExibido).not.toBe((400000).toLocaleString('pt-BR'));
    });

    it('fatores DIFERENTES entre as 4 energias tiram a média corretamente (nem todas overflow igual)', () => {
        // mana/aura com overflow (fator=2 cada, mesma conta do teste anterior);
        // chakra/corpo pequenos, sem overflow (fator=1 cada).
        // fatorForca = (2+2+1+1)/4 = 1.5.
        // Fixture NÃO escalada pelo mesmo motivo do teste anterior.
        const ficha = fichaBase({
            mana: { base: 400000000 }, aura: { base: 400000000 },
            chakra: { base: 1000000 }, corpo: { base: 1000000 },
            multiplicadorForcaPrestigio: 3,
        });
        montarMockUseStore(ficha);

        render(<MarcadosPanel />);

        // média bruta = (4e8+4e8+1e6+1e6)/4 = 200.500.000; * 1.5 = 300.750.000 (bruto) -> exibido /1000 = 300.750.
        const maximoExibido = lerMaximoBarra('Força');
        expect(maximoExibido).toBe((300750).toLocaleString('pt-BR'));
    });
});

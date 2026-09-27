import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MarcadosPanel from './Marcados';
import useStore from '../../stores/useStore';

// ---------------------------------------------------------------------------
// QA — Pontos de Prestígio concedidos pelo Mestre + ASCENDER (core/prestigioDistribuicao.js),
// exercitados via a UI real de Marcados.jsx (Página 2 "Análise de Poder", grid "Mecânicas de
// Ascensão e Divisores"). Cobertura complementar a Marcados.statusPool.test.jsx, que testa a
// matemática do pool de Status com o Prestígio editado LIVRE (caminho do Mestre).
//
// - `.prestigio-pontos-box`: Mestre edita livremente (CampoNumeroConfirmavel, aplica no blur);
//   jogador só vê o valor, somente leitura.
// - Categorias (VIDA/MANA/AURA/CHAKRA/CORPO/STATUS): jogador usa os botões "+"/"−" (1 ponto por
//   clique, gastando/devolvendo de prestigioPontosDisponiveis) ou digita um valor no campo — só
//   aplicado no blur, validado por validarDistribuicaoPrestigio (alerta e não muda nada se faltar
//   pontos). Mestre edita as categorias livremente, sem gastar pontos.
// - `.btn-ascender`: só aparece quando as 6 categorias chegam a 100 de Prestígio; ao clicar (com
//   confirmação), aplicarAscensao reseta cada categoria pra 1 (excedente preservado) e soma 1 em
//   ascensaoBase, sem tocar no pool de Status nem nas bases dos 8 atributos físicos.
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    uploadImagem: vi.fn(),
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
}));

const STATS8 = ['forca', 'destreza', 'inteligencia', 'sabedoria', 'energiaEsp', 'carisma', 'stamina', 'constituicao'];

// Multiplicadores de base por categoria (mesma escala de core/prestigioDistribuicao.js e
// handleTabelaChange/getBasePFor em Marcados.jsx), usados aqui só pra montar fichas de teste com
// um Prestígio (P) já aplicado, sem depender da UI pra "chegar" nesse estado.
const MULTS = { vida: 1000000, mana: 10000000, aura: 10000000, chakra: 10000000, corpo: 10000000 };

function fichaPrestigio({
    vidaP = 0, manaP = 0, auraP = 0, chakraP = 0, corpoP = 0, statusP = 0,
    ascensaoBase = 1, prestigioPontosDisponiveis = 0, prestigioPontosDistribuidos = {}, statusPool = 0,
} = {}) {
    const ficha = {
        vida: { base: vidaP * MULTS.vida },
        mana: { base: manaP * MULTS.mana },
        aura: { base: auraP * MULTS.aura },
        chakra: { base: chakraP * MULTS.chakra },
        corpo: { base: corpoP * MULTS.corpo },
        ascensaoBase, divisores: {}, bio: {}, estetica: {}, labels: {},
        statusPrestigioAplicado: statusP, statusPool, statusPoolGasto: 0, statusPoolAlocado: {},
        prestigioPontosDisponiveis, prestigioPontosDistribuidos,
    };
    STATS8.forEach(s => { ficha[s] = { base: 1000 }; });
    return ficha;
}

function montarMockUseStore(minhaFicha, isMestre = false) {
    const mockState = {
        minhaFicha,
        updateFicha: vi.fn((callback) => callback(minhaFicha)),
        meuNome: 'Testador',
        importarDaAbaStatus: vi.fn(),
        isMestre,
    };
    useStore.mockImplementation((selector) => (selector ? selector(mockState) : mockState));
    return mockState;
}

function irParaPaginaAnalise() {
    fireEvent.click(screen.getByRole('button', { name: /Próxima/ }));
}

// Localiza o "card" de uma categoria (VIDA/MANA/AURA/CHAKRA/CORPO/STATUS) no grid "Mecânicas de
// Ascensão e Divisores" — mesmo padrão de navegação usado em Marcados.statusPool.test.jsx
// (inputPrestigioStatus/badgeRankStatus), generalizado pra qualquer categoria.
function cardCategoria(container, label) {
    const spans = Array.from(container.querySelectorAll('span'));
    const catSpan = spans.find(s => s.textContent === label);
    const headerRow = catSpan.parentElement;
    return headerRow.parentElement;
}

function wrapperPrestigioCategoria(container, label) {
    return cardCategoria(container, label).children[1];
}

function inputPrestigioCategoria(container, label) {
    return wrapperPrestigioCategoria(container, label).querySelector('input');
}

function botoesPrestigioCategoria(container, label) {
    const botoes = Array.from(wrapperPrestigioCategoria(container, label).querySelectorAll('button'));
    return { menos: botoes[0], mais: botoes[1] };
}

// O campo de Prestígio de cada categoria só APLICA ao sair do campo (blur) — digitar sozinho não
// mexe em nada (CampoNumeroConfirmavel).
function editarPrestigioCategoria(container, label, valor) {
    const input = inputPrestigioCategoria(container, label);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: valor } });
    fireEvent.blur(input);
}

describe('Marcados — Pontos de Prestígio (jogador): botões +/- distribuem, campo valida contra o disponível', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        window.alert = vi.fn();
    });

    afterEach(() => cleanup());

    it('"🎖️ Pontos de Prestígio" aparece só leitura para o jogador (sem input dentro de .prestigio-pontos-box)', () => {
        const ficha = fichaPrestigio({ prestigioPontosDisponiveis: 5 });
        montarMockUseStore(ficha, false);

        const { container } = render(<MarcadosPanel />);
        irParaPaginaAnalise();

        const box = container.querySelector('.prestigio-pontos-box');
        expect(box).toBeTruthy();
        expect(box.querySelector('input')).toBeNull();
        expect(box.textContent).toContain('5');
    });

    it('clicar "+" em VIDA gasta 1 Ponto de Prestígio: disponíveis -1, vida.base = (P+1)*1e6, distribuídos.vida +1', () => {
        const ficha = fichaPrestigio({ vidaP: 2, prestigioPontosDisponiveis: 5 });
        montarMockUseStore(ficha, false);

        const { container } = render(<MarcadosPanel />);
        irParaPaginaAnalise();

        fireEvent.click(botoesPrestigioCategoria(container, 'VIDA').mais);

        expect(ficha.prestigioPontosDisponiveis).toBe(4);
        expect(ficha.vida.base).toBe(3 * MULTS.vida);
        expect(ficha.prestigioPontosDistribuidos.vida).toBe(1);
        expect(window.alert).not.toHaveBeenCalled();
    });

    it('"+" fica desabilitado quando não há Pontos de Prestígio disponíveis', () => {
        const ficha = fichaPrestigio({ vidaP: 2, prestigioPontosDisponiveis: 0 });
        montarMockUseStore(ficha, false);

        const { container } = render(<MarcadosPanel />);
        irParaPaginaAnalise();

        expect(botoesPrestigioCategoria(container, 'VIDA').mais.disabled).toBe(true);
    });

    it('"−" fica desabilitado sem nada distribuído na categoria; depois de um "+", "−" desfaz exatamente', () => {
        const ficha = fichaPrestigio({ vidaP: 2, prestigioPontosDisponiveis: 5 });
        montarMockUseStore(ficha, false);

        const { container, rerender } = render(<MarcadosPanel />);
        irParaPaginaAnalise();
        expect(botoesPrestigioCategoria(container, 'VIDA').menos.disabled).toBe(true);

        fireEvent.click(botoesPrestigioCategoria(container, 'VIDA').mais);
        rerender(<MarcadosPanel />);
        expect(botoesPrestigioCategoria(container, 'VIDA').menos.disabled).toBe(false);

        fireEvent.click(botoesPrestigioCategoria(container, 'VIDA').menos);

        expect(ficha.prestigioPontosDisponiveis).toBe(5);
        expect(ficha.vida.base).toBe(2 * MULTS.vida);
        expect(ficha.prestigioPontosDistribuidos.vida).toBe(0);
        rerender(<MarcadosPanel />);
        expect(botoesPrestigioCategoria(container, 'VIDA').menos.disabled).toBe(true);
    });

    it('digitar um valor acima do disponível dispara alert() e não muda a ficha', () => {
        const ficha = fichaPrestigio({ vidaP: 2, prestigioPontosDisponiveis: 1 });
        montarMockUseStore(ficha, false);

        const { container } = render(<MarcadosPanel />);
        irParaPaginaAnalise();

        // delta pedido = 5 (2 -> 7), só 1 disponível.
        editarPrestigioCategoria(container, 'VIDA', '7');

        expect(window.alert).toHaveBeenCalledTimes(1);
        expect(window.alert.mock.calls[0][0]).toMatch(/1 Ponto/);
        expect(ficha.vida.base).toBe(2 * MULTS.vida);
        expect(ficha.prestigioPontosDisponiveis).toBe(1);
        expect(ficha.prestigioPontosDistribuidos.vida ?? 0).toBe(0);
    });
});

describe('Marcados — Pontos de Prestígio (mestre): edição livre da caixa e das categorias', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        window.alert = vi.fn();
    });

    afterEach(() => cleanup());

    it('.prestigio-pontos-box tem um input para o Mestre; confirmar no blur define prestigioPontosDisponiveis', () => {
        const ficha = fichaPrestigio({ prestigioPontosDisponiveis: 5 });
        montarMockUseStore(ficha, true);

        const { container } = render(<MarcadosPanel />);
        irParaPaginaAnalise();

        const box = container.querySelector('.prestigio-pontos-box');
        const input = box.querySelector('input');
        expect(input).toBeTruthy();

        fireEvent.focus(input);
        fireEvent.change(input, { target: { value: '20' } });
        fireEvent.blur(input);

        expect(ficha.prestigioPontosDisponiveis).toBe(20);
    });

    it('Mestre edita o Prestígio de uma categoria livremente, sem gastar prestigioPontosDisponiveis', () => {
        const ficha = fichaPrestigio({ vidaP: 2, prestigioPontosDisponiveis: 5 });
        montarMockUseStore(ficha, true);

        const { container } = render(<MarcadosPanel />);
        irParaPaginaAnalise();

        const input = inputPrestigioCategoria(container, 'VIDA');
        fireEvent.focus(input);
        fireEvent.change(input, { target: { value: '10' } });
        fireEvent.blur(input);

        expect(ficha.vida.base).toBe(10 * MULTS.vida);
        expect(ficha.prestigioPontosDisponiveis).toBe(5); // inalterado — Mestre não gasta pontos
        expect(window.alert).not.toHaveBeenCalled();
    });
});

describe('Marcados — botão ASCENDER (.btn-ascender)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        window.alert = vi.fn();
    });

    afterEach(() => cleanup());

    it('não aparece quando qualquer categoria está abaixo de 100', () => {
        const ficha = fichaPrestigio({ vidaP: 100, manaP: 100, auraP: 100, chakraP: 100, corpoP: 99, statusP: 100 });
        montarMockUseStore(ficha, false);

        const { container } = render(<MarcadosPanel />);
        irParaPaginaAnalise();

        expect(container.querySelector('.btn-ascender')).toBeNull();
    });

    it('aparece quando as 6 categorias chegam a 100 (vida.base 1e8, mana/aura/chakra/corpo base 1e9, statusPrestigioAplicado 100)', () => {
        const ficha = fichaPrestigio({ vidaP: 100, manaP: 100, auraP: 100, chakraP: 100, corpoP: 100, statusP: 100 });
        expect(ficha.vida.base).toBe(1e8);
        expect(ficha.mana.base).toBe(1e9);
        expect(ficha.aura.base).toBe(1e9);
        expect(ficha.chakra.base).toBe(1e9);
        expect(ficha.corpo.base).toBe(1e9);
        montarMockUseStore(ficha, false);

        const { container } = render(<MarcadosPanel />);
        irParaPaginaAnalise();

        expect(container.querySelector('.btn-ascender')).toBeTruthy();
    });

    it('clicar com confirm=true soma 1 em ascensaoBase, reseta as 6 categorias pra 1 e não mexe no pool de Status nem nas bases dos 8 atributos', () => {
        const ficha = fichaPrestigio({
            vidaP: 100, manaP: 100, auraP: 100, chakraP: 100, corpoP: 100, statusP: 100,
            ascensaoBase: 3, statusPool: 12,
        });
        montarMockUseStore(ficha, false);

        const { container } = render(<MarcadosPanel />);
        irParaPaginaAnalise();

        fireEvent.click(container.querySelector('.btn-ascender'));

        expect(window.confirm).toHaveBeenCalledTimes(1);
        expect(ficha.ascensaoBase).toBe(4);
        expect(ficha.vida.base).toBe(1 * MULTS.vida);
        expect(ficha.mana.base).toBe(1 * MULTS.mana);
        expect(ficha.aura.base).toBe(1 * MULTS.aura);
        expect(ficha.chakra.base).toBe(1 * MULTS.chakra);
        expect(ficha.corpo.base).toBe(1 * MULTS.corpo);
        expect(ficha.statusPrestigioAplicado).toBe(1);
        // Pool de Status e as bases dos 8 atributos físicos ficam intocados.
        expect(ficha.statusPool).toBe(12);
        STATS8.forEach(s => expect(ficha[s].base).toBe(1000));
    });

    it('clicar com confirm=false não muda nada', () => {
        const ficha = fichaPrestigio({
            vidaP: 100, manaP: 100, auraP: 100, chakraP: 100, corpoP: 100, statusP: 100,
            ascensaoBase: 3, statusPool: 12,
        });
        montarMockUseStore(ficha, false);
        window.confirm = vi.fn(() => false);

        const { container } = render(<MarcadosPanel />);
        irParaPaginaAnalise();

        fireEvent.click(container.querySelector('.btn-ascender'));

        expect(ficha.ascensaoBase).toBe(3);
        expect(ficha.vida.base).toBe(1e8);
        expect(ficha.mana.base).toBe(1e9);
        expect(ficha.statusPrestigioAplicado).toBe(100);
        expect(ficha.statusPool).toBe(12);
    });
});

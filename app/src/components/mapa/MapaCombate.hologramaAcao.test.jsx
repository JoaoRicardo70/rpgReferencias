import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { MapaHologramaAcao } from './MapaCombate';
import { MapaFormProvider } from './MapaFormContext';
import useStore from '../../stores/useStore';

// ---------------------------------------------------------------------------
// QA — Moldura de combate do Mapa (MapaHologramaAcao). Importa o componente
// diretamente de MapaCombate.jsx (não de MapaPanel.jsx) porque MapaPanel.jsx
// importa (via AIFormContext.jsx) o pacote pdfjs-dist, que quebra em jsdom com
// "ReferenceError: DOMMatrix is not defined" — um problema de ambiente
// pré-existente e completamente alheio a este componente. useMapaForm() usa
// Context de verdade (não é um hook puro sobre useStore), então o teste
// precisa envolver o componente no MapaFormProvider real, com useStore
// mockado por baixo dele.
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    salvarCenarioCompleto: vi.fn(),
    zerarIniciativaGlobal: vi.fn(),
    salvarDummie: vi.fn(),
    enviarParaFeed: vi.fn(),
    uploadImagem: vi.fn(),
    aplicarDanoDireto: vi.fn(),
    aplicarFadigaDireta: vi.fn(),
    aplicarElementoDireto: vi.fn(),
    aplicarElementoNivelDireto: vi.fn(),
}));

function criarStat(atual, base) {
    return { atual, base, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mUnico: '1.0', mAbsoluto: 1.0, reducaoCusto: 0, regeneracao: 0 };
}

function criarFichaDeCombate(vidaAtual) {
    const ficha = {
        posicao: { x: 0, y: 0 },
        vida: criarStat(vidaAtual, 1000000),
        mana: criarStat(500, 100000),
        aura: criarStat(500, 100000),
        chakra: criarStat(500, 100000),
        corpo: criarStat(500, 100000),
        divisores: { vida: 1, status: 1, mana: 1, aura: 1, chakra: 1, corpo: 1 },
    };
    ['forca', 'destreza', 'inteligencia', 'sabedoria', 'energiaEsp', 'carisma', 'stamina', 'constituicao'].forEach(s => {
        ficha[s] = criarStat(0, 1000);
    });
    return ficha;
}

function montarMockState(overrides = {}) {
    return {
        minhaFicha: { posicao: { x: 0, y: 0 } },
        meuNome: 'Kakaroto',
        personagens: {},
        feedCombate: [],
        updateFicha: vi.fn(),
        isMestre: false,
        mesaCriador: '',
        dummies: {},
        alvoSelecionado: null,
        cenario: {},
        abaAtiva: 'aba-mapa',
        divisorPoderMesa: 1,
        ...overrides,
    };
}

function renderHolograma(mockState) {
    useStore.mockImplementation((selector) => (typeof selector === 'function' ? selector(mockState) : mockState));
    return render(<MapaFormProvider><MapaHologramaAcao /></MapaFormProvider>);
}

describe('MapaCombate - MapaHologramaAcao (moldura de combate)', () => {
    afterEach(() => {
        cleanup();
        vi.clearAllMocks();
    });

    it('mostra "O campo de batalha aguarda" quando não há ninguém em combate nem feed (regressão da mudança de <div> pra <> + <style>)', () => {
        renderHolograma(montarMockState());
        expect(screen.getByText(/O campo de batalha aguarda/i)).toBeDefined();
    });

    it('renderiza a moldura com o nome do jogador quando há uma ação de dano no feed', () => {
        const ficha = criarFichaDeCombate(500000);
        renderHolograma(montarMockState({ minhaFicha: ficha, feedCombate: [{ tipo: 'dano', nome: 'Kakaroto', dano: 9999 }] }));
        expect(screen.getAllByText(/Kakaroto/i).length).toBeGreaterThan(0);
    });

    it('mostra o Atual/Máximo da vida (não só o número cru) quando a ficha tem status suficiente pra calcular um máximo', () => {
        const ficha = criarFichaDeCombate(500000);
        const { container } = renderHolograma(montarMockState({ minhaFicha: ficha, feedCombate: [{ tipo: 'dano', nome: 'Kakaroto', dano: 9999 }] }));

        // A barra de vida (BarraVital) deve existir com um width em porcentagem entre 0 e 100.
        const barras = Array.from(container.querySelectorAll('div')).filter(d => /width:\s*\d+(\.\d+)?%/.test(d.getAttribute('style') || ''));
        expect(barras.length).toBeGreaterThan(0);
        barras.forEach(b => {
            const match = /width:\s*(\d+(?:\.\d+)?)%/.exec(b.getAttribute('style'));
            const pct = parseFloat(match[1]);
            expect(pct).toBeGreaterThanOrEqual(0);
            expect(pct).toBeLessThanOrEqual(100);
        });
    });

    it('não quebra quando a ficha do alvo não tem NENHUM status definido (getMaximo com dados ausentes)', () => {
        expect(() => renderHolograma(montarMockState({
            minhaFicha: { posicao: { x: 0, y: 0 } },
            feedCombate: [{ tipo: 'dano', nome: 'Kakaroto', dano: 100 }],
        }))).not.toThrow();
    });

    it('a moldura (.holograma-impacto) é remontada como um NOVO nó do DOM quando chega uma ação nova no feed (o gatilho da animação de "pulso")', () => {
        const ficha = criarFichaDeCombate(500000);
        const mockState = montarMockState({ minhaFicha: ficha, feedCombate: [{ tipo: 'dano', nome: 'Kakaroto', dano: 100 }] });
        const { container, rerender } = renderHolograma(mockState);

        const nodeAntes = container.querySelector('.holograma-impacto');
        expect(nodeAntes).not.toBeNull();

        // Uma ficha só mudando de valor (mesmo comprimento de feed) NÃO deve remontar a moldura.
        mockState.minhaFicha = criarFichaDeCombate(400000);
        rerender(<MapaFormProvider><MapaHologramaAcao /></MapaFormProvider>);
        expect(container.querySelector('.holograma-impacto')).toBe(nodeAntes);

        // Um item NOVO no feed (comprimento maior) deve remontar a moldura (novo nó do DOM).
        mockState.feedCombate = [...mockState.feedCombate, { tipo: 'dano', nome: 'Kakaroto', dano: 200 }];
        rerender(<MapaFormProvider><MapaHologramaAcao /></MapaFormProvider>);
        const nodeDepois = container.querySelector('.holograma-impacto');
        expect(nodeDepois).not.toBeNull();
        expect(nodeDepois).not.toBe(nodeAntes);
    });

    it('a cor da barra de vida (perigo) fica vermelha quando a vida cai abaixo de 20% do máximo', () => {
        const fichaCritica = criarFichaDeCombate(1); // vida quase zerada, base bem maior
        const { container } = renderHolograma(montarMockState({ minhaFicha: fichaCritica, feedCombate: [{ tipo: 'dano', nome: 'Kakaroto', dano: 1 }] }));

        const barraVermelha = Array.from(container.querySelectorAll('div')).find(d => (d.getAttribute('style') || '').includes('#ff3030'));
        expect(barraVermelha).toBeDefined();
    });

    // -----------------------------------------------------------------------
    // QA (gap) — BarraVital: comportamento EXATO nos thresholds de 20%/50%, não só
    // "bem abaixo"/"bem acima". Lendo o código-fonte (MapaCombate.jsx > BarraVital):
    //   if (pct <= 20) corBarra = '#ff3030'; else if (pct <= 50) corBarra = '#ffcc00';
    // ou seja, AMBOS os thresholds são INCLUSIVOS (<=), não estritos (<). Vida base
    // (criarFichaDeCombate) é 1000000, então vidaAtual=200000 -> pct=20 exato e
    // vidaAtual=500000 -> pct=50 exato.
    // -----------------------------------------------------------------------
    // Nota: jsdom normaliza `background: '#ff3030'` pra `rgb(...)` no atributo style,
    // mas preserva o hex literal dentro de `box-shadow: 0 0 6px ${corBarra}` (a mesma
    // div de BarraVital seta as duas propriedades) — por isso os testes abaixo
    // procuram o hex no box-shadow, igual ao teste "abaixo de 20%" já existente acima.
    it('exatamente 20% de vida (pct === 20, não "abaixo de 20") AINDA conta como vermelho — o threshold é <=20, inclusivo', () => {
        const ficha = criarFichaDeCombate(200000); // 200000 / 1000000 = 20% exato
        const { container } = renderHolograma(montarMockState({ minhaFicha: ficha, feedCombate: [{ tipo: 'dano', nome: 'Kakaroto', dano: 1 }] }));

        const barraVermelha = Array.from(container.querySelectorAll('div')).find(d => (d.getAttribute('style') || '').includes('#ff3030'));
        expect(barraVermelha).toBeDefined();
        expect(barraVermelha.getAttribute('style')).toMatch(/width:\s*20%/);
    });

    it('logo ACIMA de 20% (pct ≈ 20.0001%) já deixa de ser vermelho e vira amarelo (perigo médio)', () => {
        const ficha = criarFichaDeCombate(200001); // 200001 / 1000000 = 20.0001%
        const { container } = renderHolograma(montarMockState({ minhaFicha: ficha, feedCombate: [{ tipo: 'dano', nome: 'Kakaroto', dano: 1 }] }));

        const divs = Array.from(container.querySelectorAll('div')).map(d => d.getAttribute('style') || '');
        expect(divs.some(s => s.includes('#ff3030'))).toBe(false);
        expect(divs.some(s => s.includes('#ffcc00'))).toBe(true);
    });

    it('exatamente 50% de vida (pct === 50) AINDA conta como amarelo — o threshold é <=50, inclusivo', () => {
        const ficha = criarFichaDeCombate(500000); // 500000 / 1000000 = 50% exato
        const { container } = renderHolograma(montarMockState({ minhaFicha: ficha, feedCombate: [{ tipo: 'dano', nome: 'Kakaroto', dano: 1 }] }));

        const barraAmarela = Array.from(container.querySelectorAll('div')).find(d => (d.getAttribute('style') || '').includes('#ffcc00'));
        expect(barraAmarela).toBeDefined();
        expect(barraAmarela.getAttribute('style')).toMatch(/width:\s*50%/);
    });

    it('logo ACIMA de 50% (pct ≈ 50.0001%) deixa de ser amarelo e volta pra cor normal da barra de HP (#ff4d4d)', () => {
        const ficha = criarFichaDeCombate(500001); // 500001 / 1000000 = 50.0001%
        const { container } = renderHolograma(montarMockState({ minhaFicha: ficha, feedCombate: [{ tipo: 'dano', nome: 'Kakaroto', dano: 1 }] }));

        // A div da BARRA (a barra INTERNA, com width em %) é a que reflete o corBarra
        // calculado — filtramos por width pra não colidir com o "#ff4d4d" do texto/label HP.
        const barrasComWidth = Array.from(container.querySelectorAll('div')).filter(d => /width:\s*\d+(\.\d+)?%/.test(d.getAttribute('style') || ''));
        const estilos = barrasComWidth.map(d => d.getAttribute('style') || '');
        expect(estilos.some(s => s.includes('#ffcc00'))).toBe(false);
        expect(estilos.some(s => s.includes('#ff3030'))).toBe(false);
        expect(estilos.some(s => s.includes('#ff4d4d'))).toBe(true);
    });

    it('maximo <= 0 (getMaximo retorna 0, status sem base definida) não divide por zero nem quebra — cai no fallback (atual>0 => barra cheia)', () => {
        const ficha = criarFichaDeCombate(500);
        ficha.vida = { atual: 500 }; // sem "base" -> getMaximo(ficha, 'vida') = 0
        let container;
        expect(() => {
            ({ container } = renderHolograma(montarMockState({ minhaFicha: ficha, feedCombate: [{ tipo: 'dano', nome: 'Kakaroto', dano: 1 }] })));
        }).not.toThrow();

        const barras = Array.from(container.querySelectorAll('div')).filter(d => /width:\s*\d+(\.\d+)?%/.test(d.getAttribute('style') || ''));
        expect(barras.length).toBeGreaterThan(0);
        barras.forEach(b => {
            const pct = parseFloat(/width:\s*(\d+(?:\.\d+)?)%/.exec(b.getAttribute('style'))[1]);
            expect(Number.isFinite(pct)).toBe(true);
            expect(pct).toBeGreaterThanOrEqual(0);
            expect(pct).toBeLessThanOrEqual(100);
        });
    });

    it('maximo <= 0 E atual === 0 (vital totalmente indefinido) cai pra pct=0 (barra vazia) sem NaN', () => {
        const ficha = criarFichaDeCombate(500);
        ficha.vida = {}; // nem "atual" nem "base" definidos
        const { container } = renderHolograma(montarMockState({ minhaFicha: ficha, feedCombate: [{ tipo: 'dano', nome: 'Kakaroto', dano: 1 }] }));

        const barraVida = Array.from(container.querySelectorAll('div')).find(d => (d.getAttribute('style') || '').includes('#ff3030'));
        expect(barraVida).toBeDefined();
        expect(barraVida.getAttribute('style')).toMatch(/width:\s*0%/);
    });

    // -----------------------------------------------------------------------
    // QA (gap) — a barra de PODER (⚡ PODER) não usa BarraVital, é só o número
    // formatado (formatarPoderCosmico) — precisa continuar aparecendo corretamente
    // dentro do novo layout em Fragment (<> + <style> + a div .holograma-impacto),
    // não só as barras vitais que ganharam o BarraVital novo.
    // -----------------------------------------------------------------------
    it('a linha "⚡ PODER" continua renderizando um valor numérico formatado no novo layout em Fragment', () => {
        const ficha = criarFichaDeCombate(500000);
        renderHolograma(montarMockState({ minhaFicha: ficha, feedCombate: [{ tipo: 'dano', nome: 'Kakaroto', dano: 1 }] }));

        const labelPoder = screen.getByText('⚡ PODER');
        expect(labelPoder).toBeDefined();
        const linhaPoder = labelPoder.parentElement;
        const valorSpan = Array.from(linhaPoder.children).find(el => el !== labelPoder);
        expect(valorSpan).toBeDefined();
        expect(valorSpan.textContent.trim().length).toBeGreaterThan(0);
        // formatarPoderCosmico sempre devolve um número (pt-BR) ou notação Xe+Y, nunca vazio/NaN/undefined.
        expect(valorSpan.textContent).not.toMatch(/NaN|undefined/i);
    });
});

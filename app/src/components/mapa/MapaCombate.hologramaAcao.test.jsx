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

    it('mostra a barra de vida (BarraVital) com um width em porcentagem válido, SEM mostrar o número de Máximo ao lado do Atual', () => {
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

        // QA — pedido do usuário: mostrar "Atual / Máximo" lado a lado não ficou interessante,
        // só o valor Atual deve aparecer (a barra já é o indicador visual "prático" de fartura).
        expect(container.textContent).not.toMatch(/\d\s*\/\s*[\d.,]+/);
    });

    // -------------------------------------------------------------------------
    // QA — Regressão do bug relatado: a moldura comparava "atual" (guardado na escala de
    // EXIBIÇÃO comprimida, ver core/vitals.js > calcVitalScale) contra getMaximo() BRUTO (sem
    // compressão), fazendo "atual" aparecer MAIOR que o "máximo" pra qualquer vital grande o
    // bastante pra cruzar a fronteira de compressão (9+ dígitos em mana/aura/chakra/corpo) —
    // exatamente o que o usuário reportou (screenshot: "345.000.000 / 230.000.000"). Corrigido
    // trocando getMaximo() por getVitalMxDisplay() (a mesma "única fonte de verdade" que a
    // própria Ficha Definitiva e a Regeneração automática já usam).
    // -------------------------------------------------------------------------
    it('a barra de MP não estoura 100% mesmo quando "atual" (na escala comprimida) seria maior que o getMaximo() bruto', () => {
        const ficha = criarFichaDeCombate(500000);
        // base = 5 bilhões (10 dígitos) -> calcVitalScale comprime com p=1 -> mxDisplay = 500.000.000.
        // atual = 400.000.000 já na escala comprimida (é assim que a Ficha Definitiva grava) —
        // ANTES da correção, a barra comparava isso contra getMaximo() bruto = 5.000.000.000,
        // dando ~8% (errado); DEPOIS, compara contra getVitalMxDisplay() = 500.000.000 -> 80%.
        ficha.mana = { atual: 400000000, base: 5000000000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mUnico: '1.0', mAbsoluto: 1.0 };
        const { container } = renderHolograma(montarMockState({ minhaFicha: ficha, feedCombate: [{ tipo: 'dano', nome: 'Kakaroto', dano: 1 }] }));

        const barraMp = Array.from(container.querySelectorAll('div')).find(d => (d.getAttribute('style') || '').includes('#4dffff') && /width:\s*\d/.test(d.getAttribute('style') || ''));
        expect(barraMp).toBeDefined();
        const match = /width:\s*(\d+(?:\.\d+)?)%/.exec(barraMp.getAttribute('style'));
        const pct = parseFloat(match[1]);
        expect(pct).toBeCloseTo(80, 0);
        expect(pct).toBeLessThanOrEqual(100);
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

    // -----------------------------------------------------------------------
    // QA (gap) — vital em ZERO (atual=0) com um teto REAL (getVitalMxDisplay > 0), diferente do
    // teste já existente "maximo <= 0 E atual === 0" (que testa a ficha SEM base nenhuma). Aqui a
    // barra deve ficar em 0% (não NaN, não 100% pelo fallback de "sem máximo") e, sendo a barra de
    // HP (perigo=true), a cor de perigo mais forte (vermelho, <=20%) deve disparar em 0% também.
    // -----------------------------------------------------------------------
    it('HP zerado (atual=0, com máximo real > 0) renderiza a barra em 0% (não NaN) E já dispara a cor de perigo vermelha', () => {
        const ficha = criarFichaDeCombate(0);
        const { container } = renderHolograma(montarMockState({ minhaFicha: ficha, feedCombate: [{ tipo: 'dano', nome: 'Kakaroto', dano: 1 }] }));

        const barraVermelha = Array.from(container.querySelectorAll('div')).find(d => (d.getAttribute('style') || '').includes('#ff3030'));
        expect(barraVermelha).toBeDefined();
        expect(barraVermelha.getAttribute('style')).toMatch(/width:\s*0%/);
        expect(barraVermelha.getAttribute('style')).not.toMatch(/NaN/);
    });

    it('MP zerado (atual=0, com máximo real > 0, vital SEM perigo) renderiza a barra em 0% sem lançar erro e sem virar cor de perigo (perigo é exclusivo de HP)', () => {
        const ficha = criarFichaDeCombate(500000);
        ficha.mana = { atual: 0, base: 100000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mUnico: '1.0', mAbsoluto: 1.0 };
        let container;
        expect(() => {
            ({ container } = renderHolograma(montarMockState({ minhaFicha: ficha, feedCombate: [{ tipo: 'dano', nome: 'Kakaroto', dano: 1 }] })));
        }).not.toThrow();

        const barraMp = Array.from(container.querySelectorAll('div')).find(d => (d.getAttribute('style') || '').includes('#4dffff') && /width:\s*\d/.test(d.getAttribute('style') || ''));
        expect(barraMp).toBeDefined();
        expect(barraMp.getAttribute('style')).toMatch(/width:\s*0%/);
        // MP não é a barra "perigo" (só HP é) -- nunca deveria assumir #ff3030/#ffcc00 mesmo em 0%.
        expect(barraMp.getAttribute('style')).not.toMatch(/#ff3030|#ffcc00/);
    });

    // -----------------------------------------------------------------------
    // QA (gap) — os 5 vitais (vida/mana/aura/chakra/corpo) cruzando a fronteira de compressão de
    // calcVitalScale AO MESMO TEMPO, não só mana isolado (como no teste de regressão já existente
    // acima). Vida usa o limite de 8 dígitos; as outras 4 usam 9 -- com o MESMO "base" de
    // 100.000.000 (9 dígitos), vida (limite 8) já comprime com p=1 (mxDisplay=10.000.000), enquanto
    // mana/aura/chakra/corpo (limite 9) ainda NÃO comprimem (p=0, mxDisplay=100.000.000 igual ao
    // bruto) -- provando que getVitalMxDisplay é chamado com a chave certa (não reaproveitando o
    // mesmo threshold pros 5) e que a barra de cada um reflete seu próprio teto comprimido.
    // -----------------------------------------------------------------------
    it('vida/mana/aura/chakra/corpo cruzando a fronteira de compressão SIMULTANEAMENTE: vida (limite 8 dígitos) já comprime, as outras 4 (limite 9) ainda não, com o MESMO "base"', () => {
        const baseComum = 100000000; // 9 dígitos
        // 70% do próprio mxDisplay -- longe o bastante dos thresholds de perigo (<=20%/<=50%) de
        // HP pra não mudar a cor da barra de vida, já que só ela (perigo=true) muda de cor com o pct.
        const ficha = criarFichaDeCombate(7000000); // vida: mxDisplay comprimido = 10.000.000 (limite 8) -> 70% = 7.000.000
        ficha.vida = { atual: 7000000, base: baseComum, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mUnico: '1.0', mAbsoluto: 1.0 };
        ['mana', 'aura', 'chakra', 'corpo'].forEach(k => {
            ficha[k] = { atual: 70000000, base: baseComum, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mUnico: '1.0', mAbsoluto: 1.0 }; // mxDisplay sem compressão = 100.000.000 (limite 9) -> 70% = 70.000.000
        });
        const { container } = renderHolograma(montarMockState({ minhaFicha: ficha, feedCombate: [{ tipo: 'dano', nome: 'Kakaroto', dano: 1 }] }));

        // mana/aura/chakra/corpo continuam com 1 barra só (numBarras=1 sempre) -- cor inalterada,
        // dá pra achar pela cor literal do vital.
        const coresEsperadas = ['#4dffff', '#ffff4d', '#00ffcc', '#ff66ff'];
        coresEsperadas.forEach(cor => {
            const barra = Array.from(container.querySelectorAll('div')).find(d => {
                const style = d.getAttribute('style') || '';
                return style.includes(cor) && /width:\s*\d/.test(style);
            });
            expect(barra, `barra de cor ${cor} deveria existir`).toBeDefined();
            const pct = parseFloat(/width:\s*(\d+(?:\.\d+)?)%/.exec(barra.getAttribute('style'))[1]);
            // Todos os vitais foram setados em exatamente 70% do próprio teto comprimido
            // (mxDisplay), independente de vida ter comprimido (p=1) e os outros não (p=0) --
            // todos devem dar 70%, provando que cada um usa SEU PRÓPRIO getVitalMxDisplay(key,ficha).
            expect(pct).toBeCloseTo(70, 0);
        });

        // Vida (limite 8 dígitos) comprime com p=1 -> 2 barras "Break Bars" (getNumBarrasVida).
        // Desde que cada barra ganhou sua PRÓPRIA cor (pedido do usuário), a barra da frente
        // (índice 0) não é mais garantida como #ff4d4d literal -- busca por classe em vez de cor.
        // Dano total=3.000.000 (7.000.000 de 10.000.000): barra 0 esvazia inteira (0%), barra 1
        // fica com o restante (7.000.000/10.000.000 = 70%), provando a escala comprimida (1e7).
        const barrasVida = Array.from(container.querySelectorAll('.break-bars-barra'));
        expect(barrasVida.length).toBe(2);
        const pctsVida = barrasVida.map(b => {
            const preenchimento = b.querySelector('.break-bars-barra__preenchimento');
            return parseFloat(/width:\s*(\d+(?:\.\d+)?)%/.exec(preenchimento.getAttribute('style'))[1]);
        }).sort((a, b) => a - b);
        expect(pctsVida).toEqual([0, 70]);
    });

    // -----------------------------------------------------------------------
    // QA (gap) — regressão explícita: getMaximo() (core/attributes.js, valor BRUTO sem a escala de
    // exibição) não pode voltar a ser usado em MapaCombate.jsx pra calcular os "máximos" das barras
    // -- foi exatamente essa troca (getMaximo -> getVitalMxDisplay) que corrigiu o bug relatado.
    // Escaneia o próprio código-fonte em vez de só testar comportamento, porque um import
    // "esquecido" de getMaximo sem uso real não quebraria nenhuma asserção de comportamento acima.
    // -----------------------------------------------------------------------
    // -----------------------------------------------------------------------
    // QA (gap) — turno de um DUMMY/NPC do Mapa (jogadorDaVez.isDummie: true). Diferente de um
    // jogador (fichaBase.vida = { atual, base, ... }), o dummy usa um shape FLAT (fichaBase.hpMax/
    // fichaBase.hpAtual) e passa pelo branch `calcularBarrasVidaDummy` em vez de
    // `calcularBarrasVida` (ver MapaCombate.jsx > MapaHologramaAcao > isDummieDaVez). Monta o
    // dummy via `dummies` + `ordemIniciativa`/`jogadorDaVez` (MapaFormContext.jsx deriva
    // jogadorDaVez a partir de `dummies` com iniciativa>0 na cena ativa), não via `minhaFicha`.
    // -----------------------------------------------------------------------
    function montarMockStateComDummy(dummyOverrides = {}, stateOverrides = {}) {
        const dummy = {
            nome: 'Slime Selvagem',
            iniciativa: 15,
            hpMax: 100000000, // 9 dígitos -> cruza a fronteira (calcularBarrasVidaDummy: p=1) -> 2 barras de 5e7 cada
            hpAtual: 60000000, // dano total = 4e7: esvazia metade da barra da frente (5e7 -> resta 1e7)
            ...dummyOverrides,
        };
        return montarMockState({
            dummies: { dummie1: dummy },
            ...stateOverrides,
        });
    }

    it('turno de um DUMMY (isDummie=true) usa calcularBarrasVidaDummy e renderiza HP corretamente sem quebrar (hpMax cruzando a fronteira, 2 barras)', () => {
        const { container } = renderHolograma(montarMockStateComDummy());

        expect(screen.getAllByText(/Slime Selvagem/i).length).toBeGreaterThan(0);

        // HP total exibido = hpAtual (60.000.000), formatado em pt-BR. O nº de barras não aparece
        // mais como texto -- o visual novo de "Break Bars" (components/shared/BarrasVida.jsx) já
        // mostra isso pela fileira de losangos ("pips") acima das barras.
        expect(screen.getByText(/60\.000\.000/)).toBeDefined();
        const pips = container.querySelectorAll('.break-bars-pip');
        expect(pips.length).toBe(2);

        // As 2 barras de HP (perigo=true) devem existir com width válido (0-100%), sem NaN --
        // barra 0 (frente) parcialmente esvaziada, barra 1 (trás) intacta. Busca por classe (não
        // mais por cor literal, já que cada barra ganhou sua própria cor -- pedido do usuário).
        const barrasHp = Array.from(container.querySelectorAll('.break-bars-barra'));
        expect(barrasHp.length).toBe(2);
        const pcts = barrasHp.map(b => {
            const preenchimento = b.querySelector('.break-bars-barra__preenchimento');
            const match = /width:\s*(\d+(?:\.\d+)?)%/.exec(preenchimento.getAttribute('style'));
            expect(match).not.toBeNull();
            const pct = parseFloat(match[1]);
            expect(Number.isFinite(pct)).toBe(true);
            expect(pct).toBeGreaterThanOrEqual(0);
            expect(pct).toBeLessThanOrEqual(100);
            return pct;
        });

        // Barra da FRENTE (índice 0, primeira renderizada) recebeu o dano primeiro: dano total=4e7,
        // mxPorBarra=5e7 -> barra 0 fica com 1e7/5e7 = 20% (dano < 1 barra, sem cascata); barra 1
        // (trás) continua 100% intacta.
        expect(pcts[0]).toBeCloseTo(20, 0);
        expect(pcts[1]).toBeCloseTo(100, 0);
    });

    it('turno de um DUMMY sem cruzar a fronteira (hpMax pequeno) renderiza exatamente 1 barra de HP, sem o sufixo "(N barras)"', () => {
        const { container } = renderHolograma(montarMockStateComDummy({ hpMax: 500, hpAtual: 250 }));

        expect(screen.getByText(/^250$/)).toBeDefined();
        expect(container.textContent).not.toMatch(/\(\d+ barras\)/);

        const barrasHp = Array.from(container.querySelectorAll('div')).filter(d => {
            const style = d.getAttribute('style') || '';
            return /width:\s*\d/.test(style) && (style.includes('#ff4d4d') || style.includes('#ff3030') || style.includes('#ffcc00'));
        });
        expect(barrasHp.length).toBe(1);
        const pct = parseFloat(/width:\s*(\d+(?:\.\d+)?)%/.exec(barrasHp[0].getAttribute('style'))[1]);
        expect(pct).toBeCloseTo(50, 0);
    });

    it('turno de um DUMMY com hpAtual=0 (derrotado) renderiza todas as barras em 0%, sem NaN nem lançar', () => {
        let container;
        expect(() => {
            ({ container } = renderHolograma(montarMockStateComDummy({ hpAtual: 0 })));
        }).not.toThrow();

        const barrasHp = Array.from(container.querySelectorAll('div')).filter(d => {
            const style = d.getAttribute('style') || '';
            return /width:\s*\d/.test(style) && (style.includes('#ff4d4d') || style.includes('#ff3030') || style.includes('#ffcc00'));
        });
        expect(barrasHp.length).toBe(2);
        barrasHp.forEach(b => {
            expect(b.getAttribute('style')).toMatch(/width:\s*0%/);
            expect(b.getAttribute('style')).not.toMatch(/NaN/);
        });
    });

    it('turno de um jogador NORMAL (isDummie=false) continua usando calcularBarrasVida (não o branch de dummy), preservando o comportamento já validado', () => {
        // Regressão simples: confirma que ligar `dummies` no state não faz um turno de JOGADOR
        // normal (via minhaFicha/feedCombate, sem ordemIniciativa) acidentalmente cair no branch
        // de dummy quando jogadorDaVez é null (fora de combate) -- mesmo cenário dos testes
        // originais deste arquivo, só que agora com `dummies` populado ao mesmo tempo.
        const ficha = criarFichaDeCombate(500000);
        const { container } = renderHolograma(montarMockState({
            minhaFicha: ficha,
            feedCombate: [{ tipo: 'dano', nome: 'Kakaroto', dano: 1 }],
            dummies: { dummie1: { nome: 'Slime Selvagem', iniciativa: 0, hpMax: 100000000, hpAtual: 60000000 } },
        }));

        expect(container.textContent).not.toMatch(/\(\d+ barras\)/); // ficha de player (base 1e6) não cruza a fronteira de Vitalidade
        const barrasHp = Array.from(container.querySelectorAll('div')).filter(d => {
            const style = d.getAttribute('style') || '';
            return /width:\s*\d/.test(style) && (style.includes('#ff4d4d') || style.includes('#ff3030') || style.includes('#ffcc00'));
        });
        expect(barrasHp.length).toBe(1);
    });

    it('regressão de fonte: MapaCombate.jsx não importa nem usa getMaximo de core/attributes.js para os máximos das barras', async () => {
        const fs = await import('node:fs');
        const path = await import('node:path');
        const caminho = path.resolve(__dirname, './MapaCombate.jsx');
        const codigoFonte = fs.readFileSync(caminho, 'utf8');

        // Sem import de getMaximo vindo de core/attributes (direto ou via require dinâmico).
        expect(codigoFonte).not.toMatch(/import\s*\{[^}]*\bgetMaximo\b[^}]*\}\s*from\s*['"].*attributes(\.js)?['"]/);
        // E sem NENHUMA chamada real "getMaximo(" fora de comentários (a função getVitalMxDisplay
        // continua sendo a única fonte de teto usada aqui).
        const semComentarios = codigoFonte
            .split('\n')
            .filter(linha => !/^\s*(\/\/|\*|\/\*)/.test(linha))
            .join('\n');
        expect(semComentarios).not.toMatch(/[^a-zA-Z_]getMaximo\(/);
        // Confirma que getVitalMxDisplay CONTINUA sendo importado de core/vitals — junto de
        // calcularBarrasVida/calcularBarrasVidaDummy (múltiplas barras de Vida), que passaram a
        // ser a fonte real do teto de HP especificamente (getVitalMxDisplay continua servindo
        // MP/AU/CK/CP, que não ganham múltiplas barras).
        expect(codigoFonte).toMatch(/import\s*\{[^}]*\bgetVitalMxDisplay\b[^}]*\}\s*from\s*['"]\.\.\/\.\.\/core\/vitals['"]/);
        expect(codigoFonte).toMatch(/import\s*\{[^}]*\bcalcularBarrasVida\b[^}]*\}\s*from\s*['"]\.\.\/\.\.\/core\/vitals['"]/);
    });
});

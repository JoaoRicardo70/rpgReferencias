import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MapaMundi from './MapaMundi';
import useStore from '../../stores/useStore';

// ==========================================================================
// NOTA DE ESCOPO (herdada do MapaMundi.smoke.test.jsx):
// MapaMundi.jsx é grande e cai em múltiplas "telas" alternadas por state
// local (`nivelVisao`). Montar o componente real de ponta a ponta dentro
// de um <MapaFormProvider> real arrastaria @react-three/fiber/three.js
// (usados por outros consumidores do mesmo contexto, não por MapaMundi.jsx
// diretamente) e dezenas de campos irrelevantes para este teste. Por isso,
// aqui `./MapaFormContext` é mockado manualmente com um objeto controlável
// (`mockCtx`), reexpondo apenas o que MapaMundi.jsx realmente consome:
// `useMapaForm()` (→ { cenaRenderId, cenaAtual }) e `urlSeguraParaCss`
// (reimplementada com a MESMA lógica do arquivo real, já que é uma função
// pura simples — evita puxar o resto do módulo, que importa firebase-sync).
//
// Cobertura:
//   1) useMapaForm() com cenaRenderId setado -> pula direto pra tela 'reino'
//      (renderiza os children recebidos, não a tela 'sistema_solar').
//   2) Mudança de cenaRenderId entre renders -> cabeçalho atualiza o nome
//      da cena (useEffect com dependência em ctxMapa?.cenaRenderId).
//   3) useMapaForm() retornando null (fora do provider) -> NÃO pula sozinho
//      pra tela de batalha, continua mostrando a tela cósmica inicial
//      (confirma que a mudança não regrediu o comportamento já coberto
//      pelo smoke test existente).
//
// Fora de escopo aqui (não coberto): o fluxo real de clique no "Gerenciador
// de Cenas" (MapaFerramentasMestre.jsx) que altera cenario.ativa/
// cenaVisualizadaId dentro de um MapaFormProvider de verdade, e a gravação
// no Firebase via salvarCenarioCompleto (entrarNoMapaDeBatalha/
// atualizarImagemMapa) — isso exigiria mockar firebase-config/firebase-sync
// e useStore.getState() de forma mais completa; não é acionado pelos
// testes abaixo, que só exercitam o useEffect de sincronização e a
// renderização condicional da tela 'reino'.
// ==========================================================================

vi.mock('../../stores/useStore', () => ({
    default: vi.fn(),
}));

function mockUseStore(state) {
    useStore.mockImplementation((selector) => (typeof selector === 'function' ? selector(state) : state));
}

// Objeto controlável entre renders: os testes reatribuem os campos antes de
// cada render/rerender, e o mock de useMapaForm sempre lê a referência atual.
let mockCtx = null;

vi.mock('./MapaFormContext', () => ({
    useMapaForm: () => mockCtx,
    // Reimplementação fiel da função real (app/src/components/mapa/MapaFormContext.jsx):
    // evita importar o módulo de verdade, que arrasta firebase-sync/core/engine etc.
    urlSeguraParaCss: (url) => {
        if (!url || typeof url !== 'string') return '';
        const trimmed = url.trim();
        if (!/^https?:\/\//i.test(trimmed) && !/^data:image\//i.test(trimmed)) return '';
        return `url("${trimmed.replace(/["\\)]/g, '')}")`;
    },
}));

describe('MapaMundi - sincronização com Cena publicada/visualizada (ctxMapa)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        mockUseStore({
            cenario: { ativa: null, lista: {} },
            setCenario: vi.fn(),
        });
        mockCtx = null;
    });

    afterEach(() => {
        cleanup();
    });

    it('pula direto para a tela de batalha (children) quando useMapaForm() já retorna uma cenaRenderId', () => {
        mockCtx = { cenaRenderId: 'cena-x', cenaAtual: { nome: 'Sala do Trono', img: '' } };

        render(
            <MapaMundi>
                <div data-testid="grelha-de-batalha">GRELHA</div>
            </MapaMundi>
        );

        // Não deve mostrar a tela cósmica inicial
        expect(screen.queryByText(/Universo Material/i)).toBeNull();

        // Deve renderizar os children (só acontece na tela 'reino')
        expect(screen.getByTestId('grelha-de-batalha')).toBeDefined();

        // Elementos exclusivos da tela 'reino'
        expect(screen.getByText('⬅ SAIR')).toBeDefined();
        expect(screen.getByText('⚙️ EDITAR CENÁRIO')).toBeDefined();
        // textTransform: uppercase é só CSS (visual) — o textContent real preserva o case original.
        expect(screen.getByText('Sala do Trono')).toBeDefined();
    });

    it('atualiza o cabeçalho com o novo nome da cena quando cenaRenderId muda entre re-renders', () => {
        mockCtx = { cenaRenderId: 'cena-x', cenaAtual: { nome: 'Sala do Trono', img: '' } };

        const { rerender } = render(
            <MapaMundi>
                <div data-testid="grelha-de-batalha">GRELHA</div>
            </MapaMundi>
        );
        expect(screen.getByText('Sala do Trono')).toBeDefined();

        // Simula o Mestre publicando/trocando pra outra Cena: novo cenaRenderId
        mockCtx = { cenaRenderId: 'cena-y', cenaAtual: { nome: 'Floresta Sombria', img: '' } };
        rerender(
            <MapaMundi>
                <div data-testid="grelha-de-batalha">GRELHA</div>
            </MapaMundi>
        );

        expect(screen.getByText('Floresta Sombria')).toBeDefined();
        expect(screen.queryByText('Sala do Trono')).toBeNull();
    });

    it('usa cenaAtual.img (via urlSeguraParaCss) como fundo quando não há entrada correspondente no Atlas local', () => {
        mockCtx = { cenaRenderId: 'cena-x', cenaAtual: { nome: 'Sala do Trono', img: 'https://exemplo.com/fundo.png' } };

        const { container } = render(
            <MapaMundi>
                <div data-testid="grelha-de-batalha">GRELHA</div>
            </MapaMundi>
        );

        const areaFundo = container.querySelector('div.fade-in[style*="background-image"]');
        expect(areaFundo).not.toBeNull();
        expect(areaFundo.style.backgroundImage).toContain('https://exemplo.com/fundo.png');
    });

    it('NÃO pula sozinho para a tela de batalha quando useMapaForm() retorna null (fora do provider) — mantém a tela cósmica inicial', () => {
        mockCtx = null;

        render(
            <MapaMundi>
                <div data-testid="grelha-de-batalha">GRELHA</div>
            </MapaMundi>
        );

        expect(screen.getByText(/Universo Material/i)).toBeDefined();
        expect(screen.queryByTestId('grelha-de-batalha')).toBeNull();
        expect(screen.queryByText('⬅ SAIR')).toBeNull();
    });

    it('não lança exceção quando useMapaForm() retorna objeto sem cenaAtual (defensivo)', () => {
        mockCtx = { cenaRenderId: 'cena-z' };

        expect(() =>
            render(
                <MapaMundi>
                    <div data-testid="grelha-de-batalha">GRELHA</div>
                </MapaMundi>
            )
        ).not.toThrow();

        // cenaAtual ausente -> mapaNome cai pra '' (ctxMapa?.cenaAtual?.nome || '')
        expect(screen.getByTestId('grelha-de-batalha')).toBeDefined();
    });

    // ======================================================================
    // ACHADO DE QA (não é uma falha de teste — documenta um bug real de
    // produção reproduzido de forma isolada; ver texto do relatório):
    //
    // No MapaFormContext.jsx real (não mockado neste arquivo), `cenaRenderId`
    // é derivado de `cenario?.ativa || 'default'` (MapaFormContext.jsx:103-105)
    // — ou seja, NUNCA é null/undefined/'' em produção, mesmo quando o Mestre
    // nunca publicou/trocou cena nenhuma. Como o useEffect de sincronização em
    // MapaMundi.jsx (linhas 35-43) só faz `if (!cenaRenderId) return;` antes
    // de forçar `nivelVisao` para 'reino', na prática ele SEMPRE dispara essa
    // troca assim que o componente monta — porque MapaMundi é montado sempre
    // dentro do MapaFormProvider (via MapaAreaCentral, ver MapaGrelha.jsx),
    // então ctxMapa nunca é null e cenaRenderId nunca é falsy no app real
    // (só é null/undefined no teste "fora do provider" acima, que só
    // acontece fora do MapaFormProvider, uma situação que não ocorre na
    // aplicação real).
    //
    // Efeito prático: a tela cósmica de navegação ('sistema_solar' → clique
    // num planeta → 'globo' → 'ENTRAR EM RUNETERRA' → 'continente' → clicar
    // num reino → escolher/CRIAR um mapa no Atlas) fica inacessível sempre
    // que o MapaMundi remonta (ex.: toda vez que o jogador troca de aba e
    // volta pra aba do Mapa) — o jogador é jogado direto pra tela 'reino' da
    // cena "default"/ativa, mesmo que o Mestre nunca tenha publicado nada.
    // Isso reproduz o mesmo teste 1 acima, mas com o valor de fallback REAL
    // usado em produção ('default') em vez de um id fictício.
    // ======================================================================
    it('[ACHADO] com cenaRenderId="default" (fallback real de produção quando nenhuma cena foi publicada), MapaMundi ainda assim pula direto pra "reino" e nunca mostra a navegação cósmica', () => {
        mockCtx = { cenaRenderId: 'default', cenaAtual: { nome: 'Cenário Inicial', img: '' } };

        render(
            <MapaMundi>
                <div data-testid="grelha-de-batalha">GRELHA</div>
            </MapaMundi>
        );

        // Isto é o BUG: a tela inicial de navegação cósmica nunca aparece.
        expect(screen.queryByText(/Universo Material/i)).toBeNull();
        expect(screen.getByTestId('grelha-de-batalha')).toBeDefined();
    });
});

import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MarcadosPanel from './Marcados';
import useStore from '../../stores/useStore';

// ---------------------------------------------------------------------------
// QA — Regressão: o Poder do Scouter agora IGNORA os bônus de Status/Energia/
// Vida (mFormas incluído) que vêm do Grimório (ficha.poderes — Habilidades/
// Formas/Poderes). Esses bônus continuam valendo normalmente no resto da
// Ficha (Radar, barras de Vida/Mana/etc, painel de Status) — só saem da
// leitura do Scouter.
//
// Antes desta mudança, getGlobalMultipliers() somava, para cada um dos 6
// eixos (vida/mana/aura/chakra/corpo/status), o bônus dinâmico de mFormas
// vindo de poderes[]/inventario[]/seresSelados[] ao grupo MFORMAS — inclusive
// quando esse bônus vinha de uma entrada do Grimório. Agora esse cálculo usa
// getEfetivoMFormas(ficha, eixo, /*ignorarPoderes*/ true), que passa
// ignorarPoderes=true para getBuffs() e por isso nunca mais lê ficha.poderes.
// Quem quiser que uma entrada do Grimório afete o Poder do Scouter usa agora
// o campo dedicado "PODER (Direto)" (atributo:'poder_direto' — ver
// Marcados.poderDiretoGrimorio.test.jsx).
//
// O campo ESTÁTICO ficha.<attr>.mFormas (escrito por fora do Grimório, ex.:
// pela aba Status) não é afetado por essa mudança — continua contando
// normalmente no Scouter, como prova o terceiro describe abaixo.
//
// Como getGlobalMultipliers/getEfetivoMFormas não são exportadas, a
// validação é feita renderizando o MarcadosPanel real e lendo a leitura
// auxiliar em notação científica do Scouter (mesmo padrão dos demais
// arquivos de teste do Scouter, ex.: Marcados.scouterFormulaAscensao.test.jsx).
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    uploadImagem: vi.fn(),
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
}));

// Ficha minimalista com todas as 6 categorias (vida/mana/aura/chakra/corpo/
// status) zeradas por padrão. Bases mantidas bem abaixo dos divisores de
// prestígio de cada categoria (vida: 1e6, status: 1e3 por atributo médio)
// para garantir prestígio = 0 em todas elas — isso mantém a Ascensão Geral
// Efetiva presa em 1 (ascensaoBase=1 * multiplicadorForcaAscensao=1, sem
// overflow), o que isola a variável sob teste (glob.finalF, via mFormas) do
// resto da fórmula do Scouter (poderComAscensao).
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

describe('MarcadosPanel — Grimório (poderes[]) com mformas tageado num eixo específico NÃO move mais o Scouter', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        window.alert = vi.fn();
    });

    afterEach(() => {
        cleanup();
    });

    // Poder_Base = (vida*10)/6 = (600*10)/6 = 1000 (todo o resto zerado).
    // ascensaoGeralEfetiva = 1 (ascensaoBase padrão=1, sem overflow), então
    // multiplicadorAscensao = 1.25^1 = 1.25. glob.finalF fica travado em 1 nos dois
    // estados (ligado/desligado) porque getEfetivoMFormas agora ignora buffs
    // vindos de ficha.poderes: poderMultiplicado = 1000*1.25*1 = 1250, magnitude
    // = floor(log10(1250)) = 3, poderComAscensao = 1250 + 1*10^4 = 11250, exibido 11300.
    it('ativar uma Forma via poderes[] com efeito atributo:"vida"/propriedade:"mformas" NÃO altera mais a leitura do Scouter', () => {
        const ficha = fichaMinimaScouter({
            vida: { base: 600 },
            poderes: [{ nome: 'Forma Vital', ativa: false, efeitos: [{ atributo: 'vida', propriedade: 'mformas', valor: 2 }] }],
        });
        const mockState = montarMockUseStoreReativo(ficha);

        const { rerender } = render(<MarcadosPanel />);
        const valorDesligado = lerPoderGlobalExibido();
        expect(valorDesligado).toBe(11300);

        mockState.updateFicha((f) => { f.poderes[0].ativa = true; });
        rerender(<MarcadosPanel />);
        const valorLigado = lerPoderGlobalExibido();
        expect(valorLigado).toBe(11300);
        expect(valorLigado).toBe(valorDesligado);

        mockState.updateFicha((f) => { f.poderes[0].ativa = false; });
        rerender(<MarcadosPanel />);
        const valorRevertido = lerPoderGlobalExibido();
        expect(valorRevertido).toBe(11300);
    });
});

describe('MarcadosPanel — cobertura multi-eixo: a exclusão vale para qualquer eixo, não só "vida" (eixo status, âncora "forca")', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        window.alert = vi.fn();
    });

    afterEach(() => {
        cleanup();
    });

    // getEfetivoMFormas(ficha, 'status') usa a âncora 'forca' (anchor =
    // k==='status' ? 'forca' : k). Poder_Base = (statusEfetivo*100)/6, com
    // statusEfetivo = somaStatus/8 e apenas forca.base=480 setado (demais 7
    // atributos físicos = 0): statusEfetivo = 480/8 = 60 => Poder_Base =
    // (60*100)/6 = 1000 (mesmo Poder_Base do teste do eixo vida acima, logo
    // mesmo baseline 11300 — ver comentário no describe acima).
    it('ativar uma Forma via poderes[] com efeito atributo:"forca"/propriedade:"mformas" NÃO altera mais a leitura do Scouter (eixo status)', () => {
        const ficha = fichaMinimaScouter({
            forca: { base: 480 },
            poderes: [{ nome: 'Forma de Combate', ativa: false, efeitos: [{ atributo: 'forca', propriedade: 'mformas', valor: 2 }] }],
        });
        const mockState = montarMockUseStoreReativo(ficha);

        const { rerender } = render(<MarcadosPanel />);
        const valorDesligado = lerPoderGlobalExibido();
        expect(valorDesligado).toBe(11300);

        mockState.updateFicha((f) => { f.poderes[0].ativa = true; });
        rerender(<MarcadosPanel />);
        const valorLigado = lerPoderGlobalExibido();
        expect(valorLigado).toBe(11300);
        expect(valorLigado).toBe(valorDesligado);

        mockState.updateFicha((f) => { f.poderes[0].ativa = false; });
        rerender(<MarcadosPanel />);
        const valorRevertido = lerPoderGlobalExibido();
        expect(valorRevertido).toBe(11300);
    });
});

describe('MarcadosPanel — campo ESTÁTICO ficha.<attr>.mFormas (fora do Grimório) continua contando no Scouter', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        window.alert = vi.fn();
    });

    afterEach(() => {
        cleanup();
    });

    // Rota A (campo estático, ex.: escrito pela aba Status): ficha.forca.mFormas
    // = 3, sem buffs de poderes[] -> v=3 -> getEfetivoMFormas retorna v=3
    // diretamente -> glob.finalF = 1+(3-1) = 3. Poder_Base = (vida*10)/6 =
    // 1000 (só vida=600). poderMultiplicado = 1000*1.25(ascensão)*3(finalF) =
    // 3750, magnitude = 3, poderComAscensao = 3750 + 1*10^4 = 13750, exibido 13800.
    //
    // Rota B (buff dinâmico via poderes[] ativo): agora IGNORADA pelo Scouter
    // (ver describes acima) — glob.finalF fica em 1, poderMultiplicado =
    // 1000*1.25*1 = 1250, poderComAscensao = 1250 + 10000 = 11250, exibido 11300. As duas
    // leituras NÃO são mais iguais, ao contrário do comportamento anterior à
    // exclusão do Grimório do cálculo do Scouter.
    it('campo estático mFormas=3 continua valendo no Scouter (13800); o mesmo bônus vindo de poderes[] não conta mais (11300)', () => {
        const fichaEstatica = fichaMinimaScouter({
            vida: { base: 600 },
            forca: { base: 0, mFormas: 3 },
        });
        montarMockUseStoreReativo(fichaEstatica);
        const { unmount } = render(<MarcadosPanel />);
        const leituraEstatica = lerPoderGlobalExibido();
        unmount();

        const fichaBuff = fichaMinimaScouter({
            vida: { base: 600 },
            forca: { base: 0 },
            poderes: [{ nome: 'Forma de Combate III', ativa: true, efeitos: [{ atributo: 'forca', propriedade: 'mformas', valor: 3 }] }],
        });
        montarMockUseStoreReativo(fichaBuff);
        render(<MarcadosPanel />);
        const leituraBuff = lerPoderGlobalExibido();

        expect(leituraEstatica).toBe(13800);
        expect(leituraBuff).toBe(11300);
        expect(leituraEstatica).not.toBe(leituraBuff);
    });
});

describe('MarcadosPanel — Grimório (poderes[]) não infla o Poder INDIRETAMENTE via Ascensão/Prestígio', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        window.alert = vi.fn();
    });

    afterEach(() => {
        cleanup();
    });

    // As fichas de "gargalo único" acima (fichaMinimaScouter, com 5 das 6 categorias
    // zeradas) não conseguem expor um vazamento pela Ascensão: como Math.min(...) entre
    // as 6 categorias já trava nivelCompletos em 0 (as 5 categorias zeradas nunca sobem),
    // um bônus de mFormas isolado em "vida" nunca muda o mínimo. Aqui, TODAS as 6
    // categorias têm overflow de Prestígio > 0, com "vida" deliberadamente MENOR que as
    // outras 5 (o gargalo real) — só assim um bônus de mFormas em "vida" vindo do
    // Grimório teria como empurrar o mínimo para cima, se ainda vazasse pela Ascensão.
    //
    // vida=1e8 -> prestígio bruto=100 -> bonusAscensao=floor(100/100)=1 (o gargalo).
    // mana/aura/chakra/corpo=5e9 -> prestígio bruto=500 -> bonusAscensao=5 cada.
    // forca..constituicao=500000 (média) -> prestígio bruto(status)=500 -> bonusAscensao=5.
    // nivelCompletos = min(1,5,5,5,5,5) = 1 -> ascensaoGeralEfetivaParaPoder = (1+1)*1 = 2
    // -> multiplicadorAscensao = 1.25^2 = 1,5625 (mesmo com o poder do Grimório desativado).
    function fichaComGargaloDeVida(overrides = {}) {
        return {
            vida: { base: 100000000 },
            mana: { base: 5000000000 },
            aura: { base: 5000000000 },
            chakra: { base: 5000000000 },
            corpo: { base: 5000000000 },
            forca: { base: 500000 },
            destreza: { base: 500000 },
            inteligencia: { base: 500000 },
            sabedoria: { base: 500000 },
            energiaEsp: { base: 500000 },
            carisma: { base: 500000 },
            stamina: { base: 500000 },
            constituicao: { base: 500000 },
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

    // Se um efeito de poderes[] com atributo:'vida'/propriedade:'mformas' NÃO for excluído
    // do cálculo de Ascensão (regressão), ele empurraria o gargalo de "vida" (bonusAscensao=1)
    // para cima do das outras 5 categorias (bonusAscensao=5), fazendo nivelCompletos SUBIR
    // de 1 para 5 e ascensaoGeralEfetivaParaPoder de 2 para 6 — um salto de 1.25^6/1.25^2=1.25^4≈2,44x só
    // por causa da Ascensão, ADEMAIS de qualquer efeito "poder_direto" no mesmo Poder. Com a
    // exclusão correta (ignorarPoderes=true em calcularPrestAtual/getEfetivoMFormas), ativar
    // este Poder NÃO deve mudar a leitura do Scouter em nada.
    it('efeito de poderes[] com atributo:"vida"/propriedade:"mformas" NÃO altera a Ascensão/Prestígio usada pelo Poder, mesmo quando "vida" é o gargalo do mínimo entre as 6 categorias', () => {
        const ficha = fichaComGargaloDeVida({
            poderes: [{ nome: 'Forma Vital Extrema', ativa: false, efeitos: [{ atributo: 'vida', propriedade: 'mformas', valor: 60 }] }],
        });
        const mockState = montarMockUseStoreReativo(ficha);

        const { rerender } = render(<MarcadosPanel />);
        const valorDesligado = lerPoderGlobalExibido();

        mockState.updateFicha((f) => { f.poderes[0].ativa = true; });
        rerender(<MarcadosPanel />);
        const valorLigado = lerPoderGlobalExibido();

        expect(valorLigado).toBe(valorDesligado);

        mockState.updateFicha((f) => { f.poderes[0].ativa = false; });
        rerender(<MarcadosPanel />);
        const valorRevertido = lerPoderGlobalExibido();
        expect(valorRevertido).toBe(valorDesligado);
    });
});

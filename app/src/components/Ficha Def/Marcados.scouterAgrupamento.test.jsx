import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MarcadosPanel from './Marcados';
import useStore from '../../stores/useStore';

// ---------------------------------------------------------------------------
// QA — Correção de getGlobalMultipliers() / getPoderAbsolutoAtributo() em Marcados.jsx
//
// getGlobalMultipliers(ficha) é uma função local, não exportada, que extrai
// multiplicadores MBASE/MGERAL/MFORMAS/MABS de várias fontes (caixas manuais,
// buffs do sistema via getBuffs, texto de passivas/habilidades/etc.) e os
// combina em um fator final por tipo. A regra correta é: TODAS as instâncias
// do MESMO TIPO, não importa a fonte, se SOMAM (1 + soma) — e só então os
// quatro fatores finais (MBASE, MGERAL, MFORMAS, MABS) se multiplicam entre
// si. Antes da correção, instâncias do mesmo tipo eram agrupadas por fonte e
// as fontes eram MULTIPLICADAS entre si (ex.: duas fontes de MGERAL:+8 davam
// (1+8)*(1+8)=81 em vez de 1+8+8=17). O mUnico é a única exceção: continua
// puramente multiplicativo entre instâncias (cada instância multiplica o
// total), sem alteração pela correção.
//
// getPoderAbsolutoAtributo(key, ficha) agora deriva pontosTotais do par final
// { prestigioFinal, ascensaoFinal } retornado por aplicarMultiplicadorForca
// (a mesma cascata de overflow Prestígio->Ascensão usada pelo Radar), em vez
// de somar cru (ascensaoBase*multA*100) + (prestigioBruto*multP) sem qualquer
// tratamento de overflow.
//
// Nenhuma das duas funções é exportada — validamos renderizando o
// MarcadosPanel real, com os mesmos padrões de mock de
// Marcados.scouterTempoReal.test.jsx.
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    uploadImagem: vi.fn(),
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
}));

// Ficha "base" com valores grandes em todas as 6 categorias (vida, mana,
// aura, chakra, corpo, status via os 8 atributos físicos) — mesmo padrão de
// Marcados.scouterTempoReal.test.jsx — para que multiplicadores globais
// produzam variações de ordem de grandeza claras na leitura do Scouter.
function fichaComPoderes(poderesList = []) {
    return {
        vida: { base: 100000000 },
        mana: { base: 1000000000 },
        aura: { base: 1000000000 },
        chakra: { base: 1000000000 },
        corpo: { base: 1000000000 },
        forca: { base: 1000000 },
        destreza: { base: 1000000 },
        inteligencia: { base: 1000000 },
        sabedoria: { base: 1000000 },
        energiaEsp: { base: 1000000 },
        carisma: { base: 1000000 },
        stamina: { base: 1000000 },
        constituicao: { base: 1000000 },
        divisores: {},
        bio: {},
        estetica: {},
        labels: {},
        poderes: poderesList,
        inventario: [],
        seresSelados: [],
    };
}

// Ficha minimalista focada só em Vida, com os demais atributos zerados, para
// isolar a leitura de "Poder Verdadeiro" de Vida (primeiro badge "Poder:" da
// Página 1) do resto do cálculo.
function fichaVidaOverflow({ vidaBase, multiplicadorForcaPrestigio, ascensaoBase = 1, multiplicadorForcaAscensao = 1 }) {
    return {
        vida: { base: vidaBase },
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
        ascensaoBase,
        multiplicadorForcaPrestigio,
        multiplicadorForcaAscensao,
        divisores: {},
        bio: {},
        estetica: {},
        labels: {},
        poderes: [],
        inventario: [],
        seresSelados: [],
    };
}

function montarMockUseStore(ficha) {
    const mockState = {
        minhaFicha: ficha,
        updateFicha: vi.fn((callback) => callback(ficha)),
        meuNome: 'Testador',
        importarDaAbaStatus: vi.fn(),
    };
    useStore.mockImplementation((selector) => (selector ? selector(mockState) : mockState));
    return mockState;
}

// Localiza o span da leitura auxiliar em notação científica do Scouter
// (ex: "1.37E9") — mesmo helper de Marcados.scouterTempoReal.test.jsx.
function lerPoderGlobalExibido() {
    const span = screen.getByText((_, el) => el?.tagName === 'SPAN' && /^-?\d+(\.\d+)?E-?\d+$/.test(el.textContent || ''));
    return Number(span.textContent);
}

// Renderiza uma ficha com a lista de poderes fornecida e devolve a leitura
// numérica do Scouter, já limpando o DOM em seguida.
function renderELerPoderGlobal(poderesList) {
    montarMockUseStore(fichaComPoderes(poderesList));
    render(<MarcadosPanel />);
    const valor = lerPoderGlobalExibido();
    cleanup();
    return valor;
}

// Localiza o primeiro elemento cujo texto começa com "Poder:" — na Página 1
// (padrão inicial), a ordem de renderização é Vida, Mana, Aura, Chakra,
// Corpo (via LinhaVital) e depois Energia de Forma; Vida é sempre o primeiro.
function lerPrimeiroPoderExibido() {
    // `el.children.length === 0` garante que pegamos apenas o <div>-folha que
    // contém diretamente o texto "Poder: X" (sem elementos filhos) — divs
    // ancestrais (que envolvem várias linhas de vitais) também "começam" com
    // "Poder:" quando o texto é lido concatenado via textContent, então
    // precisam ser excluídos explicitamente.
    const divs = screen.getAllByText((_, el) => el?.tagName === 'DIV' && el.children.length === 0 && /^Poder:/.test(el.textContent || ''));
    return divs[0].textContent;
}

describe('MarcadosPanel — getGlobalMultipliers(): multiplicadores do MESMO TIPO se SOMAM entre fontes, não multiplicam', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        window.alert = vi.fn();
    });

    afterEach(() => {
        cleanup();
    });

    it.each([
        ['mgeral'],
        ['mbase'],
        ['mabs'],
    ])('%s: duas fontes ativas de +8 cada resultam no MESMO valor do Scouter que uma única fonte de +16 (soma aditiva entre fontes)', (prop) => {
        const comDuasFontes = renderELerPoderGlobal([
            { nome: 'Fonte A', ativa: true, efeitos: [{ atributo: 'geral', propriedade: prop, valor: 8 }] },
            { nome: 'Fonte B', ativa: true, efeitos: [{ atributo: 'geral', propriedade: prop, valor: 8 }] },
        ]);
        const comUmaFonteSomada = renderELerPoderGlobal([
            { nome: 'Fonte Única', ativa: true, efeitos: [{ atributo: 'geral', propriedade: prop, valor: 16 }] },
        ]);

        expect(comDuasFontes).toBe(comUmaFonteSomada);
    });

    it.each([
        ['mgeral'],
        ['mbase'],
        ['mabs'],
    ])('%s: duas fontes ativas de +8 cada multiplicam o Scouter por ~17x (1+8+8), NÃO por ~81x (bug antigo: (1+8)*(1+8) multiplicado entre fontes)', (prop) => {
        const baseline = renderELerPoderGlobal([]);
        const comDuasFontes = renderELerPoderGlobal([
            { nome: 'Fonte A', ativa: true, efeitos: [{ atributo: 'geral', propriedade: prop, valor: 8 }] },
            { nome: 'Fonte B', ativa: true, efeitos: [{ atributo: 'geral', propriedade: prop, valor: 8 }] },
        ]);

        const ratio = comDuasFontes / baseline;

        // Correto: 1 + 8 + 8 = 17
        expect(ratio).toBeGreaterThan(16.5);
        expect(ratio).toBeLessThan(17.5);
        // Regressão: bug antigo dava (1+8)*(1+8) = 81 — bem longe de 17.
        expect(ratio).toBeLessThan(20);
    });

    it('mUnico: duas fontes ativas de x3 cada continuam MULTIPLICANDO o Scouter por ~9x (3*3) — regressão: NÃO deve virar soma aditiva (~7x) como MBASE/MGERAL/MABS', () => {
        const baseline = renderELerPoderGlobal([]);
        const comUmaFonte = renderELerPoderGlobal([
            { nome: 'Único A', ativa: true, efeitos: [{ atributo: 'geral', propriedade: 'munico', valor: 3 }] },
        ]);
        const comDuasFontes = renderELerPoderGlobal([
            { nome: 'Único A', ativa: true, efeitos: [{ atributo: 'geral', propriedade: 'munico', valor: 3 }] },
            { nome: 'Único B', ativa: true, efeitos: [{ atributo: 'geral', propriedade: 'munico', valor: 3 }] },
        ]);

        const ratioUmaFonte = comUmaFonte / baseline;
        const ratioDuasFontes = comDuasFontes / baseline;

        // Uma única instância multiplica o total por 3x.
        expect(ratioUmaFonte).toBeGreaterThan(2.9);
        expect(ratioUmaFonte).toBeLessThan(3.1);

        // Duas instâncias devem multiplicar por 3*3=9x, não somar para 1+3+3=7x
        // (o padrão aditivo que passou a valer para MBASE/MGERAL/MABS).
        expect(ratioDuasFontes).toBeGreaterThan(8.5);
        expect(ratioDuasFontes).toBeLessThan(9.5);
        expect(ratioDuasFontes).toBeGreaterThan(7.5); // exclui explicitamente o padrão aditivo (~7x)
    });
});

describe('MarcadosPanel — getPoderAbsolutoAtributo(): pontosTotais usa o par (prestigioFinal, ascensaoFinal) já normalizado por overflow', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        window.alert = vi.fn();
    });

    afterEach(() => {
        cleanup();
    });

    it('prestígio=90 com multP=3 (overflow: prestigioTotal=270 -> Ascensão+2, Prestígio=70) e prestígio=270 com multP=1 (mesmo prestigioTotal=270, mesmo par final) produzem a MESMA leitura de Poder Verdadeiro para Vida', () => {
        montarMockUseStore(fichaVidaOverflow({ vidaBase: 90000000, multiplicadorForcaPrestigio: 3 }));
        const { unmount } = render(<MarcadosPanel />);
        const textoA = lerPrimeiroPoderExibido();
        unmount();

        montarMockUseStore(fichaVidaOverflow({ vidaBase: 270000000, multiplicadorForcaPrestigio: 1 }));
        render(<MarcadosPanel />);
        const textoB = lerPrimeiroPoderExibido();

        expect(textoB).toBe(textoA);
        // Sanidade: garante que não estamos comparando dois "Poder: 0" por acidente.
        expect(textoA).not.toBe('Poder: 0');
    });

    it('sanidade: prestígio=0 (sem overflow) produz uma leitura de Poder Verdadeiro de Vida DIFERENTE do cenário com overflow acima', () => {
        montarMockUseStore(fichaVidaOverflow({ vidaBase: 0, multiplicadorForcaPrestigio: 1 }));
        render(<MarcadosPanel />);
        const textoBase = lerPrimeiroPoderExibido();

        // ascensaoBase default=1 (multA=1) já contribui um piso de
        // (1*100)+0=100 pontos mesmo com prestígio bruto zerado, então o
        // valor não é literalmente "Poder: 0" — mas precisa ser bem menor e
        // diferente da leitura do cenário com overflow (pontosTotais=370)
        // testado acima, provando que a função é sensível ao prestígio real
        // e não está sempre retornando o mesmo valor por acidente.
        expect(textoBase).toBe('Poder: 100 Milhões');
        expect(textoBase).not.toBe('Poder: 370 Milhões');
    });
});

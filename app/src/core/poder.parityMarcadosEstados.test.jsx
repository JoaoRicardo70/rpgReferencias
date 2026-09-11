import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { calcularPoderAtual } from './poder';
import MarcadosPanel from '../components/Ficha Def/Marcados';
import useStore from '../stores/useStore';

// ---------------------------------------------------------------------------
// QA — paridade REAL entre core/poder.js e Ficha Def/Marcados.jsx para os 3
// ESTADOS excludentes da Arma Espiritual / Fantasma Nobre (Base / Forma
// Verdadeira / Fantasma Nobre): mesmo padrão de
// core/poder.parityMarcados.test.jsx, mas cobrindo especificamente
// estadoAtivo/acessoVerdadeira/acessoFantasma — as duas cópias manuais de
// getGlobalMultipliers (core/poder.js e a cópia local em Marcados.jsx) usam a
// MESMA lógica de fallback de estado, e este arquivo garante que o jogador
// vendo o Scouter da própria Ficha nunca vê um número diferente do que
// qualquer outra tela que reaproveite core/poder.js (ex.: Mapa).
// ---------------------------------------------------------------------------

vi.mock('../stores/useStore');
vi.mock('../services/firebase-sync', () => ({
    uploadImagem: vi.fn(),
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
}));

function fichaParaMarcados(armaEspiritual) {
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
        poderes: [],
        inventario: [],
        seresSelados: [],
        ataquesElementais: [],
        ...(armaEspiritual !== undefined ? { armaEspiritual } : {}),
    };
}

function lerPoderExibidoStringDoMarcados(ficha) {
    const mockState = {
        minhaFicha: ficha,
        updateFicha: vi.fn((callback) => callback(ficha)),
        meuNome: 'Testador',
        importarDaAbaStatus: vi.fn(),
    };
    useStore.mockImplementation((selector) => (selector ? selector(mockState) : mockState));
    render(<MarcadosPanel />);
    const span = screen.getByText((_, el) => el?.tagName === 'SPAN' && /^-?\d+(\.\d+)?E-?\d+$/.test(el.textContent || ''));
    return span.textContent;
}

function formatarComoOScouter(poderGlobal) {
    return Number(poderGlobal).toExponential(2).replace('+', '').toUpperCase();
}

describe('core/poder - calcularPoderAtual: paridade real com Ficha Def/Marcados.jsx (Arma Espiritual - estados excludentes)', () => {
    afterEach(() => {
        cleanup();
        vi.clearAllMocks();
    });

    it('REGRESSÃO: concorda com o Scouter da Ficha quando estadoAtivo está ausente (comportamento antigo, usa passivas/runas do Base)', () => {
        const ficha = fichaParaMarcados({
            passivas: [{ id: 'p1', texto: 'MGERAL: +50' }],
            runas: [{ id: 'r1', texto: 'MUNICO: 2' }],
        });
        const poderDaFichaStr = lerPoderExibidoStringDoMarcados(ficha);
        const poderDoCore = calcularPoderAtual(ficha, 1).poderGlobal;

        expect(poderDaFichaStr).toBe(formatarComoOScouter(poderDoCore));
    });

    it('concorda com o Scouter da Ficha quando estadoAtivo="verdadeira" com acesso: só passivasVerdadeira/runasVerdadeira contam nos dois lados', () => {
        const ficha = fichaParaMarcados({
            estadoAtivo: 'verdadeira',
            acessoVerdadeira: true,
            passivas: [{ id: 'p1', texto: 'MGERAL: +9999' }],
            passivasVerdadeira: [{ id: 'pv1', texto: 'MGERAL: +50' }],
            runasVerdadeira: [{ id: 'rv1', texto: 'MUNICO: 2' }],
        });
        const poderDaFichaStr = lerPoderExibidoStringDoMarcados(ficha);
        const poderDoCore = calcularPoderAtual(ficha, 1).poderGlobal;

        expect(poderDaFichaStr).toBe(formatarComoOScouter(poderDoCore));
    });

    it('concorda com o Scouter da Ficha quando estadoAtivo="fantasma" com acesso: só passivasFantasma/runasFantasma contam nos dois lados', () => {
        const ficha = fichaParaMarcados({
            estadoAtivo: 'fantasma',
            acessoVerdadeira: true,
            acessoFantasma: true,
            passivas: [{ id: 'p1', texto: 'MGERAL: +9999' }],
            passivasVerdadeira: [{ id: 'pv1', texto: 'MGERAL: +9999' }],
            passivasFantasma: [{ id: 'pf1', texto: 'MGERAL: +50' }],
            runasFantasma: [{ id: 'rf1', texto: 'MUNICO: 2' }],
        });
        const poderDaFichaStr = lerPoderExibidoStringDoMarcados(ficha);
        const poderDoCore = calcularPoderAtual(ficha, 1).poderGlobal;

        expect(poderDaFichaStr).toBe(formatarComoOScouter(poderDoCore));
    });

    it('concorda com o Scouter da Ficha quando estadoAtivo="fantasma" mas acessoFantasma=false: cálculo cai pra "verdadeira" nos dois lados', () => {
        const ficha = fichaParaMarcados({
            estadoAtivo: 'fantasma',
            acessoVerdadeira: true,
            acessoFantasma: false,
            passivasVerdadeira: [{ id: 'pv1', texto: 'MGERAL: +50' }],
            passivasFantasma: [{ id: 'pf1', texto: 'MGERAL: +9999' }],
        });
        const poderDaFichaStr = lerPoderExibidoStringDoMarcados(ficha);
        const poderDoCore = calcularPoderAtual(ficha, 1).poderGlobal;

        expect(poderDaFichaStr).toBe(formatarComoOScouter(poderDoCore));
    });

    it('concorda com o Scouter da Ficha quando estadoAtivo="verdadeira" mas acessoVerdadeira=false: cálculo cai DIRETO pro Base nos dois lados', () => {
        const ficha = fichaParaMarcados({
            estadoAtivo: 'verdadeira',
            acessoVerdadeira: false,
            acessoFantasma: true,
            passivas: [{ id: 'p1', texto: 'MGERAL: +50' }],
            passivasVerdadeira: [{ id: 'pv1', texto: 'MGERAL: +777' }],
            passivasFantasma: [{ id: 'pf1', texto: 'MGERAL: +9999' }],
        });
        const poderDaFichaStr = lerPoderExibidoStringDoMarcados(ficha);
        const poderDoCore = calcularPoderAtual(ficha, 1).poderGlobal;

        expect(poderDaFichaStr).toBe(formatarComoOScouter(poderDoCore));
    });

    it('concorda com o Scouter da Ficha quando a Arma Espiritual está Desequipada (equipada=false): nenhum estado conta em nenhum dos dois lados', () => {
        const ficha = fichaParaMarcados({
            equipada: false,
            estadoAtivo: 'fantasma',
            acessoVerdadeira: true,
            acessoFantasma: true,
            passivas: [{ id: 'p1', texto: 'MGERAL: +50' }],
            passivasFantasma: [{ id: 'pf1', texto: 'MGERAL: +50' }],
        });
        const poderDaFichaStr = lerPoderExibidoStringDoMarcados(ficha);
        const poderDoCore = calcularPoderAtual(ficha, 1).poderGlobal;
        const poderSemArmaEspiritual = calcularPoderAtual(fichaParaMarcados(undefined), 1).poderGlobal;

        expect(poderDoCore).toBe(poderSemArmaEspiritual);
        expect(poderDaFichaStr).toBe(formatarComoOScouter(poderDoCore));
    });
});

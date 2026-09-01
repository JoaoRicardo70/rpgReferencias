import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { calcularPoderAtual } from './poder';
import MarcadosPanel from '../components/Ficha Def/Marcados';
import useStore from '../stores/useStore';

// ---------------------------------------------------------------------------
// QA — paridade REAL entre core/poder.js e Ficha Def/Marcados.jsx (Fadiga de
// Combate): em vez de só comparar a fórmula por inspeção, este arquivo
// renderiza o PRÓPRIO MarcadosPanel (mockando useStore/firebase-sync, mesmo
// padrão de Marcados.fadigaCombate.test.jsx) para a MESMA ficha usada em
// calcularPoderAtual(), e compara o Poder Calculado exibido no Scouter
// (notação exponencial, mesma leitura que lerPoderGlobalExibido usa no
// arquivo irmão) contra o poderGlobal retornado por core/poder.js — provando
// que as duas implementações concordam de verdade para o mesmo input,
// inclusive com Fadiga de Combate ativa.
//
// Precisa de extensão .jsx (diferente de core/poder.test.js) porque monta um
// componente React de verdade.
// ---------------------------------------------------------------------------

vi.mock('../stores/useStore');
vi.mock('../services/firebase-sync', () => ({
    uploadImagem: vi.fn(),
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
}));

function fichaParaMarcados(combateExtra) {
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
        ...(combateExtra !== undefined ? { combate: combateExtra } : {}),
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

describe('core/poder - calcularPoderAtual: paridade real com Ficha Def/Marcados.jsx (Fadiga de Combate)', () => {
    afterEach(() => {
        cleanup();
        vi.clearAllMocks();
    });

    it('concorda com o Poder Calculado exibido no Scouter da Ficha para 35% de Fadiga (7 turnos x 5%/turno)', () => {
        const combateExtra = { fadigaTurnos: 7, fadigaPorTurno: 5 };
        const poderDaFichaStr = lerPoderExibidoStringDoMarcados(fichaParaMarcados(combateExtra));
        const poderDoCore = calcularPoderAtual(fichaParaMarcados(combateExtra), 1).poderGlobal;

        expect(poderDaFichaStr).toBe(formatarComoOScouter(poderDoCore));
    });

    it('concorda com o Poder Calculado exibido no Scouter da Ficha SEM nenhuma Fadiga (regressão de paridade)', () => {
        const poderDaFichaStr = lerPoderExibidoStringDoMarcados(fichaParaMarcados(undefined));
        const poderDoCore = calcularPoderAtual(fichaParaMarcados(undefined), 1).poderGlobal;

        expect(poderDaFichaStr).toBe(formatarComoOScouter(poderDoCore));
    });

    it('concorda com o Poder Calculado exibido no Scouter da Ficha em 100% de Fadiga (clamp, poder zerado)', () => {
        const combateExtra = { fadigaTurnos: 1000, fadigaPorTurno: 50 };
        const poderDaFichaStr = lerPoderExibidoStringDoMarcados(fichaParaMarcados(combateExtra));
        const poderDoCore = calcularPoderAtual(fichaParaMarcados(combateExtra), 1).poderGlobal;

        expect(poderDoCore).toBe(0);
        expect(poderDaFichaStr).toBe(formatarComoOScouter(poderDoCore));
    });

    // -----------------------------------------------------------------------
    // fadigaExtra (core/fadiga.js): pontos ganhos AUTOMATICAMENTE no Mapa
    // (energia gasta / vida perdida / Formas ativas), somados EM CIMA da
    // fadigaBase (fadigaTurnos x fadigaPorTurno) manual — calcularFadigaAtual
    // é a única fonte de verdade pros dois, então core/poder.js e Marcados.jsx
    // precisam continuar concordando mesmo combinando as duas partes.
    // -----------------------------------------------------------------------
    it('concorda com o Poder Calculado exibido no Scouter quando SÓ fadigaExtra está presente (sem fadigaTurnos)', () => {
        const combateExtra = { fadigaTurnos: 0, fadigaPorTurno: 5, fadigaExtra: 12.5 };
        const poderDaFichaStr = lerPoderExibidoStringDoMarcados(fichaParaMarcados(combateExtra));
        const poderDoCore = calcularPoderAtual(fichaParaMarcados(combateExtra), 1).poderGlobal;

        expect(poderDaFichaStr).toBe(formatarComoOScouter(poderDoCore));
    });

    it('concorda com o Poder Calculado exibido no Scouter combinando fadigaTurnos/fadigaPorTurno (base) COM fadigaExtra (dinâmica) somados', () => {
        const combateExtra = { fadigaTurnos: 5, fadigaPorTurno: 5, fadigaExtra: 10 }; // base 25% + extra 10% = 35%
        const poderDaFichaStr = lerPoderExibidoStringDoMarcados(fichaParaMarcados(combateExtra));
        const poderDoCore = calcularPoderAtual(fichaParaMarcados(combateExtra), 1).poderGlobal;

        expect(poderDaFichaStr).toBe(formatarComoOScouter(poderDoCore));
    });

    it('concorda com o Poder Calculado exibido no Scouter quando a SOMA de base + fadigaExtra estoura 100% (clamp conjunto, poder zerado nos dois lados)', () => {
        const combateExtra = { fadigaTurnos: 15, fadigaPorTurno: 5, fadigaExtra: 50 }; // 75% + 50% = 125% -> clamp 100%
        const poderDaFichaStr = lerPoderExibidoStringDoMarcados(fichaParaMarcados(combateExtra));
        const poderDoCore = calcularPoderAtual(fichaParaMarcados(combateExtra), 1).poderGlobal;

        expect(poderDoCore).toBe(0);
        expect(poderDaFichaStr).toBe(formatarComoOScouter(poderDoCore));
    });
});

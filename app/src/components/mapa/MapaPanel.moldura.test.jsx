import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MapaPanel from './MapaPanel';
import useStore from '../../stores/useStore';
import { CHAVE_MOLDURA_OCULTA } from '../../core/molduraMapa';

vi.mock('../../stores/useStore');
vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: { workerSrc: '' }, getDocument: vi.fn(), version: '0' }));
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    salvarCenarioCompleto: vi.fn(),
    zerarIniciativaGlobal: vi.fn()
}));

function mockarStore() {
    const state = {
        minhaFicha: {}, meuNome: 'Herói', personagens: {}, feedCombate: [], updateFicha: vi.fn(),
        isMestre: false, mesaCriador: null, dummies: {}, alvoSelecionado: null, cenario: {},
        abaAtiva: 'aba-mapa', pastasFechadasMapaTecnicas: {}, setPastasFechadasMapaTecnicas: vi.fn(),
        divisorPoderMesa: 1,
        itemEditandoId: null, setItemEditandoId: vi.fn(),
        efeitosTempArsenal: [], setEfeitosTempArsenal: vi.fn(),
        efeitosTempPassivosArsenal: [], setEfeitosTempPassivosArsenal: vi.fn()
    };
    useStore.mockImplementation((selector) => (selector ? selector(state) : state));
}

describe('MapaPanel - ocultar a moldura', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.removeItem(CHAVE_MOLDURA_OCULTA);
        mockarStore();
    });
    afterEach(() => cleanup());

    it('a moldura aparece por padrão e dá para esconder e mostrar de novo', () => {
        const { container } = render(<MapaPanel />);
        const coluna = container.querySelector('.mapa-moldura-coluna');
        expect(coluna.hidden).toBe(false);
        fireEvent.click(screen.getByRole('button', { name: 'Ocultar a moldura' }));
        expect(coluna.hidden).toBe(true);
        fireEvent.click(screen.getByRole('button', { name: 'Mostrar a moldura' }));
        expect(coluna.hidden).toBe(false);
        expect(screen.queryByRole('button', { name: 'Mostrar a moldura' })).toBeNull();
    });

    it('a escolha fica guardada: reabrir o Mapa mantém a moldura escondida', () => {
        const primeira = render(<MapaPanel />);
        fireEvent.click(screen.getByRole('button', { name: 'Ocultar a moldura' }));
        expect(localStorage.getItem(CHAVE_MOLDURA_OCULTA)).toBe('1');
        primeira.unmount();
        const { container } = render(<MapaPanel />);
        expect(container.querySelector('.mapa-moldura-coluna').hidden).toBe(true);
        fireEvent.click(screen.getByRole('button', { name: 'Mostrar a moldura' }));
        expect(localStorage.getItem(CHAVE_MOLDURA_OCULTA)).toBeNull();
    });

    it('o layout limita a coluna da tela à largura da janela (a moldura não é empurrada para fora)', async () => {
        const { readFileSync } = await import('node:fs');
        const css = readFileSync('css/styles.css', 'utf8');
        const bloco = css.match(/\.main-content\s*\{([^}]*)\}/)[1];
        expect(bloco).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    });
});

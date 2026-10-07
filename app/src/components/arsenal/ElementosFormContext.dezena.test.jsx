import React from 'react';
import { render, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ElementosFormProvider, useElementosForm } from './ElementosFormContext';
import useStore from '../../stores/useStore';

vi.mock('../../stores/useStore', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, default: vi.fn() };
});
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(), salvarFichaAlvoSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()), salvarFichaAlvoImediato: vi.fn(() => Promise.resolve()),
    iniciarSincronizacaoFichaAlvo: vi.fn(), pararSincronizacaoFichaAlvo: vi.fn(), enviarParaFeed: vi.fn(),
}));

let probe;
function Harness() { probe = useElementosForm(); return null; }
function montar(minhaFicha) {
    const state = {
        minhaFicha, personagens: {}, meuNome: 'Heroi', updateFicha: vi.fn(), updateFichaAlvo: vi.fn(),
        setAbaAtiva: vi.fn(), elemEditandoId: null, setElemEditandoId: vi.fn(),
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(state) : state));
    render(<ElementosFormProvider><Harness /></ElementosFormProvider>);
}
afterEach(() => { cleanup(); probe = undefined; });

describe('ElementosFormContext.getModificadorDoisDigitos (CD/Acerto)', () => {
    it('120000 => 12, ignorando Ascensão', () => {
        montar({ forca: { base: 120000, ascensaoBase: 3 } });
        expect(probe.getModificadorDoisDigitos('forca')).toBe(12);
    });
    it('24000 => 24', () => {
        montar({ destreza: { base: 24000 } });
        expect(probe.getModificadorDoisDigitos('destreza')).toBe(24);
    });
    it('atributo ausente => 0', () => {
        montar({ forca: { base: 120000 } });
        expect(probe.getModificadorDoisDigitos('inexistente')).toBe(0);
    });
    it('ficha vazia => 0', () => {
        montar({});
        expect(probe.getModificadorDoisDigitos('forca')).toBe(0);
    });
});

describe('Moldura do mapa', () => {
    const raiz = path.resolve(__dirname, '../../..');
    it('css define .mapa-moldura-coluna com padding-top', () => {
        const css = fs.readFileSync(path.join(raiz, 'css/styles.css'), 'utf8');
        const m = css.match(/\.mapa-moldura-coluna\s*\{([^}]*)\}/);
        expect(m).not.toBeNull();
        expect(m[1]).toMatch(/padding-top\s*:\s*\d+px/);
    });
    it('MapaPanel usa a classe na coluna da moldura', () => {
        const src = fs.readFileSync(path.join(raiz, 'src/components/mapa/MapaPanel.jsx'), 'utf8');
        expect(src).toMatch(/className="mapa-moldura-coluna"/);
    });
});

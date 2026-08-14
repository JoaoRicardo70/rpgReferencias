/**
 * QA — Regression test for the PerfilFormContext performance refactor
 * (app/src/components/perfil/PerfilFormContext.jsx)
 *
 * Before: PerfilFormProvider opened its OWN Firebase listener
 * (iniciarListenerPersonagens) just to keep a local `personagensDB` state,
 * duplicating the listener that useFirebase.js (the global hook) already
 * maintains via `setPersonagens` on the Zustand store.
 *
 * After: the duplicate listener was removed; PerfilFormProvider now reads
 * `personagens` directly from the store with
 * `const personagensDB = useStore(s => s.personagens);`
 *
 * This test proves that once the store's `personagens` slice is populated
 * (exactly as useFirebase.js's listener callback would do via
 * `setPersonagens`), PerfilFormProvider's derived `listaLocal` correctly
 * reflects that data — i.e. removing the duplicate listener did not break
 * data reading.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Firebase mocks — PerfilFormContext imports `auth` from firebase-config and
// several functions from firebase-sync. We stub them all; only `auth` needs
// to behave (fire onAuthStateChanged synchronously with a fake user so that
// `contaId` gets set, which listaLocal depends on).
// ---------------------------------------------------------------------------
vi.mock('../services/firebase-config', () => ({
    auth: {
        onAuthStateChanged: (cb) => {
            cb({ email: 'meuUsuario@example.com' });
            return () => {};
        },
    },
    db: { __isMock: true },
    storage: { __isMock: true },
}));

vi.mock('../services/firebase-sync', () => ({
    carregarFichaDoFirebase: vi.fn(() => Promise.resolve(null)),
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
    uploadImagem: vi.fn(() => Promise.resolve('')),
}));

import useStore from '../stores/useStore.js';
import { PerfilFormProvider, usePerfilForm } from '../components/perfil/PerfilFormContext.jsx';

function ListaLocalProbe() {
    const ctx = usePerfilForm();
    if (!ctx) return <div data-testid="lista">no-ctx</div>;
    return <div data-testid="lista">{ctx.listaLocal.join(',')}</div>;
}

function renderProvider() {
    return render(
        <PerfilFormProvider>
            <ListaLocalProbe />
        </PerfilFormProvider>
    );
}

describe('perf refactor — PerfilFormContext reads personagens directly from the store', () => {
    const initialState = useStore.getState();

    beforeEach(() => {
        localStorage.clear();
        // Reset the real store back to a clean baseline before each test,
        // then seed `personagens` the same way useFirebase.js's listener would
        // (via the store's own setPersonagens action).
        useStore.setState({ ...initialState, personagens: {} }, true);
    });

    afterEach(() => {
        cleanup();
        useStore.setState({ ...initialState, personagens: {} }, true);
    });

    it('lists characters owned by the logged-in account once personagens is populated in the store', async () => {
        useStore.getState().setPersonagens({
            'Herói A': { donoDaFicha: 'meuUsuario' },
            'Herói B': { donoDaFicha: 'meuUsuario' },
            'Vilão de Outro Jogador': { donoDaFicha: 'outraConta' },
        });

        renderProvider();

        await waitFor(() => {
            const text = screen.getByTestId('lista').textContent;
            expect(text).toContain('Herói A');
        });

        const text = screen.getByTestId('lista').textContent;
        const nomes = text.split(',').filter(Boolean);
        expect(nomes.sort()).toEqual(['Herói A', 'Herói B']);
        expect(nomes).not.toContain('Vilão de Outro Jogador');
    });

    it('reflects live store updates to personagens without remounting (selector reactivity preserved)', async () => {
        useStore.getState().setPersonagens({});
        renderProvider();

        await waitFor(() => {
            expect(screen.getByTestId('lista').textContent).toBe('');
        });

        // Simulate what useFirebase.js's listener callback does on a new
        // Firebase snapshot — same store action, no component-local listener.
        useStore.getState().setPersonagens({
            'Novo Personagem': { donoDaFicha: 'meuUsuario' },
        });

        await waitFor(() => {
            expect(screen.getByTestId('lista').textContent).toContain('Novo Personagem');
        });
    });

    it('returns an empty list when personagens has no characters owned by the account', async () => {
        useStore.getState().setPersonagens({
            'Personagem de Outra Conta': { donoDaFicha: 'contaAlheia' },
        });

        renderProvider();

        await waitFor(() => {
            expect(screen.getByTestId('lista')).toBeTruthy();
        });

        expect(screen.getByTestId('lista').textContent).toBe('');
    });
});

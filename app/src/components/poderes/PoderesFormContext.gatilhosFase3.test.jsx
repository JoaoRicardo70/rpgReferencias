import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PoderesFormProvider, usePoderesForm } from './PoderesFormContext';
import useStore from '../../stores/useStore';
import { enviarParaFeed } from '../../services/firebase-sync';

// Fase 3: o dono e o Mestre armam/desarmam um gatilho opcional; so o Mestre forca o disparo.
vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
    uploadImagem: vi.fn(() => Promise.resolve('x')),
    enviarParaFeed: vi.fn(),
}));

let mockState; let probe;
function Harness() { probe = usePoderesForm(); return null; }
const OPC = { id: 'g1', nome: 'Cinzas', modo: 'opcional', armado: true, evento: { tipo: 'danoQueZeraria' }, limite: { max: 1, por: 'cena' }, acoes: [{ tipo: 'definirVida', percMax: 1 }, { tipo: 'rolarTabela', dado: '1d4', resultados: [{ ate: 4, texto: 'ok', acoes: [{ tipo: 'mensagem', texto: 'volta' }] }] }] };
const AUTO = { id: 'g2', nome: 'Auto', evento: { tipo: 'turnoInicio' }, acoes: [{ tipo: 'mensagem', texto: 'x' }] };
function montar(isMestre) {
    mockState = {
        minhaFicha: { vida: { atual: 5 }, poderes: [{ id: 1, nome: 'Volta', categoria: 'poder', ativa: true, efeitos: [], efeitosPassivos: [], gatilhos: [JSON.parse(JSON.stringify(OPC)), AUTO] }] },
        meuNome: 'Heroi', isMestre, cenario: { ativa: 'c1' },
        updateFicha: vi.fn((cb) => cb(mockState.minhaFicha)),
        efeitosTemp: [], setEfeitosTemp: vi.fn(), efeitosTempPassivos: [], setEfeitosTempPassivos: vi.fn(),
        poderEditandoId: null, setPoderEditandoId: vi.fn(),
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(mockState) : mockState));
    return render(<PoderesFormProvider><Harness /></PoderesFormProvider>);
}
const g = (id) => mockState.minhaFicha.poderes[0].gatilhos.find(x => x.id === id);
beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); window.confirm = vi.fn(() => true); });
afterEach(() => cleanup());

describe('Poderes - armar/desarmar e forcar gatilhos (Fase 3)', () => {
    it('o dono (nao Mestre) alterna armado do gatilho opcional; automatico e ignorado', () => {
        montar(false);
        act(() => { probe.alternarArmadoGatilho(1, 'g1'); });
        expect(g('g1').armado).toBe(false);
        act(() => { probe.alternarArmadoGatilho(1, 'g1'); });
        expect(g('g1').armado).toBe(true);
        act(() => { probe.alternarArmadoGatilho(1, 'g2'); });
        expect('armado' in g('g2')).toBe(false);
    });
    it('o Mestre tambem arma/desarma', () => {
        montar(true);
        act(() => { probe.alternarArmadoGatilho(1, 'g1'); });
        expect(g('g1').armado).toBe(false);
    });
    it('jogador comum NAO forca o disparo', () => {
        montar(false);
        act(() => { probe.forcarGatilhoMestre(1, 'g1'); });
        expect(enviarParaFeed).not.toHaveBeenCalled();
        expect(mockState.updateFicha).not.toHaveBeenCalled();
    });
    it('Mestre forca: ignora armado/limite, o feed diz "forcado pelo Mestre" e nao gasta o limite', () => {
        montar(true);
        act(() => { probe.alternarArmadoGatilho(1, 'g1'); }); // desarmado
        mockState.updateFicha.mockClear();
        act(() => { probe.forcarGatilhoMestre(1, 'g1'); });
        const texto = enviarParaFeed.mock.calls.at(-1)[0].texto;
        expect(texto).toContain('Cinzas forçado pelo Mestre');
        expect(texto).toMatch(/Cinzas rolou \d \(d4\): ok/);
        expect(mockState.minhaFicha.combate?.usosPoderes).toBeUndefined();
    });
    it('Mestre pode cancelar o confirm: nada acontece', () => {
        montar(true); window.confirm = vi.fn(() => false);
        act(() => { probe.forcarGatilhoMestre(1, 'g1'); });
        expect(enviarParaFeed).not.toHaveBeenCalled();
    });
});

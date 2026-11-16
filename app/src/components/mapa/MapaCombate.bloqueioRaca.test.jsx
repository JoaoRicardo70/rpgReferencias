import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaTecnicasRapidas } from './MapaCombate';
import { PoderesFormProvider } from '../poderes/PoderesFormContext';
import useStore from '../../stores/useStore';

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(), salvarFirebaseImediato: vi.fn(() => Promise.resolve()), enviarParaFeed: vi.fn(),
    salvarDummie: vi.fn(), salvarCenarioCompleto: vi.fn(), uploadImagem: vi.fn(() => Promise.resolve('')),
}));
const gastar = vi.fn(() => true);
vi.mock('../../hooks/useGastarAcao', () => ({ default: () => gastar }));

let mockState;
function montar(minhaFicha, cenario) {
    mockState = {
        minhaFicha, cenario, meuNome: 'Heroi', isMestre: true, personagens: {}, dummies: {}, feedCombate: [],
        updateFicha: vi.fn((cb) => cb(minhaFicha)), setAbaAtiva: vi.fn(), abaAtiva: 'aba-mapa',
        efeitosTemp: [], setEfeitosTemp: vi.fn(), efeitosTempPassivos: [], setEfeitosTempPassivos: vi.fn(),
        poderEditandoId: null, setPoderEditandoId: vi.fn(),
        pastasFechadasMapaTecnicas: {}, setPastasFechadasMapaTecnicas: vi.fn(),
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(mockState) : mockState));
    useStore.getState = () => mockState;
}
const cenario = { racas: [{ id: 'saiyajin', nome: 'Saiyajin' }] };
const hab = (extra = {}) => ({ id: 'h', nome: 'Kaioken', categoria: 'habilidadeRaca', racasAcesso: ['saiyajin'], ativa: false, vida: {}, mana: {}, aura: {}, chakra: {}, corpo: {}, ...extra });

afterEach(() => cleanup());
beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); });

describe('MapaTecnicasRapidas — Habilidade de Raça bloqueada', () => {
    it('bloqueada: avisa com o motivo, NÃO gasta a Ação e não liga', () => {
        const ficha = { bio: { raca: 'Saiyajin', racaId: 'saiyajin' }, poderes: [hab({ bloqueio: { ativo: true, requisito: 'Despertar no combate' } })] };
        montar(ficha, cenario);
        const { getByText } = render(<PoderesFormProvider><MapaTecnicasRapidas /></PoderesFormProvider>);
        act(() => { getByText('☆ Kaioken').click(); });
        expect(window.alert).toHaveBeenCalledWith(expect.stringMatching(/bloqueada.*Despertar no combate/));
        expect(gastar).not.toHaveBeenCalled();
        expect(ficha.poderes[0].ativa).toBe(false);
    });
    it('Domínio insuficiente também barra antes da Ação; liberada gasta e liga', () => {
        const baixa = { bio: { raca: 'Saiyajin', racaId: 'saiyajin', composicaoRacial: [{ racaId: 'saiyajin', percentual: 10, origem: 'nativa' }] }, poderes: [hab({ percentualMinimo: 50 })] };
        montar(baixa, cenario);
        const r = render(<PoderesFormProvider><MapaTecnicasRapidas /></PoderesFormProvider>);
        act(() => { r.getByText('☆ Kaioken').click(); });
        expect(gastar).not.toHaveBeenCalled();
        expect(baixa.poderes[0].ativa).toBe(false);
        cleanup();
        const ok = { bio: { raca: 'Saiyajin', racaId: 'saiyajin' }, poderes: [hab({ percentualMinimo: 50 })] };
        montar(ok, cenario);
        const r2 = render(<PoderesFormProvider><MapaTecnicasRapidas /></PoderesFormProvider>);
        act(() => { r2.getByText('☆ Kaioken').click(); });
        expect(ok.poderes[0].ativa).toBe(true);
    });
});

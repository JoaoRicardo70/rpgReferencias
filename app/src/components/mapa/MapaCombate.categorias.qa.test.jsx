import React from 'react';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaTecnicasRapidas } from './MapaCombate';
import { PoderesFormProvider } from '../poderes/PoderesFormContext';
import useStore from '../../stores/useStore';

vi.mock('../../stores/useStore');
vi.mock('../../core/engine', () => ({ calcularDano: vi.fn(() => ({ dano: 10, letalidade: 0, rolagem: '', rolagemMagica: '', atributosUsados: '', detalheEnergia: '', armaStr: '', detalheConta: '' })) }));
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
    enviarParaFeed: vi.fn(),
    salvarDummie: vi.fn(),
    salvarCenarioCompleto: vi.fn(),
    uploadImagem: vi.fn(() => Promise.resolve('https://exemplo.com/img.png')),
}));

let mockState;
function montarStore(poderes) {
    mockState = {
        minhaFicha: { poderes, inventario: [] }, meuNome: 'Heroi', isMestre: true, personagens: {},
        updateFicha: vi.fn((cb) => cb(mockState.minhaFicha)), setAbaAtiva: vi.fn(), abaAtiva: 'aba-mapa', feedCombate: [],
        alvoSelecionado: null, dummies: {}, efeitosTemp: [], setEfeitosTemp: vi.fn(), efeitosTempPassivos: [], setEfeitosTempPassivos: vi.fn(),
        poderEditandoId: null, setPoderEditandoId: vi.fn(), pastasFechadasMapaTecnicas: {},
        setPastasFechadasMapaTecnicas: vi.fn((m) => { mockState.pastasFechadasMapaTecnicas = m; }),
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(mockState) : mockState));
    useStore.getState = () => mockState;
}
const montar = (poderes) => { montarStore(poderes); return render(<PoderesFormProvider><MapaTecnicasRapidas /></PoderesFormProvider>); };

afterEach(() => cleanup());
beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); });

describe('MapaTecnicasRapidas - categorias novas', () => {
    it('3 secoes novas aparecem com seus poderes', () => {
        const { getByText } = montar([
            { id: 1, nome: 'Sharingan', categoria: 'ocular', ativa: false },
            { id: 2, nome: 'Rin', categoria: 'infinity', ativa: false },
            { id: 3, nome: 'Anomalia', categoria: 'singularidade', ativa: false },
        ]);
        expect(getByText('👁️ Poderes Oculares')).toBeTruthy();
        expect(getByText('♾️ Infinities')).toBeTruthy();
        expect(getByText('🌌 Singularidades')).toBeTruthy();
        expect(getByText('☆ Sharingan')).toBeTruthy();
        expect(getByText('☆ Rin')).toBeTruthy();
        expect(getByText('☆ Anomalia')).toBeTruthy();
    });
    it('secoes sem poderes nao aparecem', () => {
        const { queryByText } = montar([{ id: 1, nome: 'Golpe', categoria: 'habilidade', ativa: false }]);
        expect(queryByText('👁️ Poderes Oculares')).toBeNull();
        expect(queryByText('♾️ Infinities')).toBeNull();
        expect(queryByText('🌌 Singularidades')).toBeNull();
    });
    it('categoria no plural / caixa diferente cai na secao certa', () => {
        const { getByText } = montar([{ id: 1, nome: 'Olhos', categoria: 'Oculares', ativa: false }]);
        expect(getByText('👁️ Poderes Oculares')).toBeTruthy();
    });
    it('categoria desconhecida vai para Habilidades (nao some) e sem categoria vai para Poderes', () => {
        const { getByText, queryByText } = montar([
            { id: 1, nome: 'Estranho', categoria: 'legado', ativa: false },
            { id: 2, nome: 'Antigo', ativa: false },
        ]);
        expect(getByText('🗡️ Habilidades')).toBeTruthy();
        expect(getByText('✨ Poderes')).toBeTruthy();
        expect(getByText('☆ Estranho')).toBeTruthy();
        expect(getByText('☆ Antigo')).toBeTruthy();
        expect(queryByText('👁️ Poderes Oculares')).toBeNull();
    });
    it('cada poder aparece uma unica vez (sem duplicar entre secoes)', () => {
        const { getAllByText } = montar([{ id: 1, nome: 'Unico', categoria: 'infinity', ativa: false }]);
        expect(getAllByText('☆ Unico')).toHaveLength(1);
    });
    it('clicar no poder ocular liga via togglePoder (updateFicha chamado)', () => {
        const { getByText } = montar([{ id: 1, nome: 'Sharingan', categoria: 'ocular', ativa: false, efeitos: [], efeitosPassivos: [] }]);
        fireEvent.click(getByText('☆ Sharingan'));
        expect(mockState.updateFicha).toHaveBeenCalled();
    });
    it('poderes null na lista nao quebram', () => {
        expect(() => montar([null, { id: 1, nome: 'A', categoria: 'ocular', ativa: false }])).not.toThrow();
    });
});

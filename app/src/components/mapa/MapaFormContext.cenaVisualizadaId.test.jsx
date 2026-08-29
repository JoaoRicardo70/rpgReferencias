import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaFormProvider, useMapaForm } from './MapaFormContext';
import useStore from '../../stores/useStore';

// ==========================================================================
// NOTA DE ESCOPO:
// `MapaFormContext.jsx` só importa `useStore` (Zustand), `services/firebase-sync`
// (rede) e funções puras de `core/` (engine/efeitos-resolver/attributes) — nenhum
// desses arrasta @react-three/fiber/three.js. Por isso, ao contrário de
// `MapaGrelha.jsx` (que importa `Tabuleiro3D`, e cujo import sozinho já trava o
// Vitest por ~20s tentando montar o motor 3D em jsdom — verificado manualmente
// antes de escrever este arquivo), aqui é viável montar o `MapaFormProvider`
// REAL e testar a regra de negócio de ponta a ponta, sem mockar o Context.
//
// `useStore` é mockado com um objeto controlável (`mockUseStore`) — mesmo
// padrão usado em MapaMundi.sincronizacaoCena.test.jsx — e `services/firebase-sync`
// é mockado por completo (rede), já que não é o alvo deste teste.
//
// Para simular o Firebase empurrando uma atualização de `cenario` (ex.: outra
// pessoa deu "Publicar para Todos"), reatribuímos o estado mockado e chamamos
// `rerender(...)` na MESMA árvore (mesma instância do Provider) — isso é
// importante: se cada teste desse `render()` de novo, o `useRef`/`useState`
// internos do Provider seriam recriados do zero e o bug (que depende do
// Provider já estar montado com um `cenaVisualizadaId` fixado antes da troca)
// nunca seria reproduzido.
// ==========================================================================

vi.mock('../../stores/useStore', () => ({
    default: vi.fn(),
}));

vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    enviarParaFeed: vi.fn(),
    salvarDummie: vi.fn(),
    uploadImagem: vi.fn(() => Promise.resolve('https://exemplo.com/img.png')),
    salvarCenarioCompleto: vi.fn(),
    zerarIniciativaGlobal: vi.fn(),
}));

let storeState;
function mockUseStore(state) {
    storeState = state;
    useStore.mockImplementation((selector) => (typeof selector === 'function' ? selector(storeState) : storeState));
    useStore.getState = () => storeState;
}

function baseState(overrides = {}) {
    return {
        minhaFicha: { nome: 'Astolfo' },
        meuNome: 'Astolfo',
        personagens: {},
        updateFicha: vi.fn(),
        feedCombate: [],
        isMestre: true,
        mesaCriador: 'Astolfo',
        dummies: {},
        alvoSelecionado: null,
        abaAtiva: 'mapa',
        cenario: {
            ativa: 'cena-a',
            lista: {
                'cena-a': { nome: 'Cena A' },
                'cena-b': { nome: 'Cena B (prévia oculta)' },
                'cena-c': { nome: 'Cena C (publicada depois)' },
            },
        },
        ...overrides,
    };
}

// Referência controlável entre renders: cada Harness reatribui `probe` para o
// ctx mais recente do MapaFormProvider.
let probe;
function Harness() {
    probe = useMapaForm();
    return null;
}

function Tree() {
    return (
        <MapaFormProvider>
            <Harness />
        </MapaFormProvider>
    );
}

describe('MapaFormContext - bugfix: cenaVisualizadaId presa quando cenaAtivaIdGlobal muda (MapaFormContext.jsx:112-118)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        probe = undefined;
        mockUseStore(baseState());
    });

    afterEach(() => {
        cleanup();
    });

    it('Happy Path: sem "Ver Cena Oculta" fixado, cenaRenderId reflete direto a cenaAtivaIdGlobal', () => {
        render(<Tree />);
        expect(probe.cenaVisualizadaId).toBeNull();
        expect(probe.cenaAtivaIdGlobal).toBe('cena-a');
        expect(probe.cenaRenderId).toBe('cena-a');
        expect(probe.cenaAtual.nome).toBe('Cena A');
    });

    it('Happy Path: Mestre usa "Ver Cena Oculta" (setCenaVisualizadaId) e cenaRenderId passa a refletir a cena fixada', () => {
        render(<Tree />);

        act(() => {
            probe.setCenaVisualizadaId('cena-b');
        });

        expect(probe.cenaVisualizadaId).toBe('cena-b');
        expect(probe.cenaRenderId).toBe('cena-b');
        expect(probe.cenaAtual.nome).toBe('Cena B (prévia oculta)');
    });

    it('[BUGFIX] quando cenaAtivaIdGlobal muda (outra pessoa publicou uma Cena nova) enquanto o Mestre está com "Ver Cena Oculta" fixado, cenaRenderId passa a refletir a NOVA cena publicada automaticamente — não fica preso na prévia antiga', () => {
        const { rerender } = render(<Tree />);

        act(() => {
            probe.setCenaVisualizadaId('cena-b');
        });
        expect(probe.cenaRenderId).toBe('cena-b');

        // Simula o Firebase empurrando cenario.ativa = 'cena-c' (outra pessoa deu "Publicar para Todos")
        mockUseStore(baseState({
            cenario: {
                ativa: 'cena-c',
                lista: baseState().cenario.lista,
            },
        }));
        rerender(<Tree />);

        expect(probe.cenaAtivaIdGlobal).toBe('cena-c');
        expect(probe.cenaVisualizadaId).toBeNull(); // solto pelo useEffect de auto-liberação
        expect(probe.cenaRenderId).toBe('cena-c'); // não fica preso em 'cena-b'
        expect(probe.cenaAtual.nome).toBe('Cena C (publicada depois)');
    });

    it('Edge Case: rerender com a MESMA cenaAtivaIdGlobal não solta o "Ver Cena Oculta" fixado (evita reset indevido a cada render)', () => {
        const { rerender } = render(<Tree />);

        act(() => {
            probe.setCenaVisualizadaId('cena-b');
        });

        // Rerender com o cenario idêntico (ativa continua 'cena-a')
        mockUseStore(baseState());
        rerender(<Tree />);

        expect(probe.cenaVisualizadaId).toBe('cena-b');
        expect(probe.cenaRenderId).toBe('cena-b');
    });

    it('Edge Case: jogador comum (isMestre=false) nunca usa cenaVisualizadaId — cenaRenderId é sempre a cenaAtivaIdGlobal mesmo que o estado local seja setado', () => {
        mockUseStore(baseState({ isMestre: false }));
        render(<Tree />);

        act(() => {
            probe.setCenaVisualizadaId('cena-b');
        });

        // cenaVisualizadaId até fica setado no estado local, mas cenaRenderId ignora (isMestre é false)
        expect(probe.cenaVisualizadaId).toBe('cena-b');
        expect(probe.cenaRenderId).toBe('cena-a');
    });

    it('regressão: publicar a MESMA cena que já estava fixada (ativarCena(cenaRenderId), fluxo do botão "Publicar Esta Cena para Todos") também solta cenaVisualizadaId e cenaRenderId permanece correto', () => {
        const { rerender } = render(<Tree />);

        act(() => {
            probe.setCenaVisualizadaId('cena-b');
        });
        expect(probe.cenaRenderId).toBe('cena-b');

        // "Publicar Esta Cena para Todos" muda cenario.ativa para a MESMA cena visualizada
        mockUseStore(baseState({
            cenario: { ativa: 'cena-b', lista: baseState().cenario.lista },
        }));
        rerender(<Tree />);

        expect(probe.cenaAtivaIdGlobal).toBe('cena-b');
        expect(probe.cenaVisualizadaId).toBeNull();
        expect(probe.cenaRenderId).toBe('cena-b');
    });
});

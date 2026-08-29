import React from 'react';
import { render, screen, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaFormProvider, useMapaForm } from './MapaFormContext';
import { MapaMestreGerenciadorCenas } from './MapaFerramentasMestre';
import useStore from '../../stores/useStore';
import { salvarCenarioCompleto, enviarParaFeed } from '../../services/firebase-sync';

// ==========================================================================
// NOTA DE ESCOPO:
// `MapaFerramentasMestre.jsx` só importa `useMapaForm` (MapaFormContext.jsx)
// e `salvarDummie` (firebase-sync) — não importa `MapaGrelha.jsx`/`Tabuleiro3D`,
// então é seguro montar `MapaMestreGerenciadorCenas` dentro de um
// `MapaFormProvider` REAL (verificado manualmente: importar `MapaGrelha.jsx`
// sozinho já trava o Vitest por ~20s por arrastar @react-three/fiber/three.js;
// importar `MapaFormContext.jsx` + `MapaFerramentasMestre.jsx` juntos é
// instantâneo). Por isso o filtro equivalente usado no `<select>` de
// `MapaControlesSuperiores` (MapaGrelha.jsx) é coberto separadamente em
// `MapaGrelha.filtroCenaApenasCriador.test.js`, isolando a expressão pura de
// filtragem em vez de montar o componente real.
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
        minhaFicha: { nome: 'Ficha' },
        meuNome: 'Mestre Supremo',
        personagens: {},
        updateFicha: vi.fn(),
        feedCombate: [],
        isMestre: true,
        mesaCriador: 'Mestre Supremo',
        dummies: {},
        alvoSelecionado: null,
        abaAtiva: 'mapa',
        cenario: { ativa: 'cena-publica', lista: { 'cena-publica': { nome: 'Praça Pública' } } },
        ...overrides,
    };
}

describe('MapaMestreGerenciadorCenas - visibilidade de Cenas "apenasCriador" (MapaFerramentasMestre.jsx:90)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        cleanup();
    });

    it('Happy Path: esconde uma Cena "apenasCriador" de quem NÃO é souCriador (Co-Mestre)', () => {
        mockUseStore(baseState({
            meuNome: 'Co-Mestre',
            mesaCriador: 'Mestre Supremo',
            cenario: {
                ativa: 'cena-publica',
                lista: {
                    'cena-publica': { nome: 'Praça Pública' },
                    'cena-secreta': { nome: 'Covil Secreto', apenasCriador: true },
                },
            },
        }));

        render(<MapaFormProvider><MapaMestreGerenciadorCenas /></MapaFormProvider>);

        expect(screen.getByText('Praça Pública')).toBeDefined();
        expect(screen.queryByText('Covil Secreto')).toBeNull();
    });

    it('Happy Path: mostra a Cena "apenasCriador" para o próprio souCriador (Mestre Supremo)', () => {
        mockUseStore(baseState({
            meuNome: 'Mestre Supremo',
            mesaCriador: 'Mestre Supremo',
            cenario: {
                ativa: 'cena-publica',
                lista: {
                    'cena-publica': { nome: 'Praça Pública' },
                    'cena-secreta': { nome: 'Covil Secreto', apenasCriador: true },
                },
            },
        }));

        render(<MapaFormProvider><MapaMestreGerenciadorCenas /></MapaFormProvider>);

        expect(screen.getByText('Praça Pública')).toBeDefined();
        expect(screen.getByText('Covil Secreto')).toBeDefined();
    });

    it('Edge Case: assim que a Cena "apenasCriador" vira a cenaAtivaIdGlobal (foi dado "Publicar para Todos"), ela passa a aparecer também para o Co-Mestre', () => {
        mockUseStore(baseState({
            meuNome: 'Co-Mestre',
            mesaCriador: 'Mestre Supremo',
            cenario: {
                ativa: 'cena-secreta', // já publicada pra mesa toda
                lista: {
                    'cena-publica': { nome: 'Praça Pública' },
                    'cena-secreta': { nome: 'Covil Secreto', apenasCriador: true },
                },
            },
        }));

        render(<MapaFormProvider><MapaMestreGerenciadorCenas /></MapaFormProvider>);

        expect(screen.getByText('Covil Secreto')).toBeDefined();
    });

    it('Regressão: uma Cena SEM apenasCriador continua visível tanto para o Mestre Supremo quanto para o Co-Mestre', () => {
        const cenario = { ativa: 'cena-publica', lista: { 'cena-publica': { nome: 'Praça Pública' } } };

        mockUseStore(baseState({ meuNome: 'Mestre Supremo', mesaCriador: 'Mestre Supremo', cenario }));
        const { unmount } = render(<MapaFormProvider><MapaMestreGerenciadorCenas /></MapaFormProvider>);
        expect(screen.getByText('Praça Pública')).toBeDefined();
        unmount();
        cleanup();

        mockUseStore(baseState({ meuNome: 'Co-Mestre', mesaCriador: 'Mestre Supremo', cenario }));
        render(<MapaFormProvider><MapaMestreGerenciadorCenas /></MapaFormProvider>);
        expect(screen.getByText('Praça Pública')).toBeDefined();
    });

    it('checkbox "🔒 Só eu vejo" só aparece para souCriador', () => {
        mockUseStore(baseState({ meuNome: 'Mestre Supremo', mesaCriador: 'Mestre Supremo' }));
        render(<MapaFormProvider><MapaMestreGerenciadorCenas /></MapaFormProvider>);
        expect(screen.getByText(/Só eu vejo/)).toBeDefined();
    });

    it('Edge Case: checkbox "🔒 Só eu vejo" NÃO aparece para um Co-Mestre (não-souCriador)', () => {
        mockUseStore(baseState({ meuNome: 'Co-Mestre', mesaCriador: 'Mestre Supremo' }));
        render(<MapaFormProvider><MapaMestreGerenciadorCenas /></MapaFormProvider>);
        expect(screen.queryByText(/Só eu vejo/)).toBeNull();
    });

    it('Edge Case: jogador comum (isMestre=false) não vê o Gerenciador de Cenas de forma alguma, independente de apenasCriador', () => {
        mockUseStore(baseState({ isMestre: false, meuNome: 'Jogador Comum', mesaCriador: 'Mestre Supremo' }));
        const { container } = render(<MapaFormProvider><MapaMestreGerenciadorCenas /></MapaFormProvider>);
        expect(container.textContent).toBe('');
    });
});

// Referência controlável entre renders: usada pelos testes de handleUploadNovaCena
// abaixo, que precisam chamar métodos do contexto diretamente (bypass da UI),
// já que o checkbox "Só eu vejo" nem chega a renderizar para quem não é souCriador.
let probe;
function Harness() {
    probe = useMapaForm();
    return null;
}

describe('handleUploadNovaCena - defesa em profundidade do "apenasCriador" (MapaFormContext.jsx:263-293)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        probe = undefined;
    });

    afterEach(() => {
        cleanup();
    });

    it('Happy Path: grava apenasCriador:true quando quem cria a Cena é o souCriador e marcou a opção', async () => {
        mockUseStore(baseState({
            meuNome: 'Mestre Supremo',
            mesaCriador: 'Mestre Supremo',
            cenario: { ativa: 'default', lista: {} },
        }));
        render(<MapaFormProvider><Harness /></MapaFormProvider>);

        act(() => {
            probe.setNovaCenaNome('Sala Secreta');
            probe.setNovaCenaApenasCriador(true);
        });

        await act(async () => {
            await probe.handleUploadNovaCena({ target: { files: [{}] } });
        });

        expect(salvarCenarioCompleto).toHaveBeenCalledTimes(1);
        const novoCenario = salvarCenarioCompleto.mock.calls[0][0];
        const novaCena = Object.values(novoCenario.lista).find(c => c.nome === 'Sala Secreta');
        expect(novaCena).toBeDefined();
        expect(novaCena.apenasCriador).toBe(true);

        // Cena oculta não avisa ninguém no feed (senão entregaria que algo está sendo preparado)
        expect(enviarParaFeed).not.toHaveBeenCalled();
    });

    it('[DEFESA EM PROFUNDIDADE] NÃO grava apenasCriador:true quando quem chama NÃO é souCriador, mesmo que novaCenaApenasCriador esteja true no estado local', async () => {
        mockUseStore(baseState({
            meuNome: 'Co-Mestre',
            mesaCriador: 'Mestre Supremo',
            cenario: { ativa: 'default', lista: {} },
        }));
        render(<MapaFormProvider><Harness /></MapaFormProvider>);

        act(() => {
            probe.setNovaCenaNome('Sala Secreta');
            // Estado local forçado via contexto (o checkbox real nunca apareceria pro Co-Mestre,
            // mas testamos a defesa mesmo assim, caso algo consiga chamar o setter diretamente).
            probe.setNovaCenaApenasCriador(true);
        });

        await act(async () => {
            await probe.handleUploadNovaCena({ target: { files: [{}] } });
        });

        expect(salvarCenarioCompleto).toHaveBeenCalledTimes(1);
        const novoCenario = salvarCenarioCompleto.mock.calls[0][0];
        const novaCena = Object.values(novoCenario.lista).find(c => c.nome === 'Sala Secreta');
        expect(novaCena).toBeDefined();
        expect(novaCena.apenasCriador).toBeUndefined();

        // Como a defesa em profundidade barrou o "apenasCriador", a Cena é tratada como
        // pública normal -> o feed de aviso deve ser enviado (nada escondido de ninguém).
        expect(enviarParaFeed).toHaveBeenCalledTimes(1);
    });

    it('Happy Path (regressão): Cena criada sem marcar "apenasCriador" nunca grava a flag, mesmo sendo o souCriador quem cria', async () => {
        mockUseStore(baseState({
            meuNome: 'Mestre Supremo',
            mesaCriador: 'Mestre Supremo',
            cenario: { ativa: 'default', lista: {} },
        }));
        render(<MapaFormProvider><Harness /></MapaFormProvider>);

        act(() => {
            probe.setNovaCenaNome('Cena Normal');
        });

        await act(async () => {
            await probe.handleUploadNovaCena({ target: { files: [{}] } });
        });

        const novoCenario = salvarCenarioCompleto.mock.calls[0][0];
        const novaCena = Object.values(novoCenario.lista).find(c => c.nome === 'Cena Normal');
        expect(novaCena.apenasCriador).toBeUndefined();
        expect(enviarParaFeed).toHaveBeenCalledTimes(1);
    });
});

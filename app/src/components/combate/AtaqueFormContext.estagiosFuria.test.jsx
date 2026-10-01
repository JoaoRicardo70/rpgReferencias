import React from 'react';
import { render, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AtaqueFormProvider, useAtaqueForm } from './AtaqueFormContext';
import useStore from '../../stores/useStore';

// ---------------------------------------------------------------------------
// QA — AtaqueFormContext usa os efeitos ESCALADOS pelo estágio (core/estagios.js) no scan de
// furia_berserker: técnica ativa com Estágios multiplica o valor; passivos não escalam; técnica
// desligada não conta.
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore');
vi.mock('../../core/engine', () => ({ calcularDano: vi.fn() }));
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    enviarParaFeed: vi.fn(),
    salvarDummie: vi.fn(),
    salvarCenarioCompleto: vi.fn(),
}));

let probe;
function Harness() { probe = useAtaqueForm(); return null; }

function montar(poderes) {
    const minhaFicha = { poderes, inventario: [], passivas: [], ataquesElementais: [], hierarquia: {}, combate: {} };
    const mockState = {
        minhaFicha, meuNome: 'Heroi', personagens: {},
        updateFicha: vi.fn((cb) => cb(minhaFicha)),
        setAbaAtiva: vi.fn(), abaAtiva: 'aba-ataque', feedCombate: [],
        alvoSelecionado: null, dummies: {},
        ignorarTravaAcerto: false, setIgnorarTravaAcerto: vi.fn(),
        cenario: { zonas: [] },
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(mockState) : mockState));
    useStore.getState = () => mockState;
    render(<AtaqueFormProvider><Harness /></AtaqueFormProvider>);
}

const CFG = { habilitado: true, maximo: 10, crescimento: 100, fadigaPorEstagio: 2, rotulo: 'Portão', nomes: [] };
const furia = (valor) => [{ atributo: 'geral', propriedade: 'furia_berserker', valor }];

beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); });
afterEach(() => cleanup());

describe('AtaqueFormContext — multiplicadorFuriaClasse com Estágios', () => {
    it('técnica ativa no 3º estágio (100%) multiplica o valor da Fúria por 3', () => {
        montar([{ id: 1, nome: 'Fúria', ativa: true, estagios: { ...CFG }, estagioAtual: 3, efeitos: furia(2), efeitosPassivos: [] }]);
        expect(probe.multiplicadorFuriaClasse).toBe(6);
    });

    it('no 1º estágio vale o valor original', () => {
        montar([{ id: 1, nome: 'Fúria', ativa: true, estagios: { ...CFG }, estagioAtual: 1, efeitos: furia(2), efeitosPassivos: [] }]);
        expect(probe.multiplicadorFuriaClasse).toBe(2);
    });

    it('técnica sem Estágios não é afetada por estagioAtual', () => {
        montar([{ id: 1, nome: 'Fúria', ativa: true, estagioAtual: 5, efeitos: furia(2), efeitosPassivos: [] }]);
        expect(probe.multiplicadorFuriaClasse).toBe(2);
    });

    it('técnica desligada não conta nos efeitos ativos', () => {
        montar([{ id: 1, nome: 'Fúria', ativa: false, estagios: { ...CFG }, estagioAtual: 4, efeitos: furia(2), efeitosPassivos: [] }]);
        expect(probe.multiplicadorFuriaClasse).toBe(0);
    });

    it('efeito PASSIVO não escala com o estágio', () => {
        montar([{ id: 1, nome: 'Fúria', ativa: true, estagios: { ...CFG }, estagioAtual: 4, efeitos: [], efeitosPassivos: furia(2) }]);
        expect(probe.multiplicadorFuriaClasse).toBe(2);
    });
});

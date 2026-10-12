import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaFormProvider } from './MapaFormContext';
import { MapaMestreDanoRapido } from './MapaFerramentasMestre';
import useStore from '../../stores/useStore';

// Prévia do Dano Rápido (PreviaDanoRapido): mesmo esquema de MapaFerramentasMestre.danoRapido.test.jsx.

vi.mock('../../stores/useStore', () => ({ default: vi.fn() }));
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    enviarParaFeed: vi.fn(),
    salvarDummie: vi.fn(),
    uploadImagem: vi.fn(() => Promise.resolve('https://exemplo.com/img.png')),
    salvarCenarioCompleto: vi.fn(),
    zerarIniciativaGlobal: vi.fn(),
    aplicarDanoDireto: vi.fn(),
    aplicarFadigaDireta: vi.fn(),
    aplicarElementoDireto: vi.fn(),
    aplicarElementoNivelDireto: vi.fn(),
}));

let storeState;
function mockUseStore(state) {
    storeState = state;
    useStore.mockImplementation((selector) => (typeof selector === 'function' ? selector(storeState) : storeState));
    useStore.getState = () => storeState;
}

function baseState(overrides = {}) {
    const minhaFicha = { nome: 'Ficha', iniciativa: 0, posicao: { x: 0, y: 0, z: 0, cenaId: 'default' }, vida: { atual: 100 } };
    return {
        minhaFicha, meuNome: 'Mestre', personagens: {},
        updateFicha: vi.fn((cb) => cb(minhaFicha)),
        feedCombate: [], isMestre: true, mesaCriador: 'Mestre', dummies: {}, alvoSelecionado: null, abaAtiva: 'mapa',
        cenario: { ativa: 'default', lista: { default: { nome: 'Cena', escala: 1.5 } } },
        ...overrides,
    };
}

const stat = (atual, base) => ({ atual, base, mBase: 1, mGeral: 1, mFormas: 1, mUnico: '1.0', mAbsoluto: 1 });
// Dummie com 1.000 de Vida exibida (hpMax bruto 1.000.000) e 500 atuais.
const goblin = { nome: 'Goblin', cenaId: 'default', hpAtual: 500000, hpMax: 1000000 };

function montar(overrides) {
    mockUseStore(baseState(overrides));
    return render(<MapaFormProvider><MapaMestreDanoRapido /></MapaFormProvider>);
}
const escolherAlvo = (id) => fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: id } });
const digitarDano = (v) => fireEvent.change(screen.getByDisplayValue('10'), { target: { value: String(v) } });

describe('PreviaDanoRapido (Dano Rápido do Mestre)', () => {
    beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); });
    afterEach(() => cleanup());

    it('sem alvo escolhido mostra a mensagem de escolher um alvo', () => {
        montar({ dummies: { goblin } });
        expect(screen.getByText(/Escolha um alvo para ver a prévia do dano/)).toBeDefined();
        expect(screen.queryByText(/👁️ Prévia/)).toBeNull();
    });

    it('com alvo e dano digitado mostra "👁️ Prévia", o dano final e a Vida antes -> depois', () => {
        const { container } = montar({ dummies: { goblin } });
        escolherAlvo('goblin');
        digitarDano(100);
        expect(screen.getByText(/👁️ Prévia — Goblin/)).toBeDefined();
        const final = container.querySelector('.dano-previa-final');
        expect(final.textContent).toContain('Dano que entra');
        expect(final.textContent).toContain('100');
        const vida = container.querySelector('.dano-previa-vida');
        expect(vida.textContent.replace(/\s+/g, ' ')).toContain('500 → 400 / 1.000');
    });

    it('dano zero pede um dano maior que zero', () => {
        montar({ dummies: { goblin } });
        escolherAlvo('goblin');
        digitarDano(0);
        expect(screen.getByText(/Digite um dano maior que zero/)).toBeDefined();
    });

    it('dano maior que a Vida mostra Vida em 0 e o aviso de queda', () => {
        const { container } = montar({ dummies: { goblin } });
        escolherAlvo('goblin');
        digitarDano(900);
        const vida = container.querySelector('.dano-previa-vida');
        expect(vida.textContent.replace(/\s+/g, ' ')).toContain('500 → 0 / 1.000');
        expect(vida.textContent).toContain('cai a 0');
    });

    it('jogador com Reduções na ficha mostra os passos em sequência e o dano final reduzido', () => {
        const vilao = {
            posicao: { x: 1, y: 1, z: 0, cenaId: 'default' },
            vida: stat(1000000, 1000000),
            reducoesDano: [
                { id: 'a', nome: 'Couraça', percentual: 20, elemento: 'todos' },
                { id: 'b', nome: 'Pele Yin', percentual: 30, elemento: 'pol:yin' },
            ],
        };
        const { container } = montar({ personagens: { Vilao: vilao } });
        fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'Vilao' } });
        fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: 'Fogo' } });
        digitarDano(1000);
        const passos = container.querySelector('.dano-previa-passos').textContent;
        expect(passos).toContain('Dano digitado');
        expect(passos).toContain('Couraça');
        expect(passos).toContain('Pele Yin');
        expect(passos).toContain('−20%');
        expect(passos).toContain('−30%');
        // 1000 -> 800 -> 560 (sequencial)
        expect(container.querySelector('.dano-previa-final').textContent).toContain('560');
    });
});

import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MarcadosPanel from './Marcados';
import useStore from '../../stores/useStore';

// ---------------------------------------------------------------------------
// QA — complemento de Marcados.regeneracaoVitais.test.jsx: aquele arquivo só exercita a
// Regeneração (LinhaVital) pra Vida e Mana. Este cobre Corpo e Aura — os vitais restantes
// renderizados na primeira página (ver Marcados.jsx > LinhaVital de vida/mana/aura/chakra/corpo)
// — pra garantir que a mesma lógica (campo manual + bônus de Poder/Passiva/Item) funciona pra
// TODOS os vitais, não só os dois já cobertos.
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    uploadImagem: vi.fn(),
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
}));

function fichaBase(overrides = {}) {
    return {
        vida: { base: 1000000 }, mana: { base: 1000000 }, aura: { base: 1000000 }, chakra: { base: 1000000 }, corpo: { base: 1000000 },
        forca: { base: 0 }, destreza: { base: 0 }, inteligencia: { base: 0 }, sabedoria: { base: 0 },
        energiaEsp: { base: 0 }, carisma: { base: 0 }, stamina: { base: 0 }, constituicao: { base: 0 },
        ascensaoBase: 1, divisores: {}, bio: {}, estetica: {}, labels: {}, statusPool: 0,
        poderes: [], inventario: [], passivas: [], seresSelados: [],
        ...overrides,
    };
}

function montarMockUseStore(minhaFicha) {
    const mockState = {
        minhaFicha,
        updateFicha: vi.fn((callback) => callback(minhaFicha)),
        meuNome: 'Testador',
        importarDaAbaStatus: vi.fn(),
    };
    useStore.mockImplementation((selector) => (selector ? selector(mockState) : mockState));
    return mockState;
}

function linhaRegen(labelText) {
    const input = screen.getByDisplayValue(labelText);
    const wrapper = input.parentElement.parentElement.parentElement;
    return wrapper.children[2];
}

describe('Marcados (página 1, LinhaVital) — Regeneração de Corpo e Aura (vitais não cobertos por Marcados.regeneracaoVitais.test.jsx)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        window.alert = vi.fn();
    });

    afterEach(() => cleanup());

    it('Corpo mostra o campo de regeneração manual com o valor salvo em ficha.corpo.regeneracao', () => {
        const ficha = fichaBase({ corpo: { base: 1000000, regeneracao: 250 } });
        montarMockUseStore(ficha);
        render(<MarcadosPanel />);

        const regenInput = linhaRegen('Corpo').querySelector('input[type="number"]');
        expect(regenInput.value).toBe('250');
    });

    it('editar o campo manual de Corpo chama updateFicha e grava em ficha.corpo.regeneracao', () => {
        const ficha = fichaBase({ corpo: { base: 1000000, regeneracao: 0 } });
        const mockState = montarMockUseStore(ficha);
        render(<MarcadosPanel />);

        const regenInput = linhaRegen('Corpo').querySelector('input[type="number"]');
        fireEvent.change(regenInput, { target: { value: '333' } });

        expect(mockState.updateFicha).toHaveBeenCalled();
        expect(ficha.corpo.regeneracao).toBe(333);
    });

    it('um Poder ATIVO com efeito propriedade="regeneracao" em "corpo" soma ao total exibido, sem vazar pra Aura', () => {
        const ficha = fichaBase({
            corpo: { base: 1000000, regeneracao: 100 },
            aura: { base: 1000000, regeneracao: 10 },
            poderes: [{ id: 'p1', nome: 'Fortalecimento', categoria: 'passiva', ativa: true, efeitos: [{ atributo: 'corpo', propriedade: 'regeneracao', valor: 60 }] }],
        });
        montarMockUseStore(ficha);
        render(<MarcadosPanel />);

        const textoCorpo = linhaRegen('Corpo').textContent;
        expect(textoCorpo).toMatch(/\+ 60/);
        expect(textoCorpo).toMatch(/160/); // 100 (manual) + 60 (buff) = 160

        expect(linhaRegen('Aura').textContent).not.toMatch(/Poder\/Passiva\/Item/);
        expect(linhaRegen('Aura').querySelector('input[type="number"]').value).toBe('10');
    });

    it('Aura sem regeneração manual definida (undefined) mostra o input com valor 0, sem lançar', () => {
        const ficha = fichaBase({ aura: { base: 1000000 } }); // sem .regeneracao
        montarMockUseStore(ficha);
        expect(() => render(<MarcadosPanel />)).not.toThrow();

        const regenInput = linhaRegen('Aura').querySelector('input[type="number"]');
        expect(regenInput.value).toBe('0');
    });

    it('um Poder desativado com bônus de regeneração em Corpo não soma nada, mas o mesmo Poder ATIVO com bônus em Aura não interfere no Corpo', () => {
        const ficha = fichaBase({
            corpo: { base: 1000000, regeneracao: 5 },
            aura: { base: 1000000, regeneracao: 0 },
            poderes: [
                { id: 'p1', nome: 'Buff Corpo Inativo', categoria: 'passiva', ativa: false, efeitos: [{ atributo: 'corpo', propriedade: 'regeneracao', valor: 999 }] },
                { id: 'p2', nome: 'Buff Aura Ativo', categoria: 'passiva', ativa: true, efeitos: [{ atributo: 'aura', propriedade: 'regeneracao', valor: 40 }] },
            ],
        });
        montarMockUseStore(ficha);
        render(<MarcadosPanel />);

        expect(linhaRegen('Corpo').textContent).not.toMatch(/Poder\/Passiva\/Item/);
        expect(linhaRegen('Aura').textContent).toMatch(/\+ 40/);
    });
});

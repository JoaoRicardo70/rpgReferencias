import React from 'react';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ArsenalFormProvider } from './ArsenalFormContext';
import { ArsenalInventarioList } from './ArsenalSubComponents';
import useStore from '../../stores/useStore';

// QA - ArsenalInventarioList: filtro de tipos e campos Qtd/Kg/Descricao.

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({ salvarFichaSilencioso: vi.fn() }));

let mockState;
function montarStore(inventario) {
    mockState = {
        minhaFicha: { inventario },
        meuNome: 'Heroi',
        updateFicha: vi.fn((cb) => cb(mockState.minhaFicha)),
        itemEditandoId: null, setItemEditandoId: vi.fn(),
        efeitosTempArsenal: [], setEfeitosTempArsenal: vi.fn(),
        efeitosTempPassivosArsenal: [], setEfeitosTempPassivosArsenal: vi.fn(),
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(mockState) : mockState));
}
const item = (id, nome, tipo, extra = {}) => ({ id, nome, tipo, equipado: false, quantidade: 2, peso: 1.5, desc: '', ...extra });
const renderLista = () => render(<ArsenalFormProvider><ArsenalInventarioList /></ArsenalFormProvider>);
const inputs = (c) => c.querySelectorAll('.arsenal-item-extra input');

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('ArsenalInventarioList - filtro', () => {
    it('esconde consumivel e mundano, mostra arma, armadura e acessorio', () => {
        montarStore([item(1, 'Espada', 'arma'), item(2, 'Poção', 'consumivel'), item(3, 'Corda', 'mundano'), item(4, 'Anel', 'acessorio'), item(5, 'Cota', 'armadura')]);
        const { container } = renderLista();
        const t = container.textContent;
        expect(t).toContain('Espada');
        expect(t).toContain('Anel');
        expect(t).toContain('Cota');
        expect(t).not.toContain('Poção');
        expect(t).not.toContain('Corda');
    });

    it('só consumíveis/mundanos: mostra a mensagem de forja vazia', () => {
        montarStore([item(2, 'Poção', 'consumivel'), item(3, 'Corda', 'mundano')]);
        const { container } = renderLista();
        expect(container.textContent).toContain('Nenhum equipamento na sua forja.');
    });

    it('inventário vazio ou ausente não quebra', () => {
        montarStore([]);
        expect(renderLista().container.textContent).toContain('Nenhum equipamento');
        cleanup();
        montarStore(undefined);
        expect(renderLista().container.textContent).toContain('Nenhum equipamento');
    });

    it('entradas nulas no inventário são ignoradas', () => {
        montarStore([null, item(1, 'Espada', 'arma')]);
        expect(renderLista().container.textContent).toContain('Espada');
    });
});

describe('ArsenalInventarioList - Qtd / Kg / Descrição', () => {
    it('mostra os valores atuais (fallback Qtd=1, Kg=0 quando ausentes)', () => {
        montarStore([{ id: 1, nome: 'Anel', tipo: 'acessorio' }]);
        const { container } = renderLista();
        const [qtd, kg] = inputs(container);
        expect(qtd.value).toBe('1');
        expect(kg.value).toBe('0');
    });

    it('Qtd converte string para número', () => {
        montarStore([item(1, 'Espada', 'arma')]);
        const { container } = renderLista();
        fireEvent.change(inputs(container)[0], { target: { value: '7' } });
        expect(mockState.minhaFicha.inventario[0].quantidade).toBe(7);
    });

    it('Kg aceita decimal', () => {
        montarStore([item(1, 'Espada', 'arma')]);
        const { container } = renderLista();
        fireEvent.change(inputs(container)[1], { target: { value: '2.5' } });
        expect(mockState.minhaFicha.inventario[0].peso).toBe(2.5);
    });

    it("Qtd e Kg aceitam vazio ('') sem virar 0", () => {
        montarStore([item(1, 'Espada', 'arma')]);
        const { container } = renderLista();
        fireEvent.change(inputs(container)[0], { target: { value: '' } });
        fireEvent.change(inputs(container)[1], { target: { value: '' } });
        expect(mockState.minhaFicha.inventario[0].quantidade).toBe('');
        expect(mockState.minhaFicha.inventario[0].peso).toBe('');
    });

    it('valor 0 é gravado como 0 (não vazio)', () => {
        montarStore([item(1, 'Espada', 'arma')]);
        const { container } = renderLista();
        fireEvent.change(inputs(container)[0], { target: { value: '0' } });
        expect(mockState.minhaFicha.inventario[0].quantidade).toBe(0);
    });

    it('Descrição grava o texto', () => {
        montarStore([item(1, 'Espada', 'arma')]);
        const { container } = renderLista();
        fireEvent.change(container.querySelector('textarea.arsenal-item-desc'), { target: { value: 'Brilha à noite ✨' } });
        expect(mockState.minhaFicha.inventario[0].desc).toBe('Brilha à noite ✨');
    });
});

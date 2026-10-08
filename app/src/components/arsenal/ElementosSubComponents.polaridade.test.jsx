import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ElementosGrimorio } from './ElementosSubComponents';
import { useElementosForm } from './ElementosFormContext';

vi.mock('./ElementosFormContext', async () => {
    const real = await vi.importActual('./ElementosFormContext');
    return { ...real, useElementosForm: vi.fn() };
});

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('ElementosGrimorio — selo de polaridade nos chips de elemento', () => {
    it('Fogo=Yin, Vento=Yang, Agua=Neutro e "Aura Pura" sem selo', () => {
        useElementosForm.mockReturnValue({
            abaAtual: 'cap1',
            elemSelecionado: null,
            selecionarElemento: vi.fn(),
            minhaFicha: { dominios: {} },
            abasDinamicas: { cap1: { label: 'Cap 1', categorias: [{ titulo: 'Elementos', itens: ['Fogo', 'Vento', 'Agua', 'Aura Pura'] }] } },
            criarElementoCustomizado: vi.fn(),
        });
        render(<ElementosGrimorio />);
        const selo = (nome) => screen.getByText(new RegExp(nome)).closest('button').querySelector('.polaridade-selo');

        expect(selo('Fogo').classList.contains('polaridade-yin')).toBe(true);
        expect(selo('Vento').classList.contains('polaridade-yang')).toBe(true);
        expect(selo('Agua').classList.contains('polaridade-neutro')).toBe(true);
        expect(selo('Aura Pura')).toBeNull();
    });
});

import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import PerfilPanel from './PerfilPanel';
import useStore from '../../stores/useStore';

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    carregarFichaDoFirebase: vi.fn(() => Promise.resolve()),
    deletarPersonagem: vi.fn(),
    salvarFichaSilencioso: vi.fn(),
    uploadImagem: vi.fn()
}));

beforeEach(() => {
    const st = { minhaFicha: { avatar: { base: '' } }, meuNome: 'Heroi', isMestre: false, updateFicha: vi.fn(), setMeuNome: vi.fn(), setIsMestre: vi.fn(), resetFicha: vi.fn(), carregarDadosFicha: vi.fn(), setPersonagemParaDeletar: vi.fn(), setAbaAtiva: vi.fn() };
    useStore.mockImplementation(sel => (sel ? sel(st) : st));
});
afterEach(() => cleanup());

describe('PerfilPanel - aparencia (agora em Configuracoes)', () => {
    it('nao mostra mais o painel de Aparencia (foi para a aba Configuracoes)', () => {
        const { container } = render(<PerfilPanel />);
        expect(container.querySelector('.aparencia-panel')).toBeNull();
    });
    it('com children customizados nao mostra o painel', () => {
        const { container } = render(<PerfilPanel><div>custom</div></PerfilPanel>);
        expect(container.querySelector('.aparencia-panel')).toBeNull();
    });
});

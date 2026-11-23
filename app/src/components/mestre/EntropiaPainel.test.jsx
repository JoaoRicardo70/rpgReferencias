import React from 'react';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import EntropiaPainel from './EntropiaPainel';
import EntropiaSelo from '../shared/EntropiaSelo';
import useStore from '../../stores/useStore';
import { enviarParaFeed, salvarFichaSilencioso } from '../../services/firebase-sync';

vi.mock('../../stores/useStore', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, default: vi.fn() };
});
vi.mock('../../services/firebase-sync', () => ({
    enviarParaFeed: vi.fn(), salvarFichaSilencioso: vi.fn(), salvarFichaAlvoSilencioso: vi.fn(),
    salvarFichaAlvoImediato: vi.fn(), salvarFirebaseImediato: vi.fn(),
    iniciarSincronizacaoFichaAlvo: vi.fn(), pararSincronizacaoFichaAlvo: vi.fn(),
}));

let ficha; let state;
function montar({ isMestre = true, entropias = [] } = {}) {
    ficha = { entropias };
    state = { isMestre, meuNome: 'Boss', minhaFicha: ficha, personagens: {}, updateFicha: vi.fn((cb) => cb(ficha)), updateFichaAlvo: vi.fn() };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(state) : state));
    return render(<EntropiaPainel />);
}
const ent = (extra = {}) => ({ id: 'e1', nome: 'Maré', descricao: '', ativa: false, oculta: false, efeitos: [], ...extra });

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => cleanup());

describe('EntropiaPainel', () => {
    it('só renderiza para o Mestre', () => {
        const { container } = montar({ isMestre: false });
        expect(container.innerHTML).toBe('');
    });
    it('sem Entropias mostra o vazio e o botão de criar', () => {
        montar();
        expect(screen.getByText(/Nenhuma Entropia criada/)).toBeTruthy();
        fireEvent.click(screen.getByText(/NOVA ENTROPIA/));
        expect(ficha.entropias).toHaveLength(1);
        expect(ficha.entropias[0].nome).toBe('Nova Entropia');
        expect(salvarFichaSilencioso).toHaveBeenCalled();
    });
    it('ligar uma Entropia grava ativa e avisa o feed da mesa', () => {
        montar({ entropias: [ent()] });
        fireEvent.click(screen.getByText('Ligar'));
        expect(ficha.entropias[0].ativa).toBe(true);
        expect(enviarParaFeed).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'sistema', texto: expect.stringContaining('Maré') }));
    });
    it('ligar uma Entropia OCULTA não avisa o feed', () => {
        montar({ entropias: [ent({ oculta: true })] });
        fireEvent.click(screen.getByText('Ligar'));
        expect(ficha.entropias[0].ativa).toBe(true);
        expect(enviarParaFeed).not.toHaveBeenCalled();
    });
    it('desligar não avisa o feed', () => {
        montar({ entropias: [ent({ ativa: true })] });
        fireEvent.click(screen.getByText(/LIGADA/));
        expect(ficha.entropias[0].ativa).toBe(false);
        expect(enviarParaFeed).not.toHaveBeenCalled();
    });
    it('adiciona um efeito válido e recusa um inválido', () => {
        montar({ entropias: [ent()] });
        const add = screen.getByTitle('Adicionar efeito');
        expect(add.disabled).toBe(true);
        fireEvent.change(screen.getByLabelText('Valor do efeito'), { target: { value: '50' } });
        expect(add.disabled).toBe(false);
        fireEvent.click(add);
        expect(ficha.entropias[0].efeitos).toHaveLength(1);
        expect(ficha.entropias[0].efeitos[0]).toMatchObject({ atributo: 'forca', valor: 50 });
    });
    it('Poder Direto só oferece multiplicadores', () => {
        montar({ entropias: [ent()] });
        fireEvent.change(screen.getByLabelText('Atributo do efeito'), { target: { value: 'poder_direto' } });
        const opcoes = [...screen.getByLabelText('Propriedade do efeito').options].map(o => o.value);
        expect(opcoes).toEqual(['mbase', 'mgeral', 'mformas', 'mabs', 'munico']);
    });
    it('remove um efeito e apaga a Entropia (com confirmação)', () => {
        montar({ entropias: [ent({ efeitos: [{ nome: 'x', atributo: 'forca', propriedade: 'base', valor: 5 }] })] });
        fireEvent.click(screen.getByLabelText('Remover efeito'));
        expect(ficha.entropias[0].efeitos).toHaveLength(0);
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        fireEvent.click(screen.getByTitle('Apagar esta Entropia'));
        expect(ficha.entropias).toHaveLength(0);
    });
    it('não apaga se o Mestre cancelar a confirmação', () => {
        montar({ entropias: [ent()] });
        vi.spyOn(window, 'confirm').mockReturnValue(false);
        fireEvent.click(screen.getByTitle('Apagar esta Entropia'));
        expect(ficha.entropias).toHaveLength(1);
    });
});

describe('EntropiaSelo', () => {
    const f = { entropias: [ent({ id: 'a', nome: 'Visível', ativa: true }), ent({ id: 'b', nome: 'Secreta', ativa: true, oculta: true }), ent({ id: 'c', nome: 'Desligada' })] };
    it('o dono vê só as ligadas e não secretas', () => {
        render(<EntropiaSelo ficha={f} />);
        expect(screen.getByText('Visível')).toBeTruthy();
        expect(screen.queryByText(/Secreta/)).toBeNull();
        expect(screen.queryByText(/Desligada/)).toBeNull();
    });
    it('o Mestre vê as secretas marcadas', () => {
        render(<EntropiaSelo ficha={f} isMestre />);
        expect(screen.getByText(/Secreta/).textContent).toContain('🙈');
    });
    it('sem Entropia ligada não renderiza nada; compacto resume', () => {
        const { container } = render(<EntropiaSelo ficha={{ entropias: [ent()] }} />);
        expect(container.innerHTML).toBe('');
        cleanup();
        render(<EntropiaSelo compacto isMestre ficha={f} />);
        expect(screen.getByText(/Entropia ×2/)).toBeTruthy();
    });
    it('ficha nula não quebra', () => {
        const { container } = render(<EntropiaSelo ficha={null} />);
        expect(container.innerHTML).toBe('');
    });
});

import React from 'react';
import { render, cleanup, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaLivroHost, MapaBarraRapida, ATALHOS_FICHA_NO_MAPA } from './MapaAcessoFichas';
import useStore from '../../stores/useStore';

vi.mock('../../stores/useStore', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, default: vi.fn() };
});
vi.mock('../mestre/LivroEntidade', () => ({
    default: ({ nome, abaInicial, aoFechar }) => <div data-testid="livro" data-nome={nome} data-aba={abaInicial || ''}><button onClick={aoFechar}>fechar-livro</button></div>,
}));
let ctxMapa = null;
vi.mock('./MapaFormContext', () => ({ useMapaForm: () => ctxMapa }));

let state;
function montarEstado(extra = {}) {
    state = {
        isMestre: false, meuNome: 'Lohen', livroEntidadeMapa: null, livroMapaOpcoes: null,
        setLivroEntidadeMapa: vi.fn(), limparFichaPaginaPedida: vi.fn(), abrirLivroNoMapa: vi.fn(), ...extra,
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(state) : state));
}

beforeEach(() => { vi.clearAllMocks(); ctxMapa = { minhaFicha: {}, ordemIniciativa: [] }; });
afterEach(() => cleanup());

describe('MapaLivroHost', () => {
    it('sem ficha pedida não renderiza nada', () => {
        montarEstado();
        const { container } = render(<MapaLivroHost />);
        expect(container.innerHTML).toBe('');
    });
    it('jogador abre a PRÓPRIA ficha, com a aba pedida', async () => {
        montarEstado({ livroEntidadeMapa: 'Lohen', livroMapaOpcoes: { aba: 'grimorio', pagina: null } });
        render(<MapaLivroHost />);
        const livro = await screen.findByTestId('livro');
        expect(livro.getAttribute('data-nome')).toBe('Lohen');
        expect(livro.getAttribute('data-aba')).toBe('grimorio');
    });
    it('jogador NÃO abre a ficha de outro personagem', async () => {
        montarEstado({ livroEntidadeMapa: 'natsu' });
        render(<MapaLivroHost />);
        await new Promise(r => setTimeout(r, 50));
        expect(screen.queryByTestId('livro')).toBeNull();
    });
    it('o Mestre abre a ficha de qualquer um', async () => {
        montarEstado({ isMestre: true, livroEntidadeMapa: 'natsu' });
        render(<MapaLivroHost />);
        expect((await screen.findByTestId('livro')).getAttribute('data-nome')).toBe('natsu');
    });
    it('fechar limpa a ficha aberta e o pedido de página', async () => {
        montarEstado({ livroEntidadeMapa: 'Lohen', livroMapaOpcoes: { aba: 'ficha', pagina: 5 } });
        render(<MapaLivroHost />);
        fireEvent.click(await screen.findByText('fechar-livro'));
        expect(state.setLivroEntidadeMapa).toHaveBeenCalledWith(null);
        expect(state.limparFichaPaginaPedida).toHaveBeenCalled();
    });
});

describe('MapaBarraRapida', () => {
    it('mostra os atalhos e abre a própria ficha na página/aba de cada um', () => {
        montarEstado();
        render(<MapaBarraRapida />);
        ATALHOS_FICHA_NO_MAPA.forEach(a => expect(screen.getByText(new RegExp(a.rotulo))).toBeTruthy());
        fireEvent.click(screen.getByText(/Inventário/));
        expect(state.abrirLivroNoMapa).toHaveBeenCalledWith('Lohen', { aba: 'ficha', pagina: 5 });
        fireEvent.click(screen.getByText(/Grimório/));
        expect(state.abrirLivroNoMapa).toHaveBeenCalledWith('Lohen', { aba: 'grimorio', pagina: null });
        fireEvent.click(screen.getByText(/Combate$/));
        expect(state.abrirLivroNoMapa).toHaveBeenCalledWith('Lohen', { aba: 'ficha', pagina: 8 });
    });
    it('em combate destaca a barra', () => {
        montarEstado();
        ctxMapa = { minhaFicha: {}, ordemIniciativa: [{ id: 'a' }] };
        const { container } = render(<MapaBarraRapida />);
        expect(container.querySelector('.barra-rapida-mapa.em-combate')).not.toBeNull();
        expect(container.querySelector('.barra-rapida-titulo').textContent).toBe('⚔️ Combate');
    });
    it('sem personagem ou sem ficha não renderiza', () => {
        montarEstado({ meuNome: '' });
        expect(render(<MapaBarraRapida />).container.innerHTML).toBe('');
        cleanup();
        montarEstado();
        ctxMapa = { minhaFicha: null, ordemIniciativa: [] };
        expect(render(<MapaBarraRapida />).container.innerHTML).toBe('');
        cleanup();
        ctxMapa = null;
        expect(render(<MapaBarraRapida />).container.innerHTML).toBe('');
    });
});

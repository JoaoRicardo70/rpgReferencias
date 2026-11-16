import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import ComposicaoRacialFicha from './ComposicaoRacialFicha';
import DialogoTematico from './DialogoTematico';
import useStore from '../../stores/useStore';
import * as comp from '../../services/composicaoRacial';

vi.mock('../../services/firebase-sync', () => ({
    salvarDummie: vi.fn(), salvarCamposPersonagem: vi.fn(), salvarFichaSilencioso: vi.fn(),
}));
vi.mock('../../services/composicaoRacial', () => ({ pedirRacaAdquirida: vi.fn(() => ({ ok: true, pedido: { id: 'p1' } })) }));

const RACAS = [
    { id: 'saiyajin', nome: 'Saiyajin', icone: '🐒', apelidos: [], herdaDe: '' },
    { id: 'humano', nome: 'Humano', icone: '🧍', apelidos: [], herdaDe: '' },
    { id: 'elfo', nome: 'Elfo', icone: '🧝', apelidos: [], herdaDe: '' },
];
function preparar(ficha, extra = {}) {
    useStore.setState({ isMestre: false, meuNome: 'Kai', cenario: { racas: RACAS }, minhaFicha: ficha, personagens: {}, ...extra });
}
const fichaMestica = (poderes = [], extraBio = {}) => ({
    bio: { raca: 'Saiyajin', racaId: 'saiyajin', composicaoRacial: [{ racaId: 'saiyajin', percentual: 70, origem: 'nativa' }, { racaId: 'humano', percentual: 30, origem: 'adquirida' }], ...extraBio },
    poderes,
});
beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { cleanup(); useStore.setState({ isMestre: false, cenario: {}, personagens: {} }); });

describe('ComposicaoRacialFicha (jogador)', () => {
    it('mostra Raça principal + Domínio, chips com percentual e selo nativa/adquirida (somente leitura)', () => {
        preparar(fichaMestica());
        render(<ComposicaoRacialFicha />);
        expect(screen.getByText(/Raça principal:/).textContent).toMatch(/Saiyajin.*Domínio 70%/);
        expect(screen.getByText('Domínio 70%')).toBeTruthy();
        expect(screen.getByText('Domínio 30%')).toBeTruthy();
        expect(screen.getByText('🌱 Nativa')).toBeTruthy();
        expect(screen.getByText('🧪 Adquirida')).toBeTruthy();
        expect(screen.queryByRole('textbox')).toBeNull();
        expect(screen.queryByRole('spinbutton')).toBeNull();
    });

    it('dica "definida pelo Mestre" só quando a principal não está na composição explícita', () => {
        preparar(fichaMestica([], { raca: 'Elfo', racaId: 'elfo' }));
        render(<ComposicaoRacialFicha />);
        expect(screen.getByText('Sua composição racial é definida pelo Mestre.')).toBeTruthy();
        cleanup();
        preparar(fichaMestica());
        render(<ComposicaoRacialFicha />);
        expect(screen.queryByText('Sua composição racial é definida pelo Mestre.')).toBeNull();
    });

    it('sem composição explícita mostra a Raça principal a 100%', () => {
        preparar({ bio: { raca: 'Humano', racaId: 'humano' }, poderes: [] });
        render(<ComposicaoRacialFicha />);
        expect(screen.getByText('Domínio 100%', { selector: '.composicao-chip-dominio' })).toBeTruthy();
    });

    it('sem poder de DNA NÃO mostra o botão de pedir Raça', () => {
        preparar(fichaMestica([{ id: 1, nome: 'Soco' }]));
        render(<ComposicaoRacialFicha />);
        expect(screen.queryByRole('button', { name: /Pedir nova Raça/ })).toBeNull();
    });

    it('com poder de DNA mostra o botão; o modal só lista Raças ainda não possuídas e envia o pedido', () => {
        preparar(fichaMestica([{ id: 1, nome: 'Absorção', manipulaDNA: true }]));
        render(<ComposicaoRacialFicha />);
        fireEvent.click(screen.getByRole('button', { name: /Pedir nova Raça/ }));
        const dialogo = screen.getByRole('dialog');
        expect(dialogo.getAttribute('aria-modal')).toBe('true');
        const opcoes = [...screen.getByLabelText('Raça desejada').querySelectorAll('option')].map(o => o.value);
        expect(opcoes).toEqual(['', 'elfo']);
        fireEvent.change(screen.getByLabelText('Raça desejada'), { target: { value: 'elfo' } });
        fireEvent.change(screen.getByLabelText('Motivo do pedido'), { target: { value: 'Absorvi o DNA do elfo' } });
        fireEvent.click(screen.getByRole('button', { name: 'Enviar pedido' }));
        expect(comp.pedirRacaAdquirida).toHaveBeenCalledWith('elfo', 'Absorvi o DNA do elfo');
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(screen.getByRole('status').textContent).toMatch(/Pedido enviado ao Mestre/);
    });

    it('erro do serviço aparece no modal; Esc cancela', () => {
        preparar(fichaMestica([{ id: 1, nome: 'Absorção', manipulaDNA: true }]));
        comp.pedirRacaAdquirida.mockReturnValueOnce({ ok: false, mensagem: 'Muitos pedidos pendentes: aguarde o Mestre.' });
        render(<ComposicaoRacialFicha />);
        fireEvent.click(screen.getByRole('button', { name: /Pedir nova Raça/ }));
        fireEvent.change(screen.getByLabelText('Raça desejada'), { target: { value: 'elfo' } });
        fireEvent.click(screen.getByRole('button', { name: 'Enviar pedido' }));
        expect(screen.getByRole('alert').textContent).toMatch(/Muitos pedidos/);
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('enviar sem escolher Raça pede para escolher e não chama o serviço', () => {
        preparar(fichaMestica([{ id: 1, nome: 'Absorção', manipulaDNA: true }]));
        render(<ComposicaoRacialFicha />);
        fireEvent.click(screen.getByRole('button', { name: /Pedir nova Raça/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Enviar pedido' }));
        expect(screen.getByRole('alert').textContent).toMatch(/Escolha a Raça/);
        expect(comp.pedirRacaAdquirida).not.toHaveBeenCalled();
    });

    it('lista os pedidos pendentes do jogador e tira a Raça já pedida das opções', () => {
        preparar(fichaMestica([{ id: 1, nome: 'Absorção', manipulaDNA: true }], { pedidosRaca: [{ id: 'p1', racaId: 'elfo', motivo: 'DNA', ts: 1 }] }));
        render(<ComposicaoRacialFicha />);
        expect(screen.getByRole('list', { name: 'Seus pedidos de Raça pendentes' }).textContent).toMatch(/Elfo.*aguardando o Mestre/);
        fireEvent.click(screen.getByRole('button', { name: /Pedir nova Raça/ }));
        expect([...screen.getByLabelText('Raça desejada').querySelectorAll('option')].map(o => o.value)).toEqual(['']);
    });

    it('sem catálogo de Raças não renderiza nada', () => {
        preparar(fichaMestica(), { cenario: {} });
        const { container } = render(<ComposicaoRacialFicha />);
        expect(container.innerHTML).toBe('');
    });
});

describe('DialogoTematico', () => {
    it('role=dialog, foco inicial no primeiro controle (ou marcado), Esc e fundo cancelam', () => {
        const fechar = vi.fn();
        render(<DialogoTematico titulo="Teste" aoFechar={fechar} acoes={<><button type="button">A</button><button type="button" data-foco-inicial>B</button></>} />);
        const d = screen.getByRole('dialog', { name: 'Teste' });
        expect(d).toBeTruthy();
        expect(document.activeElement.textContent).toBe('B');
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(fechar).toHaveBeenCalledTimes(1);
        fireEvent.mouseDown(d.parentElement);
        expect(fechar).toHaveBeenCalledTimes(2);
    });
});

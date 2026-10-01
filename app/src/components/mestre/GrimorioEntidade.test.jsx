import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('firebase/database', () => ({ ref: vi.fn((db, p) => p), onValue: vi.fn(), set: vi.fn(), get: vi.fn() }));
vi.mock('../../services/firebase-config', () => ({ db: {}, functions: {}, auth: {} }));
vi.mock('../../services/firebase-sync', () => ({ salvarFichaSilencioso: vi.fn(), salvarDummie: vi.fn() }));
// Stub: expõe as props recebidas.
vi.mock('./MestrePedidosSexta', () => ({
    PedidosNaFicha: ({ nome, aba, pedidoFocoId }) => (
        <div data-testid="pedidos-na-ficha" data-nome={nome} data-aba={aba} data-foco={pedidoFocoId ?? ''} />
    ),
}));

import GrimorioEntidade from './GrimorioEntidade';
import useStore from '../../stores/useStore';

const ped = (tipo, objeto, over = {}) => ({ tipo, alvo: 'Ana', solicitante: 'Ana', em: 1000, avisos: [], objeto, ...over });
const jog = (ficha = {}, over = {}) => ({ nome: 'Ana', classId: 'guerreiro', ficha, ...over });
const abaBtn = (nome) => screen.getByRole('tab', { name: new RegExp(nome) });

beforeEach(() => {
    useStore.setState({ sextaFeiraPendentes: {} });
});
afterEach(() => { cleanup(); document.body.innerHTML = ''; vi.clearAllMocks(); });

describe('GrimorioEntidade > portal', () => {
    it('renderiza em document.body e fora do container', () => {
        const { container } = render(<GrimorioEntidade jogador={jog()} aoFechar={vi.fn()} />);
        expect(container.innerHTML).toBe('');
        expect(document.body.querySelector('.grimorio-mestre')).not.toBeNull();
        expect(container.querySelector('.grimorio-mestre')).toBeNull();
        expect(screen.getByText('📖 GRIMÓRIO: Ana', { exact: false })).toBeDefined();
    });
    it('sem jogador não renderiza nada', () => {
        render(<GrimorioEntidade jogador={null} aoFechar={vi.fn()} />);
        expect(document.body.querySelector('.grimorio-mestre')).toBeNull();
    });
});

describe('GrimorioEntidade > abas e contagens', () => {
    const ficha = {
        poderes: [
            { nome: 'Hab1', categoria: 'habilidade' }, { nome: 'Hab2', categoria: 'habilidade' },
            { nome: 'Pod1' }, { nome: 'Forma1', categoria: 'forma' },
        ],
        ataquesElementais: [{ nome: 'Bola', elemento: 'Fogo' }],
        inventario: [{ nome: 'Espada' }, { nome: 'Poção' }, null],
        dominios: { Fogo: { nivel: 3 }, lixo: { x: 1 } },
    };
    it('mostra as seis abas com contagens', () => {
        render(<GrimorioEntidade jogador={jog(ficha)} aoFechar={vi.fn()} />);
        expect(abaBtn('Habilidades').textContent).toContain('(2)');
        expect(abaBtn('Poderes').textContent).toContain('(1)');
        expect(abaBtn('Formas').textContent).toContain('(1)');
        expect(abaBtn('Técnicas Elementais').textContent).toContain('(1)');
        expect(abaBtn('Inventário').textContent).toContain('(2)');
        expect(abaBtn('Domínios').textContent).toContain('(1)');
    });
    it('aba inicial: primeira não vazia entre habilidade/poder/forma', () => {
        render(<GrimorioEntidade jogador={jog({ poderes: [{ nome: 'F', categoria: 'forma' }] })} aoFechar={vi.fn()} />);
        expect(abaBtn('Formas').getAttribute('aria-selected')).toBe('true');
        expect(screen.getByText('F')).toBeDefined();
    });
    it('aba inicial sem nada: habilidade', () => {
        render(<GrimorioEntidade jogador={jog()} aoFechar={vi.fn()} />);
        expect(abaBtn('Habilidades').getAttribute('aria-selected')).toBe('true');
        expect(screen.getByText('Nenhuma Habilidade registrada.')).toBeDefined();
    });
    it('clicar nas abas mostra os cartões', () => {
        render(<GrimorioEntidade jogador={jog({
            ...ficha,
            poderes: [{ nome: 'Hab1', categoria: 'habilidade', descricao: 'Desc A', dadosQtd: 2, dadosFaces: 6, custoPercentual: 10, efeitos: [{ atributo: 'forca', propriedade: 'mgeral', valor: 2 }] }, { nome: 'Pod1' }],
            inventario: [{ nome: 'Espada', equipado: true }, { nome: 'Poção' }],
        })} aoFechar={vi.fn()} />);
        expect(screen.getByText('Hab1')).toBeDefined();
        expect(screen.getByText('"Desc A"')).toBeDefined();
        expect(screen.getByText(/2d6/)).toBeDefined();
        expect(screen.getByText(/10% das energias/)).toBeDefined();
        expect(screen.getByText(/\[FORCA\] MGERAL: \+2/)).toBeDefined();
        fireEvent.click(abaBtn('Poderes'));
        expect(screen.getByText('Pod1')).toBeDefined();
        fireEvent.click(abaBtn('Inventário'));
        expect(screen.getByText('Equipado')).toBeDefined();
        expect(screen.getByText('Na mochila')).toBeDefined();
        fireEvent.click(abaBtn('Domínios'));
        expect(screen.getByText('Fogo')).toBeDefined();
        expect(screen.getByText(/Nv 3/)).toBeDefined();
    });
    it('técnicas agrupadas por elemento com domínio', () => {
        render(<GrimorioEntidade jogador={jog({
            ataquesElementais: [{ nome: 'Bola', elemento: 'Fogo' }, { nome: 'Sem elem' }],
            dominios: { Fogo: { nivel: 4 } },
        })} aoFechar={vi.fn()} />);
        fireEvent.click(abaBtn('Técnicas Elementais'));
        expect(screen.getByText(/Pergaminhos de Fogo/)).toBeDefined();
        expect(screen.getByText(/Pergaminhos de Neutro/)).toBeDefined();
        expect(screen.getByText(/Domínio de Fogo: Nv\. 4/)).toBeDefined();
        expect(screen.getByText(/Domínio de Neutro: nenhum/)).toBeDefined();
    });
    it('sem técnicas / sem itens / sem domínios mostra vazio', () => {
        render(<GrimorioEntidade jogador={jog()} aoFechar={vi.fn()} />);
        fireEvent.click(abaBtn('Técnicas Elementais'));
        expect(screen.getByText('Nenhuma Técnica Elemental.')).toBeDefined();
        fireEvent.click(abaBtn('Inventário'));
        expect(screen.getByText(/relicário/)).toBeDefined();
        fireEvent.click(abaBtn('Domínios'));
        expect(screen.getByText('Nenhum Domínio registrado.')).toBeDefined();
    });
    it('Formas são agrupadas por pasta e a pasta pode ser recolhida', () => {
        render(<GrimorioEntidade jogador={jog({ poderes: [
            { nome: 'F1', categoria: 'forma', pasta: 'Bestial' }, { nome: 'F2', categoria: 'forma' },
        ] })} aoFechar={vi.fn()} />);
        const titulo = screen.getByRole('button', { name: /Bestial/ });
        expect(screen.getByText('F1')).toBeDefined();
        expect(screen.getByRole('button', { name: /Sem Pasta/ })).toBeDefined();
        fireEvent.click(titulo);
        expect(screen.queryByText('F1')).toBeNull();
        expect(screen.getByText('F2')).toBeDefined();
        fireEvent.click(titulo);
        expect(screen.getByText('F1')).toBeDefined();
    });
});

describe('GrimorioEntidade > pedidos pendentes', () => {
    it('aba inicial é a do pedido em foco e repassa props ao PedidosNaFicha', () => {
        useStore.setState({ sextaFeiraPendentes: { p1: ped('item', { nome: 'Anel' }) } });
        render(<GrimorioEntidade jogador={jog({ poderes: [{ nome: 'H' }] })} pedidoFocoId="p1" aoFechar={vi.fn()} />);
        expect(abaBtn('Inventário').getAttribute('aria-selected')).toBe('true');
        const el = screen.getByTestId('pedidos-na-ficha');
        expect(el.getAttribute('data-nome')).toBe('Ana');
        expect(el.getAttribute('data-aba')).toBe('inventario');
        expect(el.getAttribute('data-foco')).toBe('p1');
    });
    it('badge de pendente conta pedidos por aba só deste jogador', () => {
        useStore.setState({ sextaFeiraPendentes: {
            a: ped('item', { nome: 'I1' }), b: ped('item', { nome: 'I2' }),
            c: ped('magia', { nome: 'M1' }),
            d: ped('item', { nome: 'I3' }, { alvo: 'Beto', solicitante: 'Beto' }),
        } });
        render(<GrimorioEntidade jogador={jog()} aoFechar={vi.fn()} />);
        expect(abaBtn('Inventário').textContent).toContain('⏳2');
        expect(abaBtn('Técnicas Elementais').textContent).toContain('⏳1');
        expect(abaBtn('Habilidades').textContent).not.toContain('⏳');
    });
    it('pedido de poder cai na aba da categoria', () => {
        useStore.setState({ sextaFeiraPendentes: { a: ped('poder', { nome: 'Forma X', categoria: 'forma' }) } });
        render(<GrimorioEntidade jogador={jog()} pedidoFocoId="a" aoFechar={vi.fn()} />);
        expect(abaBtn('Formas').textContent).toContain('⏳1');
        expect(abaBtn('Formas').getAttribute('aria-selected')).toBe('true');
    });
    it('foco inexistente cai no padrão', () => {
        render(<GrimorioEntidade jogador={jog()} pedidoFocoId="nada" aoFechar={vi.fn()} />);
        expect(abaBtn('Habilidades').getAttribute('aria-selected')).toBe('true');
    });
});

describe('GrimorioEntidade > fechar', () => {
    it('Esc chama aoFechar', () => {
        const fechar = vi.fn();
        render(<GrimorioEntidade jogador={jog()} aoFechar={fechar} />);
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(fechar).toHaveBeenCalledTimes(1);
    });
    it('outras teclas não fecham', () => {
        const fechar = vi.fn();
        render(<GrimorioEntidade jogador={jog()} aoFechar={fechar} />);
        fireEvent.keyDown(document, { key: 'Enter' });
        expect(fechar).not.toHaveBeenCalled();
    });
    it('Esc não fecha com .sexta-modal-fundo no documento', () => {
        const fechar = vi.fn();
        const modal = document.createElement('div');
        modal.className = 'sexta-modal-fundo';
        document.body.appendChild(modal);
        render(<GrimorioEntidade jogador={jog()} aoFechar={fechar} />);
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(fechar).not.toHaveBeenCalled();
    });
    it('mousedown no fundo fecha; no conteúdo não', () => {
        const fechar = vi.fn();
        render(<GrimorioEntidade jogador={jog()} aoFechar={fechar} />);
        fireEvent.mouseDown(screen.getByRole('dialog'));
        expect(fechar).not.toHaveBeenCalled();
        fireEvent.mouseDown(document.body.querySelector('.grimorio-mestre-fundo'));
        expect(fechar).toHaveBeenCalledTimes(1);
    });
    it('botão de fechar chama aoFechar', () => {
        const fechar = vi.fn();
        render(<GrimorioEntidade jogador={jog()} aoFechar={fechar} />);
        fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
        expect(fechar).toHaveBeenCalledTimes(1);
    });
    it('remove o listener de Esc ao desmontar', () => {
        const fechar = vi.fn();
        const { unmount } = render(<GrimorioEntidade jogador={jog()} aoFechar={fechar} />);
        unmount();
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(fechar).not.toHaveBeenCalled();
    });
    it('sem aoFechar não quebra', () => {
        render(<GrimorioEntidade jogador={jog()} />);
        expect(() => { fireEvent.keyDown(document, { key: 'Escape' }); fireEvent.click(screen.getByRole('button', { name: 'Fechar' })); }).not.toThrow();
    });
});

describe('GrimorioEntidade > ficha malformada', () => {
    it('campos como objeto/string não quebram', () => {
        const ficha = {
            poderes: 'lixo', ataquesElementais: 5, inventario: 'x', dominios: 'y',
            avatar: { base: { a: 1 } }, forca: { base: { x: 1 } },
        };
        expect(() => render(<GrimorioEntidade jogador={jog(ficha, { classId: { a: 1 } })} aoFechar={vi.fn()} />)).not.toThrow();
        expect(screen.getByText('Classe: MUNDANO')).toBeDefined();
        expect(screen.getByText('Sem Foto')).toBeDefined();
        for (const n of ['Poderes', 'Formas', 'Técnicas Elementais', 'Inventário', 'Domínios']) {
            fireEvent.click(abaBtn(n));
        }
    });
    it('cartões com campos de texto como objeto não quebram', () => {
        const ficha = {
            poderes: [{ nome: { a: 1 }, descricao: { b: 1 }, alcance: {}, categoria: 'forma', efeitos: 'x' }],
            ataquesElementais: [{ nome: {}, elemento: { x: 1 }, descricao: {} }],
            inventario: [{ nome: {}, tipo: {}, raridade: {} }],
        };
        render(<GrimorioEntidade jogador={jog(ficha)} aoFechar={vi.fn()} />);
        for (const n of ['Técnicas Elementais', 'Inventário']) fireEvent.click(abaBtn(n));
        expect(screen.getByText('Item desconhecido')).toBeDefined();
    });
    it('avatar string válido vira imagem', () => {
        render(<GrimorioEntidade jogador={jog({ avatar: { base: 'http://x/a.png' } })} aoFechar={vi.fn()} />);
        expect(screen.getByAltText('Avatar').getAttribute('src')).toBe('http://x/a.png');
    });
});

import React from 'react';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaAtalhoAtaques } from './MapaCombate';
import useStore from '../../stores/useStore';

// QA - abas do Livro do atalho (ataques / tecnicas / elementais).
let ataqueCtx;
let poderesCtx;
let elemCtx;
vi.mock('../combate/AtaqueFormContext', () => ({ useAtaqueForm: () => ataqueCtx }));
vi.mock('../poderes/PoderesFormContext', () => ({ usePoderesForm: () => poderesCtx }));
vi.mock('../arsenal/ElementosFormContext', () => ({ useElementosForm: () => elemCtx, emogis: {}, cores: {} }));
vi.mock('../arsenal/ArsenalFormContext', () => ({ useArsenalForm: () => null }));
vi.mock('./MapaFormContext', () => ({ useMapaForm: () => null, urlSeguraParaCss: (u) => u, calcularCA: () => 10 }));
vi.mock('../../stores/useStore');

const SALVO = { id: 1, nome: 'Combo', config: { armaStatusUsados: ['forca'], poderesIds: [], magiasIds: [] } };
const PODERES = [
    { id: 'p1', nome: 'Golpe Rapido', ativa: true, categoria: 'poder' },
    { id: 'p2', nome: 'Escudo Etereo', ativa: false, categoria: 'poder' },
    { id: 'p3', nome: 'Modo Furia', ativa: true, categoria: 'habilidade' }
];
const MAGIAS = [
    { id: 'm1', nome: 'Bola de Fogo', elemento: 'Fogo', equipado: true },
    { id: 'm2', nome: 'Jato Dagua', elemento: 'Agua', equipado: false }
];

let storeState;
let rolarAtaqueSalvo, rolarDanoCustomizado, togglePoder, toggleEquiparElem;

function fichaDe(salvos, poderes, magias) {
    return { poderes, ataquesElementais: magias, ataqueConfig: { ataquesSalvos: salvos } };
}
function aplicarFicha(ficha, { comPoderesCtx = true, comElemCtx = true } = {}) {
    ataqueCtx = {
        minhaFicha: ficha, podeRolarDano: true, ignorarTravaAcerto: false, dummieAlvo: null,
        poderesAtivos: [], magiasOfensivas: [], armaEquipada: null, rolarAtaqueSalvo, rolarDanoCustomizado
    };
    poderesCtx = comPoderesCtx ? { minhaFicha: ficha, togglePoder, mudarEstagioPoder: vi.fn() } : null;
    elemCtx = comElemCtx ? { minhaFicha: ficha, toggleEquiparElem } : null;
}
function montar({ salvos = [SALVO], poderes = PODERES, magias = MAGIAS, ...ctxOpts } = {}) {
    aplicarFicha(fichaDe(salvos, poderes, magias), ctxOpts);
    return render(<MapaAtalhoAtaques />);
}
const botao = () => screen.queryByTitle('Atalho dos Ataques Salvos');
const abrir = () => fireEvent.click(botao());
const abas = () => screen.queryAllByRole('tab');
const aba = (txt) => abas().find(a => a.textContent.includes(txt));
const fundo = () => document.querySelector('.livro-entidade-fundo');

beforeEach(() => {
    rolarAtaqueSalvo = vi.fn(); rolarDanoCustomizado = vi.fn(); togglePoder = vi.fn(); toggleEquiparElem = vi.fn();
    storeState = { pastasFechadasMapaTecnicas: {}, setPastasFechadasMapaTecnicas: vi.fn() };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(storeState) : storeState));
});
afterEach(() => cleanup());

describe('abas do Livro - visibilidade e contador', () => {
    it('mostra as tres abas quando ha ataques, tecnicas e elementais', () => {
        montar(); abrir();
        expect(abas()).toHaveLength(3);
        expect(aba('Ataques Salvos')).toBeTruthy();
        expect(aba('Habilidades')).toBeTruthy();
        expect(aba('Técnicas Elementais')).toBeTruthy();
    });

    it('contadores: ataques mostra total; tecnicas e elementais mostram ★ ligadas/total', () => {
        montar(); abrir();
        expect(aba('Ataques Salvos').querySelector('small').textContent).toBe('1');
        expect(aba('Habilidades').querySelector('small').textContent).toBe('★ 2/3');
        expect(aba('Técnicas Elementais').querySelector('small').textContent).toBe('★ 1/2');
    });

    it('sem ataques salvos some a aba de ataques', () => {
        montar({ salvos: [] }); abrir();
        expect(abas()).toHaveLength(2);
        expect(aba('Ataques Salvos')).toBeUndefined();
    });

    it('sem tecnicas some a aba de tecnicas', () => {
        montar({ poderes: [] }); abrir();
        expect(aba('Habilidades')).toBeUndefined();
        expect(abas()).toHaveLength(2);
    });

    it('sem elementais some a aba de elementais', () => {
        montar({ magias: [] }); abrir();
        expect(aba('Técnicas Elementais')).toBeUndefined();
    });

    it('sem contexto de Poderes a aba de tecnicas nao aparece mesmo com poderes na ficha', () => {
        montar({ comPoderesCtx: false }); abrir();
        expect(aba('Habilidades')).toBeUndefined();
        expect(aba('Técnicas Elementais')).toBeTruthy();
    });

    it('sem contexto de Elementos a aba de elementais nao aparece', () => {
        montar({ comElemCtx: false }); abrir();
        expect(aba('Técnicas Elementais')).toBeUndefined();
        expect(aba('Habilidades')).toBeTruthy();
    });

    it('ignora entradas nulas nas listas ao contar', () => {
        montar({ poderes: [null, PODERES[0]], magias: [null, MAGIAS[0]] }); abrir();
        expect(aba('Habilidades').querySelector('small').textContent).toBe('★ 1/1');
        expect(aba('Técnicas Elementais').querySelector('small').textContent).toBe('★ 1/1');
    });

    it('abre na aba de ataques por padrao (aria-selected)', () => {
        montar(); abrir();
        expect(aba('Ataques Salvos').getAttribute('aria-selected')).toBe('true');
        expect(aba('Habilidades').getAttribute('aria-selected')).toBe('false');
    });
});

describe('abas do Livro - troca de corpo', () => {
    it('aba de tecnicas lista as tecnicas e clicar chama togglePoder', () => {
        montar(); abrir();
        fireEvent.click(aba('Habilidades'));
        expect(aba('Habilidades').getAttribute('aria-selected')).toBe('true');
        expect(screen.queryByText(/USAR/)).toBeNull();
        const corpo = document.querySelector('.livro-entidade-corpo');
        fireEvent.click(within(corpo).getByText(/Escudo Etereo/));
        expect(togglePoder).toHaveBeenCalledTimes(1);
        expect(togglePoder).toHaveBeenCalledWith('p2');
        expect(rolarAtaqueSalvo).not.toHaveBeenCalled();
    });

    it('aba de elementais lista as magias e clicar chama toggleEquiparElem', () => {
        montar(); abrir();
        fireEvent.click(aba('Técnicas Elementais'));
        const corpo = document.querySelector('.livro-entidade-corpo');
        fireEvent.click(within(corpo).getByText(/Jato Dagua/));
        expect(toggleEquiparElem).toHaveBeenCalledWith('m2');
        expect(togglePoder).not.toHaveBeenCalled();
    });

    it('voltar para a aba de ataques mostra as cartas de novo', () => {
        montar(); abrir();
        fireEvent.click(aba('Habilidades'));
        fireEvent.click(aba('Ataques Salvos'));
        expect(screen.getByText(/USAR/)).toBeTruthy();
        expect(screen.queryByText(/Escudo Etereo/)).toBeNull();
    });

    it('usar tecnica nao fecha o livro', () => {
        montar(); abrir();
        fireEvent.click(aba('Habilidades'));
        fireEvent.click(screen.getByText(/Golpe Rapido/));
        expect(fundo()).not.toBeNull();
    });
});

describe('abas do Livro - teclas 1-9', () => {
    it('na aba de ataques a tecla 1 executa o ataque', () => {
        montar(); abrir();
        fireEvent.keyDown(document, { key: '1' });
        expect(rolarAtaqueSalvo).toHaveBeenCalledWith(SALVO);
    });

    it('na aba de tecnicas a tecla 1 nao executa ataque', () => {
        montar(); abrir();
        fireEvent.click(aba('Habilidades'));
        fireEvent.keyDown(document, { key: '1' });
        expect(rolarAtaqueSalvo).not.toHaveBeenCalled();
        expect(rolarDanoCustomizado).not.toHaveBeenCalled();
        expect(fundo()).not.toBeNull();
    });

    it('na aba de elementais as teclas 1-9 nao executam ataque', () => {
        montar(); abrir();
        fireEvent.click(aba('Técnicas Elementais'));
        for (const k of ['1', '2', '5', '9']) fireEvent.keyDown(document, { key: k });
        expect(rolarAtaqueSalvo).not.toHaveBeenCalled();
        expect(fundo()).not.toBeNull();
    });

    it('Esc ainda fecha o livro nas abas de tecnicas', () => {
        montar(); abrir();
        fireEvent.click(aba('Habilidades'));
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(fundo()).toBeNull();
    });

    it('voltando para a aba de ataques a tecla volta a funcionar', () => {
        montar(); abrir();
        fireEvent.click(aba('Habilidades'));
        fireEvent.click(aba('Ataques Salvos'));
        fireEvent.keyDown(document, { key: '1' });
        expect(rolarAtaqueSalvo).toHaveBeenCalledTimes(1);
    });
});

describe('botao flutuante sem ataques salvos', () => {
    it('existe so com tecnicas, sem contagem, e abre direto na aba de tecnicas', () => {
        montar({ salvos: [], magias: [] });
        expect(botao()).not.toBeNull();
        expect(botao().textContent.trim()).toBe('⚔️');
        abrir();
        expect(abas()).toHaveLength(1);
        expect(aba('Habilidades').getAttribute('aria-selected')).toBe('true');
        expect(screen.getByText(/Escudo Etereo/)).toBeTruthy();
    });

    it('existe so com elementais e abre direto na aba de elementais', () => {
        montar({ salvos: [], poderes: [] });
        abrir();
        expect(aba('Técnicas Elementais').getAttribute('aria-selected')).toBe('true');
        expect(screen.getByText(/Bola de Fogo/)).toBeTruthy();
    });

    it('com ataques salvos o botao mostra a contagem', () => {
        montar();
        expect(botao().textContent).toContain('1');
    });

    it('sem nenhum conteudo o botao nao existe', () => {
        montar({ salvos: [], poderes: [], magias: [] });
        expect(botao()).toBeNull();
    });

    it('sem ataques e sem contexto de Poderes/Elementos nao renderiza nada', () => {
        montar({ salvos: [], comPoderesCtx: false, comElemCtx: false });
        expect(botao()).toBeNull();
    });
});

describe('aba ativa que some', () => {
    it('cai na primeira aba existente quando a aba de tecnicas fica vazia', () => {
        const { rerender } = montar(); abrir();
        fireEvent.click(aba('Habilidades'));
        aplicarFicha(fichaDe([SALVO], [], MAGIAS));
        rerender(<MapaAtalhoAtaques />);
        expect(aba('Habilidades')).toBeUndefined();
        expect(aba('Ataques Salvos').getAttribute('aria-selected')).toBe('true');
        expect(screen.getByText(/USAR/)).toBeTruthy();
    });

    it('sem ataques, cai de tecnicas para a primeira restante (elementais)', () => {
        const { rerender } = montar({ salvos: [] }); abrir();
        fireEvent.click(aba('Habilidades'));
        aplicarFicha(fichaDe([], [], MAGIAS));
        rerender(<MapaAtalhoAtaques />);
        expect(abas()).toHaveLength(1);
        expect(aba('Técnicas Elementais').getAttribute('aria-selected')).toBe('true');
    });

    it('o livro fecha quando nao sobra conteudo', () => {
        const { rerender } = montar(); abrir();
        aplicarFicha(fichaDe([], [], []));
        rerender(<MapaAtalhoAtaques />);
        expect(fundo()).toBeNull();
        expect(botao()).toBeNull();
    });

    it('apos o conteudo voltar o livro nao reabre sozinho', () => {
        const { rerender } = montar(); abrir();
        aplicarFicha(fichaDe([], [], []));
        rerender(<MapaAtalhoAtaques />);
        aplicarFicha(fichaDe([SALVO], PODERES, MAGIAS));
        rerender(<MapaAtalhoAtaques />);
        expect(botao()).not.toBeNull();
        expect(fundo()).toBeNull();
    });
});

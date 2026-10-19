import React from 'react';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaAtalhoAtaques } from './MapaCombate';
import useStore from '../../stores/useStore';

// QA - estrutura DOM do Livro do atalho (capa / barra / miolo / paginas / rodape).
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
const PODERES = [{ id: 'p1', nome: 'Golpe Rapido', ativa: true, categoria: 'poder' }];
const MAGIAS = [{ id: 'm1', nome: 'Bola de Fogo', elemento: 'Fogo', equipado: true }];

beforeEach(() => {
    const ficha = { poderes: PODERES, ataquesElementais: MAGIAS, ataqueConfig: { ataquesSalvos: [SALVO] } };
    ataqueCtx = {
        minhaFicha: ficha, podeRolarDano: true, ignorarTravaAcerto: false, dummieAlvo: null,
        poderesAtivos: [], magiasOfensivas: [], armaEquipada: null,
        rolarAtaqueSalvo: vi.fn(), rolarDanoCustomizado: vi.fn()
    };
    poderesCtx = { minhaFicha: ficha, togglePoder: vi.fn(), mudarEstagioPoder: vi.fn() };
    elemCtx = { minhaFicha: ficha, toggleEquiparElem: vi.fn() };
    const storeState = { pastasFechadasMapaTecnicas: {}, setPastasFechadasMapaTecnicas: vi.fn() };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(storeState) : storeState));
    render(<MapaAtalhoAtaques />);
    fireEvent.click(screen.getByTitle('Atalho dos Ataques Salvos'));
});
afterEach(() => cleanup());

const q = (sel, raiz = document) => raiz.querySelector(sel);
const aba = (txt) => screen.getAllByRole('tab').find(a => a.textContent.includes(txt));

describe('estrutura do Livro', () => {
    it('(a) hierarquia fundo > capa > (barra, miolo > tabpanel, rodape)', () => {
        const fundo = q('.livro-entidade-fundo.atalho-livro-fundo');
        expect(fundo).not.toBeNull();
        const capa = q('.atalho-livro-capa', fundo);
        expect(capa).not.toBeNull();
        expect(capa.parentElement).toBe(fundo);
        const barra = q('.livro-entidade-barra.atalho-livro-barra', capa);
        expect(barra.parentElement).toBe(capa);
        const miolo = q('.atalho-livro-miolo', capa);
        expect(miolo.parentElement).toBe(capa);
        const painel = screen.getByRole('tabpanel');
        expect(painel.classList.contains('livro-entidade-corpo')).toBe(true);
        expect(painel.classList.contains('atalho-livro-paginas')).toBe(true);
        expect(painel.parentElement).toBe(miolo);
        const rodape = q('.atalho-livro-rodape', capa);
        expect(rodape.parentElement).toBe(capa);
        expect(miolo.contains(rodape)).toBe(false);
        expect(q('.atalho-livro-marcadores', barra).parentElement).toBe(barra);
    });

    it('(b) marcador ativo tem classe ativa e aria-selected; trocar move a classe', () => {
        const marcadores = screen.getAllByRole('tab');
        expect(marcadores).toHaveLength(3);
        marcadores.forEach(m => {
            expect(m.classList.contains('atalho-livro-marcador')).toBe(true);
            expect(m.parentElement.classList.contains('atalho-livro-marcadores')).toBe(true);
        });
        const estado = () => marcadores.map(m => [m.classList.contains('ativa'), m.getAttribute('aria-selected')]);
        expect(estado()).toEqual([[true, 'true'], [false, 'false'], [false, 'false']]);
        fireEvent.click(aba('Habilidades'));
        expect(estado()).toEqual([[false, 'false'], [true, 'true'], [false, 'false']]);
        fireEvent.click(aba('Técnicas Elementais'));
        expect(estado()).toEqual([[false, 'false'], [false, 'false'], [true, 'true']]);
        expect(document.querySelectorAll('.atalho-livro-marcador.ativa')).toHaveLength(1);
    });

    it('(c) titulo existe e botao de fechar fica na barra', () => {
        const barra = q('.atalho-livro-barra');
        const titulo = q('h2.atalho-livro-titulo', barra);
        expect(titulo.textContent).toContain('Livro de Combate');
        const fechar = within(barra).getByRole('button', { name: /FECHAR LIVRO/ });
        expect(fechar.parentElement).toBe(barra);
        fireEvent.click(fechar);
        expect(q('.livro-entidade-fundo')).toBeNull();
    });

    it('(d) conteudo de tecnicas e elementais fica em .atalho-livro-modulo dentro do tabpanel', () => {
        fireEvent.click(aba('Habilidades'));
        let painel = screen.getByRole('tabpanel');
        let modulo = q('.atalho-livro-modulo', painel);
        expect(modulo).not.toBeNull();
        expect(modulo.parentElement).toBe(painel);
        expect(within(modulo).getByText(/Golpe Rapido/)).toBeTruthy();

        fireEvent.click(aba('Técnicas Elementais'));
        painel = screen.getByRole('tabpanel');
        modulo = q('.atalho-livro-modulo', painel);
        expect(modulo).not.toBeNull();
        expect(modulo.parentElement).toBe(painel);
        expect(within(modulo).getByText(/Bola de Fogo/)).toBeTruthy();
        expect(painel.querySelectorAll('.atalho-livro-modulo')).toHaveLength(1);
    });

    it('(e) rodape tem aria-hidden="true"', () => {
        expect(q('.atalho-livro-rodape').getAttribute('aria-hidden')).toBe('true');
    });
});

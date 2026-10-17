import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaAtalhoAtaques } from './MapaCombate';

let ctx;
vi.mock('../combate/AtaqueFormContext', () => ({ useAtaqueForm: () => ctx }));
vi.mock('../../stores/useStore');
vi.mock('../poderes/PoderesFormContext', () => ({ usePoderesForm: () => null }));
vi.mock('../arsenal/ArsenalFormContext', () => ({ useArsenalForm: () => null }));
vi.mock('../arsenal/ElementosFormContext', () => ({ useElementosForm: () => null, emogis: {}, cores: {} }));
vi.mock('./MapaFormContext', () => ({ useMapaForm: () => null, urlSeguraParaCss: (u) => u, calcularCA: () => 10 }));

const salvos = (n) => Array.from({ length: n }, (_, i) => ({ id: i + 1, nome: 'Atk' + (i + 1), config: {} }));
const montar = (ataqueConfig, extra = {}) => {
    ctx = {
        minhaFicha: { ataqueConfig },
        podeRolarDano: true, ignorarTravaAcerto: false, dummieAlvo: null,
        rolarAtaqueSalvo: vi.fn(), rolarDanoCustomizado: vi.fn(), ...extra
    };
    return render(<div data-testid="host"><MapaAtalhoAtaques /></div>);
};
const abrir = () => fireEvent.click(screen.getByTitle('Atalho dos Ataques Salvos'));

afterEach(() => cleanup());
beforeEach(() => vi.clearAllMocks());

describe('MapaAtalhoAtaques - modificadores e repeat', () => {
    it.each([['ctrlKey'], ['altKey'], ['metaKey']])('%s + 1 NAO executa o slot', (mod) => {
        montar({ ataquesSalvos: salvos(2) });
        abrir();
        fireEvent.keyDown(document, { key: '1', [mod]: true });
        expect(ctx.rolarAtaqueSalvo).not.toHaveBeenCalled();
        expect(screen.getByText('Atk1')).toBeTruthy();
    });

    it('tecla repetida (repeat) NAO executa', () => {
        montar({ ataquesSalvos: salvos(2) });
        abrir();
        fireEvent.keyDown(document, { key: '1', repeat: true });
        expect(ctx.rolarAtaqueSalvo).not.toHaveBeenCalled();
    });

    it('tecla sem modificador executa uma unica vez', () => {
        montar({ ataquesSalvos: salvos(2) });
        abrir();
        fireEvent.keyDown(document, { key: '2' });
        expect(ctx.rolarAtaqueSalvo).toHaveBeenCalledTimes(1);
        expect(ctx.rolarAtaqueSalvo).toHaveBeenCalledWith(ctx.minhaFicha.ataqueConfig.ataquesSalvos[1]);
    });

    it('tecla sem slot correspondente, 0 e letras nao executam nada', () => {
        montar({ ataquesSalvos: salvos(2) });
        abrir();
        for (const key of ['3', '9', '0', 'a']) fireEvent.keyDown(document, { key });
        expect(ctx.rolarAtaqueSalvo).not.toHaveBeenCalled();
        expect(ctx.rolarDanoCustomizado).not.toHaveBeenCalled();
    });

    it('com a grade fechada as teclas nao executam', () => {
        montar({ ataquesSalvos: salvos(2) });
        fireEvent.keyDown(document, { key: '1' });
        expect(ctx.rolarAtaqueSalvo).not.toHaveBeenCalled();
    });

    it('Ctrl+Esc ainda fecha (Esc e tratado antes dos modificadores)', () => {
        montar({ ataquesSalvos: salvos(2) });
        abrir();
        fireEvent.keyDown(document, { key: 'Escape', ctrlKey: true });
        expect(screen.queryByText('Atk1')).toBeNull();
    });
});

describe('MapaAtalhoAtaques - portal', () => {
    it('botao fica em document.body, fora do container do render, e some ao desmontar', () => {
        const { container, unmount } = montar({ ataquesSalvos: salvos(1) });
        const botao = screen.getByTitle('Atalho dos Ataques Salvos');
        expect(container.contains(botao)).toBe(false);
        expect(document.body.contains(botao)).toBe(true);
        expect(botao.closest('.atalho-ataques').parentElement).toBe(document.body);
        abrir();
        const painel = screen.getByRole('dialog');
        expect(container.contains(painel)).toBe(false);
        expect(document.body.contains(painel)).toBe(true);
        unmount();
        expect(document.querySelector('.atalho-ataques')).toBeNull();
        expect(screen.queryByTitle('Atalho dos Ataques Salvos')).toBeNull();
    });

    it('apos desmontar, teclas nao executam (listeners removidos)', () => {
        const { unmount } = montar({ ataquesSalvos: salvos(1) });
        abrir();
        const fn = ctx.rolarAtaqueSalvo;
        unmount();
        fireEvent.keyDown(document, { key: '1' });
        expect(fn).not.toHaveBeenCalled();
    });
});

describe('MapaAtalhoAtaques - ordem e limite de slots', () => {
    it('ataquesSalvos vem antes das formulas, e a contagem soma ambos', () => {
        montar({
            ataquesSalvos: [{ id: 1, nome: 'Salvo1', config: {} }],
            formulasSalvas: [{ id: 7, nome: 'Form1', formula: '1d6', letalidade: 0 }]
        });
        abrir();
        const nomes = [...document.querySelectorAll('.atalho-ataques-nome')].map(n => n.textContent);
        expect(nomes).toEqual(['Salvo1', 'Form1']);
        const teclas = [...document.querySelectorAll('.atalho-ataques-tecla')].map(n => n.textContent);
        expect(teclas).toEqual(['1', '2']);
        fireEvent.keyDown(document, { key: '2' });
        expect(ctx.rolarDanoCustomizado).toHaveBeenCalledWith('1d6', 0, undefined, undefined);
        expect(ctx.rolarAtaqueSalvo).not.toHaveBeenCalled();
    });

    it('so os 9 primeiros slots tem tecla; o 10o aparece sem tecla e so por clique', () => {
        montar({ ataquesSalvos: salvos(9), formulasSalvas: [{ id: 50, nome: 'Decima', formula: '2d6', letalidade: 1 }] });
        expect(screen.getByTitle('Atalho dos Ataques Salvos').textContent).toContain('10');
        abrir();
        const slots = document.querySelectorAll('.atalho-livro-carta');
        expect(slots.length).toBe(10);
        expect(document.querySelectorAll('.atalho-ataques-tecla').length).toBe(9);
        expect(slots[9].querySelector('.atalho-ataques-tecla')).toBeNull();
        fireEvent.keyDown(document, { key: '9' });
        expect(ctx.rolarAtaqueSalvo).toHaveBeenCalledWith(ctx.minhaFicha.ataqueConfig.ataquesSalvos[8]);
        expect(ctx.rolarDanoCustomizado).not.toHaveBeenCalled();
        abrir();
        fireEvent.click(screen.getByText('Decima'));
        expect(ctx.rolarDanoCustomizado).toHaveBeenCalledTimes(1);
    });
});

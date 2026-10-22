import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MarcadosPanel from './Marcados';
import useStore from '../../stores/useStore';

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    uploadImagem: vi.fn(),
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
    salvarDivisorPoderMesa: vi.fn(),
}));

const STATUS_FISICOS = ['forca', 'destreza', 'inteligencia', 'sabedoria', 'energiaEsp', 'carisma', 'stamina', 'constituicao'];
const criarStat = (base) => ({ base, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mUnico: '1.0', mAbsoluto: 1.0, reducaoCusto: 0, regeneracao: 0 });

function fichaBase(bio = {}) {
    const ficha = {
        ascensaoBase: 1, vida: criarStat(100000000), mana: criarStat(1000000000), aura: criarStat(1000000000),
        chakra: criarStat(1000000000), corpo: criarStat(1000000000), divisores: {}, bio, estetica: {}, labels: {},
        poderes: [], inventario: [], seresSelados: [], ataquesElementais: [],
    };
    STATUS_FISICOS.forEach(s => { ficha[s] = criarStat(1000000); });
    return ficha;
}

function montar(ficha) {
    const mockState = { minhaFicha: ficha, updateFicha: vi.fn((cb) => cb(ficha)), meuNome: 'Testador', importarDaAbaStatus: vi.fn() };
    useStore.mockImplementation((selector) => (selector ? selector(mockState) : mockState));
    return mockState;
}

// O rotulo e um <input> (LabelMagico); o campo e o proximo input/select do mesmo bloco da linha.
function campoDaLinha(rotulo) {
    const lbl = screen.getByDisplayValue(rotulo);
    const linha = lbl.closest('div[style*="display: flex"]').parentElement.closest('div[style*="display: flex"]') || lbl.parentElement;
    const alvo = lbl.parentElement.parentElement.querySelector('input:not([value="' + rotulo + '"]), select');
    return alvo || linha.querySelector('input, select');
}

beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); window.confirm = vi.fn(() => true); });
afterEach(() => { cleanup(); });

describe('MarcadosPanel pagina 1: campos de bio (Fisico, Sangue, Dinheiro, Linha Temporal)', () => {
    it('mostra os quatro rotulos novos', () => {
        montar(fichaBase());
        render(<MarcadosPanel />);
        ['Físico', 'Tipo Sanguíneo', 'Dinheiro', 'Linha Temporal'].forEach(r => expect(screen.getByDisplayValue(r)).toBeDefined());
    });

    it('mostra os valores existentes de bio', () => {
        montar(fichaBase({ fisico: 'Atletico', sangue: 'O+', dinheiro: '1500', mesa: 'futuro' }));
        render(<MarcadosPanel />);
        expect(screen.getByDisplayValue('Atletico')).toBeDefined();
        expect(screen.getByDisplayValue('O+')).toBeDefined();
        expect(screen.getByDisplayValue('1500')).toBeDefined();
        expect(campoDaLinha('Linha Temporal').value).toBe('futuro');
    });

    it.each([['Físico', 'fisico', 'Forte'], ['Tipo Sanguíneo', 'sangue', 'AB-'], ['Dinheiro', 'dinheiro', '999']])('digitar em %s grava em bio.%s', (rotulo, chave, texto) => {
        const ficha = fichaBase();
        const estado = montar(ficha);
        render(<MarcadosPanel />);
        const input = campoDaLinha(rotulo);
        expect(input).toBeTruthy();
        fireEvent.change(input, { target: { value: texto } });
        expect(estado.updateFicha).toHaveBeenCalled();
        expect(ficha.bio[chave]).toBe(texto);
    });

    it('Linha Temporal e um select com 3 opcoes e grava em bio.mesa', () => {
        const ficha = fichaBase();
        montar(ficha);
        render(<MarcadosPanel />);
        const sel = campoDaLinha('Linha Temporal');
        expect(sel.tagName).toBe('SELECT');
        expect(Array.from(sel.options).map(o => o.value)).toEqual(['presente', 'futuro', 'npc']);
        expect(sel.value).toBe('presente');
        fireEvent.change(sel, { target: { value: 'npc' } });
        expect(ficha.bio.mesa).toBe('npc');
        fireEvent.change(sel, { target: { value: 'futuro' } });
        expect(ficha.bio.mesa).toBe('futuro');
    });

    it('limpar o campo grava string vazia (nao quebra)', () => {
        const ficha = fichaBase({ fisico: 'Forte' });
        montar(ficha);
        render(<MarcadosPanel />);
        fireEvent.change(screen.getByDisplayValue('Forte'), { target: { value: '' } });
        expect(ficha.bio.fisico).toBe('');
    });

    it('unicode e texto longo sao gravados sem alteracao', () => {
        const ficha = fichaBase();
        montar(ficha);
        render(<MarcadosPanel />);
        const longo = 'ç'.repeat(500) + '🔥日本';
        fireEvent.change(campoDaLinha('Físico'), { target: { value: longo } });
        expect(ficha.bio.fisico).toBe(longo);
    });

    it('nao grava nos campos novos em outras chaves (idade intacta)', () => {
        const ficha = fichaBase({ idade: '20' });
        montar(ficha);
        render(<MarcadosPanel />);
        fireEvent.change(campoDaLinha('Dinheiro'), { target: { value: '5' } });
        expect(ficha.bio.idade).toBe('20');
        expect(ficha.bio.dinheiro).toBe('5');
    });

    it('ficha sem bio cria o objeto bio ao salvar', () => {
        const ficha = fichaBase();
        delete ficha.bio;
        montar(ficha);
        render(<MarcadosPanel />);
        fireEvent.change(campoDaLinha('Tipo Sanguíneo'), { target: { value: 'A+' } });
        expect(ficha.bio.sangue).toBe('A+');
    });

    it('rodape mostra Pagina 1 de 8', () => {
        montar(fichaBase());
        render(<MarcadosPanel />);
        expect(screen.getByText('Página 1 de 8')).toBeDefined();
    });
});

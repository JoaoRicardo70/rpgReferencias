import React from 'react';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FichaFormProvider, useFichaForm } from './FichaFormContext';
import { FichaCondicoesEElementais } from './FichaSubComponents';
import useStore from '../../stores/useStore';
import { salvarFichaSilencioso } from '../../services/firebase-sync.js';

// QA - editor de Reducoes de Dano (handlers do contexto + coluna 3 de FichaCondicoesEElementais).

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync.js', () => ({
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
    uploadImagem: vi.fn(() => Promise.resolve('https://exemplo.com/img.png')),
}));

let mockState;
let probe;
function Harness() { probe = useFichaForm(); return null; }

function montar(fichaExtra = {}, filho = null) {
    const ficha = { seresSelados: [], ...fichaExtra };
    mockState = {
        minhaFicha: ficha, personagens: {}, meuNome: 'Heroi',
        updateFicha: vi.fn((cb) => cb(mockState.minhaFicha)),
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(mockState) : mockState));
    render(<FichaFormProvider><Harness />{filho}</FichaFormProvider>);
    return ficha;
}

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => cleanup());

describe('FichaFormContext - handlers de Reducoes de Dano', () => {
    it('adicionar cria a lista quando ausente com defaults (10%, todos, nome vazio, id rd_)', () => {
        const ficha = montar();
        act(() => { probe.adicionarReducaoDano(); });
        expect(ficha.reducoesDano).toHaveLength(1);
        expect(ficha.reducoesDano[0]).toMatchObject({ nome: '', percentual: 10, elemento: 'todos' });
        expect(ficha.reducoesDano[0].id).toMatch(/^rd_/);
        expect(salvarFichaSilencioso).toHaveBeenCalled();
    });

    it('adicionar duas vezes gera ids distintos', () => {
        const ficha = montar();
        act(() => { probe.adicionarReducaoDano(); });
        act(() => { probe.adicionarReducaoDano(); });
        expect(ficha.reducoesDano).toHaveLength(2);
        expect(ficha.reducoesDano[0].id).not.toBe(ficha.reducoesDano[1].id);
    });

    it('adicionar substitui reducoesDano nao-array por lista nova', () => {
        const ficha = montar({ reducoesDano: 'lixo' });
        act(() => { probe.adicionarReducaoDano(); });
        expect(Array.isArray(ficha.reducoesDano)).toBe(true);
        expect(ficha.reducoesDano).toHaveLength(1);
    });

    describe('atualizar', () => {
        const base = () => ({ reducoesDano: [{ id: 'r1', nome: 'A', percentual: 10, elemento: 'todos' }, { id: 'r2', nome: 'B', percentual: 5, elemento: 'todos' }] });

        it('percentual valido (35 e "42.5" string)', () => {
            const ficha = montar(base());
            act(() => { probe.atualizarReducaoDano('r1', 'percentual', 35); });
            expect(ficha.reducoesDano[0].percentual).toBe(35);
            act(() => { probe.atualizarReducaoDano('r1', 'percentual', '42.5'); });
            expect(ficha.reducoesDano[0].percentual).toBe(42.5);
        });
        it('percentual clampa em 100 no maximo', () => {
            const ficha = montar(base());
            act(() => { probe.atualizarReducaoDano('r1', 'percentual', 150); });
            expect(ficha.reducoesDano[0].percentual).toBe(100);
        });
        it('percentual clampa em -100 no minimo (vulnerabilidade)', () => {
            const ficha = montar(base());
            act(() => { probe.atualizarReducaoDano('r1', 'percentual', -20); });
            expect(ficha.reducoesDano[0].percentual).toBe(-20);
        });
        it('percentual nao numerico ou vazio vira 0', () => {
            const ficha = montar(base());
            act(() => { probe.atualizarReducaoDano('r1', 'percentual', 'abc'); });
            expect(ficha.reducoesDano[0].percentual).toBe(0);
            act(() => { probe.atualizarReducaoDano('r2', 'percentual', ''); });
            expect(ficha.reducoesDano[1].percentual).toBe(0);
        });
        it('percentual 0 e 100 exatos sao preservados', () => {
            const ficha = montar(base());
            act(() => { probe.atualizarReducaoDano('r1', 'percentual', 100); });
            expect(ficha.reducoesDano[0].percentual).toBe(100);
            act(() => { probe.atualizarReducaoDano('r1', 'percentual', 0); });
            expect(ficha.reducoesDano[0].percentual).toBe(0);
        });
        it('nome e truncado em 60 caracteres', () => {
            const ficha = montar(base());
            act(() => { probe.atualizarReducaoDano('r1', 'nome', 'x'.repeat(100)); });
            expect(ficha.reducoesDano[0].nome).toHaveLength(60);
        });
        it('nome aceita unicode e null vira vazio', () => {
            const ficha = montar(base());
            act(() => { probe.atualizarReducaoDano('r1', 'nome', 'Escudo Ígneo ✨'); });
            expect(ficha.reducoesDano[0].nome).toBe('Escudo Ígneo ✨');
            act(() => { probe.atualizarReducaoDano('r1', 'nome', null); });
            expect(ficha.reducoesDano[0].nome).toBe('');
        });
        it('elemento muda e vazio volta para todos', () => {
            const ficha = montar(base());
            act(() => { probe.atualizarReducaoDano('r1', 'elemento', 'fogo'); });
            expect(ficha.reducoesDano[0].elemento).toBe('fogo');
            act(() => { probe.atualizarReducaoDano('r1', 'elemento', ''); });
            expect(ficha.reducoesDano[0].elemento).toBe('todos');
        });
        it('id inexistente nao altera nada e campo desconhecido e ignorado', () => {
            const ficha = montar(base());
            const antes = JSON.stringify(ficha.reducoesDano);
            act(() => { probe.atualizarReducaoDano('nope', 'percentual', 50); });
            act(() => { probe.atualizarReducaoDano('r1', 'id', 'hack'); });
            expect(JSON.stringify(ficha.reducoesDano)).toBe(antes);
        });
        it('sem lista reducoesDano nao lanca', () => {
            montar();
            expect(() => act(() => { probe.atualizarReducaoDano('r1', 'percentual', 5); })).not.toThrow();
        });
        it('altera so a linha certa', () => {
            const ficha = montar(base());
            act(() => { probe.atualizarReducaoDano('r2', 'percentual', 77); });
            expect(ficha.reducoesDano[0].percentual).toBe(10);
            expect(ficha.reducoesDano[1].percentual).toBe(77);
        });
    });

    describe('remover', () => {
        it('remove apenas o id indicado', () => {
            const ficha = montar({ reducoesDano: [{ id: 'r1', percentual: 10 }, { id: 'r2', percentual: 5 }] });
            act(() => { probe.removerReducaoDano('r1'); });
            expect(ficha.reducoesDano.map(r => r.id)).toEqual(['r2']);
            expect(salvarFichaSilencioso).toHaveBeenCalled();
        });
        it('id inexistente mantem a lista', () => {
            const ficha = montar({ reducoesDano: [{ id: 'r1', percentual: 10 }] });
            act(() => { probe.removerReducaoDano('zzz'); });
            expect(ficha.reducoesDano).toHaveLength(1);
        });
        it('sem lista vira []', () => {
            const f2 = montar();
            act(() => { probe.removerReducaoDano('r1'); });
            expect(f2.reducoesDano).toEqual([]);
        });
    });
});

describe('FichaCondicoesEElementais - coluna Reducoes de Dano', () => {
    function Tela() { return <FichaCondicoesEElementais />; }

    it('renderiza titulo, botao adicionar e nenhuma linha quando vazia', () => {
        montar({}, <Tela />);
        expect(screen.getByText(/Habilidades de Redução de Dano/)).toBeTruthy();
        expect(screen.getByText('+ Criar Habilidade de Redução')).toBeTruthy();
        expect(document.querySelectorAll('.habilidade-card')).toHaveLength(0);
        expect(document.querySelector('.reducao-dano-previa')).toBeNull();
    });

    it('renderiza uma linha por reducao com nome, percentual e elemento', () => {
        montar({ reducoesDano: [
            { id: 'r1', nome: 'Armadura', percentual: 20, elemento: 'todos' },
            { id: 'r2', nome: 'Fogo', percentual: 30, elemento: 'fogo' },
        ] }, <Tela />);
        expect(document.querySelectorAll('.habilidade-card')).toHaveLength(2);
        expect(screen.getByDisplayValue('Armadura')).toBeTruthy();
        expect(screen.getByDisplayValue('20')).toBeTruthy();
        const cartoes = document.querySelectorAll('.habilidade-card');
        expect(cartoes[0].textContent).toContain('Todo dano');
        expect(cartoes[1].textContent).toContain('Fogo');
        expect(cartoes[1].querySelector('.habilidade-alvo-add option[value="madeira"]')).toBeTruthy();
    });

    it('previa mostra a sequencia das reducoes gerais (100 -> 80 -> 64)', () => {
        montar({ reducoesDano: [
            { id: 'r1', nome: 'A', percentual: 20, elemento: 'todos' },
            { id: 'r2', nome: 'B', percentual: 20, elemento: 'todos' },
        ] }, <Tela />);
        const previa = document.querySelector('.reducao-dano-previa');
        expect(previa).toBeTruthy();
        expect(previa.textContent).toContain('100 → −20% A → 80 → −20% B → 64');
    });

    it('interacao via UI: adicionar, editar percentual (clamp) e remover pela linha', () => {
        const ficha = montar({ reducoesDano: [{ id: 'r1', nome: 'A', percentual: 10, elemento: 'todos' }] }, <Tela />);
        fireEvent.click(screen.getByText('+ Criar Habilidade de Redução'));
        expect(ficha.reducoesDano).toHaveLength(2);
        fireEvent.change(document.querySelector('.reducao-dano-pct'), { target: { value: '999' } });
        expect(ficha.reducoesDano[0].percentual).toBe(100);
        fireEvent.click(document.querySelector('.reducao-dano-remover'));
        expect(ficha.reducoesDano.map(r => r.id)).not.toContain('r1');
        expect(ficha.reducoesDano).toHaveLength(1);
    });

    it('varios tipos: adicionar e remover chips grava em elementos', () => {
        const ficha = montar({ reducoesDano: [{ id: 'r1', nome: 'Pele', percentual: 30, elementos: ['fogo'], elemento: 'fogo' }] }, <Tela />);
        fireEvent.change(document.querySelector('.habilidade-alvo-add'), { target: { value: 'agua' } });
        expect(ficha.reducoesDano[0].elementos).toEqual(['fogo', 'agua']);
        fireEvent.change(document.querySelector('.habilidade-alvo-add'), { target: { value: 'pol:yin' } });
        expect(ficha.reducoesDano[0].elementos).toEqual(['fogo', 'agua', 'pol:yin']);
        fireEvent.click(document.querySelectorAll('.habilidade-alvo-remover')[0]);
        expect(ficha.reducoesDano[0].elementos).toEqual(['agua', 'pol:yin']);
    });

    it('passivas e ativas ficam em grupos separados e o tipo pode ser trocado', () => {
        const ficha = montar({ reducoesDano: [
            { id: 'p', nome: 'Passiva', percentual: 10, tipo: 'passiva', elementos: ['todos'] },
            { id: 'a', nome: 'Ativa', percentual: 10, elementos: ['todos'] },
        ] }, <Tela />);
        const grupos = document.querySelectorAll('.habilidade-grupo');
        expect(grupos).toHaveLength(2);
        expect(grupos[0].textContent).toContain('Passivas');
        expect(grupos[0].querySelector('.habilidade-reducao-ativa')).toBeNull();
        expect(grupos[1].querySelector('.habilidade-reducao-ativa')).toBeTruthy();
        fireEvent.change(grupos[1].querySelector('.habilidade-card-tipo'), { target: { value: 'passiva' } });
        expect(ficha.reducoesDano[1].tipo).toBe('passiva');
    });
});

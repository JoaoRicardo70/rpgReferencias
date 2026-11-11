import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';

// QA — Grimório: painel de cores (gravação com debounce de 400ms, flush ao sair/trocar de entidade) e sub-abas acessíveis.

const salvarSilencioso = vi.fn();
const salvarImediato = vi.fn(() => Promise.resolve());
// Uma ficha/updateFicha por entidade; `entidadeAtual` escolhe qual o Grimório enxerga.
let entidades;
let entidadeAtual;
vi.mock('../poderes/PoderesPanel', () => ({ default: () => <div>PODERES</div> }));
vi.mock('../arsenal/ElementosPanel', () => ({ default: () => <div>ELEMENTOS</div> }));
vi.mock('../ficha/FichaFormContext', () => ({ FichaFormProvider: ({ children }) => <div>{children}</div> }));
vi.mock('../ficha/FichaSubComponents', () => ({ FichaCondicoesEElementais: () => <div>ESTADOS_E_REDUCOES</div> }));
vi.mock('./FichaAlvoContext', () => ({
    useFichaAtiva: () => {
        const e = entidades[entidadeAtual];
        return { ficha: e.ficha, updateFicha: e.updateFicha, nome: entidadeAtual, souEuMesmo: true };
    },
    useCallSaveAtivo: () => salvarSilencioso,
    useSalvarImediatoAtivo: () => salvarImediato,
}));

import GrimorioPanel from './Grimorio';

function criarEntidade(esteticaGrimorio) {
    const e = { ficha: { esteticaGrimorio } };
    // Imita o Immer: aplica o callback na ficha da entidade (troca a referência para re-renderizar).
    e.updateFicha = vi.fn((cb) => { const copia = { ...e.ficha }; cb(copia); e.ficha = copia; });
    return e;
}

const abrirCores = () => fireEvent.click(screen.getByRole('button', { name: /Cores$/ }));
const seletor = () => screen.getByLabelText('Cor de destaque do Grimório');
const raiz = () => document.querySelector('.grimorio');

beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    entidades = { Natsu: criarEntidade({}), Gray: criarEntidade({ corDestaque: '#ff0000' }) };
    entidadeAtual = 'Natsu';
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('painel de cores', () => {
    it('sem cor salva o Grimório segue o tema (nenhuma variável inline)', () => {
        render(<GrimorioPanel />);
        expect(raiz().style.getPropertyValue('--cor-primaria')).toBe('');
    });

    it('cor salva na ficha é aplicada como variáveis CSS na raiz', () => {
        entidadeAtual = 'Gray';
        render(<GrimorioPanel />);
        expect(raiz().style.getPropertyValue('--cor-primaria')).toBe('#ff0000');
        expect(raiz().style.getPropertyValue('--cor-primaria-rgb')).toBe('255, 0, 0');
    });

    it('o painel abre e fecha (aria-expanded)', () => {
        render(<GrimorioPanel />);
        const btn = screen.getByRole('button', { name: /Cores$/ });
        expect(btn.getAttribute('aria-expanded')).toBe('false');
        abrirCores();
        expect(btn.getAttribute('aria-expanded')).toBe('true');
        expect(screen.getByLabelText('Cores do Grimório')).toBeTruthy();
        abrirCores();
        expect(screen.queryByLabelText('Cores do Grimório')).toBeNull();
    });

    it('escolher cor no seletor aplica na hora mas só grava após ~400ms', () => {
        render(<GrimorioPanel />);
        abrirCores();
        fireEvent.change(seletor(), { target: { value: '#00ff00' } });
        expect(raiz().style.getPropertyValue('--cor-primaria')).toBe('#00ff00');
        expect(entidades.Natsu.updateFicha).not.toHaveBeenCalled();
        act(() => { vi.advanceTimersByTime(399); });
        expect(entidades.Natsu.updateFicha).not.toHaveBeenCalled();
        act(() => { vi.advanceTimersByTime(2); });
        expect(entidades.Natsu.updateFicha).toHaveBeenCalledTimes(1);
        expect(entidades.Natsu.ficha.esteticaGrimorio).toEqual({ corDestaque: '#00ff00' });
        expect(salvarSilencioso).toHaveBeenCalledTimes(1);
        expect(salvarImediato).not.toHaveBeenCalled();
    });

    it('várias escolhas seguidas gravam UMA vez, com o último valor (debounce)', () => {
        render(<GrimorioPanel />);
        abrirCores();
        ['#111111', '#222222', '#333333'].forEach(c => { fireEvent.change(seletor(), { target: { value: c } }); act(() => { vi.advanceTimersByTime(100); }); });
        act(() => { vi.advanceTimersByTime(500); });
        expect(entidades.Natsu.updateFicha).toHaveBeenCalledTimes(1);
        expect(entidades.Natsu.ficha.esteticaGrimorio).toEqual({ corDestaque: '#333333' });
    });

    it('cor pronta grava imediatamente (sem esperar o debounce)', () => {
        const { rerender } = render(<GrimorioPanel />);
        abrirCores();
        const amostra = screen.getAllByRole('button', { name: /^Cor / })[0];
        fireEvent.click(amostra);
        expect(entidades.Natsu.updateFicha).toHaveBeenCalledTimes(1);
        expect(entidades.Natsu.ficha.esteticaGrimorio.corDestaque).toMatch(/^#[0-9a-f]{6}$/);
        rerender(<GrimorioPanel />); // o mock de useFichaAtiva não assina a store: força a leitura da ficha nova
        expect(screen.getAllByRole('button', { name: /^Cor / })[0].getAttribute('aria-pressed')).toBe('true');
    });

    it('desmontar com cor pendente grava (flush) e não deixa timer solto', () => {
        const { unmount } = render(<GrimorioPanel />);
        abrirCores();
        fireEvent.change(seletor(), { target: { value: '#abcdef' } });
        expect(entidades.Natsu.updateFicha).not.toHaveBeenCalled();
        unmount();
        expect(entidades.Natsu.updateFicha).toHaveBeenCalledTimes(1);
        expect(entidades.Natsu.ficha.esteticaGrimorio).toEqual({ corDestaque: '#abcdef' });
        act(() => { vi.advanceTimersByTime(1000); });
        expect(entidades.Natsu.updateFicha).toHaveBeenCalledTimes(1);
    });

    it('desmontar sem nada pendente não grava', () => {
        const { unmount } = render(<GrimorioPanel />);
        unmount();
        expect(entidades.Natsu.updateFicha).not.toHaveBeenCalled();
    });

    it('trocar de entidade grava o pendente na ANTIGA, nunca na nova, e zera corLocal', () => {
        const { rerender } = render(<GrimorioPanel />);
        abrirCores();
        fireEvent.change(seletor(), { target: { value: '#00ff00' } });
        expect(raiz().style.getPropertyValue('--cor-primaria')).toBe('#00ff00');

        entidadeAtual = 'Gray';
        rerender(<GrimorioPanel />);

        expect(entidades.Natsu.updateFicha).toHaveBeenCalledTimes(1);
        expect(entidades.Natsu.ficha.esteticaGrimorio).toEqual({ corDestaque: '#00ff00' });
        expect(entidades.Gray.updateFicha).not.toHaveBeenCalled();
        expect(entidades.Gray.ficha.esteticaGrimorio).toEqual({ corDestaque: '#ff0000' });
        // corLocal zerada: a raiz mostra a cor SALVA da nova entidade, não a escolha pendente.
        expect(raiz().style.getPropertyValue('--cor-primaria')).toBe('#ff0000');
        // E o timer antigo não dispara depois.
        act(() => { vi.advanceTimersByTime(1000); });
        expect(entidades.Gray.updateFicha).not.toHaveBeenCalled();
        expect(entidades.Natsu.updateFicha).toHaveBeenCalledTimes(1);
    });

    it('trocar de entidade sem pendência não grava nada em ninguém', () => {
        const { rerender } = render(<GrimorioPanel />);
        entidadeAtual = 'Gray';
        rerender(<GrimorioPanel />);
        expect(entidades.Natsu.updateFicha).not.toHaveBeenCalled();
        expect(entidades.Gray.updateFicha).not.toHaveBeenCalled();
    });

    it('"Seguir o tema do app" limpa a cor (ficha volta a {}) e fica desabilitado sem cor', () => {
        entidadeAtual = 'Gray';
        const { rerender } = render(<GrimorioPanel />);
        abrirCores();
        const btn = screen.getByRole('button', { name: 'Seguir o tema do app' });
        expect(btn.disabled).toBe(false);
        fireEvent.click(btn);
        expect(entidades.Gray.ficha.esteticaGrimorio).toEqual({});
        rerender(<GrimorioPanel />); // o mock de useFichaAtiva não assina a store
        expect(raiz().style.getPropertyValue('--cor-primaria')).toBe('');
        expect(screen.getByRole('button', { name: 'Seguir o tema do app' }).disabled).toBe(true);
    });

    it('"Seguir o tema" cancela uma escolha pendente do seletor', () => {
        entidadeAtual = 'Gray';
        render(<GrimorioPanel />);
        abrirCores();
        fireEvent.change(seletor(), { target: { value: '#00ff00' } });
        fireEvent.click(screen.getByRole('button', { name: 'Seguir o tema do app' }));
        act(() => { vi.advanceTimersByTime(1000); });
        expect(entidades.Gray.ficha.esteticaGrimorio).toEqual({});
    });

    it('cor salva inválida/legada na ficha é ignorada (sem variáveis inline)', () => {
        entidades.Natsu = criarEntidade({ corDestaque: 'red; x', corTinta: 5 });
        render(<GrimorioPanel />);
        expect(raiz().style.getPropertyValue('--cor-primaria')).toBe('');
    });

    it('ficha ausente mostra o estado de carregamento sem quebrar', () => {
        entidades.Natsu = { ficha: undefined, updateFicha: vi.fn() };
        render(<GrimorioPanel />);
        expect(screen.getByText(/Invocando o Grimório/)).toBeTruthy();
    });
});

describe('sub-abas Poderes / Elementos / Estados', () => {
    const abas = () => screen.getAllByRole('tab');

    it('tablist com 3 tabs, aria-selected e tabpanel ligado por aria-controls/aria-labelledby', () => {
        render(<GrimorioPanel />);
        expect(screen.getByRole('tablist', { name: 'Páginas do Grimório' })).toBeTruthy();
        expect(abas()).toHaveLength(3);
        expect(abas().map(a => a.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
        const painel = screen.getByRole('tabpanel');
        abas().forEach(a => expect(a.getAttribute('aria-controls')).toBe(painel.id));
        expect(painel.getAttribute('aria-labelledby')).toBe(abas()[0].id);
        expect(abas().map(a => a.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
    });

    it('clicar numa aba troca o painel e o aria-labelledby', () => {
        render(<GrimorioPanel />);
        fireEvent.click(abas()[1]);
        expect(screen.getByText('ELEMENTOS')).toBeTruthy();
        expect(screen.queryByText('PODERES')).toBeNull();
        expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe(abas()[1].id);
        expect(abas()[1].getAttribute('aria-selected')).toBe('true');
    });

    it('seta direita/esquerda movem a seleção e o foco, com volta circular', () => {
        render(<GrimorioPanel />);
        fireEvent.keyDown(abas()[0], { key: 'ArrowRight' });
        expect(abas()[1].getAttribute('aria-selected')).toBe('true');
        expect(document.activeElement).toBe(abas()[1]);
        fireEvent.keyDown(abas()[1], { key: 'ArrowRight' });
        fireEvent.keyDown(abas()[2], { key: 'ArrowRight' });
        expect(abas()[0].getAttribute('aria-selected')).toBe('true');
        fireEvent.keyDown(abas()[0], { key: 'ArrowLeft' });
        expect(abas()[2].getAttribute('aria-selected')).toBe('true');
        expect(document.activeElement).toBe(abas()[2]);
    });

    it('Home e End vão para a primeira e a última', () => {
        render(<GrimorioPanel />);
        fireEvent.keyDown(abas()[0], { key: 'End' });
        expect(abas()[2].getAttribute('aria-selected')).toBe('true');
        expect(screen.getByText('ESTADOS_E_REDUCOES')).toBeTruthy();
        fireEvent.keyDown(abas()[2], { key: 'Home' });
        expect(abas()[0].getAttribute('aria-selected')).toBe('true');
    });

    it('outras teclas não mudam a seleção', () => {
        render(<GrimorioPanel />);
        fireEvent.keyDown(abas()[0], { key: 'a' });
        fireEvent.keyDown(abas()[0], { key: 'ArrowDown' });
        expect(abas()[0].getAttribute('aria-selected')).toBe('true');
    });
});

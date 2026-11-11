import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';

// QA — Grimório: cores de destaque/texto/fundo, aviso de contraste, observer de tema, debounce/flush.

const salvarSilencioso = vi.fn();
const salvarImediato = vi.fn(() => Promise.resolve());
let entidades;
let entidadeAtual;
vi.mock('../poderes/PoderesPanel', () => ({ default: () => <div>PODERES</div> }));
vi.mock('../arsenal/ElementosPanel', () => ({ default: () => <div>ELEMENTOS</div> }));
vi.mock('../ficha/FichaFormContext', () => ({ FichaFormProvider: ({ children }) => <div>{children}</div> }));
vi.mock('../ficha/FichaSubComponents', () => ({ FichaCondicoesEElementais: () => <div>ESTADOS</div> }));
vi.mock('./FichaAlvoContext', () => ({
    useFichaAtiva: () => {
        const e = entidades[entidadeAtual];
        const [, forcar] = React.useReducer((x) => x + 1, 0);
        React.useEffect(() => { e.ouvintes.add(forcar); return () => e.ouvintes.delete(forcar); }, [e]);
        return { ficha: e.ficha, updateFicha: e.updateFicha, nome: entidadeAtual, souEuMesmo: true };
    },
    useCallSaveAtivo: () => salvarSilencioso,
    useSalvarImediatoAtivo: () => salvarImediato,
}));

import GrimorioPanel from './Grimorio';

function criarEntidade(esteticaGrimorio) {
    const e = { ficha: { esteticaGrimorio }, ouvintes: new Set() };
    e.updateFicha = vi.fn((cb) => { const copia = { ...e.ficha }; cb(copia); e.ficha = copia; e.ouvintes.forEach(f => f()); });
    return e;
}

const abrirCores = () => fireEvent.click(screen.getByRole('button', { name: /Cores$/ }));
const sel = (n) => screen.getByLabelText(`Cor de ${n} do Grimório`);
const raiz = () => document.querySelector('.grimorio');
const aviso = () => document.querySelector('.grimorio-cores-aviso');
const TXT_AVISO = /contraste baixo/;

beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    entidades = { Natsu: criarEntidade({}), Gray: criarEntidade({ corDestaque: '#ff0000', corTexto: '#ffffff', corFundo: '#000000' }) };
    entidadeAtual = 'Natsu';
    document.body.className = '';
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); document.body.className = ''; });

describe('classes e style do container', () => {
    it('ficha sem chaves: sem classes --texto/--fundo e sem style', () => {
        render(<GrimorioPanel />);
        expect(raiz().className).toBe('grimorio');
        expect(raiz().getAttribute('style') || '').toBe('');
    });
    it('só com texto: apenas grimorio--texto', () => {
        entidades.Natsu = criarEntidade({ corTexto: '#ffffff' });
        render(<GrimorioPanel />);
        expect(raiz().classList.contains('grimorio--texto')).toBe(true);
        expect(raiz().classList.contains('grimorio--fundo')).toBe(false);
        expect(raiz().style.getPropertyValue('--grimorio-texto')).toBe('#ffffff');
    });
    it('só com fundo: apenas grimorio--fundo', () => {
        entidades.Natsu = criarEntidade({ corFundo: '#112233' });
        render(<GrimorioPanel />);
        expect(raiz().classList.contains('grimorio--fundo')).toBe(true);
        expect(raiz().classList.contains('grimorio--texto')).toBe(false);
        expect(raiz().style.getPropertyValue('--grimorio-fundo')).toBe('#112233');
        expect(raiz().style.getPropertyValue('--bg-body-2')).toBe('#112233');
    });
    it('style só contém custom properties', () => {
        entidadeAtual = 'Gray';
        render(<GrimorioPanel />);
        const st = raiz().style;
        expect(st.length).toBeGreaterThan(0);
        for (let i = 0; i < st.length; i++) expect(st[i].startsWith('--')).toBe(true);
    });
    it('ficha legada migra: só tinta vira destaque', () => {
        entidades.Natsu = criarEntidade({ corPapel: '#fff', corTinta: '#00ff00', corTexto: '#123456' });
        render(<GrimorioPanel />);
        expect(raiz().style.getPropertyValue('--cor-primaria')).toBe('#00ff00');
        expect(raiz().classList.contains('grimorio--texto')).toBe(false);
    });
    it('esteticaGrimorio ausente/lixo não quebra', () => {
        entidades.Natsu = criarEntidade(undefined);
        expect(() => render(<GrimorioPanel />)).not.toThrow();
        cleanup();
        entidades.Natsu = criarEntidade(['x']);
        expect(() => render(<GrimorioPanel />)).not.toThrow();
    });
});

describe('painel: linhas e botões', () => {
    it('três linhas com seletores, três "Seguir o tema" e Restaurar tudo', () => {
        render(<GrimorioPanel />);
        abrirCores();
        sel('destaque'); sel('texto'); sel('fundo');
        expect(screen.getAllByRole('button', { name: 'Seguir o tema' })).toHaveLength(3);
        expect(screen.getByRole('button', { name: 'Restaurar tudo' })).toBeTruthy();
    });
    it('sem cores: Seguir o tema e Restaurar tudo desabilitados', () => {
        render(<GrimorioPanel />);
        abrirCores();
        screen.getAllByRole('button', { name: 'Seguir o tema' }).forEach(b => expect(b.disabled).toBe(true));
        expect(screen.getByRole('button', { name: 'Restaurar tudo' }).disabled).toBe(true);
    });
    it('amostra de texto grava imediatamente e marca aria-pressed', () => {
        render(<GrimorioPanel />);
        abrirCores();
        fireEvent.click(screen.getByRole('button', { name: 'Texto Branco' }));
        expect(entidades.Natsu.ficha.esteticaGrimorio).toEqual({ corTexto: '#ffffff' });
        expect(salvarSilencioso).toHaveBeenCalledTimes(1);
        expect(screen.getByRole('button', { name: 'Texto Branco' }).getAttribute('aria-pressed')).toBe('true');
        expect(raiz().classList.contains('grimorio--texto')).toBe(true);
    });
    it('amostra de fundo grava imediatamente', () => {
        render(<GrimorioPanel />);
        abrirCores();
        fireEvent.click(screen.getByRole('button', { name: 'Fundo Grafite' }));
        expect(entidades.Natsu.ficha.esteticaGrimorio).toEqual({ corFundo: '#1c1c24' });
    });
    it('cores combinam sem sobrescrever outras', () => {
        render(<GrimorioPanel />);
        abrirCores();
        fireEvent.click(screen.getByRole('button', { name: 'Texto Branco' }));
        fireEvent.click(screen.getByRole('button', { name: 'Fundo Grafite' }));
        expect(entidades.Natsu.ficha.esteticaGrimorio).toEqual({ corTexto: '#ffffff', corFundo: '#1c1c24' });
    });
    it('Seguir o tema remove só aquela cor', () => {
        entidadeAtual = 'Gray';
        render(<GrimorioPanel />);
        abrirCores();
        fireEvent.click(screen.getAllByRole('button', { name: 'Seguir o tema' })[1]);
        expect(entidades.Gray.ficha.esteticaGrimorio).toEqual({ corDestaque: '#ff0000', corFundo: '#000000' });
    });
    it('Restaurar tudo grava {} imediatamente', () => {
        entidadeAtual = 'Gray';
        render(<GrimorioPanel />);
        abrirCores();
        fireEvent.click(screen.getByRole('button', { name: 'Restaurar tudo' }));
        expect(entidades.Gray.ficha.esteticaGrimorio).toEqual({});
        expect(raiz().className).toBe('grimorio');
    });
    it('seletor de texto grava só após 400ms', () => {
        render(<GrimorioPanel />);
        abrirCores();
        fireEvent.change(sel('texto'), { target: { value: '#123456' } });
        expect(raiz().style.getPropertyValue('--grimorio-texto')).toBe('#123456');
        expect(entidades.Natsu.updateFicha).not.toHaveBeenCalled();
        act(() => { vi.advanceTimersByTime(401); });
        expect(entidades.Natsu.ficha.esteticaGrimorio).toEqual({ corTexto: '#123456' });
    });
    it('várias mudanças rápidas geram uma única gravação', () => {
        render(<GrimorioPanel />);
        abrirCores();
        fireEvent.change(sel('fundo'), { target: { value: '#111111' } });
        act(() => { vi.advanceTimersByTime(200); });
        fireEvent.change(sel('fundo'), { target: { value: '#222222' } });
        act(() => { vi.advanceTimersByTime(500); });
        expect(entidades.Natsu.updateFicha).toHaveBeenCalledTimes(1);
        expect(entidades.Natsu.ficha.esteticaGrimorio).toEqual({ corFundo: '#222222' });
    });
    it('flush ao trocar de entidade grava na antiga', () => {
        const { rerender } = render(<GrimorioPanel />);
        abrirCores();
        fireEvent.change(sel('texto'), { target: { value: '#abcdef' } });
        entidadeAtual = 'Gray';
        rerender(<GrimorioPanel />);
        expect(entidades.Natsu.ficha.esteticaGrimorio).toEqual({ corTexto: '#abcdef' });
        expect(entidades.Gray.updateFicha).not.toHaveBeenCalled();
        act(() => { vi.advanceTimersByTime(1000); });
        expect(entidades.Gray.updateFicha).not.toHaveBeenCalled();
    });
    it('flush ao desmontar', () => {
        const { unmount } = render(<GrimorioPanel />);
        abrirCores();
        fireEvent.change(sel('fundo'), { target: { value: '#abcdef' } });
        unmount();
        expect(entidades.Natsu.ficha.esteticaGrimorio).toEqual({ corFundo: '#abcdef' });
    });
});

describe('aviso de contraste', () => {
    it('região aria-live="polite" sempre presente com painel aberto, vazia sem aviso', () => {
        render(<GrimorioPanel />);
        abrirCores();
        expect(aviso()).toBeTruthy();
        expect(aviso().getAttribute('aria-live')).toBe('polite');
        expect(aviso().textContent).toBe('');
    });
    it('texto e fundo parecidos => aviso', () => {
        entidades.Natsu = criarEntidade({ corTexto: '#777777', corFundo: '#808080' });
        render(<GrimorioPanel />);
        abrirCores();
        expect(aviso().textContent).toMatch(TXT_AVISO);
    });
    it('texto e fundo contrastantes => sem aviso', () => {
        entidadeAtual = 'Gray';
        render(<GrimorioPanel />);
        abrirCores();
        expect(aviso().textContent).toBe('');
    });
    it('aviso surge e some ao escolher amostras', () => {
        render(<GrimorioPanel />);
        abrirCores();
        fireEvent.click(screen.getByRole('button', { name: 'Texto Branco' }));
        fireEvent.click(screen.getByRole('button', { name: 'Fundo Branco' }));
        expect(aviso().textContent).toMatch(TXT_AVISO);
        fireEvent.click(screen.getByRole('button', { name: 'Fundo Preto' }));
        expect(aviso().textContent).toBe('');
    });
    it('sem cores personalizadas nunca há aviso', () => {
        vi.spyOn(window, 'getComputedStyle').mockReturnValue({ color: 'rgb(10, 10, 10)', getPropertyValue: () => '#0a0a0a' });
        render(<GrimorioPanel />);
        abrirCores();
        expect(aviso().textContent).toBe('');
    });
    it('só texto personalizado contra fundo do tema semelhante => aviso', () => {
        vi.spyOn(window, 'getComputedStyle').mockReturnValue({ color: 'rgb(0, 0, 0)', getPropertyValue: () => '#101010' });
        entidades.Natsu = criarEntidade({ corTexto: '#141414' });
        render(<GrimorioPanel />);
        abrirCores();
        expect(aviso().textContent).toMatch(TXT_AVISO);
    });
    it('token do tema não convertível (color-mix) não gera aviso espúrio', () => {
        vi.spyOn(window, 'getComputedStyle').mockReturnValue({ color: 'rgb(255, 255, 255)', getPropertyValue: () => 'color-mix(in srgb, red, blue)' });
        entidades.Natsu = criarEntidade({ corTexto: '#ffffff' });
        render(<GrimorioPanel />);
        abrirCores();
        expect(aviso().textContent).toBe('');
    });
    it('token convertível via rgb() do navegador é usado', () => {
        vi.spyOn(window, 'getComputedStyle').mockReturnValue({ color: 'rgb(255, 255, 255)', getPropertyValue: () => 'rgb(250, 250, 250)' });
        entidades.Natsu = criarEntidade({ corTexto: '#ffffff' });
        render(<GrimorioPanel />);
        abrirCores();
        expect(aviso().textContent).toMatch(TXT_AVISO);
    });
    it('getComputedStyle lançando erro não derruba o painel', () => {
        entidades.Natsu = criarEntidade({ corTexto: "#ffffff" });
        render(<GrimorioPanel />);
        const botao = screen.getByRole("button", { name: /Cores$/ });
        vi.spyOn(window, "getComputedStyle").mockImplementation(() => { throw new Error("x"); });
        expect(() => fireEvent.click(botao)).not.toThrow();
        vi.restoreAllMocks();
        expect(aviso().textContent).toBe('');
    });
});

describe('MutationObserver do tema', () => {
    const tick = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };

    it('trocar a classe do body com painel aberto atualiza o aviso', async () => {
        let fundoTema = '#ffffff';
        vi.spyOn(window, 'getComputedStyle').mockImplementation(() => ({ color: 'rgb(0, 0, 0)', getPropertyValue: () => fundoTema }));
        entidades.Natsu = criarEntidade({ corTexto: '#ffffff' });
        render(<GrimorioPanel />);
        abrirCores();
        expect(aviso().textContent).toMatch(TXT_AVISO);
        fundoTema = '#000000';
        document.body.className = 'theme-escuro';
        await tick();
        expect(aviso().textContent).toBe('');
    });
    it('observer é conectado ao abrir e desconectado ao fechar', () => {
        const disconnect = vi.fn(); const observe = vi.fn();
        const Orig = global.MutationObserver;
        global.MutationObserver = class { observe(...a) { observe(...a); } disconnect() { disconnect(); } };
        try {
            render(<GrimorioPanel />);
            expect(observe).not.toHaveBeenCalled();
            abrirCores();
            expect(observe).toHaveBeenCalledTimes(1);
            expect(observe.mock.calls[0][0]).toBe(document.body);
            expect(observe.mock.calls[0][1]).toEqual({ attributes: true, attributeFilter: ['class'] });
            expect(disconnect).not.toHaveBeenCalled();
            abrirCores();
            expect(disconnect).toHaveBeenCalledTimes(1);
        } finally { global.MutationObserver = Orig; }
    });
    it('observer é desligado ao desmontar', () => {
        const disconnect = vi.fn();
        const Orig = global.MutationObserver;
        global.MutationObserver = class { observe() {} disconnect() { disconnect(); } };
        try {
            const { unmount } = render(<GrimorioPanel />);
            abrirCores();
            unmount();
            expect(disconnect).toHaveBeenCalledTimes(1);
        } finally { global.MutationObserver = Orig; }
    });
    it('sem MutationObserver disponível não quebra', () => {
        const Orig = global.MutationObserver;
        global.MutationObserver = undefined;
        try {
            render(<GrimorioPanel />);
            expect(() => abrirCores()).not.toThrow();
        } finally { global.MutationObserver = Orig; }
    });
});

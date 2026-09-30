import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import fs from 'fs';
import path from 'path';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

vi.mock('firebase/database', () => ({ ref: vi.fn(), onValue: vi.fn(), set: vi.fn(), get: vi.fn() }));
vi.mock('../../services/firebase-config', () => ({ db: {}, functions: {}, auth: {} }));
vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: {}, version: '0', getDocument: vi.fn() }));
vi.mock('../../services/sextaFeiraIA', () => ({ chamarGemini: vi.fn(), traduzirErroGemini: vi.fn(), listarModelosGemini: vi.fn() }));
vi.mock('../../services/sextaFeiraDados', () => ({
    LIMITE_MENSAGENS_CHAT_SALVAS: 60,
    carregarChat: vi.fn(), salvarChat: vi.fn(),
    carregarEventosFeedDesde: vi.fn(), carregarTranscricoesDesde: vi.fn(),
    memorizarFato: vi.fn(), apagarFato: vi.fn(),
    lerUltimoResumoEm: vi.fn(), gravarUltimoResumoEm: vi.fn(),
}));

import { AIHeader, AIChat } from './AISubComponents';
import { AIFormProvider, useAIForm } from './AIFormContext';
import useStore from '../../stores/useStore';
import * as dados from '../../services/sextaFeiraDados';

const capitulos = [{ id: 1, titulo: 'Cap P', tierList: [], arcos: [{ id: 11, titulo: 'Arco', texto: 'texto' }] }];

function Sonda() {
    const { subAba, setSubAba } = useAIForm();
    return (
        <div>
            <span data-testid="sub">{subAba}</span>
            {['lore', 'tierlist', 'arvore'].map(s => (
                <button key={s} data-testid={`ir-${s}`} onClick={() => setSubAba(s)}>{s}</button>
            ))}
        </div>
    );
}
const montarHeader = () => render(<AIFormProvider><AIHeader /><Sonda /></AIFormProvider>);
const sub = () => screen.getByTestId('sub').textContent;
const selecionadas = () => screen.getAllByRole('tab').filter(t => t.getAttribute('aria-selected') === 'true');

beforeEach(() => {
    localStorage.clear();
    Object.values(dados).forEach(f => { if (typeof f?.mockReset === 'function') f.mockReset(); });
    dados.carregarChat.mockResolvedValue(null);
    dados.salvarChat.mockResolvedValue();
    dados.carregarEventosFeedDesde.mockResolvedValue([]);
    dados.carregarTranscricoesDesde.mockResolvedValue([]);
    useStore.setState({
        meuNome: 'Ana', minhaFicha: {}, isMestre: false, mesaId: 'M1', registrosCompartilhados: false,
        sextaFeiraConfig: { chaveGemini: 'K', modelo: 'm' }, sextaFeiraMemoria: {},
        personagens: {}, dummies: {}, resumoTurnoMapa: null, cenario: null,
        loreCapitulosPresente: capitulos, loreCapitulosFuturo: [],
        loreCapituloAtivoId: 1, loreArcoAtivoIdPresente: 11, loreCapFuturoAtivoId: null, loreArcoAtivoIdFuturo: null,
    });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('AIHeader nav - estrutura', () => {
    it('e um nav.sexta-nav com role tablist e abas sexta-nav-item', () => {
        const { container } = montarHeader();
        const nav = container.querySelector('nav.sexta-nav');
        expect(nav).not.toBeNull();
        expect(nav.getAttribute('role')).toBe('tablist');
        screen.getAllByRole('tab').forEach(t => {
            expect(t.className).toContain('sexta-nav-item');
            expect(t.className).not.toContain('btn-neon');
        });
    });
    it('exatamente uma aba aria-selected=true e ela tem classe ativo (inicial: Chat)', () => {
        montarHeader();
        const sel = selecionadas();
        expect(sel).toHaveLength(1);
        expect(sel[0].classList.contains('ativo')).toBe(true);
        expect(sel[0].textContent).toContain('Chat');
        expect(screen.getAllByRole('tab').filter(t => t.classList.contains('ativo'))).toHaveLength(1);
    });
    it('jogador nao ve Config', () => {
        montarHeader();
        expect(screen.queryByRole('tab', { name: /Config/ })).toBeNull();
        expect(screen.getAllByRole('tab')).toHaveLength(3);
    });
    it('mestre ve Config (4 abas) e clicar seleciona so ela', () => {
        useStore.setState({ isMestre: true });
        montarHeader();
        expect(screen.getAllByRole('tab')).toHaveLength(4);
        fireEvent.click(screen.getByRole('tab', { name: /Config/ }));
        expect(sub()).toBe('config');
        const sel = selecionadas();
        expect(sel).toHaveLength(1);
        expect(sel[0].textContent).toContain('Config');
        expect(sel[0].classList.contains('ativo')).toBe(true);
    });
    it('Gravador seleciona so ele', () => {
        montarHeader();
        fireEvent.click(screen.getByRole('tab', { name: /Gravador/ }));
        expect(sub()).toBe('gravador');
        expect(selecionadas()).toHaveLength(1);
        expect(selecionadas()[0].textContent).toContain('Gravador');
    });
});

describe('AIHeader nav - Codex', () => {
    it('clicar em Codex fora dele vai para lore e fica ativo', () => {
        montarHeader();
        fireEvent.click(screen.getByRole('tab', { name: /Codex/ }));
        expect(sub()).toBe('lore');
        const sel = selecionadas();
        expect(sel).toHaveLength(1);
        expect(sel[0].textContent).toContain('Codex');
        expect(sel[0].classList.contains('ativo')).toBe(true);
    });
    it('clicar em Codex estando em tierlist mantem tierlist', () => {
        montarHeader();
        fireEvent.click(screen.getByTestId('ir-tier' + 'list'));
        expect(sub()).toBe('tierlist');
        fireEvent.click(screen.getByRole('tab', { name: /Codex/ }));
        expect(sub()).toBe('tierlist');
        expect(selecionadas()).toHaveLength(1);
        expect(selecionadas()[0].textContent).toContain('Codex');
    });
    it('clicar em Codex estando em arvore mantem arvore', () => {
        montarHeader();
        fireEvent.click(screen.getByTestId('ir-arvore'));
        fireEvent.click(screen.getByRole('tab', { name: /Codex/ }));
        expect(sub()).toBe('arvore');
    });
    it('Codex fica ativo para lore, tierlist e arvore', () => {
        montarHeader();
        ['lore', 'tierlist', 'arvore'].forEach(s => {
            fireEvent.click(screen.getByTestId(`ir-${s}`));
            const sel = selecionadas();
            expect(sel).toHaveLength(1);
            expect(sel[0].textContent).toContain('Codex');
            expect(sel[0].classList.contains('ativo')).toBe(true);
        });
    });
    it('voltar ao Chat desativa Codex', () => {
        montarHeader();
        fireEvent.click(screen.getByRole('tab', { name: /Codex/ }));
        fireEvent.click(screen.getByRole('tab', { name: /Chat/ }));
        expect(sub()).toBe('chat');
        expect(selecionadas()).toHaveLength(1);
        expect(selecionadas()[0].textContent).toContain('Chat');
        expect(screen.getByRole('tab', { name: /Codex/ }).classList.contains('ativo')).toBe(false);
    });
});

describe('AIChat - botoes chip', () => {
    const semear = (msgs) => localStorage.setItem('rpgSextaFeira_chat_M1_Ana', JSON.stringify(msgs));
    const montarChat = () => render(<AIFormProvider><AIChat /></AIFormProvider>);
    beforeEach(() => {
        window.speechSynthesis = { cancel: vi.fn(), speak: vi.fn() };
        window.SpeechSynthesisUtterance = function () {};
    });
    afterEach(() => { delete window.speechSynthesis; delete window.SpeechSynthesisUtterance; });

    it('mestre: Ouvir, Enviar, Memorizar, So Mestre usam sexta-chip-btn e nao btn-neon', () => {
        useStore.setState({ isMestre: true });
        semear([{ role: 'user', texto: 'oi' }, { role: 'ai', texto: 'resposta' }]);
        const { container } = montarChat();
        const rodape = container.querySelector('.sexta-msg-rodape');
        expect(rodape).not.toBeNull();
        const botoes = Array.from(rodape.querySelectorAll('button'));
        const info = botoes.map(b => b.textContent + '|' + (b.getAttribute('aria-label') || '')).join(' ');
        expect(info).toMatch(/Ouvir/);
        expect(info).toMatch(/Enviar/);
        expect(info).toMatch(/Memorizar/);
        expect(info).toMatch(/Mestre/);
        expect(botoes.length).toBeGreaterThanOrEqual(4);
        botoes.forEach(b => {
            expect(b.classList.contains('sexta-chip-btn')).toBe(true);
            expect(b.classList.contains('btn-neon')).toBe(false);
        });
        expect(screen.getByText(/Enviar/).classList.contains('azul')).toBe(true);
    });
    it('mestre: Resumir sessao usa chip ouro sem btn-neon', () => {
        useStore.setState({ isMestre: true });
        semear([]);
        montarChat();
        const b = screen.getByText(/Resumir sessão/);
        expect(b.classList.contains('sexta-chip-btn')).toBe(true);
        expect(b.classList.contains('ouro')).toBe(true);
        expect(b.classList.contains('btn-neon')).toBe(false);
    });
    it('erro na ultima mensagem: Tentar de novo e chip vermelho sem btn-neon', () => {
        semear([{ role: 'user', texto: 'a' }, { role: 'erro', texto: 'falhou' }]);
        montarChat();
        const b = screen.getByText(/Tentar de novo/);
        expect(b.classList.contains('sexta-chip-btn')).toBe(true);
        expect(b.classList.contains('vermelho')).toBe(true);
        expect(b.classList.contains('btn-neon')).toBe(false);
    });
    it('jogador com registros compartilhados so tem Ouvir, tambem chip', () => {
        useStore.setState({ registrosCompartilhados: true });
        semear([{ role: 'ai', texto: 'resposta' }]);
        const { container } = montarChat();
        const botoes = Array.from(container.querySelectorAll('.sexta-msg-rodape button'));
        expect(botoes.length).toBe(1);
        expect(botoes[0].className).toContain('sexta-chip-btn');
        expect(botoes[0].className).not.toContain('btn-neon');
    });
    it('nenhum botao dentro das mensagens carrega btn-neon', () => {
        useStore.setState({ isMestre: true });
        semear([{ role: 'ai', texto: 'x' }, { role: 'erro', texto: 'e' }]);
        const { container } = montarChat();
        container.querySelectorAll('.sexta-msg button').forEach(b => expect(b.classList.contains('btn-neon')).toBe(false));
    });
});

describe('styles.css - regras da nav e chips', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../../../css/styles.css'), 'utf8');
    it('existem .sexta-nav, .sexta-nav-item e .sexta-chip-btn com modificadores', () => {
        expect(css).toMatch(/\.sexta-nav\s*[{,]/);
        expect(css).toMatch(/\.sexta-nav-item\b/);
        expect(css).toMatch(/\.sexta-chip-btn\b/);
        ['azul', 'ouro', 'verde', 'vermelho'].forEach(m => expect(css).toMatch(new RegExp(`\\.sexta-chip-btn\\.${m}\\b`)));
    });
    it('.sexta-nav-item.ativo existe', () => {
        expect(css).toMatch(/\.sexta-nav-item\.ativo\b/);
    });
    it('regras antigas .sexta-abas e .sexta-msg-acoes-btn sumiram', () => {
        expect(css).not.toMatch(/\.sexta-abas\b/);
        expect(css).not.toMatch(/\.sexta-msg-acoes-btn\b/);
    });
    it('componente nao referencia mais as classes antigas', () => {
        const jsx = fs.readFileSync(path.resolve(__dirname, 'AISubComponents.jsx'), 'utf8');
        expect(jsx).not.toMatch(/sexta-abas\b/);
        expect(jsx).not.toMatch(/sexta-msg-acoes-btn\b/);
    });
});

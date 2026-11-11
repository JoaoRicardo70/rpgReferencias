import React from 'react';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PoderesFormProvider, usePoderesForm } from './PoderesFormContext';
import { PoderesNavegacaoLivro, PoderesLista } from './PoderesSubComponents';
import useStore, { fichaPadrao } from '../../stores/useStore';

// ---------------------------------------------------------------------------
// QA — pastas dos poderes NASCEM FECHADAS (estado em memória na store REAL: pastasAbertasPoder, chave
// "categoria::caminho"), Expandir/Recolher tudo, persistência entre remontagens/abas, abrir ao gravar/reescrever
// e manter o estado ao renomear. Só o firebase-sync é simulado.
// ---------------------------------------------------------------------------

vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
    salvarFichaAlvoSilencioso: vi.fn(),
    salvarFichaAlvoImediato: vi.fn(() => Promise.resolve()),
    iniciarSincronizacaoFichaAlvo: vi.fn(),
    pararSincronizacaoFichaAlvo: vi.fn(),
    uploadImagem: vi.fn(() => Promise.resolve('https://exemplo.com/img.png')),
}));

let probe;
function Harness() { probe = usePoderesForm(); return null; }

const poder = (id, nome, categoria, pasta) => ({ id, nome, categoria, ativa: false, pasta, descricao: 'd', efeitos: [], efeitosPassivos: [] });

function semear(poderes, pastasAbertasPoder = {}) {
    const ficha = JSON.parse(JSON.stringify(fichaPadrao));
    ficha.poderes = poderes;
    useStore.setState({ minhaFicha: ficha, meuNome: 'Heroi', pastasAbertasPoder, rascunhosPoder: {}, poderEditandoId: null });
}

const montar = () => render(<PoderesFormProvider><Harness /><PoderesNavegacaoLivro /><PoderesLista /></PoderesFormProvider>);
const abertas = () => useStore.getState().pastasAbertasPoder;
const toggle = (nome) => screen.getAllByRole('button').find(b => b.classList.contains('grimorio-pasta-toggle') && b.textContent.includes(`📁 ${nome}`));
const expandirTudo = () => fireEvent.click(screen.getByText('📂 Expandir tudo'));
const recolherTudo = () => fireEvent.click(screen.getByText('📁 Recolher tudo'));

const FORMAS = () => [
    poder(1, 'F-Raiz', 'forma', 'Taijutsu'),
    poder(2, 'F-Sub', 'forma', 'Taijutsu/Portões'),
    poder(3, 'F-Solta', 'forma', ''),
];

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { cleanup(); });

describe('pastas nascem fechadas', () => {
    it('com o estado inicial vazio nenhum item de pasta aparece, só os cabeçalhos', () => {
        semear(FORMAS());
        montar();
        fireEvent.click(screen.getByText('🎭 Formas'));
        expect(toggle('Taijutsu')).toBeDefined();
        expect(toggle('Taijutsu').getAttribute('aria-expanded')).toBe('false');
        expect(toggle('Sem Pasta').getAttribute('aria-expanded')).toBe('false');
        expect(screen.queryByText('F-Raiz')).toBeNull();
        expect(screen.queryByText('F-Sub')).toBeNull();
        expect(screen.queryByText('F-Solta')).toBeNull();
        expect(abertas()).toEqual({});
    });

    it('clicar abre só aquela pasta e grava a chave categoria::caminho', () => {
        semear(FORMAS());
        montar();
        fireEvent.click(screen.getByText('🎭 Formas'));
        fireEvent.click(toggle('Taijutsu'));
        expect(screen.getByText('F-Raiz')).toBeDefined();
        expect(screen.queryByText('F-Sub')).toBeNull(); // subpasta continua fechada
        expect(abertas()).toEqual({ 'forma::Taijutsu': true });
        fireEvent.click(toggle('Taijutsu'));
        expect(screen.queryByText('F-Raiz')).toBeNull();
        expect(abertas()).toEqual({});
    });

    it('habilidades sem nenhuma pasta continuam em lista simples (nada a abrir)', () => {
        semear([poder(1, 'H-1', 'habilidade', ''), poder(2, 'H-2', 'habilidade', '')]);
        montar();
        expect(screen.getByText('H-1')).toBeDefined();
        expect(screen.queryByText('📂 Expandir tudo')).toBeNull();
    });
});

describe('Expandir tudo / Recolher tudo', () => {
    it('Expandir abre pastas, subpastas e "Sem Pasta"; Recolher fecha tudo', () => {
        semear(FORMAS());
        montar();
        fireEvent.click(screen.getByText('🎭 Formas'));
        expandirTudo();
        ['F-Raiz', 'F-Sub', 'F-Solta'].forEach(n => expect(screen.getByText(n)).toBeDefined());
        expect(abertas()).toEqual({ 'forma::Taijutsu': true, 'forma::Taijutsu/Portões': true, 'forma::Sem Pasta': true });
        recolherTudo();
        ['F-Raiz', 'F-Sub', 'F-Solta'].forEach(n => expect(screen.queryByText(n)).toBeNull());
        expect(abertas()).toEqual({});
    });

    it('só mexe na categoria visível: Expandir em Formas não abre Habilidades', () => {
        semear([...FORMAS(), poder(10, 'H-Combo', 'habilidade', 'Combos')]);
        montar();
        fireEvent.click(screen.getByText('🎭 Formas'));
        expandirTudo();
        fireEvent.click(screen.getByText('🗡️ Habilidades'));
        expect(screen.queryByText('H-Combo')).toBeNull();
        expect(Object.keys(abertas()).every(k => k.startsWith('forma::'))).toBe(true);
    });
});

describe('estado sobrevive a remontagem e a trocar de aba, sem vazar entre categorias', () => {
    it('remontar o livro mantém a pasta aberta', () => {
        semear(FORMAS());
        const r = montar();
        fireEvent.click(screen.getByText('🎭 Formas'));
        fireEvent.click(toggle('Taijutsu'));
        r.unmount();
        montar();
        fireEvent.click(screen.getByText('🎭 Formas'));
        expect(screen.getByText('F-Raiz')).toBeDefined();
    });

    it('trocar de aba e voltar mantém; mesmo nome de pasta em outra categoria segue fechado', () => {
        semear([poder(1, 'H-Combo', 'habilidade', 'Combos'), poder(2, 'F-Combo', 'forma', 'Combos'), poder(3, 'P-Combo', 'poder', 'Combos')]);
        montar();
        fireEvent.click(toggle('Combos')); // habilidade
        expect(screen.getByText('H-Combo')).toBeDefined();

        fireEvent.click(screen.getByText('🎭 Formas'));
        expect(screen.queryByText('F-Combo')).toBeNull();
        fireEvent.click(screen.getByText('✨ Poderes'));
        expect(screen.queryByText('P-Combo')).toBeNull();

        fireEvent.click(screen.getByText('🗡️ Habilidades'));
        expect(screen.getByText('H-Combo')).toBeDefined();
        expect(abertas()).toEqual({ 'habilidade::Combos': true });
    });

    it('estado pré-semeado na store é respeitado', () => {
        semear(FORMAS(), { 'forma::Taijutsu': true, 'forma::Taijutsu/Portões': true });
        montar();
        fireEvent.click(screen.getByText('🎭 Formas'));
        expect(screen.getByText('F-Raiz')).toBeDefined();
        expect(screen.getByText('F-Sub')).toBeDefined();
        expect(screen.queryByText('F-Solta')).toBeNull();
    });
});

describe('gravar / reescrever abre a pasta e as mães', () => {
    it('salvarNovoPoder com pasta "A/B" abre A e A/B (e só da categoria gravada)', async () => {
        semear([]);
        montar();
        act(() => {
            probe.setAbaAtual('habilidade');
            probe.setNomePoder('Golpe Novo');
            probe.setDescricaoPoder('d');
            probe.setPastaPoder('A/B');
        });
        await act(async () => { probe.salvarNovoPoder(); });
        expect(abertas()).toEqual({ 'habilidade::A': true, 'habilidade::A/B': true });
        expect(screen.getByText('Golpe Novo')).toBeDefined();
    });

    it('salvarNovoPoder sem pasta abre o balde "Sem Pasta" da categoria', async () => {
        semear([]);
        montar();
        act(() => {
            probe.setAbaAtual('forma');
            probe.setNomePoder('Forma Solta');
            probe.setDescricaoPoder('d');
            probe.setPastaPoder('');
        });
        await act(async () => { probe.salvarNovoPoder(); });
        expect(abertas()).toEqual({ 'forma::Sem Pasta': true });
        expect(screen.getByText('Forma Solta')).toBeDefined();
    });

    it('reescrever (editarPoder) abre a pasta do poder e as mães, mesmo estando tudo fechado', () => {
        semear([poder(5, 'Fundo', 'habilidade', 'X/Y/Z')]);
        montar();
        expect(abertas()).toEqual({});
        act(() => { probe.editarPoder(5); });
        expect(abertas()).toEqual({ 'habilidade::X': true, 'habilidade::X/Y': true, 'habilidade::X/Y/Z': true });
    });
});

describe('renomear mantém o estado aberto', () => {
    let promptSpy;
    afterEach(() => { promptSpy?.mockRestore(); });

    it('renomear pasta aberta (e a subpasta aberta) mantém ambas abertas com os novos nomes', () => {
        semear(FORMAS(), { 'forma::Taijutsu': true, 'forma::Taijutsu/Portões': true });
        promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('Ninjutsu');
        montar();
        fireEvent.click(screen.getByText('🎭 Formas'));
        fireEvent.click(screen.getAllByText('✎ Renomear/Remover')[0]);
        expect(abertas()).toEqual({ 'forma::Ninjutsu': true, 'forma::Ninjutsu/Portões': true });
        expect(toggle('Ninjutsu').getAttribute('aria-expanded')).toBe('true');
        expect(screen.getByText('F-Raiz')).toBeDefined();
        expect(screen.getByText('F-Sub')).toBeDefined();
    });

    it('renomear pasta fechada continua fechada', () => {
        semear(FORMAS());
        promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('Ninjutsu');
        montar();
        fireEvent.click(screen.getByText('🎭 Formas'));
        fireEvent.click(screen.getAllByText('✎ Renomear/Remover')[0]);
        expect(toggle('Ninjutsu').getAttribute('aria-expanded')).toBe('false');
        expect(abertas()).toEqual({});
    });

    it('remover a pasta (nome vazio) apaga a chave dela e os itens sobem', () => {
        semear([poder(1, 'F-Raiz', 'forma', 'Taijutsu')], { 'forma::Taijutsu': true });
        promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('');
        montar();
        fireEvent.click(screen.getByText('🎭 Formas'));
        fireEvent.click(screen.getByText('✎ Renomear/Remover'));
        expect(abertas()['forma::Taijutsu']).toBeUndefined();
        expect(useStore.getState().minhaFicha.poderes[0].pasta).toBe('');
    });

    it('renomear em Formas não mexe nas chaves de Habilidades com o mesmo nome', () => {
        semear([poder(1, 'F1', 'forma', 'Combos'), poder(2, 'H1', 'habilidade', 'Combos')], { 'forma::Combos': true, 'habilidade::Combos': true });
        promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('Combos2');
        montar();
        fireEvent.click(screen.getByText('🎭 Formas'));
        fireEvent.click(screen.getByText('✎ Renomear/Remover'));
        expect(abertas()).toEqual({ 'forma::Combos2': true, 'habilidade::Combos': true });
    });
});

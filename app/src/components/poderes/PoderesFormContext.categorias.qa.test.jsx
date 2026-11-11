import React from 'react';
import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PoderesFormProvider, usePoderesForm } from './PoderesFormContext';
import { PoderesNavegacaoLivro } from './PoderesSubComponents';
import { FichaAlvoProvider } from '../Ficha Def/FichaAlvoContext';
import useStore, { fichaPadrao } from '../../stores/useStore';

// QA - categorias novas do Grimorio (ocular, infinity, singularidade): abas, rebaixamento, rascunho, salvarNovoPoder.

vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
    salvarFichaAlvoSilencioso: vi.fn(),
    salvarFichaAlvoImediato: vi.fn(() => Promise.resolve()),
    iniciarSincronizacaoFichaAlvo: vi.fn(),
    pararSincronizacaoFichaAlvo: vi.fn(),
    uploadImagem: vi.fn(() => Promise.resolve('https://exemplo.com/img.png')),
    enviarParaFeed: vi.fn(),
}));

let probe;
function Harness() { probe = usePoderesForm(); return null; }
function App({ alvo, persistir = false, nav = true }) {
    return (
        <FichaAlvoProvider nome={alvo}>
            <PoderesFormProvider persistirRascunho={persistir}><Harness />{nav && <PoderesNavegacaoLivro />}</PoderesFormProvider>
        </FichaAlvoProvider>
    );
}

let fichaBase;
const hier = (extra = {}) => ({ ...fichaBase.hierarquia, ...extra });
function resetStore({ hierarquia = {}, poderes = [], personagens = {}, isMestre = false, rascunhosPoder = {} } = {}) {
    useStore.setState({
        minhaFicha: { ...fichaBase, hierarquia: hier(hierarquia), poderes, contadores: [] }, meuNome: 'Heroi', isMestre, personagens,
        efeitosTemp: [], efeitosTempPassivos: [], poderEditandoId: null, rascunhosPoder,
    });
}
const minha = () => useStore.getState().minhaFicha;
const abas = () => screen.getAllByRole('tab').map(t => t.textContent);
const abaSelecionada = () => screen.getAllByRole('tab').find(t => t.getAttribute('aria-selected') === 'true')?.textContent;

beforeEach(() => {
    fichaBase = structuredClone(fichaPadrao);
    resetStore();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(window, 'alert').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('store: default de hierarquia.ocular', () => {
    it('ficha padrao tem hierarquia.ocular === false', () => {
        expect(fichaBase.hierarquia.ocular).toBe(false);
    });
});

describe('PoderesNavegacaoLivro - visibilidade das abas', () => {
    it('sem liberacao nem poderes: so Habilidades, Formas e Poderes', () => {
        render(<App />);
        expect(abas()).toEqual(['🗡️ Habilidades', '🎭 Formas', '✨ Poderes']);
    });
    it('ocular liberado: aba Poderes Oculares aparece; as outras nao', () => {
        resetStore({ hierarquia: { ocular: true } });
        render(<App />);
        expect(abas()).toContain('👁️ Poderes Oculares');
        expect(abas()).not.toContain('♾️ Infinities');
        expect(abas()).toHaveLength(4);
    });
    it('todas liberadas: 6 abas na ordem', () => {
        resetStore({ hierarquia: { ocular: true, infinity: true, singularidade: '1' } });
        render(<App />);
        expect(abas()).toEqual(['🗡️ Habilidades', '🎭 Formas', '✨ Poderes', '👁️ Poderes Oculares', '♾️ Infinities', '🌌 Singularidades']);
    });
    it('com poderes na categoria sem liberacao: aba visivel', () => {
        resetStore({ poderes: [{ id: 1, nome: 'Rin', categoria: 'infinity' }] });
        render(<App />);
        expect(abas()).toContain('♾️ Infinities');
    });
    it('ficha antiga sem hierarquia.ocular nem hierarquia: nao quebra', () => {
        useStore.setState({ minhaFicha: { ...fichaBase, hierarquia: undefined, poderes: [] } });
        expect(() => render(<App />)).not.toThrow();
        expect(abas()).toHaveLength(3);
    });
    it('Mestre ve a dica de liberar; jogador nao; com tudo liberado nem o Mestre', () => {
        resetStore({ isMestre: true });
        const { unmount } = render(<App />);
        expect(screen.getByRole('note').textContent).toContain('Libere Oculares/Infinity/Singularidade');
        unmount();
        resetStore({ isMestre: false });
        const r2 = render(<App />);
        expect(screen.queryByRole('note')).toBeNull();
        r2.unmount();
        resetStore({ isMestre: true, hierarquia: { ocular: true, infinity: true, singularidade: '0' } });
        render(<App />);
        expect(screen.queryByRole('note')).toBeNull();
    });
    it('aba Singularidade mostra grau e regra de nao copia; Infinity mostra que permite copia', () => {
        resetStore({ hierarquia: { singularidade: '2', infinity: true } });
        render(<App />);
        fireEvent.click(screen.getByRole('tab', { name: /Singularidades/ }));
        expect(screen.getByText(/Singularidade Grau 2 \(Desenvolvida\)\. Impossível de copiar ou ensinar\./)).toBeTruthy();
        fireEvent.click(screen.getByRole('tab', { name: /Infinities/ }));
        expect(screen.getByText(/Infinity permite cópia/)).toBeTruthy();
        expect(screen.queryByText(/Impossível de copiar/)).toBeNull();
    });
    it('acessibilidade: tablist, aria-controls e roving tabindex', () => {
        resetStore({ hierarquia: { ocular: true } });
        render(<App />);
        expect(screen.getByRole('tablist')).toBeTruthy();
        screen.getAllByRole('tab').forEach((t) => {
            expect(t.getAttribute('aria-controls')).toBe('poderes-categoria-painel');
            expect(t.getAttribute('tabindex')).toBe(t.getAttribute('aria-selected') === 'true' ? '0' : '-1');
        });
    });
    it('setas, Home e End percorrem as abas dinamicas (com wrap)', () => {
        resetStore({ hierarquia: { ocular: true, infinity: true } });
        render(<App />);
        const lista = screen.getByRole('tablist');
        fireEvent.keyDown(lista, { key: 'End' });
        expect(abaSelecionada()).toBe('♾️ Infinities');
        fireEvent.keyDown(lista, { key: 'ArrowRight' });
        expect(abaSelecionada()).toBe('🗡️ Habilidades');
        fireEvent.keyDown(lista, { key: 'ArrowLeft' });
        expect(abaSelecionada()).toBe('♾️ Infinities');
        fireEvent.keyDown(lista, { key: 'Home' });
        expect(abaSelecionada()).toBe('🗡️ Habilidades');
    });
});

describe('rebaixamento da aba que sumiu', () => {
    it('liberacao retirada com a aba aberta volta para Habilidades', async () => {
        resetStore({ hierarquia: { ocular: true } });
        render(<App />);
        act(() => { probe.trocarAba('ocular'); });
        expect(probe.abaAtual).toBe('ocular');
        act(() => { useStore.setState({ minhaFicha: { ...minha(), hierarquia: { ...minha().hierarquia, ocular: false } } }); });
        await waitFor(() => expect(probe.abaAtual).toBe('habilidade'));
        expect(abaSelecionada()).toBe('🗡️ Habilidades');
    });
    it('liberacao retirada MAS com poderes na categoria: a aba permanece', () => {
        resetStore({ hierarquia: { infinity: true }, poderes: [{ id: 1, nome: 'x', categoria: 'infinity' }] });
        render(<App />);
        act(() => { probe.trocarAba('infinity'); });
        act(() => { useStore.setState({ minhaFicha: { ...minha(), hierarquia: { ...minha().hierarquia, infinity: false } } }); });
        expect(probe.abaAtual).toBe('infinity');
    });
    it('Mestre troca para uma entidade sem a liberacao: volta a Habilidades', async () => {
        resetStore({ hierarquia: { infinity: true }, isMestre: true, personagens: { Outro: { ...fichaBase, hierarquia: hier({}), poderes: [] } } });
        const { rerender } = render(<App />);
        act(() => { probe.trocarAba('infinity'); });
        expect(probe.abaAtual).toBe('infinity');
        rerender(<App alvo="Outro" />);
        await waitFor(() => expect(probe.abaAtual).toBe('habilidade'));
    });
    it('Mestre troca para uma entidade que TEM a liberacao: a aba continua', () => {
        resetStore({ hierarquia: { infinity: true }, isMestre: true, personagens: { Outro: { ...fichaBase, hierarquia: hier({ infinity: true }), poderes: [] } } });
        const { rerender } = render(<App />);
        act(() => { probe.trocarAba('infinity'); });
        rerender(<App alvo="Outro" />);
        expect(probe.abaAtual).toBe('infinity');
    });
    it('carga inicial NAO rebaixa a aba restaurada do rascunho; ao chegar a ficha real a aba segue visivel', async () => {
        // ficha ainda "padrao" (sem liberacao) quando o provider monta; aba lembrada = infinity
        resetStore({ hierarquia: {}, rascunhosPoder: { 'Heroi|_aba': 'infinity' } });
        render(<App persistir />);
        expect(probe.abaAtual).toBe('infinity');
        await act(async () => { await Promise.resolve(); });
        expect(probe.abaAtual).toBe('infinity');
        act(() => { useStore.setState({ minhaFicha: { ...minha(), hierarquia: { ...minha().hierarquia, infinity: true } } }); });
        expect(probe.abaAtual).toBe('infinity');
        expect(abaSelecionada()).toBe('♾️ Infinities');
    });
    it('aba restaurada de categoria que nunca chega a ser liberada acaba rebaixada (nunca fica presa em aba oculta)', async () => {
        resetStore({ hierarquia: {}, rascunhosPoder: { 'Heroi|_aba': 'ocular' } });
        render(<App persistir />);
        expect(probe.abaAtual).toBe('ocular');
        // chega outra versao da ficha, ainda sem liberacao
        act(() => { useStore.setState({ minhaFicha: { ...minha(), bio: { ...minha().bio, apelido: 'x' } } }); });
        await waitFor(() => expect(probe.abaAtual).toBe('habilidade'));
    });
    it('aba salva invalida no rascunho cai em habilidade', () => {
        resetStore({ rascunhosPoder: { 'Heroi|_aba': 'xyz' } });
        render(<App persistir />);
        expect(probe.abaAtual).toBe('habilidade');
    });
});

describe('rascunho por categoria', () => {
    it('cada categoria mantem o seu rascunho ao trocar de aba', async () => {
        resetStore({ hierarquia: { ocular: true, infinity: true } });
        render(<App persistir />);
        act(() => { probe.setNomePoder('Rascunho Hab'); });
        act(() => { probe.trocarAba('ocular'); });
        await waitFor(() => expect(probe.nomePoder).toBe(''));
        act(() => { probe.setNomePoder('Rascunho Olho'); });
        act(() => { probe.trocarAba('infinity'); });
        await waitFor(() => expect(probe.nomePoder).toBe(''));
        act(() => { probe.trocarAba('habilidade'); });
        await waitFor(() => expect(probe.nomePoder).toBe('Rascunho Hab'));
        act(() => { probe.trocarAba('ocular'); });
        await waitFor(() => expect(probe.nomePoder).toBe('Rascunho Olho'));
        expect(useStore.getState().rascunhosPoder['Heroi|ocular']).toBeTruthy();
        expect(useStore.getState().rascunhosPoder['Heroi|_aba']).toBe('ocular');
    });
});

describe('salvarNovoPoder com as categorias novas', () => {
    it.each(['ocular', 'infinity', 'singularidade'])('%s: grava categoria, maestria e maestriaRequerida (sem fadigaPorUso)', async (cat) => {
        resetStore({ hierarquia: { ocular: true, infinity: true, singularidade: '3' } });
        render(<App />);
        act(() => { probe.trocarAba(cat); });
        act(() => { probe.setNomePoder(`Novo ${cat}`); probe.setDescricaoPoder('d'); probe.setMaestriaPoder(35); probe.setMaestriaRequeridaPoder(80); });
        await act(async () => { probe.salvarNovoPoder(); });
        const p = minha().poderes[0];
        expect(minha().poderes).toHaveLength(1);
        expect(p).toMatchObject({ nome: `Novo ${cat}`, categoria: cat, maestria: 35, maestriaRequerida: 80 });
        expect(p.fadigaPorUso).toBeUndefined();
    });
    it('maestria e maestriaRequerida sao limitadas a 0-100', async () => {
        resetStore({ hierarquia: { ocular: true } });
        render(<App />);
        act(() => { probe.trocarAba('ocular'); });
        act(() => { probe.setNomePoder('Lim'); probe.setDescricaoPoder('d'); probe.setMaestriaPoder(500); probe.setMaestriaRequeridaPoder(-5); });
        await act(async () => { probe.salvarNovoPoder(); });
        expect(minha().poderes[0]).toMatchObject({ maestria: 100, maestriaRequerida: 0 });
    });
    it('contadores e gatilhos funcionam numa categoria nova', async () => {
        resetStore({ hierarquia: { infinity: true } });
        render(<App />);
        act(() => { probe.trocarAba('infinity'); });
        act(() => { probe.adicionarContadorPoder({ nome: 'Cargas', min: 0, max: 3, reset: 'cena' }); });
        const idc = probe.contadoresPoder[0].id;
        act(() => { probe.setNomePoder('Inf C'); probe.setDescricaoPoder('d'); });
        act(() => { probe.setGatilhosPoder([{ id: 'g1', nome: 'S', evento: { tipo: 'atingido', nivel: 'qualquer' }, acoes: [{ tipo: 'contador', id: idc, op: 'somar', valor: 1 }] }]); });
        await act(async () => { probe.salvarNovoPoder(); });
        const f = minha();
        expect(f.poderes[0].categoria).toBe('infinity');
        expect(f.poderes[0].gatilhos).toHaveLength(1);
        expect(f.contadores[0]).toMatchObject({ id: idc, nome: 'Cargas', poderId: f.poderes[0].id });
    });
    it('editar poder ocular existente mantem categoria e atualiza maestria', async () => {
        resetStore({ hierarquia: { ocular: true }, poderes: [{ id: 7, nome: 'Olho', descricao: 'd', categoria: 'ocular', maestria: 10, maestriaRequerida: 20, ativa: false, efeitos: [], efeitosPassivos: [], formas: [], dadosQtd: 0, dadosFaces: 20 }] });
        render(<App />);
        act(() => { probe.trocarAba('ocular'); });
        act(() => { probe.editarPoder(7); });
        act(() => { probe.setMaestriaPoder(60); });
        await act(async () => { probe.salvarNovoPoder(); });
        const p = minha().poderes.find(x => x.id === 7);
        expect(p.categoria).toBe('ocular');
        expect(p.maestria).toBe(60);
        expect(p.maestriaRequerida).toBe(20);
        expect(minha().poderes).toHaveLength(1);
    });
    it('Forma continua com fadigaPorUso e sem maestriaRequerida', async () => {
        render(<App />);
        act(() => { probe.trocarAba('forma'); });
        act(() => { probe.setNomePoder('F'); probe.setDescricaoPoder('d'); probe.setFadigaPorUsoPoder(7); });
        await act(async () => { probe.salvarNovoPoder(); });
        expect(minha().poderes[0].categoria).toBe('forma');
        expect(minha().poderes[0].maestriaRequerida).toBeUndefined();
        expect(minha().poderes[0]).toHaveProperty('fadigaPorUso');
    });
});

describe('lista por categoria e dados antigos', () => {
    it('itensFiltrados: poder sem categoria = Poderes; categoria desconhecida = Habilidades; ocular so em Oculares', () => {
        resetStore({
            hierarquia: { ocular: true },
            poderes: [
                { id: 1, nome: 'Velho' }, { id: 2, nome: 'Estranho', categoria: 'legado' },
                { id: 3, nome: 'Olho', categoria: 'ocular' }, { id: 4, nome: 'Plural', categoria: 'Oculares' },
            ],
        });
        render(<App />);
        expect(probe.itensFiltrados.map(p => p.nome)).toEqual(['Estranho']);
        act(() => { probe.trocarAba('poder'); });
        expect(probe.itensFiltrados.map(p => p.nome)).toEqual(['Velho']);
        act(() => { probe.trocarAba('ocular'); });
        expect(probe.itensFiltrados.map(p => p.nome)).toEqual(['Olho', 'Plural']);
    });
});

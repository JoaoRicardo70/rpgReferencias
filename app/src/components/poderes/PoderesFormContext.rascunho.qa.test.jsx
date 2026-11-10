import React from 'react';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PoderesFormProvider, usePoderesForm } from './PoderesFormContext';
import { PoderesFormEditor } from './PoderesSubComponents';
import { FichaAlvoProvider } from '../Ficha Def/FichaAlvoContext';
import useStore from '../../stores/useStore';
import { rascunhoVazio, rascunhoDoPoder } from '../../core/rascunhoPoder';

// QA — rascunho persistente do formulário do Livro dos Poderes, com a STORE REAL (só o firebase-sync é simulado).

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

function App({ alvo, persistir = true, comEditor = false }) {
    const inner = (
        <PoderesFormProvider persistirRascunho={persistir}>
            <Harness />
            {comEditor && <PoderesFormEditor />}
        </PoderesFormProvider>
    );
    return alvo ? <FichaAlvoProvider nome={alvo}>{inner}</FichaAlvoProvider> : inner;
}

let fichaBase;
const poderGravado = (extra = {}) => ({
    id: 5, nome: 'Antigo', descricao: 'desc', categoria: 'habilidade', ativa: false,
    efeitos: [], efeitosPassivos: [], formas: [], dadosQtd: 0, dadosFaces: 20, ...extra,
});

function resetStore({ poderes = [], personagens = {}, meuNome = 'Heroi' } = {}) {
    useStore.setState({
        minhaFicha: { ...fichaBase, poderes },
        meuNome, isMestre: false, personagens,
        efeitosTemp: [], efeitosTempPassivos: [], poderEditandoId: null,
        rascunhosPoder: {},
    });
}
const rasc = (chave) => useStore.getState().rascunhosPoder[chave];
const avancar = (ms) => act(() => { vi.advanceTimersByTime(ms); });

let confirmSpy; let alertSpy;
beforeEach(() => {
    vi.useFakeTimers();
    fichaBase = structuredClone(useStore.getState().minhaFicha);
    resetStore();
    confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
});
afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('Rascunho — persistência na store e remontagem', () => {
    it('rascunho sobrevive à remontagem do provider (após o debounce)', () => {
        const { unmount } = render(<App />);
        act(() => { probe.setNomePoder('Chama'); probe.setDescricaoPoder('Fogo'); });
        avancar(300);
        unmount();
        render(<App />);
        expect(probe.nomePoder).toBe('Chama');
        expect(probe.descricaoPoder).toBe('Fogo');
    });

    it('desmontar ANTES dos 300ms grava o pendente (flush no cleanup)', () => {
        const { unmount } = render(<App />);
        act(() => { probe.setNomePoder('Rápido'); });
        avancar(50);
        expect(rasc('Heroi|habilidade')).toBeUndefined();
        unmount();
        expect(rasc('Heroi|habilidade').nome).toBe('Rápido');
        render(<App />);
        expect(probe.nomePoder).toBe('Rápido');
    });

    it('Habilidades e Formas guardam rascunhos separados', () => {
        render(<App />);
        act(() => { probe.setNomePoder('Hab 1'); });
        act(() => { probe.trocarAba('forma'); });
        expect(probe.nomePoder).toBe('');
        act(() => { probe.setNomePoder('Forma 1'); });
        avancar(300);
        expect(rasc('Heroi|habilidade').nome).toBe('Hab 1');
        expect(rasc('Heroi|forma').nome).toBe('Forma 1');
        act(() => { probe.trocarAba('habilidade'); });
        expect(probe.nomePoder).toBe('Hab 1');
        act(() => { probe.trocarAba('forma'); });
        expect(probe.nomePoder).toBe('Forma 1');
    });

    it('trocar de aba não zera o rascunho (nem efeitos já adicionados)', () => {
        render(<App />);
        act(() => { probe.setNomeEfeito('Bônus'); probe.setNovoVal('5'); });
        act(() => { probe.addEfeitoTemp(); });
        expect(probe.efeitosTemp).toHaveLength(1);
        act(() => { probe.trocarAba('poder'); });
        expect(probe.efeitosTemp).toHaveLength(0);
        act(() => { probe.trocarAba('habilidade'); });
        expect(probe.efeitosTemp).toHaveLength(1);
        expect(probe.efeitosTemp[0].nome).toBe('Bônus');
    });

    it('a aba aberta é lembrada ao remontar', () => {
        const { unmount } = render(<App />);
        act(() => { probe.trocarAba('forma'); });
        expect(rasc('Heroi|_aba')).toBe('forma');
        unmount();
        render(<App />);
        expect(probe.abaAtual).toBe('forma');
    });

    it('aba salva inválida cai em habilidade', () => {
        useStore.setState({ rascunhosPoder: { 'Heroi|_aba': 'lixo' } });
        render(<App />);
        expect(probe.abaAtual).toBe('habilidade');
    });

    it('apagar o conteúdo remove a chave da store (rascunho vazio não é guardado)', () => {
        render(<App />);
        act(() => { probe.setNomePoder('abc'); });
        avancar(300);
        expect(rasc('Heroi|habilidade')).toBeDefined();
        act(() => { probe.setNomePoder(''); });
        avancar(300);
        expect(rasc('Heroi|habilidade')).toBeUndefined();
    });

    it('rascunho guardado é cópia (mudar o formulário depois não altera o que está na store até gravar)', () => {
        render(<App />);
        act(() => { probe.setNomePoder('v1'); });
        avancar(300);
        const guardado = rasc('Heroi|habilidade');
        act(() => { probe.setNomePoder('v2'); });
        expect(guardado.nome).toBe('v1');
        expect(rasc('Heroi|habilidade').nome).toBe('v1');
        avancar(300);
        expect(rasc('Heroi|habilidade').nome).toBe('v2');
    });
});

describe('Rascunho — debounce', () => {
    it('grava só após 300ms; várias mudanças seguidas reiniciam o prazo', () => {
        render(<App />);
        act(() => { probe.setNomePoder('a'); });
        avancar(299);
        expect(rasc('Heroi|habilidade')).toBeUndefined();
        act(() => { probe.setNomePoder('ab'); });
        avancar(299);
        expect(rasc('Heroi|habilidade')).toBeUndefined();
        avancar(1);
        expect(rasc('Heroi|habilidade').nome).toBe('ab');
    });

    it('trocar de aba faz flush na chave ANTIGA, antes do prazo', () => {
        render(<App />);
        act(() => { probe.setNomePoder('pendente'); });
        avancar(100);
        act(() => { probe.trocarAba('forma'); });
        expect(rasc('Heroi|habilidade').nome).toBe('pendente');
        expect(rasc('Heroi|forma')).toBeUndefined();
        avancar(1000);
        expect(rasc('Heroi|forma')).toBeUndefined();
    });

    it('sem persistirRascunho nada vai para a store', () => {
        render(<App persistir={false} />);
        act(() => { probe.setNomePoder('local'); });
        avancar(1000);
        expect(useStore.getState().rascunhosPoder).toEqual({});
        expect(probe.nomePoder).toBe('local');
    });

    it('sem persistirRascunho, trocar de aba zera o formulário (comportamento antigo)', () => {
        render(<App persistir={false} />);
        act(() => { probe.setNomePoder('local'); });
        act(() => { probe.trocarAba('forma'); });
        expect(probe.nomePoder).toBe('');
        act(() => { probe.trocarAba('habilidade'); });
        expect(probe.nomePoder).toBe('');
        expect(useStore.getState().rascunhosPoder).toEqual({});
    });

    it('sem persistirRascunho a remontagem começa vazia', () => {
        const { unmount } = render(<App persistir={false} />);
        act(() => { probe.setNomePoder('local'); });
        unmount();
        render(<App persistir={false} />);
        expect(probe.nomePoder).toBe('');
    });
});

describe('Rascunho — donos diferentes (ficha própria x entidade do Mestre)', () => {
    it('rascunho da entidade usa chave própria e não vaza para a ficha do jogador', () => {
        resetStore({ personagens: { Inimigo: { ...fichaBase, poderes: [] } } });
        const { unmount } = render(<App alvo="Inimigo" />);
        act(() => { probe.setNomePoder('Do Inimigo'); });
        avancar(300);
        expect(rasc('Inimigo|habilidade').nome).toBe('Do Inimigo');
        expect(rasc('Heroi|habilidade')).toBeUndefined();
        unmount();

        render(<App />);
        expect(probe.nomePoder).toBe('');
        act(() => { probe.setNomePoder('Do Herói'); });
        avancar(300);
        expect(rasc('Inimigo|habilidade').nome).toBe('Do Inimigo');
        expect(rasc('Heroi|habilidade').nome).toBe('Do Herói');
    });

    it('rascunho da ficha própria não aparece ao abrir a entidade', () => {
        resetStore({ personagens: { Inimigo: { ...fichaBase, poderes: [] } } });
        useStore.setState({ rascunhosPoder: { 'Heroi|habilidade': { ...rascunhoVazio(), nome: 'Meu' } } });
        render(<App alvo="Inimigo" />);
        expect(probe.nomePoder).toBe('');
    });

    it('gravar na entidade não mexe no poderEditandoId global do jogador', () => {
        resetStore({ personagens: { Inimigo: { ...fichaBase, poderes: [poderGravado()] } } });
        render(<App alvo="Inimigo" />);
        act(() => { probe.editarPoder(5); });
        expect(probe.poderEditandoId).toBe(5);
        expect(useStore.getState().poderEditandoId).toBeNull();
    });
});

describe('Rascunho — Cancelar', () => {
    it('sem conteúdo: não pede confirmação', () => {
        render(<App />);
        act(() => { probe.cancelarEdicaoComConfirmacao(); });
        expect(confirmSpy).not.toHaveBeenCalled();
    });

    it('com conteúdo: pede confirmação; recusar mantém tudo', () => {
        confirmSpy.mockReturnValue(false);
        render(<App />);
        act(() => { probe.setNomePoder('Importante'); });
        act(() => { probe.cancelarEdicaoComConfirmacao(); });
        expect(confirmSpy).toHaveBeenCalledTimes(1);
        expect(confirmSpy.mock.calls[0][0]).toMatch(/Descartar o que foi escrito/);
        expect(probe.nomePoder).toBe('Importante');
    });

    it('aceitar limpa só a categoria atual e preserva o rascunho das outras', () => {
        render(<App />);
        act(() => { probe.setNomePoder('Hab'); });
        act(() => { probe.trocarAba('forma'); });
        act(() => { probe.setNomePoder('Forma'); });
        act(() => { probe.cancelarEdicaoComConfirmacao(); });
        expect(probe.nomePoder).toBe('');
        avancar(300);
        expect(rasc('Heroi|forma')).toBeUndefined();
        expect(rasc('Heroi|habilidade').nome).toBe('Hab');
        act(() => { probe.trocarAba('habilidade'); });
        expect(probe.nomePoder).toBe('Hab');
    });

    it('texto de efeito digitado e não adicionado também conta como conteúdo', () => {
        render(<App />);
        act(() => { probe.setNomeEfeito('pendente'); });
        act(() => { probe.cancelarEdicaoComConfirmacao(); });
        expect(confirmSpy).toHaveBeenCalled();
    });

    it('reescrevendo poder SEM alterações: cancelar não pede confirmação', () => {
        resetStore({ poderes: [poderGravado()] });
        render(<App />);
        act(() => { probe.editarPoder(5); });
        expect(probe.poderEditandoId).toBe(5);
        act(() => { probe.cancelarEdicaoComConfirmacao(); });
        expect(confirmSpy).not.toHaveBeenCalled();
        expect(probe.poderEditandoId).toBeNull();
        expect(probe.nomePoder).toBe('');
    });

    it('reescrevendo poder COM alterações: pede confirmação', () => {
        resetStore({ poderes: [poderGravado()] });
        render(<App />);
        act(() => { probe.editarPoder(5); });
        act(() => { probe.setNomePoder('Antigo 2'); });
        act(() => { probe.cancelarEdicaoComConfirmacao(); });
        expect(confirmSpy).toHaveBeenCalledTimes(1);
    });
});

describe('Rascunho — gravar', () => {
    it('gravar limpa o rascunho da categoria e o poder entra na ficha', async () => {
        render(<App />);
        act(() => { probe.setNomePoder('Novo'); probe.setDescricaoPoder('d'); });
        avancar(300);
        expect(rasc('Heroi|habilidade')).toBeDefined();
        await act(async () => { probe.salvarNovoPoder(); });
        expect(useStore.getState().minhaFicha.poderes.map(p => p.nome)).toEqual(['Novo']);
        expect(rasc('Heroi|habilidade')).toBeUndefined();
        expect(probe.nomePoder).toBe('');
        avancar(1000);
        expect(rasc('Heroi|habilidade')).toBeUndefined();
    });

    it('gravar a Forma não apaga o rascunho da Habilidade', async () => {
        render(<App />);
        act(() => { probe.setNomePoder('Hab em andamento'); });
        act(() => { probe.trocarAba('forma'); });
        act(() => { probe.setNomePoder('Forma pronta'); probe.setDescricaoPoder('d'); });
        await act(async () => { probe.salvarNovoPoder(); });
        expect(useStore.getState().minhaFicha.poderes[0].categoria).toBe('forma');
        expect(rasc('Heroi|forma')).toBeUndefined();
        expect(rasc('Heroi|habilidade').nome).toBe('Hab em andamento');
    });

    it('validação falha (sem nome): alerta e mantém o rascunho', async () => {
        render(<App />);
        act(() => { probe.setDescricaoPoder('só descrição'); });
        avancar(300);
        await act(async () => { probe.salvarNovoPoder(); });
        expect(alertSpy).toHaveBeenCalled();
        expect(rasc('Heroi|habilidade').descricao).toBe('só descrição');
        expect(useStore.getState().minhaFicha.poderes).toHaveLength(0);
    });

    it('gravar a entidade limpa a chave da entidade, não a do jogador', async () => {
        resetStore({ personagens: { Inimigo: { ...fichaBase, poderes: [] } } });
        useStore.setState({ rascunhosPoder: { 'Heroi|habilidade': { ...rascunhoVazio(), nome: 'Meu' } } });
        render(<App alvo="Inimigo" />);
        act(() => { probe.setNomePoder('Dele'); probe.setDescricaoPoder('d'); });
        await act(async () => { probe.salvarNovoPoder(); });
        expect(useStore.getState().personagens.Inimigo.poderes.map(p => p.nome)).toEqual(['Dele']);
        expect(rasc('Inimigo|habilidade')).toBeUndefined();
        expect(rasc('Heroi|habilidade').nome).toBe('Meu');
    });
});

describe('Rascunho — poder em edição apagado', () => {
    it('remontar com rascunho de um poder que já não existe: vira poder NOVO, campos mantidos', () => {
        const r = { ...rascunhoDoPoder(poderGravado()), nome: 'Editado' };
        useStore.setState({ rascunhosPoder: { 'Heroi|habilidade': r } });
        render(<App comEditor />);
        expect(probe.poderEditandoId).toBeNull();
        expect(probe.nomePoder).toBe('Editado');
        expect(screen.queryByText(/Reescrevendo/)).toBeNull();
        expect(screen.getByText(/Criar Novo\(a\) Habilidade/)).toBeTruthy();
    });

    it('nunca mostra "Reescrevendo: " com nome vazio', () => {
        const r = rascunhoDoPoder(poderGravado());
        useStore.setState({ rascunhosPoder: { 'Heroi|habilidade': r } });
        render(<App comEditor />);
        expect(screen.queryByText(/Reescrevendo:\s*$/)).toBeNull();
    });

    it('remontar com poder existente mantém o id e mostra "Reescrevendo: Antigo"', () => {
        resetStore({ poderes: [poderGravado()] });
        useStore.setState({ rascunhosPoder: { 'Heroi|habilidade': rascunhoDoPoder(poderGravado()) } });
        render(<App comEditor />);
        expect(probe.poderEditandoId).toBe(5);
        expect(screen.getByText('✎ Reescrevendo: Antigo')).toBeTruthy();
    });

    it('poder apagado com o formulário ABERTO: gravar cria poder novo e nunca perde o conteúdo em silêncio', async () => {
        resetStore({ poderes: [poderGravado()] });
        render(<App />);
        act(() => { probe.editarPoder(5); });
        act(() => { probe.setNomePoder('Reescrito'); });
        // o poder é apagado (ex.: Mestre/outra aba) enquanto o formulário continua aberto
        act(() => { useStore.getState().updateFicha(f => { f.poderes = []; }); });
        await act(async () => { probe.salvarNovoPoder(); });
        const nomes = useStore.getState().minhaFicha.poderes.map(p => p.nome);
        expect(nomes).toEqual(['Reescrito']);
    });

    it('rascunho com campos vazios nunca sobrescreve um poder existente', async () => {
        resetStore({ poderes: [poderGravado()] });
        render(<App />);
        act(() => { probe.editarPoder(5); });
        act(() => { probe.setNomePoder(''); });
        await act(async () => { probe.salvarNovoPoder(); });
        expect(alertSpy).toHaveBeenCalled();
        expect(useStore.getState().minhaFicha.poderes[0].nome).toBe('Antigo');
    });
});

describe('Rascunho — editarPoder entre categorias', () => {
    const fichaComForma = () => [poderGravado({ id: 9, nome: 'Bankai', categoria: 'forma', descricao: 'forma salva' })];

    it('sem rascunho no destino: troca de aba sem confirmar e carrega o poder', () => {
        resetStore({ poderes: fichaComForma() });
        render(<App />);
        act(() => { probe.editarPoder(9); });
        expect(confirmSpy).not.toHaveBeenCalled();
        expect(probe.abaAtual).toBe('forma');
        expect(probe.poderEditandoId).toBe(9);
        expect(probe.nomePoder).toBe('Bankai');
    });

    it('com rascunho em andamento no destino: confirma com o texto correto', () => {
        resetStore({ poderes: fichaComForma() });
        useStore.setState({ rascunhosPoder: { 'Heroi|forma': { ...rascunhoVazio(), nome: 'Rascunho de forma' } } });
        render(<App />);
        act(() => { probe.editarPoder(9); });
        expect(confirmSpy).toHaveBeenCalledTimes(1);
        expect(confirmSpy.mock.calls[0][0]).toBe('Já existe um rascunho em andamento na aba "Formas". Ele será substituído pelo conteúdo salvo de "Bankai". Continuar?');
        expect(probe.abaAtual).toBe('forma');
        expect(probe.nomePoder).toBe('Bankai');
    });

    it('recusar a confirmação mantém aba, formulário e rascunho de destino', () => {
        confirmSpy.mockReturnValue(false);
        resetStore({ poderes: fichaComForma() });
        useStore.setState({ rascunhosPoder: { 'Heroi|forma': { ...rascunhoVazio(), nome: 'Rascunho de forma' } } });
        render(<App />);
        act(() => { probe.setNomePoder('Hab local'); });
        act(() => { probe.editarPoder(9); });
        expect(probe.abaAtual).toBe('habilidade');
        expect(probe.nomePoder).toBe('Hab local');
        expect(rasc('Heroi|forma').nome).toBe('Rascunho de forma');
    });

    it('rascunho de destino VAZIO (sem conteúdo) não pede confirmação', () => {
        resetStore({ poderes: fichaComForma() });
        useStore.setState({ rascunhosPoder: { 'Heroi|forma': rascunhoVazio() } });
        render(<App />);
        act(() => { probe.editarPoder(9); });
        expect(confirmSpy).not.toHaveBeenCalled();
        expect(probe.nomePoder).toBe('Bankai');
    });

    it('rótulo do destino Poderes', () => {
        resetStore({ poderes: [poderGravado({ id: 11, nome: 'Dom', categoria: 'poder' })] });
        useStore.setState({ rascunhosPoder: { 'Heroi|poder': { ...rascunhoVazio(), nome: 'x' } } });
        render(<App />);
        act(() => { probe.editarPoder(11); });
        expect(confirmSpy.mock.calls[0][0]).toContain('na aba "Poderes"');
    });

    it('rascunho da aba de ORIGEM não é perdido ao ir para outra categoria', () => {
        resetStore({ poderes: fichaComForma() });
        render(<App />);
        act(() => { probe.setNomePoder('Hab em andamento'); });
        act(() => { probe.editarPoder(9); });
        expect(probe.abaAtual).toBe('forma');
        act(() => { probe.trocarAba('habilidade'); });
        expect(probe.nomePoder).toBe('Hab em andamento');
    });

    it('mesma categoria com rascunho novo em andamento: pede confirmação própria', () => {
        resetStore({ poderes: [poderGravado()] });
        render(<App />);
        act(() => { probe.setNomePoder('Escrevendo'); });
        act(() => { probe.editarPoder(5); });
        expect(confirmSpy).toHaveBeenCalledTimes(1);
        expect(confirmSpy.mock.calls[0][0]).toContain('Descartá-lo para reescrever "Antigo"');
    });

    it('editarPoder com id inexistente é no-op', () => {
        render(<App />);
        act(() => { probe.setNomePoder('x'); });
        act(() => { probe.editarPoder(12345); });
        expect(confirmSpy).not.toHaveBeenCalled();
        expect(probe.nomePoder).toBe('x');
    });
});

describe('Rascunho — UI do formulário em seções', () => {
    const SECOES = ['Básico', 'Combate', 'Efeitos', 'Gatilhos', 'Avançado'];
    const cab = (titulo) => screen.getAllByRole('button').find(b => b.classList.contains('grimorio-form-secao-cab') && b.textContent.includes(titulo));

    it('renderiza as 5 seções; só Básico começa aberta', () => {
        render(<App comEditor />);
        SECOES.forEach(t => expect(cab(t)).toBeTruthy());
        expect(cab('Básico').getAttribute('aria-expanded')).toBe('true');
        ['Combate', 'Efeitos', 'Gatilhos', 'Avançado'].forEach(t => expect(cab(t).getAttribute('aria-expanded')).toBe('false'));
    });

    it('aria-controls aponta para o corpo existente da seção', () => {
        const { container } = render(<App comEditor />);
        SECOES.forEach(t => {
            const id = cab(t).getAttribute('aria-controls');
            expect(id).toBeTruthy();
            expect(container.querySelector(`[id="${id}"]`)).toBeTruthy();
        });
    });

    it('clicar alterna aria-expanded', () => {
        render(<App comEditor />);
        fireEvent.click(cab('Combate'));
        expect(cab('Combate').getAttribute('aria-expanded')).toBe('true');
        fireEvent.click(cab('Combate'));
        expect(cab('Combate').getAttribute('aria-expanded')).toBe('false');
    });

    it('campos continuam no DOM com a seção recolhida (e o valor sobrevive)', () => {
        render(<App comEditor />);
        expect(cab('Avançado').getAttribute('aria-expanded')).toBe('false');
        const usos = screen.getByLabelText('Usos máximos (vazio = ilimitado)');
        expect(usos).toBeTruthy();
        fireEvent.change(usos, { target: { value: '3' } });
        fireEvent.click(cab('Avançado'));
        fireEvent.click(cab('Avançado'));
        expect(screen.getByLabelText('Usos máximos (vazio = ilimitado)').value).toBe('3');
    });

    it('Expandir tudo / Recolher tudo', () => {
        render(<App comEditor />);
        fireEvent.click(screen.getByText('Expandir tudo'));
        SECOES.forEach(t => expect(cab(t).getAttribute('aria-expanded')).toBe('true'));
        expect(screen.queryByText('Expandir tudo')).toBeNull();
        fireEvent.click(screen.getByText('Recolher tudo'));
        SECOES.forEach(t => expect(cab(t).getAttribute('aria-expanded')).toBe('false'));
    });

    it('com uma seção fechada o botão continua "Expandir tudo"', () => {
        render(<App comEditor />);
        fireEvent.click(screen.getByText('Expandir tudo'));
        fireEvent.click(cab('Gatilhos'));
        expect(screen.getByText('Expandir tudo')).toBeTruthy();
    });

    it('resumo da seção aparece no cabeçalho', () => {
        render(<App comEditor />);
        act(() => { probe.setDadosQtd(2); probe.setDadosFaces(8); });
        expect(cab('Combate').textContent).toContain('2d8');
    });

    it('aviso "efeito digitado e não adicionado" aparece e some depois de adicionar', () => {
        render(<App comEditor />);
        act(() => { probe.setNomeEfeito('Bônus'); probe.setNovoVal('5'); });
        expect(cab('Efeitos').textContent).toContain('efeito digitado e não adicionado');
        act(() => { probe.addEfeitoTemp(); });
        expect(cab('Efeitos').textContent).not.toContain('efeito digitado e não adicionado');
        expect(cab('Efeitos').textContent).toContain('1 efeito');
    });

    it('aviso "gatilho inválido" vindo do rascunho', () => {
        useStore.setState({ rascunhosPoder: { 'Heroi|habilidade': { ...rascunhoVazio(), gatilhosDescartados: [{ x: 1 }] } } });
        render(<App comEditor />);
        expect(cab('Gatilhos').textContent).toContain('1 gatilho inválido');
        expect(cab('Gatilhos').parentElement.className).toContain('com-erro');
    });

    it('seção com conteúdo abre sozinha ao editar um poder existente', () => {
        resetStore({ poderes: [poderGravado({ efeitos: [{ nome: 'F', atributo: 'forca', propriedade: 'base', valor: 3 }], dadosQtd: 1 })] });
        render(<App comEditor />);
        act(() => { probe.editarPoder(5); });
        expect(cab('Efeitos').getAttribute('aria-expanded')).toBe('true');
        expect(cab('Combate').getAttribute('aria-expanded')).toBe('true');
        expect(cab('Gatilhos').getAttribute('aria-expanded')).toBe('false');
        expect(cab('Avançado').getAttribute('aria-expanded')).toBe('false');
        expect(screen.getByText('✎ Reescrevendo: Antigo')).toBeTruthy();
    });

    it('sem conteúdo escrito, abrir seções NÃO é persistido (rascunho vazio é descartado; só UI)', () => {
        const { unmount } = render(<App comEditor />);
        fireEvent.click(cab('Combate'));
        avancar(300);
        unmount();
        render(<App comEditor />);
        expect(cab('Combate').getAttribute('aria-expanded')).toBe('false');
    });

    it('com conteúdo escrito, o estado aberto/fechado das seções sobrevive à remontagem', () => {
        const { unmount } = render(<App comEditor />);
        fireEvent.change(screen.getByPlaceholderText('Nome (Ex: Chama Imortal)'), { target: { value: 'X' } });
        fireEvent.click(cab('Combate'));
        avancar(300);
        unmount();
        render(<App comEditor />);
        expect(cab('Combate').getAttribute('aria-expanded')).toBe('true');
    });

    it('banner: "Criar Novo(a)" por categoria e botão Cancelar só com conteúdo', () => {
        render(<App comEditor />);
        expect(screen.getByText('✎ Criar Novo(a) Habilidade')).toBeTruthy();
        expect(screen.queryByText('Cancelar')).toBeNull();
        fireEvent.change(screen.getByPlaceholderText('Nome (Ex: Chama Imortal)'), { target: { value: 'X' } });
        expect(screen.getByText('Cancelar')).toBeTruthy();
        act(() => { probe.trocarAba('forma'); });
        expect(screen.getByText('✎ Criar Novo(a) Forma')).toBeTruthy();
    });

    it('banner "Cancelar edição" só ao reescrever; botão final vira "Concluir Revisão"', () => {
        resetStore({ poderes: [poderGravado()] });
        render(<App comEditor />);
        expect(screen.queryByText('✖ Cancelar edição')).toBeNull();
        expect(screen.getByText('📜 Gravar no Grimório')).toBeTruthy();
        act(() => { probe.editarPoder(5); });
        expect(screen.getByText('✖ Cancelar edição')).toBeTruthy();
        expect(screen.getByText('✍️ Concluir Revisão')).toBeTruthy();
    });

    it('botão Cancelar da UI pede confirmação e limpa', () => {
        render(<App comEditor />);
        fireEvent.change(screen.getByPlaceholderText('Nome (Ex: Chama Imortal)'), { target: { value: 'X' } });
        fireEvent.click(screen.getByText('Cancelar'));
        expect(confirmSpy).toHaveBeenCalledTimes(1);
        expect(screen.getByPlaceholderText('Nome (Ex: Chama Imortal)').value).toBe('');
    });

    it('dica BONUS_ACERTO fica dentro de <details> recolhido', () => {
        const { container } = render(<App comEditor />);
        const det = container.querySelector('details.grimorio-form-ajuda');
        expect(det).toBeTruthy();
        expect(det.open).toBe(false);
        expect(det.textContent).toContain('BONUS_ACERTO');
    });
});

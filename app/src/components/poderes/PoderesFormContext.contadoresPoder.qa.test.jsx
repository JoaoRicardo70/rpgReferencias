import React from 'react';
import { render, screen, fireEvent, cleanup, act, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PoderesFormProvider, usePoderesForm } from './PoderesFormContext';
import { ContadoresDoPoderEditor, ContadoresNoCartao } from './ContadoresDoPoder';
import ContadoresResumo from '../Ficha Def/ContadoresResumo';
import { FichaCondicoesEElementais } from '../ficha/FichaSubComponents';
import { FichaFormProvider } from '../ficha/FichaFormContext';
import { FichaAlvoProvider } from '../Ficha Def/FichaAlvoContext';
import useStore from '../../stores/useStore';
import { normalizarEstagios } from '../../core/estagios';
import { LIMITE_CONTADORES } from '../../core/contadores';

// QA — contadores DENTRO do poder: salvamento atômico (store real, firebase-sync simulado), cartão e resumo da Ficha.

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
function App({ alvo, persistir = false, children }) {
    const inner = (<PoderesFormProvider persistirRascunho={persistir}><Harness />{children}</PoderesFormProvider>);
    return alvo ? <FichaAlvoProvider nome={alvo}>{inner}</FichaAlvoProvider> : inner;
}

const ct = (id, extra = {}) => ({ id, nome: `C${id}`, valor: 0, min: 0, max: 5, ...extra });
const poderBase = (extra = {}) => ({ id: 5, nome: 'Antigo', descricao: 'desc', categoria: 'habilidade', ativa: false, efeitos: [], efeitosPassivos: [], formas: [], dadosQtd: 0, dadosFaces: 20, ...extra });
const gatilhoDoContador = (id, cid) => ({
    id, nome: `G ${id}`, evento: { tipo: 'contadorAtingiu', contadorId: cid, op: '>=', valor: 3 },
    acoes: [{ tipo: 'contador', id: cid, op: 'zerar' }],
});
const gatilhoSomar = (id, cid) => ({ id, nome: `S ${id}`, evento: { tipo: 'atingido', nivel: 'qualquer' }, acoes: [{ tipo: 'contador', id: cid, op: 'somar', valor: 1 }] });

let fichaBase; let confirmSpy; let alertSpy;
function resetStore({ poderes = [], contadores = [], personagens = {}, isMestre = false, meuNome = 'Heroi' } = {}) {
    useStore.setState({
        minhaFicha: { ...fichaBase, poderes, contadores }, meuNome, isMestre, personagens,
        efeitosTemp: [], efeitosTempPassivos: [], poderEditandoId: null, rascunhosPoder: {},
    });
}
const minha = () => useStore.getState().minhaFicha;
const preencherBasico = (nome = 'Novo') => { act(() => { probe.setNomePoder(nome); probe.setDescricaoPoder('d'); }); };

beforeEach(() => {
    fichaBase = structuredClone(useStore.getState().minhaFicha);
    resetStore();
    confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('salvarNovoPoder — atomicidade com contadores', () => {
    it('cria poder + contadores juntos; id do contador do rascunho é mantido e o gatilho referencia um id válido', async () => {
        render(<App />);
        act(() => { probe.adicionarContadorPoder({ nome: 'Críticos', min: 0, max: 3, reset: 'cena' }); });
        const idRascunho = probe.contadoresPoder[0].id;
        expect(idRascunho).toMatch(/^ct_/);
        preencherBasico('Ego');
        act(() => { probe.setGatilhosPoder([gatilhoDoContador('g1', idRascunho), gatilhoSomar('g2', idRascunho)]); });
        await act(async () => { probe.salvarNovoPoder(); });
        const f = minha();
        expect(f.poderes).toHaveLength(1);
        expect(f.contadores).toHaveLength(1);
        expect(f.contadores[0]).toMatchObject({ id: idRascunho, nome: 'Críticos', valor: 0, min: 0, max: 3, reset: 'cena', poderId: f.poderes[0].id });
        const ids = new Set(f.contadores.map(c => c.id));
        f.poderes[0].gatilhos.forEach((g) => {
            const refs = [g.evento.contadorId, ...g.acoes.map(a => a.id)].filter(Boolean);
            refs.forEach(r => expect(ids.has(r)).toBe(true));
        });
        expect(f.poderes[0].gatilhos).toHaveLength(2);
        expect(JSON.stringify(f.contadores)).not.toContain('undefined');
        expect(probe.contadoresPoder).toEqual([]); // formulário limpo após gravar
    });

    it('estourar o limite de 12: NADA é gravado (nem o poder) e o jogador é avisado', async () => {
        const doze = Array.from({ length: LIMITE_CONTADORES }, (_, i) => ct(`c${i}`));
        resetStore({ contadores: doze });
        // o botão já bloqueia criar pela UI; o estouro vem de um rascunho persistente antigo
        useStore.setState({ rascunhosPoder: { 'Heroi|habilidade': { nome: 'Poder X', descricao: 'd', contadoresRascunho: [{ id: 'extra', nome: 'Extra', min: 0, max: 1 }] } } });
        render(<App persistir />);
        expect(probe.contadoresPoder).toHaveLength(1);
        preencherBasico('Poder X');
        const antes = JSON.stringify(minha());
        await act(async () => { probe.salvarNovoPoder(); });
        expect(JSON.stringify(minha())).toBe(antes);
        expect(minha().poderes).toHaveLength(0);
        expect(minha().contadores).toHaveLength(LIMITE_CONTADORES);
        expect(alertSpy).toHaveBeenCalled();
        expect(String(alertSpy.mock.calls[0][0])).toContain(String(LIMITE_CONTADORES));
        // rascunho continua para a pessoa corrigir
        expect(probe.nomePoder).toBe('Poder X');
        expect(probe.contadoresPoder).toHaveLength(1);
    });

    it('com 12 na ficha o botão "+ Contador" fica desabilitado, avisa e adicionarContadorPoder recusa', () => {
        resetStore({ contadores: Array.from({ length: LIMITE_CONTADORES }, (_, i) => ct(`c${i}`)) });
        render(<App><ContadoresDoPoderEditor /></App>);
        expect(screen.getByText('+ Contador').disabled).toBe(true);
        expect(screen.getByText(/limite de contadores/)).toBeTruthy();
        let r; act(() => { r = probe.adicionarContadorPoder({ nome: 'x' }); });
        expect(r).toBe(false);
        expect(probe.contadoresPoder).toHaveLength(0);
    });

    it('cancelar o formulário não deixa contador órfão na ficha', () => {
        render(<App />);
        act(() => { probe.adicionarContadorPoder({ nome: 'Temp', min: 0, max: 2 }); });
        preencherBasico();
        confirmSpy.mockReturnValue(true);
        act(() => { probe.cancelarEdicaoComConfirmacao(); });
        expect(probe.contadoresPoder).toEqual([]);
        expect(minha().contadores).toEqual([]);
        expect(minha().poderes).toEqual([]);
    });

    it('validação do poder falha (sem nome): contador do rascunho não vai para a ficha', async () => {
        render(<App />);
        act(() => { probe.adicionarContadorPoder({ nome: 'X' }); });
        await act(async () => { probe.salvarNovoPoder(); });
        expect(minha().contadores).toEqual([]);
        expect(minha().poderes).toEqual([]);
        expect(probe.contadoresPoder).toHaveLength(1);
    });

    it('vincular avulso existente: grava poderId, preserva valor e remove da lista de avulsos do formulário', async () => {
        resetStore({ contadores: [ct('av', { valor: 2, nome: 'Avulso' })] });
        render(<App />);
        expect(probe.contadoresAvulsosDaFicha.map(c => c.id)).toEqual(['av']);
        act(() => { expect(probe.vincularContadorPoder('av')).toBe(true); });
        expect(probe.contadoresAvulsosDaFicha).toEqual([]);
        expect(probe.contadoresPoder.map(c => c.id)).toEqual(['av']);
        act(() => { probe.vincularContadorPoder('av'); }); // duplicado: ignora
        expect(probe.contadoresPoder).toHaveLength(1);
        act(() => { expect(probe.vincularContadorPoder('inexistente')).toBe(false); });
        preencherBasico('Dono');
        await act(async () => { probe.salvarNovoPoder(); });
        expect(minha().contadores).toHaveLength(1);
        expect(minha().contadores[0]).toMatchObject({ id: 'av', valor: 2, poderId: minha().poderes[0].id });
    });

    it('editar poder existente mostra os contadores dele (e só deles) e regrava preservando o valor', async () => {
        resetStore({
            poderes: [poderBase()],
            contadores: [ct('a', { poderId: 5, valor: 3, nome: 'Meu' }), ct('b', { poderId: 99, nome: 'Alheio' }), ct('c', { nome: 'Avulso' })],
        });
        render(<App><ContadoresDoPoderEditor /></App>);
        act(() => { probe.editarPoder(5); });
        expect(probe.contadoresPoder.map(c => c.id)).toEqual(['a']);
        expect(screen.getByText('Meu')).toBeTruthy();
        expect(screen.queryByText('Alheio')).toBeNull();
        expect(screen.getByText(/valor 3/)).toBeTruthy();
        act(() => { probe.atualizarContadorPoder('a', { nome: 'Renomeado', max: 9 }); });
        await act(async () => { probe.salvarNovoPoder(); });
        const a = minha().contadores.find(c => c.id === 'a');
        expect(a).toMatchObject({ nome: 'Renomeado', max: 9, valor: 3, poderId: 5 });
        expect(minha().contadores).toHaveLength(3);
        expect(minha().poderes).toHaveLength(1);
    });

    it('remover contador no formulário de poder existente apaga da ficha só ao salvar', async () => {
        resetStore({ poderes: [poderBase()], contadores: [ct('a', { poderId: 5 })] });
        render(<App />);
        act(() => { probe.editarPoder(5); });
        act(() => { probe.removerContadorPoder('a'); });
        expect(minha().contadores).toHaveLength(1); // ainda não gravado
        await act(async () => { probe.salvarNovoPoder(); });
        expect(minha().contadores).toEqual([]);
    });

    it('contador do rascunho que pertence a OUTRO poder é ignorado com aviso e não é roubado', async () => {
        resetStore({
            poderes: [poderBase(), poderBase({ id: 6, nome: 'Outro' })],
            contadores: [ct('x', { poderId: 6, valor: 2, nome: 'DoOutro' })],
        });
        useStore.setState({ rascunhosPoder: { 'Heroi|habilidade': { poderEditandoId: 5, nome: 'Antigo', descricao: 'd', contadoresRascunho: [{ id: 'x', nome: 'DoOutro', min: 0, max: 5 }, { id: 'meu', nome: 'Meu', min: 0, max: 2 }] } } });
        render(<App persistir />);
        expect(probe.poderEditandoId).toBe(5);
        await act(async () => { probe.salvarNovoPoder(); });
        expect(minha().contadores.find(c => c.id === 'x')).toMatchObject({ poderId: 6, valor: 2, nome: 'DoOutro' });
        expect(minha().contadores.find(c => c.id === 'meu')).toMatchObject({ poderId: 5 });
        expect(alertSpy).toHaveBeenCalled();
        expect(String(alertSpy.mock.calls[0][0])).toContain('DoOutro');
    });
});

describe('removerContadorPoder — gatilhos', () => {
    it('contador usado por gatilho DESTE poder: confirma e remove os gatilhos dele do rascunho', () => {
        render(<App />);
        act(() => { probe.adicionarContadorPoder({ nome: 'K' }); });
        const id = probe.contadoresPoder[0].id;
        act(() => { probe.setGatilhosPoder([gatilhoDoContador('g1', id), { id: 'g2', nome: 'Livre', evento: { tipo: 'atingido', nivel: 'qualquer' }, acoes: [] }]); });
        act(() => { probe.removerContadorPoder(id); });
        expect(confirmSpy).toHaveBeenCalledTimes(1);
        expect(confirmSpy.mock.calls[0][0]).toContain('"G g1"');
        expect(probe.gatilhosPoder.map(g => g.id)).toEqual(['g2']);
        expect(probe.contadoresPoder).toEqual([]);
    });
    it('cancelar a confirmação não remove nada', () => {
        render(<App />);
        act(() => { probe.adicionarContadorPoder({ nome: 'K' }); });
        const id = probe.contadoresPoder[0].id;
        act(() => { probe.setGatilhosPoder([gatilhoSomar('g1', id)]); });
        confirmSpy.mockReturnValue(false);
        act(() => { probe.removerContadorPoder(id); });
        expect(probe.gatilhosPoder).toHaveLength(1);
        expect(probe.contadoresPoder).toHaveLength(1);
    });
    it('gatilhos de OUTROS poderes só são listados, nunca alterados', async () => {
        resetStore({
            poderes: [poderBase(), poderBase({ id: 6, nome: 'Outro', gatilhos: [gatilhoSomar('go', 'k1')] })],
            contadores: [ct('k1', { poderId: 5 })],
        });
        render(<App />);
        act(() => { probe.editarPoder(5); });
        act(() => { probe.removerContadorPoder('k1'); });
        const msg = confirmSpy.mock.calls[0][0];
        expect(msg).toContain('"S go"');
        expect(msg).toContain('Outro');
        expect(probe.gatilhosPoder).toEqual([]);
        expect(minha().poderes[1].gatilhos).toHaveLength(1);
        await act(async () => { probe.salvarNovoPoder(); });
        expect(minha().poderes[1].gatilhos[0].id).toBe('go'); // intacto
    });
    it('sem gatilho usando: remove sem confirmar', () => {
        render(<App />);
        act(() => { probe.adicionarContadorPoder({ nome: 'K' }); });
        act(() => { probe.removerContadorPoder(probe.contadoresPoder[0].id); });
        expect(confirmSpy).not.toHaveBeenCalled();
        expect(probe.contadoresPoder).toEqual([]);
    });
    it('id inexistente é no-op', () => {
        render(<App />);
        expect(() => act(() => { probe.removerContadorPoder('nada'); })).not.toThrow();
        expect(confirmSpy).not.toHaveBeenCalled();
    });
});

describe('rascunho persistente inclui contadoresRascunho', () => {
    it('contador do rascunho sobrevive à remontagem e é limpo após gravar', async () => {
        vi.useFakeTimers();
        const { unmount } = render(<App persistir />);
        act(() => { probe.adicionarContadorPoder({ nome: 'Persistente', min: 1, max: 4, reset: 'cena' }); });
        const id = probe.contadoresPoder[0].id;
        unmount(); // flush no cleanup
        expect(useStore.getState().rascunhosPoder['Heroi|habilidade'].contadoresRascunho).toEqual([{ id, nome: 'Persistente', min: 1, max: 4, reset: 'cena' }]);
        render(<App persistir />);
        expect(probe.contadoresPoder).toHaveLength(1);
        expect(probe.contadoresPoder[0].id).toBe(id);
        preencherBasico('P');
        await act(async () => { probe.salvarNovoPoder(); });
        vi.useRealTimers();
        expect(minha().contadores[0].id).toBe(id);
        expect(useStore.getState().rascunhosPoder['Heroi|habilidade']).toBeUndefined();
        expect(probe.contadoresPoder).toEqual([]);
    });
});

describe('salvarNovoPoder com Estágios', () => {
    const estagios = () => normalizarEstagios({ habilitado: true, maximo: 5, crescimento: 100 });
    it('contador novo num poder com Estágios adota estágio-1 e não força o estágio', async () => {
        resetStore({ poderes: [poderBase({ estagios: estagios(), estagioAtual: 4 })] });
        render(<App />);
        act(() => { probe.editarPoder(5); });
        act(() => { probe.adicionarContadorPoder({ nome: 'Estágio', min: 0, max: 5 }); });
        await act(async () => { probe.salvarNovoPoder(); });
        expect(minha().contadores[0].valor).toBe(3);
        expect(minha().poderes[0].estagioAtual).toBe(4);
    });
    it('editar só o nome do comandante ao salvar o poder não muda estágio nem valor', async () => {
        resetStore({ poderes: [poderBase({ estagios: estagios(), estagioAtual: 4 })], contadores: [ct('a', { poderId: 5, valor: 1 })] });
        render(<App />);
        act(() => { probe.editarPoder(5); });
        act(() => { probe.atualizarContadorPoder('a', { nome: 'Novo nome' }); });
        await act(async () => { probe.salvarNovoPoder(); });
        expect(minha().contadores[0]).toMatchObject({ nome: 'Novo nome', valor: 1 });
        expect(minha().poderes[0].estagioAtual).toBe(4);
    });
    it('poder sem Estágios: valor do contador novo fica no mínimo', async () => {
        render(<App />);
        act(() => { probe.adicionarContadorPoder({ nome: 'S', min: 2, max: 6 }); });
        preencherBasico();
        await act(async () => { probe.salvarNovoPoder(); });
        expect(minha().contadores[0].valor).toBe(2);
    });
});

describe('ContadoresNoCartao', () => {
    const poder = poderBase();
    const cartao = () => <App><ContadoresNoCartao poder={poder} /></App>;
    it('não renderiza nada sem contadores do poder', () => {
        resetStore({ poderes: [poder], contadores: [ct('x', { poderId: 99 })] });
        const { container } = render(cartao());
        expect(container.querySelector('.contadores-cartao')).toBeNull();
    });
    it('−/+ mudam o valor e param em min/max (botões desabilitados)', () => {
        resetStore({ poderes: [poder], contadores: [ct('a', { poderId: 5, valor: 0, min: 0, max: 2 })] });
        render(cartao());
        expect(screen.getByLabelText('Diminuir Ca').disabled).toBe(true);
        fireEvent.click(screen.getByLabelText('Aumentar Ca'));
        fireEvent.click(screen.getByLabelText('Aumentar Ca'));
        expect(minha().contadores[0].valor).toBe(2);
        expect(screen.getByLabelText('Aumentar Ca').disabled).toBe(true);
        expect(screen.getByLabelText('Valor de Ca').textContent).toBe('2/2');
        fireEvent.click(screen.getByLabelText('Diminuir Ca'));
        expect(minha().contadores[0].valor).toBe(1);
    });
    it('contador comandante: + avança o estágio do poder', () => {
        const p = poderBase({ estagios: normalizarEstagios({ habilitado: true, maximo: 5, crescimento: 100 }), estagioAtual: 1 });
        resetStore({ poderes: [p], contadores: [ct('a', { poderId: 5 })] });
        render(<App><ContadoresNoCartao poder={p} /></App>);
        fireEvent.click(screen.getByLabelText('Aumentar Ca'));
        expect(minha().poderes[0].estagioAtual).toBe(2);
    });
    it('dono edita; Mestre edita ficha alheia; jogador em ficha alheia só vê', () => {
        const alheia = { ...fichaBase, poderes: [poder], contadores: [ct('a', { poderId: 5, valor: 1 })] };
        // jogador em ficha alheia
        resetStore({ personagens: { Alvo: alheia }, isMestre: false });
        const r1 = render(<App alvo="Alvo"><ContadoresNoCartao poder={poder} /></App>);
        expect(screen.getByLabelText('Valor de Ca').textContent).toBe('1/5');
        expect(screen.queryByLabelText('Aumentar Ca')).toBeNull();
        expect(screen.queryByLabelText('Diminuir Ca')).toBeNull();
        r1.unmount();
        // Mestre em ficha alheia
        resetStore({ personagens: { Alvo: structuredClone(alheia) }, isMestre: true });
        render(<App alvo="Alvo"><ContadoresNoCartao poder={poder} /></App>);
        fireEvent.click(screen.getByLabelText('Aumentar Ca'));
        expect(useStore.getState().personagens.Alvo.contadores[0].valor).toBe(2);
        expect(minha().contadores).toEqual([]); // a minha ficha não foi tocada
    });
    it('mudarContadorDoPoder pelo jogador em ficha alheia é no-op', () => {
        const alheia = { ...fichaBase, poderes: [poder], contadores: [ct('a', { poderId: 5, valor: 1 })] };
        resetStore({ personagens: { Alvo: alheia }, isMestre: false });
        render(<App alvo="Alvo" />);
        act(() => { probe.mudarContadorDoPoder('a', 1); });
        expect(useStore.getState().personagens.Alvo.contadores[0].valor).toBe(1);
    });
});

describe('ContadoresResumo (aba Ficha)', () => {
    const resumo = (alvo) => render(alvo ? <FichaAlvoProvider nome={alvo}><ContadoresResumo /></FichaAlvoProvider> : <ContadoresResumo />);

    it('sem contadores: só o link "Contadores"; clicar abre o painel vazio com + Contador avulso', () => {
        resumo();
        expect(screen.getByText('🔢 Contadores')).toBeTruthy();
        expect(screen.queryByText('+ Contador avulso')).toBeNull();
        fireEvent.click(screen.getByText('🔢 Contadores'));
        expect(screen.getByText(/Nenhum contador/)).toBeTruthy();
        expect(screen.getByText('+ Contador avulso')).toBeTruthy();
        fireEvent.click(screen.getByText('Fechar'));
        expect(screen.queryByText('+ Contador avulso')).toBeNull();
    });

    it('lista com nome do poder dono; avulso sem "de ..."', () => {
        resetStore({ poderes: [poderBase({ nome: 'Portões' })], contadores: [ct('a', { poderId: 5, nome: 'Arco' }), ct('b', { nome: 'Poeira' })] });
        resumo();
        expect(screen.getByText('Arco')).toBeTruthy();
        expect(screen.getByText('de Portões')).toBeTruthy();
        expect(screen.getByText('Poeira')).toBeTruthy();
        expect(screen.getAllByText(/^de /)).toHaveLength(1);
    });

    it('+ Contador avulso cria com reset "cena" direto, sem poderId', () => {
        resetStore({ contadores: [ct('a')] });
        resumo();
        fireEvent.click(screen.getByText('+ Contador avulso'));
        fireEvent.change(screen.getByLabelText('Nome do contador'), { target: { value: 'Poeira' } });
        fireEvent.change(screen.getByLabelText('Máximo do contador'), { target: { value: '7' } });
        fireEvent.change(screen.getByLabelText('Reinício do contador'), { target: { value: 'cena' } });
        fireEvent.click(screen.getByText('Adicionar'));
        const novo = minha().contadores[1];
        expect(novo).toMatchObject({ nome: 'Poeira', min: 0, max: 7, valor: 0, reset: 'cena' });
        expect('poderId' in novo).toBe(false);
    });
    it('avulso permanente não grava a chave reset', () => {
        resetStore({ contadores: [ct('a')] });
        resumo();
        fireEvent.click(screen.getByText('+ Contador avulso'));
        fireEvent.change(screen.getByLabelText('Nome do contador'), { target: { value: 'Perm' } });
        fireEvent.click(screen.getByText('Adicionar'));
        expect('reset' in minha().contadores[1]).toBe(false);
    });
    it('no limite de 12 o botão "+ Contador avulso" some', () => {
        resetStore({ contadores: Array.from({ length: 12 }, (_, i) => ct(`c${i}`)) });
        resumo();
        expect(screen.queryByText('+ Contador avulso')).toBeNull();
    });
    it('limite atingido com o formulário já aberto: avisa e NÃO toca no último contador', () => {
        resetStore({ contadores: Array.from({ length: 11 }, (_, i) => ct(`c${i}`, { valor: 1 })) });
        resumo();
        fireEvent.click(screen.getByText('+ Contador avulso'));
        fireEvent.change(screen.getByLabelText('Nome do contador'), { target: { value: 'Extra' } });
        // outra aba/sync completa o 12º contador enquanto o formulário está aberto
        act(() => { useStore.setState({ minhaFicha: { ...minha(), contadores: [...minha().contadores, ct('c11', { valor: 1, nome: 'Ultimo' })] } }); });
        const antes = JSON.stringify(minha().contadores);
        fireEvent.click(screen.getByText('Adicionar'));
        expect(alertSpy).toHaveBeenCalledTimes(1);
        expect(JSON.stringify(minha().contadores)).toBe(antes);
        expect(minha().contadores).toHaveLength(12);
        expect(minha().contadores[11]).toMatchObject({ id: 'c11', nome: 'Ultimo', valor: 1 });
    });
    it('editar (✎) muda nome/limites/reset sem mexer no estágio do comandante', () => {
        const p = poderBase({ estagios: normalizarEstagios({ habilitado: true, maximo: 5, crescimento: 100 }), estagioAtual: 3 });
        resetStore({ poderes: [p], contadores: [ct('a', { poderId: 5, valor: 2, nome: 'Arco' })] });
        resumo();
        fireEvent.click(screen.getByLabelText('Editar o contador Arco'));
        fireEvent.change(screen.getByLabelText('Nome do contador'), { target: { value: 'Arco II' } });
        fireEvent.change(screen.getByLabelText('Máximo do contador'), { target: { value: '8' } });
        fireEvent.change(screen.getByLabelText('Reinício do contador'), { target: { value: 'cena' } });
        fireEvent.click(screen.getByText('Salvar'));
        expect(minha().contadores[0]).toMatchObject({ nome: 'Arco II', max: 8, valor: 2, reset: 'cena', poderId: 5 });
        expect(minha().poderes[0].estagioAtual).toBe(3);
    });
    it('remover sem gatilhos usa confirmação simples; cancelar mantém', () => {
        resetStore({ contadores: [ct('a', { nome: 'Arco' })] });
        resumo();
        confirmSpy.mockReturnValue(false);
        fireEvent.click(screen.getByLabelText('Remover o contador Arco'));
        expect(minha().contadores).toHaveLength(1);
        expect(confirmSpy.mock.calls[0][0]).toContain('Remover o contador "Arco"?');
        confirmSpy.mockReturnValue(true);
        fireEvent.click(screen.getByLabelText('Remover o contador Arco'));
        expect(minha().contadores).toEqual([]);
    });
    it('remover contador usado por gatilho só AVISA: os gatilhos dos poderes ficam intactos', () => {
        resetStore({
            poderes: [poderBase({ gatilhos: [gatilhoSomar('g1', 'a'), gatilhoDoContador('g2', 'a')] })],
            contadores: [ct('a', { poderId: 5, nome: 'Arco' })],
        });
        resumo();
        fireEvent.click(screen.getByLabelText('Remover o contador Arco'));
        const msg = confirmSpy.mock.calls[0][0];
        expect(msg).toContain('"S g1"'); expect(msg).toContain('"G g2"'); expect(msg).toContain('Antigo');
        expect(minha().contadores).toEqual([]);
        expect(minha().poderes[0].gatilhos).toHaveLength(2);
    });
    it('−/+ respeitam min/max', () => {
        resetStore({ contadores: [ct('a', { nome: 'Arco', valor: 4, max: 5 })] });
        resumo();
        fireEvent.click(screen.getByLabelText('Aumentar Arco'));
        expect(screen.getByLabelText('Aumentar Arco').disabled).toBe(true);
        expect(minha().contadores[0].valor).toBe(5);
    });
    it('jogador em ficha alheia: vê os contadores sem botões de edição; Mestre vê os botões', () => {
        const alheia = { ...fichaBase, poderes: [], contadores: [ct('a', { nome: 'Arco' })] };
        resetStore({ personagens: { Alvo: alheia }, isMestre: false });
        const r = resumo('Alvo');
        expect(screen.getByText('Arco')).toBeTruthy();
        expect(screen.queryByLabelText('Aumentar Arco')).toBeNull();
        expect(screen.queryByLabelText('Editar o contador Arco')).toBeNull();
        expect(screen.queryByLabelText('Remover o contador Arco')).toBeNull();
        expect(screen.queryByText('+ Contador avulso')).toBeNull();
        r.unmount();
        resetStore({ personagens: { Alvo: structuredClone(alheia) }, isMestre: true });
        resumo('Alvo');
        fireEvent.click(screen.getByLabelText('Aumentar Arco'));
        expect(useStore.getState().personagens.Alvo.contadores[0].valor).toBe(1);
    });
});

describe('Grimório pág. 3 (FichaCondicoesEElementais) sem Contadores', () => {
    it('não mostra Contadores e mantém Estados/Afinidades/Reduções, mesmo com contadores na ficha', () => {
        resetStore({ contadores: [ct('a', { nome: 'Arco' })] });
        render(<FichaFormProvider><FichaCondicoesEElementais /></FichaFormProvider>);
        expect(screen.queryByText('🔢 Contadores')).toBeNull();
        expect(screen.queryByText('+ Contador')).toBeNull();
        expect(screen.queryByText('Arco')).toBeNull();
        expect(screen.getByText(/Estados & Afinidades/)).toBeTruthy();
        expect(screen.getByText(/Habilidades de Redução de Dano/)).toBeTruthy();
    });
});

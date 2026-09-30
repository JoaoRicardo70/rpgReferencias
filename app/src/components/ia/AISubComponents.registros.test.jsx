import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, act, waitFor, within } from '@testing-library/react';

vi.mock('firebase/database', () => ({ ref: vi.fn(), onValue: vi.fn(), set: vi.fn(), get: vi.fn() }));
vi.mock('../../services/firebase-config', () => ({ db: {}, database: {}, functions: {}, auth: {} }));
vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: {}, version: '0', getDocument: vi.fn() }));
vi.mock('../../services/sextaFeiraIA', () => ({ chamarGemini: vi.fn(), traduzirErroGemini: vi.fn(), listarModelosGemini: vi.fn() }));
vi.mock('../../services/sextaFeiraDados', () => ({
    LIMITE_MENSAGENS_CHAT_SALVAS: 60,
    carregarChat: vi.fn(), salvarChat: vi.fn(),
    carregarEventosFeedDesde: vi.fn(), carregarTranscricoesDesde: vi.fn(),
    memorizarFato: vi.fn(), apagarFato: vi.fn(),
    lerUltimoResumoEm: vi.fn(), gravarUltimoResumoEm: vi.fn(),
    chaveVersaoArco: vi.fn((f, c, a) => `${f}_${c}_${a}`),
    salvarVersaoArco: vi.fn(), listarVersoesArco: vi.fn(),
    guardarNaLixeira: vi.fn(), listarLixeira: vi.fn(), removerDaLixeira: vi.fn(),
}));
vi.mock('./GravadorPanel', () => ({ default: () => <div>PAINEL-GRAVADOR</div> }));
vi.mock('./AIArvoreGenealogica', () => ({ default: () => <div>PAINEL-ARVORE</div> }));

import { AIHeader, AIAreaCentral } from './AISubComponents';
import { AIFormProvider, useAIForm } from './AIFormContext';
import { DialogosSextaProvider } from './DialogosSexta';
import useStore from '../../stores/useStore';
import * as dados from '../../services/sextaFeiraDados';

const mkPresente = () => [
    { id: 1, titulo: 'Origens', tierList: [], arcos: [{ id: 11, titulo: 'Despertar', texto: 'O herói acordou na floresta escura.' }, { id: 12, titulo: 'Queda', texto: 'Nada aqui.' }] },
    { id: 2, titulo: 'Guerra', tierList: [], arcos: [{ id: 21, titulo: 'Cerco', texto: 'A cidade sofreu o cerco. floresta floresta.' }] },
];
const mkFuturo = () => [
    { id: 100, titulo: 'Ecos', tierList: [], arcos: [{ id: 101, titulo: 'Fim do Mundo', texto: 'A rainha morre na floresta do futuro.' }] },
];

let probe;
function Sonda() { probe = useAIForm(); return null; }
const Harness = ({ comDialogos = false }) => {
    const miolo = <AIFormProvider><Sonda /><AIHeader /><AIAreaCentral /></AIFormProvider>;
    return comDialogos ? <DialogosSextaProvider>{miolo}</DialogosSextaProvider> : miolo;
};
const montar = (props) => render(<Harness {...props} />);
const st = () => useStore.getState();
const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };
const irParaRegistros = () => { act(() => probe.setSubAba('lore')); };

beforeEach(() => {
    localStorage.clear();
    Object.values(dados).forEach(f => { if (typeof f?.mockReset === 'function') f.mockReset(); });
    dados.chaveVersaoArco.mockImplementation((f, c, a) => `${f}_${c}_${a}`);
    dados.carregarChat.mockResolvedValue(null);
    dados.salvarChat.mockResolvedValue();
    dados.salvarVersaoArco.mockResolvedValue();
    dados.guardarNaLixeira.mockResolvedValue();
    dados.removerDaLixeira.mockResolvedValue();
    dados.listarVersoesArco.mockResolvedValue([]);
    dados.listarLixeira.mockResolvedValue([]);
    useStore.setState({
        meuNome: 'Ana', minhaFicha: {}, isMestre: false, mesaId: 'M1', registrosCompartilhados: false,
        sextaFeiraConfig: { chaveGemini: 'K', modelo: 'm' }, sextaFeiraMemoria: {}, personagens: {}, dummies: {},
        loreCapitulosPresente: mkPresente(), loreCapitulosFuturo: mkFuturo(),
        loreCapituloAtivoId: 1, loreArcoAtivoIdPresente: 11, loreCapFuturoAtivoId: 100, loreArcoAtivoIdFuturo: 101,
    });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('AIHeader - abas', () => {
    it('mostra Chat, Codex e Gravador; Config so para o Mestre', () => {
        montar();
        expect(screen.getByText('💬 Chat')).toBeTruthy();
        expect(screen.getByText('📚 Codex')).toBeTruthy();
        expect(screen.getByText('🎙️ Gravador')).toBeTruthy();
        expect(screen.queryByText('⚙️ Config')).toBeNull();
        cleanup();
        useStore.setState({ isMestre: true });
        montar();
        expect(screen.getByText('⚙️ Config')).toBeTruthy();
    });
    it('status online/sem chave', () => {
        montar();
        expect(screen.getByText('● online')).toBeTruthy();
        cleanup();
        useStore.setState({ sextaFeiraConfig: null });
        montar();
        expect(screen.getByText('● sem chave')).toBeTruthy();
    });
    it('comeca no Chat e cada aba troca a area central', async () => {
        useStore.setState({ isMestre: true });
        montar();
        expect(probe.subAba).toBe('chat');
        expect(screen.getByLabelText('Mensagem para a Sexta-Feira')).toBeTruthy();
        fireEvent.click(screen.getByText('🎙️ Gravador'));
        expect(probe.subAba).toBe('gravador');
        expect(screen.getByText('PAINEL-GRAVADOR')).toBeTruthy();
        fireEvent.click(screen.getByText('⚙️ Config'));
        expect(probe.subAba).toBe('config');
        expect(screen.getByText('⚙️ Configuração da Sexta-Feira')).toBeTruthy();
        fireEvent.click(screen.getByText('📚 Codex'));
        expect(probe.subAba).toBe('lore');
        fireEvent.click(screen.getByText('💬 Chat'));
        expect(probe.subAba).toBe('chat');
    });
    it('clicar em Codex estando dentro do Codex nao muda a sub-aba', () => {
        montar();
        fireEvent.click(screen.getByText('📚 Codex'));
        fireEvent.click(screen.getByRole('tab', { name: '🏆 Tier List' }));
        expect(probe.subAba).toBe('tierlist');
        fireEvent.click(screen.getByText('📚 Codex'));
        expect(probe.subAba).toBe('tierlist');
    });
});

describe('Codex - sub-abas', () => {
    it('mostra Registros / Tier List / Arvore e troca subAba lore|tierlist|arvore', () => {
        montar();
        expect(screen.queryByRole('tablist', { name: 'Codex' })).toBeNull();
        fireEvent.click(screen.getByText('📚 Codex'));
        const abas = within(screen.getByRole('tablist', { name: 'Codex' })).getAllByRole('tab');
        expect(abas.map(a => a.textContent)).toEqual(['📜 Registros', '🏆 Tier List', '🌳 Árvore']);
        expect(abas[0].getAttribute('aria-selected')).toBe('true');
        expect(screen.getByLabelText('Texto do Arco')).toBeTruthy();

        fireEvent.click(abas[1]);
        expect(probe.subAba).toBe('tierlist');
        expect(screen.getByText(/Banco de Entidades/)).toBeTruthy();
        expect(screen.queryByLabelText('Texto do Arco')).toBeNull();
        expect(abas[1].getAttribute('aria-selected')).toBe('true');
        expect(abas[0].getAttribute('aria-selected')).toBe('false');

        fireEvent.click(abas[2]);
        expect(probe.subAba).toBe('arvore');
        expect(screen.getByText('PAINEL-ARVORE')).toBeTruthy();

        fireEvent.click(abas[0]);
        expect(probe.subAba).toBe('lore');
        expect(screen.getByLabelText('Texto do Arco').value).toBe('O herói acordou na floresta escura.');
    });
});

describe('NavegadorRegistros - busca', () => {
    it('mostra a linha do tempo por padrao, com capitulos e arcos', () => {
        montar(); irParaRegistros();
        const nav = screen.getByRole('navigation', { name: 'Navegar pelos Registros' });
        expect(within(nav).getByText('Origens')).toBeTruthy();
        expect(within(nav).getByText('Guerra')).toBeTruthy();
        expect(within(nav).getByText(/Despertar/)).toBeTruthy();
        expect(within(nav).getByText(/Cerco/)).toBeTruthy();
        expect(nav.querySelectorAll('.sexta-linha-tempo-cap')).toHaveLength(2);
        // marca o arco ativo
        expect(nav.querySelector('.sexta-linha-tempo-arco.ativo').textContent).toContain('Despertar');
    });
    it('buscar mostra resultados com contagem, sem acento/caixa; clicar abre o capitulo e o arco', () => {
        montar(); irParaRegistros();
        const busca = screen.getByLabelText('Buscar nos Registros');
        fireEvent.change(busca, { target: { value: 'HEROI' } });
        expect(screen.getByText('1 resultado(s)')).toBeTruthy();
        fireEvent.change(busca, { target: { value: 'cerco' } });
        const botao = screen.getByText(/Guerra › Cerco/).closest('button');
        fireEvent.click(botao);
        expect(st().loreCapituloAtivoId).toBe(2);
        expect(st().loreArcoAtivoIdPresente).toBe(21);
        expect(probe.loreFoco).toBe('presente');
        expect(screen.getByLabelText('Texto do Arco').value).toContain('cerco');
    });
    it('resultados ordenados por ocorrencias e mostram "N×"', () => {
        montar(); irParaRegistros();
        fireEvent.change(screen.getByLabelText('Buscar nos Registros'), { target: { value: 'floresta' } });
        const botoes = [...document.querySelectorAll('.sexta-registros-resultado')];
        expect(botoes).toHaveLength(3); // presente x2 + futuro (jogador local ve o Futuro)
        expect(botoes[0].textContent).toContain('Guerra › Cerco');
        expect(botoes[0].textContent).toContain('2×');
    });
    it('clicar num resultado do Futuro muda o foco para o Futuro e seleciona o arco', () => {
        montar(); irParaRegistros();
        fireEvent.change(screen.getByLabelText('Buscar nos Registros'), { target: { value: 'rainha' } });
        const botao = screen.getByText(/Ecos › Fim do Mundo/).closest('button');
        expect(botao.textContent).toContain('🚀');
        fireEvent.click(botao);
        expect(probe.loreFoco).toBe('futuro');
        expect(st().loreCapFuturoAtivoId).toBe(100);
        expect(st().loreArcoAtivoIdFuturo).toBe(101);
        expect(screen.getByLabelText('Texto do Arco').value).toContain('rainha');
    });
    it('jogador com Registros da mesa nao encontra o Futuro', () => {
        useStore.setState({ registrosCompartilhados: true, isMestre: false });
        montar(); irParaRegistros();
        fireEvent.change(screen.getByLabelText('Buscar nos Registros'), { target: { value: 'rainha' } });
        expect(screen.getByText('0 resultado(s)')).toBeTruthy();
        expect(screen.getByText('Nada encontrado.')).toBeTruthy();
    });
    it('termo de 1 caractere continua mostrando a linha do tempo; limpar volta a ela', () => {
        montar(); irParaRegistros();
        const busca = screen.getByLabelText('Buscar nos Registros');
        fireEvent.change(busca, { target: { value: 'f' } });
        expect(document.querySelector('.sexta-linha-tempo')).toBeTruthy();
        fireEvent.change(busca, { target: { value: 'fl' } });
        expect(document.querySelector('.sexta-linha-tempo')).toBeNull();
        fireEvent.change(busca, { target: { value: '' } });
        expect(document.querySelector('.sexta-linha-tempo')).toBeTruthy();
    });
    it('linha do tempo: clicar num arco seleciona capitulo e arco', () => {
        montar(); irParaRegistros();
        fireEvent.click(screen.getByText(/Cerco/).closest('button'));
        expect(st().loreCapituloAtivoId).toBe(2);
        expect(st().loreArcoAtivoIdPresente).toBe(21);
        const ativo = document.querySelector('.sexta-linha-tempo-arco.ativo');
        expect(ativo.textContent).toContain('Cerco');
        fireEvent.click(screen.getByText(/Queda/).closest('button'));
        expect(st().loreCapituloAtivoId).toBe(1);
        expect(st().loreArcoAtivoIdPresente).toBe(12);
    });
    it('foco no Futuro: linha do tempo lista os capitulos do Futuro', () => {
        montar(); irParaRegistros();
        act(() => probe.setLoreFoco('futuro'));
        const nav = screen.getByRole('navigation', { name: 'Navegar pelos Registros' });
        expect(within(nav).getByText('Ecos')).toBeTruthy();
        expect(within(nav).queryByText('Guerra')).toBeNull();
    });
});

describe('AILore - botoes de historico', () => {
    it('Versoes e Lixeira so aparecem quando historicoDisponivel', () => {
        montar(); irParaRegistros();
        expect(screen.queryByText('🕘 Versões deste Arco')).toBeNull();
        expect(screen.queryByText('♻️ Lixeira')).toBeNull();
        cleanup();
        useStore.setState({ registrosCompartilhados: true, isMestre: true });
        montar(); irParaRegistros();
        expect(screen.getByText('🕘 Versões deste Arco')).toBeTruthy();
        expect(screen.getByText('♻️ Lixeira')).toBeTruthy();
        cleanup();
        useStore.setState({ isMestre: false });
        montar(); irParaRegistros();
        expect(screen.queryByText('♻️ Lixeira')).toBeNull();
    });
    it('jogador com Registros da mesa ve o texto somente leitura', () => {
        useStore.setState({ registrosCompartilhados: true, isMestre: false });
        montar(); irParaRegistros();
        expect(screen.getByLabelText('Texto do Arco').readOnly).toBe(true);
    });
});

describe('VersoesArcoModal', () => {
    const versoes = [
        { id: 'v2', texto: 'texto v2 mais novo', titulo: 'Despertar', autor: 'Bia', motivo: 'antes de uma edição', em: 2000 },
        { id: 'v1', texto: 'texto v1', titulo: 'Despertar', autor: '', motivo: '', em: 1000 },
    ];
    beforeEach(() => { useStore.setState({ registrosCompartilhados: true, isMestre: true }); });
    const abrir = async () => {
        irParaRegistros();
        await act(async () => { fireEvent.click(screen.getByText('🕘 Versões deste Arco')); });
        await flush();
        return screen.getByRole('dialog');
    };

    it('lista versoes (consulta o arco ativo), selecionando a mais nova e mostrando a previa', async () => {
        dados.listarVersoesArco.mockResolvedValue(versoes);
        montar();
        const dlg = await abrir();
        expect(dados.listarVersoesArco).toHaveBeenCalledWith('M1', 'presente_1_11');
        expect(dlg.getAttribute('aria-label')).toBe('🕘 Versões de "Despertar"');
        expect(dlg.querySelectorAll('.sexta-versao')).toHaveLength(2);
        expect(dlg.querySelector('.sexta-versao.ativa').textContent).toContain('antes de uma edição');
        expect(dlg.querySelector('.sexta-versao-previa').textContent).toBe('texto v2 mais novo');
        expect(within(dlg).getByText(/Bia · antes de uma edição/)).toBeTruthy();
        // sem motivo: rotulo padrao "versão"
        expect(dlg.querySelectorAll('.sexta-versao')[1].textContent).toMatch(/versão · 8 caracteres/);
    });
    it('clicar em outra versao troca a previa', async () => {
        dados.listarVersoesArco.mockResolvedValue(versoes);
        montar();
        const dlg = await abrir();
        fireEvent.click(dlg.querySelectorAll('.sexta-versao')[1]);
        expect(dlg.querySelector('.sexta-versao-previa').textContent).toBe('texto v1');
        expect(dlg.querySelectorAll('.sexta-versao')[1].className).toContain('ativa');
    });
    it('estado vazio: mensagem e Restaurar desabilitado', async () => {
        montar();
        const dlg = await abrir();
        expect(within(dlg).getByText(/Ainda não há versões guardadas/)).toBeTruthy();
        expect(within(dlg).getByText('Restaurar esta versão').disabled).toBe(true);
    });
    it('erro ao carregar: mostra mensagem e nao quebra', async () => {
        dados.listarVersoesArco.mockRejectedValue(new Error('negado'));
        montar();
        const dlg = await abrir();
        expect(within(dlg).getByText('Não foi possível carregar as versões.')).toBeTruthy();
        expect(within(dlg).queryByText(/Ainda não há versões/)).toBeNull();
    });
    it('restaurar pede confirmacao: recusar mantem texto e modal', async () => {
        dados.listarVersoesArco.mockResolvedValue(versoes);
        const conf = vi.spyOn(window, 'confirm').mockReturnValue(false);
        montar();
        const dlg = await abrir();
        await act(async () => { fireEvent.click(within(dlg).getByText('Restaurar esta versão')); });
        expect(conf).toHaveBeenCalledTimes(1);
        expect(conf.mock.calls[0][0]).toContain('Despertar');
        expect(st().loreCapitulosPresente[0].arcos[0].texto).toBe('O herói acordou na floresta escura.');
        expect(screen.queryByRole('dialog')).toBeTruthy();
        expect(dados.salvarVersaoArco).not.toHaveBeenCalled();
    });
    it('restaurar confirmado: guarda o texto atual, substitui, avisa e fecha o modal', async () => {
        dados.listarVersoesArco.mockResolvedValue(versoes);
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        const al = vi.spyOn(window, 'alert').mockImplementation(() => {});
        montar();
        const dlg = await abrir();
        fireEvent.click(dlg.querySelectorAll('.sexta-versao')[1]);
        await act(async () => { fireEvent.click(within(dlg).getByText('Restaurar esta versão')); });
        await flush();
        expect(st().loreCapitulosPresente[0].arcos[0].texto).toBe('texto v1');
        expect(dados.salvarVersaoArco).toHaveBeenCalledWith('M1', 'presente_1_11', expect.objectContaining({ texto: 'O herói acordou na floresta escura.', motivo: 'antes de restaurar uma versão' }));
        expect(al).toHaveBeenCalledWith('✅ Versão restaurada.');
        expect(screen.queryByRole('dialog')).toBeNull();
    });
    it('Fechar fecha o modal sem alterar nada', async () => {
        dados.listarVersoesArco.mockResolvedValue(versoes);
        montar();
        const dlg = await abrir();
        fireEvent.click(within(dlg).getByText('Fechar'));
        expect(screen.queryByRole('dialog')).toBeNull();
    });
    it('com o provider de dialogos: o confirmar abre POR CIMA e Esc fecha so ele; Esc de novo fecha as Versoes', async () => {
        dados.listarVersoesArco.mockResolvedValue(versoes);
        montar({ comDialogos: true });
        await abrir();
        await act(async () => { fireEvent.click(screen.getByText('Restaurar esta versão')); });
        expect(screen.getAllByRole('dialog')).toHaveLength(2);
        await act(async () => { fireEvent.keyDown(document, { key: 'Escape' }); });
        expect(screen.getAllByRole('dialog')).toHaveLength(1);
        expect(screen.getByRole('dialog').getAttribute('aria-label')).toContain('Versões de');
        expect(st().loreCapitulosPresente[0].arcos[0].texto).toBe('O herói acordou na floresta escura.');
        await act(async () => { fireEvent.keyDown(document, { key: 'Escape' }); });
        expect(screen.queryByRole('dialog')).toBeNull();
    });
    it('com o provider: confirmar "Restaurar" aplica a versao e mostra o toast', async () => {
        dados.listarVersoesArco.mockResolvedValue(versoes);
        montar({ comDialogos: true });
        await abrir();
        await act(async () => { fireEvent.click(screen.getByText('Restaurar esta versão')); });
        const dlgs = screen.getAllByRole('dialog');
        await act(async () => { fireEvent.click(within(dlgs[1]).getByText('Restaurar')); });
        await flush();
        expect(st().loreCapitulosPresente[0].arcos[0].texto).toBe('texto v2 mais novo');
        expect(screen.getByText('✅ Versão restaurada.')).toBeTruthy();
        expect(screen.queryAllByRole('dialog')).toHaveLength(0);
    });
});

describe('LixeiraModal', () => {
    const itens = [
        { id: 'L1', tipo: 'arco', foco: 'presente', capituloId: 2, dados: { id: 77, titulo: 'Arco Apagado', texto: 'zzz' }, autor: 'Bia', em: 5000 },
        { id: 'L2', tipo: 'capitulo', foco: 'futuro', capituloId: 9, dados: { id: 9, titulo: 'Cap Apagado', arcos: [{ id: 91, titulo: 'a', texto: '' }] }, autor: '', em: 4000 },
    ];
    beforeEach(() => { useStore.setState({ registrosCompartilhados: true, isMestre: true }); });
    const abrir = async () => {
        irParaRegistros();
        await act(async () => { fireEvent.click(screen.getByText('♻️ Lixeira')); });
        await flush();
        return screen.getByRole('dialog');
    };

    it('lista itens com icone, titulo, foco e autor', async () => {
        dados.listarLixeira.mockResolvedValue(itens);
        montar();
        const dlg = await abrir();
        expect(dlg.getAttribute('aria-label')).toBe('♻️ Lixeira dos Registros');
        const linhas = dlg.querySelectorAll('.sexta-memoria-item');
        expect(linhas).toHaveLength(2);
        expect(linhas[0].textContent).toContain('📂');
        expect(linhas[0].textContent).toContain('Arco Apagado');
        expect(linhas[0].textContent).toContain('Presente');
        expect(linhas[0].textContent).toContain('por Bia');
        expect(linhas[1].textContent).toContain('📖');
        expect(linhas[1].textContent).toContain('Futuro');
        expect(linhas[1].textContent).not.toContain(' por ');
    });
    it('vazia: mensagem "A Lixeira está vazia."', async () => {
        montar();
        const dlg = await abrir();
        expect(within(dlg).getByText('A Lixeira está vazia.')).toBeTruthy();
    });
    it('erro ao listar: mostra como vazia sem quebrar', async () => {
        dados.listarLixeira.mockRejectedValue(new Error('x'));
        montar();
        const dlg = await abrir();
        expect(within(dlg).getByText('A Lixeira está vazia.')).toBeTruthy();
    });
    it('restaurar arco: remove da Lixeira, devolve ao capitulo e a linha some', async () => {
        dados.listarLixeira.mockResolvedValue(itens);
        const al = vi.spyOn(window, 'alert').mockImplementation(() => {});
        montar();
        const dlg = await abrir();
        await act(async () => { fireEvent.click(within(dlg).getAllByText('↩️ Restaurar')[0]); });
        await flush();
        expect(dados.removerDaLixeira).toHaveBeenCalledWith('M1', 'L1');
        expect(st().loreCapitulosPresente[1].arcos.map(a => a.id)).toEqual([21, 77]);
        expect(dlg.querySelectorAll('.sexta-memoria-item')).toHaveLength(1);
        expect(dlg.textContent).not.toContain('Arco Apagado');
        expect(al).toHaveBeenCalledWith('✅ Arco "Arco Apagado" restaurado.');
    });
    it('restaurar capitulo do Futuro', async () => {
        dados.listarLixeira.mockResolvedValue(itens);
        vi.spyOn(window, 'alert').mockImplementation(() => {});
        montar();
        const dlg = await abrir();
        await act(async () => { fireEvent.click(within(dlg).getAllByText('↩️ Restaurar')[1]); });
        await flush();
        expect(st().loreCapitulosFuturo.map(c => c.id)).toEqual([100, 9]);
        expect(dlg.querySelectorAll('.sexta-memoria-item')).toHaveLength(1);
    });
    it('falha ao remover da Lixeira: avisa erro, linha e Registros ficam intactos', async () => {
        dados.listarLixeira.mockResolvedValue(itens);
        dados.removerDaLixeira.mockRejectedValue(new Error('negado'));
        const al = vi.spyOn(window, 'alert').mockImplementation(() => {});
        montar();
        const dlg = await abrir();
        await act(async () => { fireEvent.click(within(dlg).getAllByText('↩️ Restaurar')[0]); });
        await flush();
        expect(al).toHaveBeenCalledWith('Não foi possível restaurar.');
        expect(dlg.querySelectorAll('.sexta-memoria-item')).toHaveLength(2);
        expect(st().loreCapitulosPresente[1].arcos).toHaveLength(1);
    });
    it('sem destino valido: a linha permanece e a Lixeira nao e tocada', async () => {
        useStore.setState({ loreCapitulosFuturo: [] });
        dados.listarLixeira.mockResolvedValue([{ id: 'L3', tipo: 'arco', foco: 'futuro', capituloId: 555, dados: { id: 1, titulo: 'Orfao', texto: '' }, em: 1 }]);
        montar();
        const dlg = await abrir();
        await act(async () => { fireEvent.click(within(dlg).getByText('↩️ Restaurar')); });
        await flush();
        expect(dados.removerDaLixeira).not.toHaveBeenCalled();
        expect(dlg.querySelectorAll('.sexta-memoria-item')).toHaveLength(1);
    });
    it('Fechar / Esc fecham a Lixeira', async () => {
        montar();
        const dlg = await abrir();
        fireEvent.click(within(dlg).getByText('Fechar'));
        expect(screen.queryByRole('dialog')).toBeNull();
        await act(async () => { fireEvent.click(screen.getByText('♻️ Lixeira')); });
        await flush();
        expect(screen.getByRole('dialog')).toBeTruthy();
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(screen.queryByRole('dialog')).toBeNull();
    });
});

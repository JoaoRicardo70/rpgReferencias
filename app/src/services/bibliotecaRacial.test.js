import { describe, it, expect, vi, beforeEach } from 'vitest';
import useStore from '../stores/useStore';
import { publicarNaBiblioteca, atualizarEntradaDaBiblioteca, removerDaBiblioteca, concederHabilidade, entradaExistenteParaPoder, limparPendentesBiblioteca } from './bibliotecaRacial';
import { salvarRacasDaMesa } from './racasMesa';
import { salvarFichaSilencioso, salvarDummie, salvarCenarioCompleto, salvarCamposPersonagem, enviarParaFeed } from './firebase-sync';
import { criarEntradaDePoder, getBiblioteca } from '../core/bibliotecaRacial';

vi.mock('./firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(), salvarDummie: vi.fn(), salvarCenarioCompleto: vi.fn(), salvarCamposPersonagem: vi.fn(), enviarParaFeed: vi.fn(),
}));

const RACAS = [{ id: 'saiyajin', nome: 'Saiyajin', icone: '🐒' }, { id: 'humano', nome: 'Humano', icone: '🧍' }];
const poderZenkai = (extra = {}) => ({ id: 5, nome: 'Zenkai', categoria: 'habilidadeRaca', descricao: 'Mais forte ao se recuperar.', racasAcesso: ['saiyajin'], percentualMinimo: 40, ativa: true, efeitos: [{ nome: 'F', atributo: 'forca', propriedade: 'bonus', valor: 3 }], ...extra });
const entrada = (extra = {}) => criarEntradaDePoder(poderZenkai(), { criadoPor: 'Mestre', agora: 1, ...extra }).entrada;

function preparar(extra = {}) {
    useStore.setState({
        isMestre: true, meuNome: 'Mestre', minhaFicha: { bio: { racaId: 'saiyajin', raca: 'Saiyajin' }, poderes: [] },
        cenario: { racas: RACAS, bibliotecaRacial: [entrada()], outro: 1 },
        personagens: {
            Kai: { bio: { racaId: 'saiyajin', raca: 'Saiyajin' }, poderes: [{ id: 1, nome: 'A' }, { id: 2, nome: 'B' }] },
            Lia: { bio: { racaId: 'humano', raca: 'Humano' }, poderes: [] },
            Gok: { bio: { composicaoRacial: [{ racaId: 'saiyajin', percentual: 20 }, { racaId: 'humano', percentual: 80 }] }, poderes: [] },
        },
        dummies: { d1: { nome: 'Boss', bio: { racaId: 'saiyajin' }, poderes: [] } }, ...extra,
    });
}
const ID = 'bib_zenkai';
beforeEach(() => { vi.clearAllMocks(); limparPendentesBiblioteca(); preparar(); });

describe('permissões', () => {
    it('jogador (ou Modo Jogador, isMestre false) não publica, edita, remove nem concede', () => {
        preparar({ isMestre: false });
        expect(publicarNaBiblioteca(poderZenkai(), { nome: 'X' }).ok).toBe(false);
        expect(atualizarEntradaDaBiblioteca(ID, { nome: 'Y' }).ok).toBe(false);
        expect(removerDaBiblioteca(ID).ok).toBe(false);
        const r = concederHabilidade({ id: 'Kai', nome: 'Kai' }, ID);
        expect(r.ok).toBe(false);
        expect(r.mensagem).toMatch(/Só o Mestre/);
        expect(salvarCenarioCompleto).not.toHaveBeenCalled();
        expect(salvarCamposPersonagem).not.toHaveBeenCalled();
        expect(salvarFichaSilencioso).not.toHaveBeenCalled();
    });
});

describe('publicar / atualizar / remover', () => {
    beforeEach(() => preparar({ cenario: { racas: RACAS, outro: 1 } }));
    it('publica um snapshot sem estado, com acesso e mínimo do cartão, preservando o resto do cenário', () => {
        const r = publicarNaBiblioteca(poderZenkai(), { nome: 'Zenkai', resumo: 'Resumo', icone: '⚡' });
        expect(r.ok).toBe(true);
        const salvo = salvarCenarioCompleto.mock.calls[0][0];
        expect(salvo.outro).toBe(1);
        expect(salvo.bibliotecaRacial).toHaveLength(1);
        const e = salvo.bibliotecaRacial[0];
        expect(e).toMatchObject({ id: 'bib_zenkai', nome: 'Zenkai', resumo: 'Resumo', icone: '⚡', racasAcesso: ['saiyajin'], percentualMinimo: 40, criadoPor: 'Mestre' });
        expect(e.modelo.ativa).toBeUndefined();
        expect(e.modelo.id).toBeUndefined();
        expect(e.modelo.efeitos).toHaveLength(1);
    });
    it('recusa poder que não é Habilidade de Raça', () => {
        expect(publicarNaBiblioteca({ nome: 'X', categoria: 'poder' }, { nome: 'X' }).ok).toBe(false);
        expect(publicarNaBiblioteca(null).ok).toBe(false);
        expect(salvarCenarioCompleto).not.toHaveBeenCalled();
    });
    it('já existe (mesmo nome): recusa e oferece atualizar; com atualizarId substitui o modelo mantendo id e data', () => {
        preparar();
        const r = publicarNaBiblioteca(poderZenkai({ descricao: 'Nova' }), { nome: 'Zenkai' });
        expect(r).toMatchObject({ ok: false, jaExiste: true, entradaId: ID });
        expect(salvarCenarioCompleto).not.toHaveBeenCalled();
        const ok = publicarNaBiblioteca(poderZenkai({ descricao: 'Nova', racasAcesso: ['saiyajin', 'humano'] }), { nome: 'Zenkai 2', atualizarId: ID });
        expect(ok).toMatchObject({ ok: true, atualizada: true });
        const lista = salvarCenarioCompleto.mock.calls[0][0].bibliotecaRacial;
        expect(lista).toHaveLength(1);
        expect(lista[0]).toMatchObject({ id: ID, nome: 'Zenkai 2', criadoEm: 1, racasAcesso: ['saiyajin', 'humano'] });
        expect(lista[0].modelo.descricao).toBe('Nova');
    });
    it('entradaExistenteParaPoder acha por origemBiblioteca ou nome', () => {
        preparar();
        expect(entradaExistenteParaPoder(useStore.getState().cenario, { nome: 'Outro', origemBiblioteca: ID }).id).toBe(ID);
        expect(entradaExistenteParaPoder(useStore.getState().cenario, { nome: 'zenkai' }).id).toBe(ID);
        expect(entradaExistenteParaPoder(useStore.getState().cenario, { nome: 'Nada' })).toBeNull();
    });
    it('atualizar: muda os campos pedidos, recusa nome vazio e id inexistente', () => {
        preparar();
        const r = atualizarEntradaDaBiblioteca(ID, { nome: 'Zenkai II', racasAcesso: ['humano'], percentualMinimo: 10, requisito: 'Treinar' });
        expect(r.ok).toBe(true);
        expect(salvarCenarioCompleto.mock.calls[0][0].bibliotecaRacial[0]).toMatchObject({ nome: 'Zenkai II', racasAcesso: ['humano'], percentualMinimo: 10, requisito: 'Treinar' });
        expect(atualizarEntradaDaBiblioteca(ID, { nome: '  ' }).ok).toBe(false);
        expect(atualizarEntradaDaBiblioteca('nao', { nome: 'x' }).ok).toBe(false);
        expect(salvarCenarioCompleto).toHaveBeenCalledTimes(1);
    });
    it('remover apaga o nó quando esvazia e não toca nas fichas', () => {
        preparar();
        expect(removerDaBiblioteca(ID).ok).toBe(true);
        const salvo = salvarCenarioCompleto.mock.calls[0][0];
        expect('bibliotecaRacial' in salvo).toBe(false);
        expect(salvo.racas).toHaveLength(2);
        expect(salvarCamposPersonagem).not.toHaveBeenCalled();
        expect(removerDaBiblioteca('nao').ok).toBe(false);
    });
    it('biblioteca cheia recusa nova publicação', () => {
        const base = entrada();
        const cheia = Array.from({ length: 60 }, (_, i) => ({ ...base, id: `b${i}`, nome: `N${i}` }));
        preparar({ cenario: { racas: RACAS, bibliotecaRacial: cheia } });
        expect(publicarNaBiblioteca(poderZenkai({ nome: 'Nova' }), { nome: 'Nova' }).ok).toBe(false);
    });
});

describe('concederHabilidade', () => {
    it('em mim: updateFicha + salvarFichaSilencioso; poder novo desligado com origemBiblioteca; Feed', () => {
        const r = concederHabilidade({ id: 'Mestre', nome: 'Mestre' }, ID);
        expect(r.ok).toBe(true);
        const p = useStore.getState().minhaFicha.poderes;
        expect(p).toHaveLength(1);
        expect(p[0]).toMatchObject({ nome: 'Zenkai', categoria: 'habilidadeRaca', origemBiblioteca: ID, ativa: false, racasAcesso: ['saiyajin'] });
        expect(p[0].bloqueio).toBeUndefined();
        expect(salvarFichaSilencioso).toHaveBeenCalledTimes(1);
        expect(salvarCamposPersonagem).not.toHaveBeenCalled();
        expect(enviarParaFeed.mock.calls[0][0].texto).toBe('📚 Mestre recebeu a Habilidade de Raça Zenkai');
    });
    it('em outro jogador: anexa em poderes/<tamanho da ficha mais fresca> via salvarCamposPersonagem', () => {
        const r = concederHabilidade({ id: 'Kai', nome: 'Kai' }, ID);
        expect(r.ok).toBe(true);
        expect(salvarCamposPersonagem).toHaveBeenCalledTimes(1);
        const [nome, campos] = salvarCamposPersonagem.mock.calls[0];
        expect(nome).toBe('Kai');
        expect(Object.keys(campos)).toEqual(['poderes/2']);
        expect(campos['poderes/2']).toMatchObject({ nome: 'Zenkai', origemBiblioteca: ID });
        // ficha cresceu (outro Mestre adicionou): o índice acompanha a ficha MAIS FRESCA
        limparPendentesBiblioteca(); preparar();
        useStore.setState({ personagens: { ...useStore.getState().personagens, Kai: { bio: { racaId: 'saiyajin' }, poderes: [{ id: 1, nome: 'A' }, { id: 2, nome: 'B' }, { id: 3, nome: 'C' }, { id: 4, nome: 'D' }] } } });
        concederHabilidade({ id: 'Kai', nome: 'Kai' }, ID);
        expect(Object.keys(salvarCamposPersonagem.mock.calls[1][1])).toEqual(['poderes/4']);
    });
    it('id do poder não colide com poder existente na ficha', () => {
        const agora = Date.now();
        useStore.setState({ personagens: { ...useStore.getState().personagens, Kai: { bio: { racaId: 'saiyajin' }, poderes: Array.from({ length: 3 }, (_, i) => ({ id: agora + i, nome: `P${i}` })) } } });
        const spy = vi.spyOn(Date, 'now').mockReturnValue(agora);
        concederHabilidade({ id: 'Kai', nome: 'Kai' }, ID);
        spy.mockRestore();
        expect(salvarCamposPersonagem.mock.calls[0][1]['poderes/3'].id).toBe(agora + 3);
    });
    it('dummie: salvarDummie com o poder anexado', () => {
        const r = concederHabilidade({ id: 'd1', nome: 'Boss', isDummie: true }, ID);
        expect(r.ok).toBe(true);
        const [id, d] = salvarDummie.mock.calls[0];
        expect(id).toBe('d1');
        expect(d.poderes).toHaveLength(1);
        expect(d.poderes[0].origemBiblioteca).toBe(ID);
    });
    it('já possui (origem ou nome): recusa sem gravar', () => {
        useStore.setState({ personagens: { ...useStore.getState().personagens, Kai: { bio: { racaId: 'saiyajin' }, poderes: [{ id: 9, nome: 'zenkai' }] } } });
        const r = concederHabilidade({ id: 'Kai', nome: 'Kai' }, ID);
        expect(r).toMatchObject({ ok: false, jaPossui: true });
        expect(salvarCamposPersonagem).not.toHaveBeenCalled();
        expect(enviarParaFeed).not.toHaveBeenCalled();
    });
    it('sem Raça com acesso: pede exceção; confirmada, grava racaExcecao', () => {
        const r = concederHabilidade({ id: 'Lia', nome: 'Lia' }, ID);
        expect(r).toMatchObject({ ok: false, precisaExcecao: true });
        expect(r.mensagem).toMatch(/exceção/);
        expect(salvarCamposPersonagem).not.toHaveBeenCalled();
        const ok = concederHabilidade({ id: 'Lia', nome: 'Lia' }, ID, { excecaoConfirmada: true });
        expect(ok).toMatchObject({ ok: true, excecao: true });
        expect(salvarCamposPersonagem.mock.calls[0][1]['poderes/0'].racaExcecao).toBe(true);
    });
    it('abaixo do mínimo: concede normalmente e avisa; o poder fica com Domínio insuficiente (derivado, sem bloqueio gravado)', () => {
        const r = concederHabilidade({ id: 'Gok', nome: 'Gok' }, ID);
        expect(r).toMatchObject({ ok: true, dominioInsuficiente: true, excecao: false });
        const p = salvarCamposPersonagem.mock.calls[0][1]['poderes/0'];
        expect(p.bloqueio).toBeUndefined();
        expect(p.percentualMinimo).toBe(40);
    });
    it('bloqueada com requisito: usa o pedido; senão o da entrada', () => {
        preparar({ cenario: { racas: RACAS, bibliotecaRacial: [entrada({ requisito: 'Padrão' })] } });
        concederHabilidade({ id: 'Kai', nome: 'Kai' }, ID, { bloqueada: true, requisito: 'Vencer o Boss' });
        expect(salvarCamposPersonagem.mock.calls[0][1]['poderes/2'].bloqueio).toEqual({ ativo: true, requisito: 'Vencer o Boss', motivo: '' });
        limparPendentesBiblioteca(); // (simula o store já refletido)
        concederHabilidade({ id: 'Kai', nome: 'Kai' }, ID, { bloqueada: true });
        expect(salvarCamposPersonagem.mock.calls[1][1]['poderes/2'].bloqueio.requisito).toBe('Padrão');
    });
    it('entrada, personagem ou dummie inexistentes: falha sem gravar', () => {
        expect(concederHabilidade({ id: 'Kai', nome: 'Kai' }, 'nao').ok).toBe(false);
        expect(concederHabilidade({ id: 'Ninguem', nome: 'Ninguem' }, ID).ok).toBe(false);
        expect(concederHabilidade({ id: 'zz', isDummie: true }, ID).ok).toBe(false);
        expect(concederHabilidade(null, ID).ok).toBe(false);
    });
});

describe('Raça removida do catálogo limpa a biblioteca', () => {
    it('salvarRacasDaMesa com { removida } tira o id dos racasAcesso das entradas, na mesma gravação', () => {
        preparar({ cenario: { racas: RACAS, bibliotecaRacial: [{ ...entrada(), racasAcesso: ['saiyajin', 'humano'] }] } });
        salvarRacasDaMesa([RACAS[1]], { removida: 'saiyajin' });
        const salvo = salvarCenarioCompleto.mock.calls[0][0];
        expect(salvo.bibliotecaRacial[0].racasAcesso).toEqual(['humano']);
        expect(getBiblioteca(salvo)).toHaveLength(1);
    });
    it('sem { removida } a biblioteca fica intacta', () => {
        preparar({ cenario: { racas: RACAS, bibliotecaRacial: [{ ...entrada(), racasAcesso: ['saiyajin'] }] } });
        salvarRacasDaMesa([RACAS[1]]);
        expect(salvarCenarioCompleto.mock.calls[0][0].bibliotecaRacial[0].racasAcesso).toEqual(['saiyajin']);
    });
});

const outra = (extra = {}) => criarEntradaDePoder(poderZenkai({ nome: 'Tenacidade', racasAcesso: ['saiyajin'], ...extra }), { agora: 2 }).entrada;

describe('operações seguidas antes do store refletir', () => {
    it('duas concessões ao mesmo jogador (entradas diferentes) usam índices distintos e acumulam', () => {
        preparar({ cenario: { racas: RACAS, bibliotecaRacial: [entrada(), outra()] } });
        expect(concederHabilidade({ id: 'Kai', nome: 'Kai' }, 'bib_zenkai').ok).toBe(true);
        expect(concederHabilidade({ id: 'Kai', nome: 'Kai' }, 'bib_tenacidade').ok).toBe(true);
        const i1 = Object.keys(salvarCamposPersonagem.mock.calls[0][1])[0];
        const i2 = Object.keys(salvarCamposPersonagem.mock.calls[1][1])[0];
        expect([i1, i2]).toEqual(['poderes/2', 'poderes/3']);
        // a mesma entrada de novo: recusada como "já possui" (considera a pendente)
        expect(concederHabilidade({ id: 'Kai', nome: 'Kai' }, 'bib_zenkai')).toMatchObject({ ok: false, jaPossui: true });
    });
    it('quando o store reflete a concessão, a reserva sai e o índice segue a ficha real', () => {
        preparar({ cenario: { racas: RACAS, bibliotecaRacial: [entrada(), outra()] } });
        concederHabilidade({ id: 'Kai', nome: 'Kai' }, 'bib_zenkai');
        const gravado = salvarCamposPersonagem.mock.calls[0][1]['poderes/2'];
        useStore.setState({ personagens: { ...useStore.getState().personagens, Kai: { bio: { racaId: 'saiyajin' }, poderes: [{ id: 1, nome: 'A' }, { id: 2, nome: 'B' }, gravado] } } });
        concederHabilidade({ id: 'Kai', nome: 'Kai' }, 'bib_tenacidade');
        expect(Object.keys(salvarCamposPersonagem.mock.calls[1][1])).toEqual(['poderes/3']);
    });
    it('poderes esparso (objeto do Firebase) não colide: usa o maior índice + 1', () => {
        useStore.setState({ personagens: { ...useStore.getState().personagens, Kai: { bio: { racaId: 'saiyajin' }, poderes: { 0: { id: 1, nome: 'A' }, 5: { id: 2, nome: 'B' } } } } });
        concederHabilidade({ id: 'Kai', nome: 'Kai' }, ID);
        expect(Object.keys(salvarCamposPersonagem.mock.calls[0][1])).toEqual(['poderes/6']);
    });
    it('dummie: a segunda concessão regrava o objeto com a primeira ainda pendente', () => {
        preparar({ cenario: { racas: RACAS, bibliotecaRacial: [entrada(), outra()] } });
        concederHabilidade({ id: 'd1', nome: 'Boss', isDummie: true }, 'bib_zenkai');
        concederHabilidade({ id: 'd1', nome: 'Boss', isDummie: true }, 'bib_tenacidade');
        expect(salvarDummie.mock.calls[1][1].poderes.map(p => p.nome)).toEqual(['Zenkai', 'Tenacidade']);
    });
    it('biblioteca: publicar + editar e duas edições seguidas não perdem a primeira', () => {
        preparar({ cenario: { racas: RACAS, outro: 1 } });
        publicarNaBiblioteca(poderZenkai(), { nome: 'Zenkai' });
        expect(atualizarEntradaDaBiblioteca(ID, { resumo: 'Novo' }).ok).toBe(true);
        expect(atualizarEntradaDaBiblioteca(ID, { requisito: 'Treinar' }).ok).toBe(true);
        const lista = salvarCenarioCompleto.mock.calls[2][0].bibliotecaRacial;
        expect(lista).toHaveLength(1);
        expect(lista[0]).toMatchObject({ resumo: 'Novo', requisito: 'Treinar' });
        publicarNaBiblioteca(poderZenkai({ nome: 'Tenacidade' }), { nome: 'Tenacidade' });
        expect(salvarCenarioCompleto.mock.calls[3][0].bibliotecaRacial).toHaveLength(2);
    });
});

describe('nome da entrada', () => {
    it('atualizar: corta em 60 e recusa nome repetido (sem acento/caixa), mas aceita o próprio nome', () => {
        preparar({ cenario: { racas: RACAS, bibliotecaRacial: [entrada(), outra()] } });
        expect(atualizarEntradaDaBiblioteca(ID, { nome: 'TENACIDADE' })).toMatchObject({ ok: false, nomeDuplicado: true });
        expect(atualizarEntradaDaBiblioteca(ID, { nome: 'ZENKAI' }).ok).toBe(true);
        expect(atualizarEntradaDaBiblioteca(ID, { nome: 'x'.repeat(100) }).entrada.nome).toHaveLength(60);
    });
    it('publicar: nome já usado por OUTRA entrada é recusado', () => {
        preparar({ cenario: { racas: RACAS, bibliotecaRacial: [entrada()] } });
        const r = publicarNaBiblioteca(poderZenkai({ nome: 'Outra' }), { nome: 'zenkai' });
        expect(r).toMatchObject({ ok: false, nomeDuplicado: true });
    });
});

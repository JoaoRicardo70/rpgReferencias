import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import useStore from '../stores/useStore';
import { publicarNaBiblioteca, atualizarEntradaDaBiblioteca, removerDaBiblioteca, concederHabilidade, limparPendentesBiblioteca } from './bibliotecaRacial';
import { salvarRacasDaMesa } from './racasMesa';
import { salvarFichaSilencioso, salvarDummie, salvarCenarioCompleto, salvarCamposPersonagem } from './firebase-sync';
import { criarEntradaDePoder, disponiveisParaJogador } from '../core/bibliotecaRacial';

vi.mock('./firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(), salvarDummie: vi.fn(), salvarCenarioCompleto: vi.fn(), salvarCamposPersonagem: vi.fn(), enviarParaFeed: vi.fn(),
}));

const RACAS = [{ id: 'saiyajin', nome: 'Saiyajin', icone: '🐒' }, { id: 'humano', nome: 'Humano', icone: '🧍' }];
const poder = (extra = {}) => ({
    id: 5, nome: 'Zenkai', categoria: 'habilidadeRaca', descricao: 'd', racasAcesso: ['saiyajin'], percentualMinimo: 40, ativa: true,
    racaExcecao: true, bloqueio: { ativo: true, requisito: 'x' }, origemBiblioteca: 'bib_velho', efeitos: [{ nome: 'F', atributo: 'forca', propriedade: 'bonus', valor: 3 }], ...extra,
});
const entrada = (nome = 'Zenkai', extra = {}) => criarEntradaDePoder(poder({ nome }), { criadoPor: 'Mestre', agora: 1, ...extra }).entrada;

function preparar(extra = {}) {
    useStore.setState({
        isMestre: true, meuNome: 'Mestre', minhaFicha: { bio: { racaId: 'saiyajin' }, poderes: [] },
        cenario: { racas: RACAS, bibliotecaRacial: [entrada()] },
        personagens: {
            Kai: { bio: { racaId: 'saiyajin' }, poderes: [{ id: 1, nome: 'A' }] },
            Lia: { bio: { racaId: 'humano' }, poderes: [] },
        },
        dummies: {}, ...extra,
    });
}
beforeEach(() => { vi.clearAllMocks(); limparPendentesBiblioteca(); preparar(); });
afterEach(() => { vi.useRealTimers(); });

describe('(b) publicado e concedido pelo serviço', () => {
    it('publicar: modelo gravado sem id/ativa/bloqueio/racaExcecao/origemBiblioteca/racasAcesso; entrada leva acesso e mínimo da meta', () => {
        preparar({ cenario: { racas: RACAS } });
        expect(publicarNaBiblioteca(poder(), { nome: 'Zenkai', racasAcesso: ['humano'], percentualMinimo: 15 }).ok).toBe(true);
        const e = salvarCenarioCompleto.mock.calls[0][0].bibliotecaRacial[0];
        ['id', 'ativa', 'bloqueio', 'racaExcecao', 'origemBiblioteca', 'racasAcesso', 'percentualMinimo'].forEach(k => expect(e.modelo[k], k).toBeUndefined());
        expect(e.racasAcesso).toEqual(['humano']);
        expect(e.percentualMinimo).toBe(15);
    });
    it('concedido a outro jogador usa acesso e mínimo da ENTRADA, ativa false, origemBiblioteca = id', () => {
        preparar({ cenario: { racas: RACAS, bibliotecaRacial: [{ ...entrada(), racasAcesso: ['saiyajin', 'humano'], percentualMinimo: 12 }] } });
        concederHabilidade({ id: 'Kai', nome: 'Kai' }, 'bib_zenkai');
        const p = salvarCamposPersonagem.mock.calls[0][1]['poderes/1'];
        expect(p).toMatchObject({ origemBiblioteca: 'bib_zenkai', ativa: false, categoria: 'habilidadeRaca', racasAcesso: ['saiyajin', 'humano'], percentualMinimo: 12 });
        expect(p.bloqueio).toBeUndefined();
        expect(p.racaExcecao).toBeUndefined();
    });
});

describe('(c) segurança: nada gravado fora do Mestre', () => {
    it('Modo Jogador (isMestre false): todas as operações recusam e nenhum save é chamado; store intacto', () => {
        preparar({ isMestre: false });
        const antes = JSON.stringify(useStore.getState().cenario);
        const antesFicha = JSON.stringify(useStore.getState().minhaFicha);
        const rs = [
            publicarNaBiblioteca(poder(), { nome: 'Novo' }),
            atualizarEntradaDaBiblioteca('bib_zenkai', { nome: 'Y' }),
            removerDaBiblioteca('bib_zenkai'),
            concederHabilidade({ id: 'Kai', nome: 'Kai' }, 'bib_zenkai'),
            concederHabilidade({ id: 'Mestre', nome: 'Mestre' }, 'bib_zenkai'),
            concederHabilidade({ id: 'd1', nome: 'B', isDummie: true }, 'bib_zenkai'),
        ];
        rs.forEach(r => expect(r.ok).toBe(false));
        [salvarCenarioCompleto, salvarCamposPersonagem, salvarFichaSilencioso, salvarDummie].forEach(f => expect(f).not.toHaveBeenCalled());
        expect(JSON.stringify(useStore.getState().cenario)).toBe(antes);
        expect(JSON.stringify(useStore.getState().minhaFicha)).toBe(antesFicha);
    });
    it('visão do jogador para a ficha dele não contém modelo nem a entrada de outra Raça', () => {
        const cen = { racas: RACAS, bibliotecaRacial: [entrada('Zenkai'), { ...entrada('Adapt'), racasAcesso: ['humano'] }] };
        const l = disponiveisParaJogador(cen, { bio: { racaId: 'humano' }, poderes: [] });
        expect(l.map(x => x.nome)).toEqual(['Adapt']);
        expect(JSON.stringify(l)).not.toMatch(/modelo|efeitos/);
    });
});

describe('(d) limites na publicação', () => {
    beforeEach(() => preparar({ cenario: { racas: RACAS } }));
    it('modelo >20KB: recusa com mensagem e não grava', () => {
        const r = publicarNaBiblioteca(poder({ descricao: 'x'.repeat(21000) }), { nome: 'Gigante' });
        expect(r.ok).toBe(false);
        expect(r.mensagem).toMatch(/grande demais/);
        expect(salvarCenarioCompleto).not.toHaveBeenCalled();
    });
    it('nome >60 é cortado em 60 ao publicar', () => {
        publicarNaBiblioteca(poder(), { nome: 'n'.repeat(90) });
        expect(salvarCenarioCompleto.mock.calls[0][0].bibliotecaRacial[0].nome).toHaveLength(60);
    });
    it('chave inválida no poder: recusa', () => {
        expect(publicarNaBiblioteca(poder({ efeitos: [{ 'a/b': 1 }] }), { nome: 'Ruim' }).ok).toBe(false);
        expect(salvarCenarioCompleto).not.toHaveBeenCalled();
    });
    it('cenário do Firebase com objeto em vez de array: publicar mantém as existentes', () => {
        preparar({ cenario: { racas: RACAS, bibliotecaRacial: { 0: entrada('A'), 1: entrada('B') } } });
        publicarNaBiblioteca(poder({ nome: 'C' }), { nome: 'C' });
        const lista = salvarCenarioCompleto.mock.calls[0][0].bibliotecaRacial;
        expect(Array.isArray(lista)).toBe(true);
        expect(lista.map(e => e.nome)).toEqual(['A', 'B', 'C']);
    });
    it('exatamente 59 entradas aceita a 60ª; com 60 recusa', () => {
        const mk = (n) => Array.from({ length: n }, (_, i) => ({ ...entrada(`N${i}`), id: `b${i}` }));
        preparar({ cenario: { racas: RACAS, bibliotecaRacial: mk(59) } });
        expect(publicarNaBiblioteca(poder({ nome: 'Ultima' }), { nome: 'Ultima' }).ok).toBe(true);
        expect(salvarCenarioCompleto.mock.calls[0][0].bibliotecaRacial).toHaveLength(60);
        limparPendentesBiblioteca();
        preparar({ cenario: { racas: RACAS, bibliotecaRacial: mk(60) } });
        expect(publicarNaBiblioteca(poder({ nome: 'Extra' }), { nome: 'Extra' }).ok).toBe(false);
    });
});

describe('(e) corrida', () => {
    it('duas concessões seguidas ao mesmo jogador: poderes/1 e poderes/2 (ficha com 1 poder), ids distintos', () => {
        preparar({ cenario: { racas: RACAS, bibliotecaRacial: [entrada('Zenkai'), entrada('Tenacidade')] } });
        concederHabilidade({ id: 'Kai', nome: 'Kai' }, 'bib_zenkai');
        concederHabilidade({ id: 'Kai', nome: 'Kai' }, 'bib_tenacidade');
        const c = salvarCamposPersonagem.mock.calls;
        expect(Object.keys(c[0][1])).toEqual(['poderes/1']);
        expect(Object.keys(c[1][1])).toEqual(['poderes/2']);
        expect(c[0][1]['poderes/1'].id).not.toBe(c[1][1]['poderes/2'].id);
    });
    it('três concessões seguidas: 1, 2, 3', () => {
        preparar({ cenario: { racas: RACAS, bibliotecaRacial: [entrada('A1'), entrada('B1'), entrada('C1')] } });
        ['bib_a1', 'bib_b1', 'bib_c1'].forEach(id => concederHabilidade({ id: 'Kai', nome: 'Kai' }, id));
        expect(salvarCamposPersonagem.mock.calls.map(c => Object.keys(c[1])[0])).toEqual(['poderes/1', 'poderes/2', 'poderes/3']);
    });
    it('poderes esparso {0,5} => poderes/6', () => {
        useStore.setState({ personagens: { ...useStore.getState().personagens, Kai: { bio: { racaId: 'saiyajin' }, poderes: { 0: { id: 1, nome: 'A' }, 5: { id: 2, nome: 'B' } } } } });
        concederHabilidade({ id: 'Kai', nome: 'Kai' }, 'bib_zenkai');
        expect(Object.keys(salvarCamposPersonagem.mock.calls[0][1])).toEqual(['poderes/6']);
    });
    it('poderes ausente => poderes/0', () => {
        useStore.setState({ personagens: { ...useStore.getState().personagens, Kai: { bio: { racaId: 'saiyajin' } } } });
        concederHabilidade({ id: 'Kai', nome: 'Kai' }, 'bib_zenkai');
        expect(Object.keys(salvarCamposPersonagem.mock.calls[0][1])).toEqual(['poderes/0']);
    });
    it('concessões simultâneas a jogadores diferentes não se interferem', () => {
        preparar({ cenario: { racas: RACAS, bibliotecaRacial: [{ ...entrada(), racasAcesso: ['saiyajin', 'humano'] }] } });
        concederHabilidade({ id: 'Kai', nome: 'Kai' }, 'bib_zenkai');
        concederHabilidade({ id: 'Lia', nome: 'Lia' }, 'bib_zenkai');
        expect(salvarCamposPersonagem.mock.calls.map(c => [c[0], Object.keys(c[1])[0]])).toEqual([['Kai', 'poderes/1'], ['Lia', 'poderes/0']]);
    });
    it('a reserva expira após 8s: o índice volta a seguir a ficha do store', () => {
        vi.useFakeTimers(); vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
        preparar({ cenario: { racas: RACAS, bibliotecaRacial: [entrada('Zenkai'), entrada('Tenacidade')] } });
        concederHabilidade({ id: 'Kai', nome: 'Kai' }, 'bib_zenkai');
        vi.setSystemTime(new Date('2026-01-01T00:00:07Z'));
        concederHabilidade({ id: 'Kai', nome: 'Kai' }, 'bib_tenacidade');
        expect(Object.keys(salvarCamposPersonagem.mock.calls[1][1])).toEqual(['poderes/2']); // ainda reservada
        vi.setSystemTime(new Date('2026-01-01T00:00:20Z'));
        preparar({ cenario: { racas: RACAS, bibliotecaRacial: [entrada('Zenkai')] } });
        concederHabilidade({ id: 'Kai', nome: 'Kai' }, 'bib_zenkai');
        expect(Object.keys(salvarCamposPersonagem.mock.calls[2][1])).toEqual(['poderes/1']); // expirou
    });
    it('limparPendentesBiblioteca descarta a reserva (e o "já possui" pendente)', () => {
        concederHabilidade({ id: 'Kai', nome: 'Kai' }, 'bib_zenkai');
        expect(concederHabilidade({ id: 'Kai', nome: 'Kai' }, 'bib_zenkai').jaPossui).toBe(true);
        limparPendentesBiblioteca();
        expect(concederHabilidade({ id: 'Kai', nome: 'Kai' }, 'bib_zenkai').ok).toBe(true);
    });
    it('publicar + editar seguidos mantêm a primeira; remover logo após publicar enxerga a publicada', () => {
        preparar({ cenario: { racas: RACAS } });
        publicarNaBiblioteca(poder(), { nome: 'Zenkai' });
        publicarNaBiblioteca(poder({ nome: 'Outra' }), { nome: 'Outra' });
        expect(atualizarEntradaDaBiblioteca('bib_zenkai', { resumo: 'R' }).ok).toBe(true);
        const l = salvarCenarioCompleto.mock.calls[2][0].bibliotecaRacial;
        expect(l.map(e => e.nome)).toEqual(['Zenkai', 'Outra']);
        expect(l[0].resumo).toBe('R');
        expect(removerDaBiblioteca('bib_outra').ok).toBe(true);
        expect(salvarCenarioCompleto.mock.calls[3][0].bibliotecaRacial.map(e => e.id)).toEqual(['bib_zenkai']);
    });
    it('a base pendente expira com o tempo (8s) e passa a valer o store', () => {
        vi.useFakeTimers(); vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
        preparar({ cenario: { racas: RACAS } });
        publicarNaBiblioteca(poder(), { nome: 'Zenkai' });
        vi.setSystemTime(new Date('2026-01-01T00:00:30Z'));
        // store ainda sem a entrada (nunca refletiu): a pendente caducou, então publicar o mesmo nome de novo é aceito
        expect(publicarNaBiblioteca(poder(), { nome: 'Zenkai' }).ok).toBe(true);
    });
});

describe('(f) raça removida só pelo catálogo', () => {
    it('removida:saiyajin limpa a entrada; entrada que só tinha saiyajin fica com racasAcesso []', () => {
        preparar({ cenario: { racas: RACAS, bibliotecaRacial: [entrada('A'), { ...entrada('B'), racasAcesso: ['humano'] }] } });
        salvarRacasDaMesa([RACAS[1]], { removida: 'saiyajin' });
        const l = salvarCenarioCompleto.mock.calls[0][0].bibliotecaRacial;
        expect(l.find(e => e.nome === 'A').racasAcesso).toEqual([]);
        expect(l.find(e => e.nome === 'B').racasAcesso).toEqual(['humano']);
    });
    it('renomear/editar o catálogo sem { removida } não toca nas entradas', () => {
        preparar({ cenario: { racas: RACAS, bibliotecaRacial: [entrada('A')] } });
        salvarRacasDaMesa([{ ...RACAS[0], nome: 'Sayajin' }, RACAS[1]]);
        expect(salvarCenarioCompleto.mock.calls[0][0].bibliotecaRacial[0].racasAcesso).toEqual(['saiyajin']);
    });
});

describe('editar/remover NÃO altera cópias já concedidas', () => {
    it('após remover/editar a entrada, nenhum save de personagem/ficha/dummie', () => {
        concederHabilidade({ id: 'Mestre', nome: 'Mestre' }, 'bib_zenkai');
        const copia = JSON.stringify(useStore.getState().minhaFicha.poderes);
        vi.clearAllMocks();
        atualizarEntradaDaBiblioteca('bib_zenkai', { nome: 'Outro', percentualMinimo: 90, racasAcesso: ['humano'] });
        removerDaBiblioteca('bib_zenkai');
        expect(salvarCamposPersonagem).not.toHaveBeenCalled();
        expect(salvarDummie).not.toHaveBeenCalled();
        expect(salvarFichaSilencioso).not.toHaveBeenCalled();
        expect(JSON.stringify(useStore.getState().minhaFicha.poderes)).toBe(copia);
    });
});

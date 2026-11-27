import { describe, it, expect, vi, beforeEach } from 'vitest';
import useStore from '../stores/useStore';

vi.mock('./firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(), salvarCamposPersonagem: vi.fn(() => Promise.resolve(true)),
    enviarParaFeed: vi.fn(), salvarCenarioCompleto: vi.fn(),
}));
import * as sync from './firebase-sync';
import { concederPraticaRacial, removerRacaDaComposicao, definirComposicaoRacial, definirPercentualMinimoDoPoder, aprovarPedidoRaca, recusarPedidoRaca } from './composicaoRacial';
import { definirRacaDoPersonagemDireto } from './racasMesa';
import { listarPedidosRaca } from '../core/racas';

const cenario = { racas: [{ id: 'saiyajin', nome: 'Saiyajin' }, { id: 'humano', nome: 'Humano' }] };
const hab = (extra = {}) => ({ id: 7, nome: 'Kaioken', categoria: 'habilidadeRaca', racasAcesso: ['saiyajin'], percentualMinimo: 50, ativa: true, vida: {}, mana: {}, aura: {}, chakra: {}, corpo: {}, ...extra });
const fichaCom = (comp, poderes = [hab()], bio = {}) => ({ bio: { raca: 'Saiyajin', racaId: 'saiyajin', composicaoRacial: comp, ...bio }, poderes });
const eu = { id: 'Goku', nome: 'Goku' };
const outro = { id: 'Vegeta', nome: 'Vegeta' };
function montar({ isMestre = true, minha, outros = {} } = {}) {
    useStore.setState({ meuNome: 'Goku', isMestre, souMestreReal: isMestre, cenario, minhaFicha: minha, personagens: outros });
}
beforeEach(() => { vi.clearAllMocks(); });

describe('desliga Habilidade de Raça ligada que ficou bloqueada', () => {
    it('prática negativa na própria ficha desliga e avisa no Feed', () => {
        montar({ minha: fichaCom([{ racaId: 'saiyajin', percentual: 60, origem: 'nativa' }]) });
        expect(concederPraticaRacial(eu, 'saiyajin', -20).ok).toBe(true);
        expect(useStore.getState().minhaFicha.poderes[0].ativa).toBe(false);
        expect(sync.enviarParaFeed).toHaveBeenCalledWith(expect.objectContaining({ texto: expect.stringContaining('Kaioken foi desligada') }));
    });
    it('não desliga se continua liberada', () => {
        montar({ minha: fichaCom([{ racaId: 'saiyajin', percentual: 90, origem: 'nativa' }]) });
        concederPraticaRacial(eu, 'saiyajin', -20);
        expect(useStore.getState().minhaFicha.poderes[0].ativa).toBe(true);
    });
    it('definir composição / subir o mínimo desligam; perder a Raça por completo só dá o selo de incompatível (não bloqueia)', () => {
        montar({ minha: fichaCom([{ racaId: 'saiyajin', percentual: 60, origem: 'nativa' }]) });
        definirComposicaoRacial(eu, [{ racaId: 'saiyajin', percentual: 10 }]);
        expect(useStore.getState().minhaFicha.poderes[0].ativa).toBe(false);
        montar({ minha: fichaCom([{ racaId: 'saiyajin', percentual: 60, origem: 'nativa' }]) });
        definirPercentualMinimoDoPoder(eu, 7, 90);
        expect(useStore.getState().minhaFicha.poderes[0].ativa).toBe(false);
    });
    it('outro jogador: grava poderes/<idx>/ativa=false pela ficha mais fresca', () => {
        montar({ minha: fichaCom([]), outros: { Vegeta: fichaCom([{ racaId: 'saiyajin', percentual: 60, origem: 'nativa' }], [{ id: 1, categoria: 'habilidade' }, hab({ id: 9 })]) } });
        concederPraticaRacial(outro, 'saiyajin', -50);
        const campos = sync.salvarCamposPersonagem.mock.calls[0][1];
        expect(campos['poderes/1/ativa']).toBe(false);
        expect(campos['bio/composicaoRacial'][0].percentual).toBe(10);
    });
});

describe('alinhamento automático da composição só pelo Mestre', () => {
    it('jogador trocando a própria Raça com composição explícita: não altera a composição', () => {
        montar({ isMestre: false, minha: fichaCom([{ racaId: 'saiyajin', percentual: 40, origem: 'nativa' }], []) });
        expect(definirRacaDoPersonagemDireto(eu, 'humano')).toBe(true);
        const f = useStore.getState().minhaFicha;
        expect(f.bio.racaId).toBe('humano');
        expect(f.bio.composicaoRacial).toEqual([{ racaId: 'saiyajin', percentual: 40, origem: 'nativa' }]);
    });
    it('Mestre troca a própria Raça: a principal entra a 100%', () => {
        montar({ minha: fichaCom([{ racaId: 'saiyajin', percentual: 40, origem: 'nativa' }], []) });
        definirRacaDoPersonagemDireto(eu, 'humano');
        expect(useStore.getState().minhaFicha.bio.composicaoRacial.some(e => e.racaId === 'humano' && e.percentual === 100)).toBe(true);
    });
    it('jogador sem composição explícita: nada é gravado na composição', () => {
        montar({ isMestre: false, minha: { bio: { raca: 'Saiyajin', racaId: 'saiyajin' }, poderes: [] } });
        definirRacaDoPersonagemDireto(eu, 'humano');
        expect(useStore.getState().minhaFicha.bio.composicaoRacial).toBeUndefined();
    });
});

describe('pedido forjado (dono sem poder de Manipulação de DNA)', () => {
    const pedido = { id: 'ped1', racaId: 'humano', motivo: 'forjado', ts: 1 };
    it('aprovar é recusado; recusar continua; listarPedidosRaca marca semPoderDNA', () => {
        montar({ minha: fichaCom([], []), outros: { Vegeta: { bio: { raca: 'Saiyajin', racaId: 'saiyajin', pedidosRaca: [pedido] }, poderes: [] } } });
        const lista = listarPedidosRaca({ personagens: useStore.getState().personagens, meuNome: 'Goku', minhaFicha: useStore.getState().minhaFicha });
        expect(lista[0].semPoderDNA).toBe(true);
        const r = aprovarPedidoRaca(outro, 'ped1', 10);
        expect(r.ok).toBe(false);
        expect(r.mensagem).toMatch(/Manipulação de DNA/);
        expect(sync.salvarCamposPersonagem).not.toHaveBeenCalled();
        expect(recusarPedidoRaca(outro, 'ped1').ok).toBe(true);
    });
    it('com o poder marcado, semPoderDNA é false e aprovar funciona', () => {
        montar({ minha: fichaCom([], []), outros: { Vegeta: { bio: { raca: 'Saiyajin', racaId: 'saiyajin', pedidosRaca: [pedido] }, poderes: [{ id: 3, manipulaDNA: true }] } } });
        const lista = listarPedidosRaca({ personagens: useStore.getState().personagens, meuNome: 'Goku', minhaFicha: useStore.getState().minhaFicha });
        expect(lista[0].semPoderDNA).toBe(false);
        expect(aprovarPedidoRaca(outro, 'ped1', 25).ok).toBe(true);
    });
});

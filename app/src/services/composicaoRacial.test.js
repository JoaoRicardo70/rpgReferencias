import { describe, it, expect, vi, beforeEach } from 'vitest';
import useStore from '../stores/useStore';

vi.mock('./firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    salvarCamposPersonagem: vi.fn(() => Promise.resolve(true)),
    enviarParaFeed: vi.fn(),
    salvarCenarioCompleto: vi.fn(),
}));
import * as sync from './firebase-sync';
import {
    definirComposicaoRacial, concederPraticaRacial, adicionarRacaAdquirida, removerRacaDaComposicao, pedirRacaAdquirida,
    aprovarPedidoRaca, recusarPedidoRaca, definirBloqueioDoPoder, despertarHabilidade, definirPercentualMinimoDoPoder, definirManipulaDNA,
} from './composicaoRacial';
import { salvarRacasDaMesa } from './racasMesa';
import { getComposicaoRacial } from '../core/racas';

const cenario = { racas: [{ id: 'saiyajin', nome: 'Saiyajin' }, { id: 'humano', nome: 'Humano' }, { id: 'namek', nome: 'Namek' }] };
const hab = (extra = {}) => ({ id: 7, nome: 'Kaioken', categoria: 'habilidadeRaca', racasAcesso: ['saiyajin'], ...extra });
const fichaBase = (extra = {}) => ({ bio: { raca: 'Saiyajin', racaId: 'saiyajin' }, poderes: [hab()], ...extra });

function montar({ isMestre = true, minha = fichaBase(), outros = {} } = {}) {
    useStore.setState({ meuNome: 'Goku', isMestre, souMestreReal: isMestre, cenario, minhaFicha: minha, personagens: outros });
}
const eu = { id: 'Goku', nome: 'Goku' };
const outro = { id: 'Vegeta', nome: 'Vegeta' };

beforeEach(() => { vi.clearAllMocks(); });

describe('permissões', () => {
    it('jogador (e Modo Jogador) não usa ações do Mestre', () => {
        montar({ isMestre: false });
        expect(definirComposicaoRacial(eu, []).ok).toBe(false);
        expect(concederPraticaRacial(eu, 'saiyajin', 5).ok).toBe(false);
        expect(adicionarRacaAdquirida(eu, 'humano').ok).toBe(false);
        expect(definirBloqueioDoPoder(eu, 7, { ativo: true }).ok).toBe(false);
        expect(despertarHabilidade(eu, 7).ok).toBe(false);
        expect(definirManipulaDNA(eu, 7, true).ok).toBe(false);
        expect(definirPercentualMinimoDoPoder(eu, 7, 50).ok).toBe(false);
        expect(sync.salvarFichaSilencioso).not.toHaveBeenCalled();
    });
});

describe('composição e prática', () => {
    it('materializa a derivada, adiciona adquirida a 10% e registra histórico', () => {
        montar();
        const r = adicionarRacaAdquirida(eu, 'humano', undefined, 'Infinity de DNA');
        expect(r.ok).toBe(true);
        const f = useStore.getState().minhaFicha;
        expect(f.bio.composicaoRacial).toEqual([
            { racaId: 'saiyajin', percentual: 100, origem: 'nativa' },
            { racaId: 'humano', percentual: 10, origem: 'adquirida', fonte: 'Infinity de DNA' },
        ]);
        expect(f.bio.composicaoRacialHistorico[0]).toMatchObject({ racaId: 'humano', de: 0, para: 10, fonte: 'dna' });
        expect(sync.salvarFichaSilencioso).toHaveBeenCalled();
        expect(adicionarRacaAdquirida(eu, 'humano').ok).toBe(false);
        expect(adicionarRacaAdquirida(eu, 'inexistente').ok).toBe(false);
    });
    it('prática sobe com clamp 0-100 e histórico limitado a 50', () => {
        montar();
        adicionarRacaAdquirida(eu, 'humano');
        expect(concederPraticaRacial(eu, 'humano', 25, 'treino')).toMatchObject({ ok: true, de: 10, para: 35 });
        expect(concederPraticaRacial(eu, 'humano', 500).para).toBe(100);
        expect(concederPraticaRacial(eu, 'humano', 5).ok).toBe(false);
        expect(concederPraticaRacial(eu, 'humano', -1000).para).toBe(0);
        expect(concederPraticaRacial(eu, 'namek', 5).ok).toBe(false);
        expect(concederPraticaRacial(eu, 'humano', 0).ok).toBe(false);
        for (let i = 0; i < 60; i += 1) concederPraticaRacial(eu, 'humano', i % 2 ? -3 : 3);
        expect(useStore.getState().minhaFicha.bio.composicaoRacialHistorico.length).toBe(50);
    });
    it('remover raça e definir composição saneiam', () => {
        montar();
        definirComposicaoRacial(eu, [{ racaId: 'saiyajin', percentual: 70 }, { racaId: 'saiyajin', percentual: 1 }, { racaId: 'zzz', percentual: 5 }, { racaId: 'humano', percentual: 30 }]);
        expect(getComposicaoRacial(cenario, useStore.getState().minhaFicha).map(e => [e.racaId, e.percentual])).toEqual([['saiyajin', 70], ['humano', 30]]);
        expect(removerRacaDaComposicao(eu, 'humano').ok).toBe(true);
        expect(removerRacaDaComposicao(eu, 'humano').ok).toBe(false);
    });
    it('outro jogador: grava só caminhos pontuais pela ficha mais fresca', () => {
        montar({ outros: { Vegeta: fichaBase({ poderes: [{ id: 1, categoria: 'habilidade' }, hab({ id: 9 })] }) } });
        expect(concederPraticaRacial(outro, 'saiyajin', -20, 'perdeu').ok).toBe(true);
        const [nome, campos] = sync.salvarCamposPersonagem.mock.calls[0];
        expect(nome).toBe('Vegeta');
        expect(Object.keys(campos).sort()).toEqual(['bio/composicaoRacial', 'bio/composicaoRacialHistorico']);
        expect(campos['bio/composicaoRacial'][0].percentual).toBe(80);
        definirBloqueioDoPoder(outro, 9, { ativo: true, requisito: 'Treinar' });
        const c2 = sync.salvarCamposPersonagem.mock.calls[1][1];
        expect(c2['poderes/1/bloqueio']).toMatchObject({ ativo: true, requisito: 'Treinar' });
        expect(definirBloqueioDoPoder({ id: 'Fantasma' }, 9, { ativo: true }).ok).toBe(false);
    });
});

describe('pedidos de raça (DNA)', () => {
    it('sem poder de Manipulação de DNA é recusado', () => {
        montar({ isMestre: false });
        const r = pedirRacaAdquirida('humano', 'quero');
        expect(r.ok).toBe(false);
        expect(r.mensagem).toMatch(/Manipulação de DNA/);
    });
    it('com a marca, pede; duplicado e raça já tida são recusados; Mestre aprova com percentual editável', () => {
        montar({ minha: fichaBase({ poderes: [hab(), { id: 8, nome: 'Gene', categoria: 'infinity', manipulaDNA: true }] }) });
        const r = pedirRacaAdquirida('humano', 'sangue');
        expect(r.ok).toBe(true);
        expect(pedirRacaAdquirida('humano').ok).toBe(false);
        expect(pedirRacaAdquirida('saiyajin').ok).toBe(false);
        const id = useStore.getState().minhaFicha.bio.pedidosRaca[0].id;
        expect(aprovarPedidoRaca(eu, id, 25).ok).toBe(true);
        const f = useStore.getState().minhaFicha;
        expect(f.bio.pedidosRaca).toEqual([]);
        expect(f.bio.composicaoRacial.find(e => e.racaId === 'humano')).toMatchObject({ percentual: 25, origem: 'adquirida' });
        expect(aprovarPedidoRaca(eu, id).ok).toBe(false);
    });
    it('recusar descarta o pedido; jogador não aprova', () => {
        montar({ minha: fichaBase({ poderes: [{ id: 8, manipulaDNA: true }] }) });
        pedirRacaAdquirida('namek');
        const id = useStore.getState().minhaFicha.bio.pedidosRaca[0].id;
        useStore.setState({ isMestre: false });
        expect(aprovarPedidoRaca(eu, id).ok).toBe(false);
        expect(recusarPedidoRaca(eu, id).ok).toBe(false);
        useStore.setState({ isMestre: true });
        expect(recusarPedidoRaca(eu, id).ok).toBe(true);
        expect(useStore.getState().minhaFicha.bio.pedidosRaca).toEqual([]);
        expect(useStore.getState().minhaFicha.bio.composicaoRacial).toBeUndefined();
    });
});

describe('bloqueio, despertar, mínimo e DNA', () => {
    it('bloquear desliga, despertar desbloqueia; só Habilidades de Raça', () => {
        montar({ minha: fichaBase({ poderes: [hab({ ativa: true }), { id: 2, categoria: 'habilidade' }] }) });
        expect(definirBloqueioDoPoder(eu, 7, { ativo: true, requisito: 'Ver o céu vermelho', motivo: 'Não despertou' }).ok).toBe(true);
        let p = useStore.getState().minhaFicha.poderes[0];
        expect(p.ativa).toBe(false);
        expect(p.bloqueio).toMatchObject({ ativo: true, requisito: 'Ver o céu vermelho' });
        expect(definirBloqueioDoPoder(eu, 2, { ativo: true }).ok).toBe(false);
        expect(despertarHabilidade(eu, 7).ok).toBe(true);
        p = useStore.getState().minhaFicha.poderes[0];
        expect(p.bloqueio.ativo).toBe(false);
        expect(despertarHabilidade(eu, 7).ok).toBe(false);
        expect(sync.enviarParaFeed).toHaveBeenCalledWith(expect.objectContaining({ texto: expect.stringContaining('despertou') }));
    });
    it('despertar não resolve bloqueio por percentual', () => {
        montar({ minha: fichaBase({ bio: { raca: 'Saiyajin', racaId: 'saiyajin', composicaoRacial: [{ racaId: 'saiyajin', percentual: 20, origem: 'nativa' }] }, poderes: [hab({ percentualMinimo: 50 })] }) });
        const r = despertarHabilidade(eu, 7);
        expect(r.ok).toBe(false);
        expect(r.mensagem).toMatch(/Domínio/);
    });
    it('percentual mínimo e manipulaDNA', () => {
        montar();
        expect(definirPercentualMinimoDoPoder(eu, 7, 150)).toMatchObject({ ok: true, percentualMinimo: 100 });
        expect(useStore.getState().minhaFicha.poderes[0].percentualMinimo).toBe(100);
        definirPercentualMinimoDoPoder(eu, 7, 0);
        expect(useStore.getState().minhaFicha.poderes[0].percentualMinimo).toBeUndefined();
        expect(definirManipulaDNA(eu, 7, true).ok).toBe(true);
        expect(useStore.getState().minhaFicha.poderes[0].manipulaDNA).toBe(true);
        definirManipulaDNA(eu, 7, false);
        expect(useStore.getState().minhaFicha.poderes[0].manipulaDNA).toBeUndefined();
        expect(definirManipulaDNA(eu, 999, true).ok).toBe(false);
    });
});

describe('catálogo', () => {
    it('salvarRacasDaMesa aceita descendeDe e acessoTotalDescendentes', () => {
        montar();
        const lista = salvarRacasDaMesa([{ id: 'a', nome: 'A', acessoTotalDescendentes: true }, { id: 'b', nome: 'B', descendeDe: 'a' }, { id: 'c', nome: 'C', descendeDe: 'zzz' }]);
        expect(lista[0].acessoTotalDescendentes).toBe(true);
        expect(lista[1].descendeDe).toBe('a');
        expect(lista[2].descendeDe).toBe('');
    });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import useStore from '../stores/useStore';

vi.mock('./firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(), salvarCamposPersonagem: vi.fn(() => Promise.resolve(true)),
    enviarParaFeed: vi.fn(), salvarCenarioCompleto: vi.fn(),
}));
import * as sync from './firebase-sync';
import {
    definirComposicaoRacial, concederPraticaRacial, adicionarRacaAdquirida, removerRacaDaComposicao, pedirRacaAdquirida,
    aprovarPedidoRaca, recusarPedidoRaca, definirBloqueioDoPoder, despertarHabilidade, definirPercentualMinimoDoPoder, definirManipulaDNA,
} from './composicaoRacial';
import { salvarRacasDaMesa, definirRacaDoPersonagemDireto } from './racasMesa';
import { poderBloqueado, poderUsavel, getComposicaoRacial } from '../core/racas';

const cenario = { racas: [{ id: 'saiyajin', nome: 'Saiyajin' }, { id: 'humano', nome: 'Humano' }, { id: 'namek', nome: 'Namek' }] };
const hab = (extra = {}) => ({ id: 7, nome: 'Transformacao', categoria: 'habilidadeRaca', racasAcesso: ['humano'], percentualMinimo: 50, ...extra });
const eu = { id: 'Goku', nome: 'Goku' };
const outro = { id: 'Vegeta', nome: 'Vegeta' };
function montar({ isMestre = true, minha, outros = {} } = {}) {
    useStore.setState({ meuNome: 'Goku', isMestre, souMestreReal: isMestre, cenario, minhaFicha: minha, personagens: outros });
}
const base = (poderes, comp) => ({ bio: { raca: 'Saiyajin', racaId: 'saiyajin', ...(comp ? { composicaoRacial: comp } : {}) }, poderes });
const minha = () => useStore.getState().minhaFicha;

beforeEach(() => { vi.clearAllMocks(); });

describe('(d) adquirida 10% abaixo do minimo 50: pratica +40 libera, com historico', () => {
    it('fluxo completo', () => {
        montar({ minha: base([hab()]) });
        expect(adicionarRacaAdquirida(eu, 'humano', undefined, 'DNA do Krillin').ok).toBe(true);
        expect(poderBloqueado(cenario, minha(), minha().poderes[0])).toMatchObject({ bloqueado: true, origem: 'percentual', selo: '🔒 Domínio insuficiente (10% de 50%)' });
        expect(poderUsavel(minha(), cenario, minha().poderes[0])).toBe(false);
        const r = concederPraticaRacial(eu, 'humano', 40, 'Treino intenso');
        expect(r).toMatchObject({ ok: true, de: 10, para: 50 });
        expect(poderUsavel(minha(), cenario, minha().poderes[0])).toBe(true);
        const h = minha().bio.composicaoRacialHistorico;
        expect(h).toHaveLength(2);
        expect(h[1]).toMatchObject({ racaId: 'humano', de: 10, para: 50, delta: 40, motivo: 'Treino intenso', fonte: 'pratica' });
        expect(typeof h[1].ts).toBe('number');
    });
    it('+39 nao basta (49%)', () => {
        montar({ minha: base([hab()]) });
        adicionarRacaAdquirida(eu, 'humano');
        concederPraticaRacial(eu, 'humano', 39);
        expect(poderUsavel(minha(), cenario, minha().poderes[0])).toBe(false);
        expect(poderBloqueado(cenario, minha(), minha().poderes[0]).selo).toBe('🔒 Domínio insuficiente (49% de 50%)');
    });
    it('delta nao numerico/NaN/Infinity e rejeitado; decimal e arredondado em centesimos', () => {
        montar({ minha: base([hab()], [{ racaId: 'saiyajin', percentual: 100 }, { racaId: 'humano', percentual: 10, origem: 'adquirida' }]) });
        expect(concederPraticaRacial(eu, 'humano', NaN).ok).toBe(false);
        expect(concederPraticaRacial(eu, 'humano', 'abc').ok).toBe(false);
        expect(concederPraticaRacial(eu, 'humano', Infinity).ok).toBe(false);
        expect(concederPraticaRacial(eu, 'humano', '2.555').para).toBe(12.56);
        expect(concederPraticaRacial(eu, 'humano', null).ok).toBe(false);
    });
    it('prática em 100% ja no maximo nao muda', () => {
        montar({ minha: base([], [{ racaId: 'saiyajin', percentual: 100 }]) });
        expect(concederPraticaRacial(eu, 'saiyajin', 5).ok).toBe(false);
        expect(sync.salvarFichaSilencioso).not.toHaveBeenCalled();
    });
    it('a prática no Humano nao altera o percentual do Saiyajin', () => {
        montar({ minha: base([], [{ racaId: 'saiyajin', percentual: 70 }, { racaId: 'humano', percentual: 30, origem: 'adquirida' }]) });
        concederPraticaRacial(eu, 'humano', 25);
        expect(getComposicaoRacial(cenario, minha()).map(e => [e.racaId, e.percentual])).toEqual([['saiyajin', 70], ['humano', 55]]);
    });
});

describe('(f) pedidos de Raca', () => {
    it('sem poder DNA: recusado e nada gravado', () => {
        montar({ minha: base([hab()]) });
        const r = pedirRacaAdquirida('humano', 'quero');
        expect(r.ok).toBe(false);
        expect(minha().bio.pedidosRaca).toBeUndefined();
        expect(sync.salvarFichaSilencioso).not.toHaveBeenCalled();
    });
    it('poder com manipulaDNA=false ou string "true" nao conta', () => {
        montar({ minha: base([{ id: 1, manipulaDNA: false }, { id: 2, manipulaDNA: 'true' }]) });
        expect(pedirRacaAdquirida('humano').ok).toBe(false);
    });
    it('com poder: aprovado com 10% por padrao', () => {
        montar({ minha: base([{ id: 1, categoria: 'poder', manipulaDNA: true }]) });
        expect(pedirRacaAdquirida('humano', 'sangue').ok).toBe(true);
        const id = minha().bio.pedidosRaca[0].id;
        expect(aprovarPedidoRaca(eu, id)).toMatchObject({ ok: true, percentual: 10 });
        expect(minha().bio.composicaoRacial.find(e => e.racaId === 'humano')).toMatchObject({ percentual: 10, origem: 'adquirida', fonte: 'Pedido aprovado' });
        expect(minha().bio.composicaoRacialHistorico[0]).toMatchObject({ racaId: 'humano', de: 0, para: 10, motivo: 'sangue', fonte: 'dna' });
    });
    it('percentual custom, clamp e invalido cai em 10', () => {
        const casos = [[35, 35], [250, 100], [-5, 0], ['abc', 10], [NaN, 10]];
        casos.forEach(([entrada, esperado]) => {
            montar({ minha: base([{ id: 1, manipulaDNA: true }]) });
            pedirRacaAdquirida('namek');
            const id = minha().bio.pedidosRaca[0].id;
            expect(aprovarPedidoRaca(eu, id, entrada).percentual).toBe(esperado);
        });
    });
    it('raca duplicada (adicionada depois) e descartada; raca removida do catalogo e descartada', () => {
        montar({ minha: base([{ id: 1, manipulaDNA: true }]) });
        pedirRacaAdquirida('humano');
        const id = minha().bio.pedidosRaca[0].id;
        adicionarRacaAdquirida(eu, 'humano');
        const r = aprovarPedidoRaca(eu, id);
        expect(r.ok).toBe(false);
        expect(r.mensagem).toMatch(/já tem/);
        expect(minha().bio.pedidosRaca).toEqual([]);
        expect(minha().bio.composicaoRacial.filter(e => e.racaId === 'humano')).toHaveLength(1);

        montar({ minha: { ...base([{ id: 1, manipulaDNA: true }]), bio: { raca: 'Saiyajin', racaId: 'saiyajin', pedidosRaca: [{ id: 'p9', racaId: 'inexistente', motivo: '', ts: 1 }] } } });
        const r2 = aprovarPedidoRaca(eu, 'p9');
        expect(r2.ok).toBe(false);
        expect(r2.mensagem).toMatch(/não existe mais/);
        expect(minha().bio.pedidosRaca).toEqual([]);
        expect(minha().bio.composicaoRacial).toBeUndefined();
    });
    it('pedir raca inexistente / ja tida / sem personagem', () => {
        montar({ minha: base([{ id: 1, manipulaDNA: true }]) });
        expect(pedirRacaAdquirida('inexistente').ok).toBe(false);
        expect(pedirRacaAdquirida('saiyajin').ok).toBe(false); // principal derivada
        expect(pedirRacaAdquirida(undefined).ok).toBe(false);
        useStore.setState({ minhaFicha: null });
        expect(pedirRacaAdquirida('humano').ok).toBe(false);
    });
    it('limite de pedidos pendentes (20)', () => {
        const pedidos = Array.from({ length: 20 }, (_, i) => ({ id: `p${i}`, racaId: `r${i}`, motivo: '', ts: i }));
        montar({ minha: { bio: { raca: 'Saiyajin', racaId: 'saiyajin', pedidosRaca: pedidos }, poderes: [{ id: 1, manipulaDNA: true }] } });
        const r = pedirRacaAdquirida('humano');
        expect(r.ok).toBe(false);
        expect(r.mensagem).toMatch(/Muitos pedidos/);
    });
    it('pedido de outro jogador: aprovar grava so caminhos pontuais; motivo longo e truncado em 300', () => {
        montar({ minha: base([]), outros: { Vegeta: { bio: { raca: 'Saiyajin', racaId: 'saiyajin', pedidosRaca: [{ id: 'pp', racaId: 'namek', motivo: 'm', ts: 1 }] }, poderes: [{ id: 3, manipulaDNA: true }] } } });
        expect(aprovarPedidoRaca(outro, 'pp', 15).ok).toBe(true);
        const [nome, campos] = sync.salvarCamposPersonagem.mock.calls[0];
        expect(nome).toBe('Vegeta');
        expect(Object.keys(campos).sort()).toEqual(['bio/composicaoRacial', 'bio/composicaoRacialHistorico', 'bio/pedidosRaca']);
        montar({ minha: base([{ id: 1, manipulaDNA: true }]) });
        pedirRacaAdquirida('humano', 'x'.repeat(1000));
        expect(minha().bio.pedidosRaca[0].motivo).toHaveLength(300);
    });
});

describe('(g) seguranca: jogador / Modo Jogador nao executa acoes do Mestre', () => {
    it('todas as acoes falham e nada e gravado (inclusive aprovar/recusar e em outros personagens)', () => {
        const ped = { id: 'pp', racaId: 'namek', motivo: '', ts: 1 };
        const fichaV = { bio: { raca: 'Saiyajin', racaId: 'saiyajin', pedidosRaca: [ped] }, poderes: [hab({ id: 9 }), { id: 3, manipulaDNA: true }] };
        const antes = JSON.stringify(fichaV);
        // Mestre real em Modo Jogador: isMestre=false com souMestreReal=true
        montar({ isMestre: false, minha: base([hab({ ativa: true })]), outros: { Vegeta: fichaV } });
        useStore.setState({ souMestreReal: true });
        const acoes = [
            () => definirComposicaoRacial(outro, [{ racaId: 'namek', percentual: 100 }]),
            () => concederPraticaRacial(outro, 'saiyajin', 5),
            () => adicionarRacaAdquirida(outro, 'namek'),
            () => removerRacaDaComposicao(outro, 'saiyajin'),
            () => definirBloqueioDoPoder(outro, 9, { ativo: true }),
            () => despertarHabilidade(outro, 9),
            () => definirPercentualMinimoDoPoder(outro, 9, 80),
            () => definirManipulaDNA(outro, 9, true),
            () => aprovarPedidoRaca(outro, 'pp', 90),
            () => recusarPedidoRaca(outro, 'pp'),
            () => definirComposicaoRacial(eu, [{ racaId: 'humano', percentual: 100 }]),
            () => concederPraticaRacial(eu, 'saiyajin', -5),
            () => definirBloqueioDoPoder(eu, 7, { ativo: false }),
            () => definirManipulaDNA(eu, 7, true),
        ];
        acoes.forEach((a, i) => { const r = a(); expect([i, r.ok]).toEqual([i, false]); expect(r.mensagem).toMatch(/Mestre/); });
        expect(sync.salvarCamposPersonagem).not.toHaveBeenCalled();
        expect(sync.salvarFichaSilencioso).not.toHaveBeenCalled();
        expect(JSON.stringify(useStore.getState().personagens.Vegeta)).toBe(antes);
        expect(minha().bio.composicaoRacial).toBeUndefined();
        expect(minha().poderes[0].ativa).toBe(true);
    });
    it('jogador troca a raca de OUTRO personagem: recusado; marca manipulaDNA nao e auto-concedida', () => {
        montar({ isMestre: false, minha: base([{ id: 1, nome: 'Gene' }]), outros: { Vegeta: base([]) } });
        expect(definirRacaDoPersonagemDireto(outro, 'humano')).toBe(false);
        expect(definirManipulaDNA(eu, 1, true).ok).toBe(false);
        expect(pedirRacaAdquirida('humano').ok).toBe(false);
    });
    it('pedirRacaAdquirida so age na propria ficha (nao aceita alvo)', () => {
        montar({ minha: base([]), outros: { Vegeta: base([{ id: 3, manipulaDNA: true }]) } });
        // Vegeta tem DNA, Goku nao: Goku nao pode pedir
        expect(pedirRacaAdquirida('humano').ok).toBe(false);
        expect(sync.salvarCamposPersonagem).not.toHaveBeenCalled();
    });
});

describe('Mestre: bloqueio/despertar/minimo/DNA em cenarios numericos', () => {
    it('minimo 0 remove o campo e libera; minimo alto bloqueia e desliga', () => {
        montar({ minha: base([hab({ racasAcesso: ['saiyajin'], ativa: true })], [{ racaId: 'saiyajin', percentual: 60 }]) });
        definirPercentualMinimoDoPoder(eu, 7, 61);
        expect(minha().poderes[0].ativa).toBe(false);
        expect(poderUsavel(minha(), cenario, minha().poderes[0])).toBe(false);
        definirPercentualMinimoDoPoder(eu, 7, 0);
        expect('percentualMinimo' in minha().poderes[0]).toBe(false);
        expect(poderUsavel(minha(), cenario, minha().poderes[0])).toBe(true);
        definirPercentualMinimoDoPoder(eu, 7, 'lixo');
        expect('percentualMinimo' in minha().poderes[0]).toBe(false);
        definirPercentualMinimoDoPoder(eu, 7, -10);
        expect('percentualMinimo' in minha().poderes[0]).toBe(false);
    });
    it('bloqueio vazio apaga o campo; textos longos truncam em 300; poder inexistente falha', () => {
        montar({ minha: base([hab()]) });
        definirBloqueioDoPoder(eu, 7, { ativo: true, requisito: 'r'.repeat(500), motivo: '  m   m ' });
        expect(minha().poderes[0].bloqueio.requisito).toHaveLength(300);
        expect(minha().poderes[0].bloqueio.motivo).toBe('m m');
        definirBloqueioDoPoder(eu, 7, { ativo: false });
        expect(minha().poderes[0].bloqueio).toBeUndefined();
        expect(definirBloqueioDoPoder(eu, 999, { ativo: true }).ok).toBe(false);
        expect(definirBloqueioDoPoder(eu, 7, null).ok).toBe(true);
    });
    it('despertar grava despertouEm e libera; exceção + manual segue bloqueada ate despertar', () => {
        montar({ minha: base([hab({ racaExcecao: true, bloqueio: { ativo: true, requisito: 'Ver' } })], [{ racaId: 'saiyajin', percentual: 1 }]) });
        expect(poderUsavel(minha(), cenario, minha().poderes[0])).toBe(false);
        expect(despertarHabilidade(eu, 7).ok).toBe(true);
        expect(typeof minha().poderes[0].bloqueio.despertouEm).toBe('number');
        expect(minha().poderes[0].bloqueio.requisito).toBe('Ver');
        expect(poderUsavel(minha(), cenario, minha().poderes[0])).toBe(true);
    });
    it('definirComposicaoRacial: limite 20, clamp, default adquirida 10, [] volta a derivada', () => {
        montar({ minha: base([]) });
        const lista = [{ racaId: 'saiyajin', percentual: 'abc' }, { racaId: 'humano', percentual: 'abc', origem: 'adquirida' }, { racaId: 'namek', percentual: 999 }];
        definirComposicaoRacial(eu, lista);
        expect(minha().bio.composicaoRacial.map(e => e.percentual)).toEqual([100, 10, 100]);
        definirComposicaoRacial(eu, []);
        expect(getComposicaoRacial(cenario, minha()).map(e => [e.racaId, e.percentual])).toEqual([['saiyajin', 100]]);
        definirComposicaoRacial(eu, { 0: { racaId: 'humano', percentual: 40 } }); // objeto estilo Firebase
        expect(minha().bio.composicaoRacial[0]).toMatchObject({ racaId: 'humano', percentual: 40 });
        expect(definirComposicaoRacial(null, []).ok).toBe(false);
        expect(definirComposicaoRacial({ id: 'Fantasma' }, []).ok).toBe(false);
    });
    it('remover a raca principal da composicao desliga habilidades da raca; so a derivada volta se esvaziar', () => {
        montar({ minha: base([hab({ racasAcesso: ['saiyajin'], ativa: true })], [{ racaId: 'saiyajin', percentual: 60 }, { racaId: 'humano', percentual: 40 }]) });
        expect(removerRacaDaComposicao(eu, 'saiyajin').ok).toBe(true);
        // sem acesso por raca => incompativel, nao "bloqueada": segue ligada (limitacao documentada)
        expect(minha().poderes[0].ativa).toBe(true);
        removerRacaDaComposicao(eu, 'humano');
        expect(getComposicaoRacial(cenario, minha()).map(e => e.racaId)).toEqual(['saiyajin']);
    });
    it('manipulaDNA vale para qualquer categoria e libera o pedido', () => {
        montar({ minha: base([{ id: 20, nome: 'Sing', categoria: 'singularidade' }]) });
        expect(pedirRacaAdquirida('humano').ok).toBe(false);
        expect(definirManipulaDNA(eu, 20, true).ok).toBe(true);
        expect(pedirRacaAdquirida('humano').ok).toBe(true);
        definirManipulaDNA(eu, 20, false);
        expect(pedirRacaAdquirida('namek').ok).toBe(false);
    });
});

describe('alinhamento pela troca de Raca principal e catalogo', () => {
    it('Mestre trocando raca de outro jogador alinha a composicao explicita (campo pontual); sem explicita nao grava composicao', () => {
        montar({ minha: base([]), outros: { Vegeta: base([], [{ racaId: 'saiyajin', percentual: 40, origem: 'nativa' }]) } });
        expect(definirRacaDoPersonagemDireto(outro, 'namek')).toBe(true);
        const campos = sync.salvarCamposPersonagem.mock.calls[0][1];
        expect(campos['bio/racaId']).toBe('namek');
        expect(campos['bio/composicaoRacial']).toEqual([{ racaId: 'saiyajin', percentual: 40, origem: 'nativa' }, { racaId: 'namek', percentual: 100, origem: 'nativa' }]);
        vi.clearAllMocks();
        montar({ minha: base([]), outros: { Vegeta: base([]) } });
        definirRacaDoPersonagemDireto(outro, 'namek');
        expect(Object.keys(sync.salvarCamposPersonagem.mock.calls[0][1])).not.toContain('bio/composicaoRacial');
    });
    it('salvarRacasDaMesa: jogador nao salva; ciclo de descendeDe e cortado; acessoTotal nao booleano vira false', () => {
        montar({ isMestre: false, minha: base([]) });
        expect(salvarRacasDaMesa([{ id: 'a', nome: 'A' }])).toBeNull();
        expect(sync.salvarCenarioCompleto).not.toHaveBeenCalled();
        montar({ minha: base([]) });
        const l = salvarRacasDaMesa([{ id: 'a', nome: 'A', descendeDe: 'b', acessoTotalDescendentes: 1 }, { id: 'b', nome: 'B', descendeDe: 'a' }]);
        expect(l.every(r => r.acessoTotalDescendentes === false || r.acessoTotalDescendentes === true)).toBe(true);
        expect(l[0].descendeDe === '' || l[1].descendeDe === '').toBe(true);
        expect(sync.salvarCenarioCompleto).toHaveBeenCalled();
    });
});

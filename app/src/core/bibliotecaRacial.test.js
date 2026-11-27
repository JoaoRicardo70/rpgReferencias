import { describe, it, expect } from 'vitest';
import {
    sanitizarBiblioteca, getBiblioteca, gerarIdBiblioteca, criarEntradaDePoder, disponivelParaFicha, jaPossuiHabilidade, montarPoderConcedido,
    personagensCompativeis, entidadesDaMesa, textoDominio, disponiveisParaJogador, limparRacaDaBiblioteca, sanitizarModelo,
    LIMITE_BIBLIOTECA, LIMITE_NOME_BIBLIOTECA, LIMITE_RESUMO_BIBLIOTECA, LIMITE_BYTES_MODELO,
} from './bibliotecaRacial';
import { limparReferenciasDeRaca, poderBloqueado } from './racas';

const cenario = {
    racas: [
        { id: 'saiyajin', nome: 'Saiyajin', icone: '🐒' },
        { id: 'humano', nome: 'Humano', icone: '🧍' },
        { id: 'primordial', nome: 'Primordial', icone: '🌟', acessoTotalDescendentes: true },
        { id: 'filho', nome: 'Filho', icone: '👶', descendeDe: 'primordial' },
    ],
};
const habilidade = (extra = {}) => ({
    id: 77, nome: 'Zenkai', categoria: 'habilidadeRaca', descricao: 'Fica mais forte ao se recuperar.', ativa: true, equipado: true,
    racasAcesso: ['saiyajin'], percentualMinimo: 50, racaExcecao: true, bloqueio: { ativo: true, requisito: 'x' }, manipulaDNA: true,
    origemBiblioteca: 'bib_antigo', ensinadoPor: 'Fulano', recargaRestante: 2, estagioAtual: 3,
    efeitos: [{ nome: 'Força', atributo: 'forca', propriedade: 'bonus', valor: 5 }],
    gatilhos: [{ id: 'g1', armado: true, mestreDesligou: true, evento: 'x' }], ...extra,
});
const entradaDe = (extra = {}) => criarEntradaDePoder(habilidade(extra.poder), { criadoPor: 'Mestre', ...extra.meta }).entrada;
const fichaDe = (comp, extra = {}) => ({ bio: { composicaoRacial: comp }, poderes: [], ...extra });

describe('sanitizarModelo / criarEntradaDePoder', () => {
    it('o modelo não leva campos de instância, estado, bloqueio, exceção nem origem', () => {
        const m = sanitizarModelo(habilidade());
        ['id', 'ativa', 'equipado', 'racaExcecao', 'bloqueio', 'manipulaDNA', 'origemBiblioteca', 'ensinadoPor', 'recargaRestante', 'estagioAtual', 'racasAcesso', 'percentualMinimo'].forEach(k => expect(m[k]).toBeUndefined());
        expect(m.efeitos).toHaveLength(1);
        expect(m.descricao).toContain('recupera');
        expect(m.categoria).toBe('habilidadeRaca');
        expect(m.gatilhos[0]).toEqual({ id: 'g1', evento: 'x' });
    });
    it('criarEntradaDePoder copia acesso/mínimo do poder, não muta o original e marca manipulaDNA na entrada', () => {
        const original = habilidade();
        const r = criarEntradaDePoder(original, { nome: '  Zenkai  Saiyajin ', resumo: 'r', icone: '⚡', criadoPor: 'Mestre', existentes: ['bib_zenkai-saiyajin'], agora: 5 });
        expect(r.ok).toBe(true);
        expect(r.entrada).toMatchObject({ nome: 'Zenkai Saiyajin', icone: '⚡', resumo: 'r', racasAcesso: ['saiyajin'], percentualMinimo: 50, manipulaDNA: true, criadoEm: 5, criadoPor: 'Mestre', id: 'bib_zenkai-saiyajin-2' });
        expect(original.ativa).toBe(true);
        expect(original.bloqueio).toBeTruthy();
    });
    it('recusa o que não é Habilidade de Raça, nome vazio, chave inválida e modelo gigante', () => {
        expect(criarEntradaDePoder({ nome: 'X', categoria: 'poder' }).ok).toBe(false);
        expect(criarEntradaDePoder(null).ok).toBe(false);
        expect(criarEntradaDePoder(habilidade({ nome: '' }), { nome: '' }).ok).toBe(false);
        expect(criarEntradaDePoder(habilidade({ efeitos: [{ 'a.b': 1 }] })).ok).toBe(false);
        expect(criarEntradaDePoder(habilidade({ descricao: 'x'.repeat(LIMITE_BYTES_MODELO + 10) })).ok).toBe(false);
    });
    it('limita nome e resumo', () => {
        const e = criarEntradaDePoder(habilidade(), { nome: 'n'.repeat(200), resumo: 'r'.repeat(500) }).entrada;
        expect(e.nome).toHaveLength(LIMITE_NOME_BIBLIOTECA);
        expect(e.resumo).toHaveLength(LIMITE_RESUMO_BIBLIOTECA);
    });
});

describe('sanitizarBiblioteca / getBiblioteca', () => {
    it('descarta sem nome/modelo, deduplica ids, limita a 60 e aceita mapa', () => {
        const a = entradaDe();
        const lista = sanitizarBiblioteca([a, { ...a }, { nome: '', modelo: {} }, { nome: 'Sem modelo' }, null, { nome: 'Chave ruim', modelo: { 'a.b': 1 } }]);
        expect(lista).toHaveLength(2);
        expect(new Set(lista.map(e => e.id)).size).toBe(2);
        expect(sanitizarBiblioteca({ x: a })).toHaveLength(1);
        const muitas = Array.from({ length: 80 }, (_, i) => ({ ...a, id: `b${i}`, nome: `N${i}` }));
        expect(sanitizarBiblioteca(muitas)).toHaveLength(LIMITE_BIBLIOTECA);
    });
    it('reaplica o saneamento ao modelo (campos de estado vindos de fora saem) e normaliza percentual', () => {
        const [e] = sanitizarBiblioteca([{ ...entradaDe(), percentualMinimo: 250, modelo: habilidade() }]);
        expect(e.percentualMinimo).toBe(100);
        expect(e.modelo.bloqueio).toBeUndefined();
        expect(e.modelo.id).toBeUndefined();
    });
    it('getBiblioteca: ausente = [] e usa cache por referência', () => {
        expect(getBiblioteca({})).toEqual([]);
        expect(getBiblioteca(null)).toEqual([]);
        const cen = { bibliotecaRacial: [entradaDe()] };
        expect(getBiblioteca(cen)).toBe(getBiblioteca(cen));
    });
    it('gerarIdBiblioteca é único', () => {
        expect(gerarIdBiblioteca('Zenkai', [])).toBe('bib_zenkai');
        expect(gerarIdBiblioteca('Zenkai', ['bib_zenkai'])).toBe('bib_zenkai-2');
    });
});

describe('disponivelParaFicha', () => {
    const e = () => entradaDe();
    it('composição 70/30: Saiyajin 70% atinge o mínimo 50; 30% não atinge mas está disponível', () => {
        const alto = disponivelParaFicha(cenario, fichaDe([{ racaId: 'saiyajin', percentual: 70 }, { racaId: 'humano', percentual: 30 }]), e());
        expect(alto).toMatchObject({ disponivel: true, percentual: 70, minimo: 50, atingeMinimo: true, jaPossui: false, motivo: '' });
        const baixo = disponivelParaFicha(cenario, fichaDe([{ racaId: 'saiyajin', percentual: 30 }, { racaId: 'humano', percentual: 70 }]), e());
        expect(baixo).toMatchObject({ disponivel: true, percentual: 30, atingeMinimo: false });
        expect(baixo.motivo).toMatch(/Domínio insuficiente: 30% de 50%/);
    });
    it('Raça sem acesso: indisponível', () => {
        const s = disponivelParaFicha(cenario, fichaDe([{ racaId: 'humano', percentual: 100 }]), e());
        expect(s.disponivel).toBe(false);
        expect(s.percentual).toBe(0);
        expect(s.motivo).toMatch(/não tem acesso/);
    });
    it('sem racasAcesso ninguém tem acesso', () => {
        expect(disponivelParaFicha(cenario, fichaDe([{ racaId: 'saiyajin', percentual: 100 }]), { ...e(), racasAcesso: [] }).disponivel).toBe(false);
        expect(disponivelParaFicha(cenario, {}, null).disponivel).toBe(false);
    });
    it('Primordial acessa as habilidades das descendentes', () => {
        const entrada = { ...e(), racasAcesso: ['filho'], percentualMinimo: 0 };
        expect(disponivelParaFicha(cenario, fichaDe([{ racaId: 'primordial', percentual: 100 }]), entrada).disponivel).toBe(true);
        expect(disponivelParaFicha(cenario, fichaDe([{ racaId: 'filho', percentual: 100 }]), entrada).disponivel).toBe(true);
        expect(disponivelParaFicha(cenario, fichaDe([{ racaId: 'saiyajin', percentual: 100 }]), entrada).disponivel).toBe(false);
    });
    it('Raça principal derivada (sem composição explícita) vale a 100%', () => {
        const s = disponivelParaFicha(cenario, { bio: { raca: 'Saiyajin', racaId: 'saiyajin' } }, e());
        expect(s).toMatchObject({ disponivel: true, percentual: 100, atingeMinimo: true });
    });
    it('jaPossui por origemBiblioteca ou por nome (sem acento/caixa)', () => {
        const en = e();
        expect(jaPossuiHabilidade({ poderes: [{ id: 1, nome: 'Outra', origemBiblioteca: en.id }] }, en)).toBe(true);
        expect(jaPossuiHabilidade({ poderes: [{ id: 1, nome: 'ZENKAI' }] }, en)).toBe(true);
        expect(jaPossuiHabilidade({ poderes: [{ id: 1, nome: 'Kaioken' }] }, en)).toBe(false);
        expect(jaPossuiHabilidade({}, en)).toBe(false);
        const s = disponivelParaFicha(cenario, { bio: { racaId: 'saiyajin' }, poderes: [{ nome: 'Zenkai' }] }, en);
        expect(s.jaPossui).toBe(true);
        expect(s.motivo).toMatch(/Já possui/);
    });
});

describe('montarPoderConcedido', () => {
    it('poder novo: categoria, acesso/mínimo da entrada, origem, id, desligado, sem bloqueio', () => {
        const en = entradaDe();
        const p = montarPoderConcedido(en, { id: 1234 });
        expect(p).toMatchObject({ id: 1234, categoria: 'habilidadeRaca', racasAcesso: ['saiyajin'], percentualMinimo: 50, origemBiblioteca: en.id, ativa: false, manipulaDNA: true });
        expect(p.bloqueio).toBeUndefined();
        expect(p.racaExcecao).toBeUndefined();
        expect(p.efeitos).toEqual(en.modelo.efeitos);
        p.efeitos.push({});
        expect(en.modelo.efeitos).toHaveLength(1); // cópia profunda
    });
    it('bloqueada: bloqueio ativo com o requisito pedido (ou o da entrada); exceção marca racaExcecao', () => {
        const en = { ...entradaDe(), requisito: 'Despertar' };
        expect(montarPoderConcedido(en, { id: 1, bloqueada: true }).bloqueio).toEqual({ ativo: true, requisito: 'Despertar', motivo: '' });
        expect(montarPoderConcedido(en, { id: 1, bloqueada: true, requisito: 'Outro' }).bloqueio.requisito).toBe('Outro');
        expect(montarPoderConcedido(en, { id: 1, racaExcecao: true }).racaExcecao).toBe(true);
    });
    it('abaixo do mínimo: poderBloqueado deriva "Domínio insuficiente"', () => {
        const ficha = fichaDe([{ racaId: 'saiyajin', percentual: 20 }]);
        const p = montarPoderConcedido(entradaDe(), { id: 1 });
        const b = poderBloqueado(cenario, ficha, p);
        expect(b).toMatchObject({ bloqueado: true, origem: 'percentual' });
    });
    it('sem mínimo, não grava percentualMinimo; sem manipulaDNA na entrada, não marca', () => {
        const en = { ...entradaDe({ poder: { percentualMinimo: 0, manipulaDNA: false } }) };
        const p = montarPoderConcedido(en, { id: 1 });
        expect(p.percentualMinimo).toBeUndefined();
        expect(p.manipulaDNA).toBeUndefined();
    });
});

describe('personagensCompativeis / entidadesDaMesa / jogador', () => {
    const personagens = {
        Kai: { bio: { racaId: 'saiyajin', raca: 'Saiyajin' }, poderes: [] },
        Lia: { bio: { racaId: 'humano', raca: 'Humano' }, poderes: [] },
        Gok: { bio: { composicaoRacial: [{ racaId: 'saiyajin', percentual: 30 }, { racaId: 'humano', percentual: 70 }] }, poderes: [{ nome: 'Zenkai' }] },
    };
    const entidades = entidadesDaMesa({ personagens, meuNome: 'Mestre', minhaFicha: { bio: {} } });
    it('lista jogadores e eu', () => {
        expect(entidades.map(x => x.nome).sort()).toEqual(['Gok', 'Kai', 'Lia', 'Mestre']);
    });
    it('só quem tem Raça com acesso; mostra Raça, Domínio e jaPossui', () => {
        const lista = personagensCompativeis(cenario, entidades, entradaDe());
        expect(lista.map(x => x.nome).sort()).toEqual(['Gok', 'Kai']);
        const gok = lista.find(x => x.nome === 'Gok');
        expect(gok.situacao.jaPossui).toBe(true);
        expect(gok.racaNome).toBe('Saiyajin');
        expect(textoDominio(gok.situacao)).toBe('Domínio 30% de 50%');
        expect(textoDominio(lista.find(x => x.nome === 'Kai').situacao)).toBe('Domínio suficiente');
        expect(textoDominio({ disponivel: false })).toBe('');
    });
    it('visão do jogador: só entradas da Raça dele, sem possuídas e SEM o modelo', () => {
        const cen = { ...cenario, bibliotecaRacial: [entradaDe(), entradaDe({ poder: { nome: 'Namekuseijin', racasAcesso: ['humano'] } })] };
        const kai = disponiveisParaJogador(cen, personagens.Kai);
        expect(kai.map(x => x.nome)).toEqual(['Zenkai']);
        expect(kai[0].modelo).toBeUndefined();
        expect(JSON.stringify(kai)).not.toContain('efeitos');
        expect(disponiveisParaJogador(cen, personagens.Gok).map(x => x.nome)).toEqual(['Namekuseijin']);
    });
});

describe('limpar Raça deletada', () => {
    it('limparRacaDaBiblioteca e limparReferenciasDeRaca tiram a Raça dos racasAcesso das entradas sem mutar', () => {
        const lista = [{ ...entradaDe(), racasAcesso: ['saiyajin', 'humano'] }];
        const r = limparRacaDaBiblioteca('saiyajin', lista);
        expect(r.biblioteca[0].racasAcesso).toEqual(['humano']);
        expect(lista[0].racasAcesso).toEqual(['saiyajin', 'humano']);
        expect(r.alterados).toBe(1);
        const g = limparReferenciasDeRaca('saiyajin', { racas: cenario.racas, biblioteca: lista });
        expect(g.biblioteca[0].racasAcesso).toEqual(['humano']);
        expect(g.alterados).toBe(1);
    });
    it('id órfão na entrada é inofensivo para a disponibilidade', () => {
        const en = { ...entradaDe(), racasAcesso: ['sumiu', 'saiyajin'] };
        expect(disponivelParaFicha(cenario, { bio: { racaId: 'saiyajin' } }, en).disponivel).toBe(true);
        expect(disponivelParaFicha(cenario, { bio: { racaId: 'humano' } }, { ...en, racasAcesso: ['sumiu'] }).disponivel).toBe(false);
    });
});

describe('aba Habilidades de Raça com a biblioteca', () => {
    it('jogador sem poderes de Raça só vê a aba quando há disponíveis (opcao comDisponiveis)', async () => {
        const { categoriasVisiveisNaFicha } = await import('./categoriasPoder');
        expect(categoriasVisiveisNaFicha({ poderes: [] }, { isMestre: false }).some(c => c.id === 'habilidadeRaca')).toBe(false);
        expect(categoriasVisiveisNaFicha({ poderes: [] }, { isMestre: false, comDisponiveis: true }).some(c => c.id === 'habilidadeRaca')).toBe(true);
    });
});

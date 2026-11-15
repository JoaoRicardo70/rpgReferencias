import { describe, it, expect } from 'vitest';
import {
    normalizarNomeRaca, getRacas, sanitizarRacas, gerarIdRaca, resolverRaca, ancestraisDaRaca, racaTemAcesso, racasComAcessoTexto,
    motivoSemAcesso, poderRacaIncompativel, ehHabilidadeDeRaca, verificarAcessoHabilidadeRaca, limparReferenciasDeRaca, migrarHabilidadesDeRaca,
    camposDaRacaNaFicha, racaIdAposEdicaoDeTexto, contarRacasComAcesso, racasAcessoPadraoParaFicha, aplicarExcecaoRaca, normalizarRacasAcesso,
    LIMITE_RACAS, LIMITE_NOME_RACA, LIMITE_APELIDOS_RACA,
} from './racas';
import { idCategoriaPoder, categoriasVisiveisNaFicha, poderEhCopiavel, usaMaestriaRequerida, CATEGORIAS_PODER, IDS_CATEGORIA_PODER } from './categoriasPoder';
import { verificarAcessoOferta, aceitarOferta, prepararItemEnsinado } from './ensinar';
import { planejarModelo, aplicarModeloNaFicha, obterModelo } from './modelosPoder';
import { separarItensPorAcessoRaca, montarPoderFinal, mudarCategoriaImportada } from './importadorIA';

const cenario = {
    racas: [
        { id: 'saiyajin', nome: 'Saiyajin', icone: '🐒', apelidos: ['Saiyan', 'Sayajin'], herdaDe: '' },
        { id: 'meio-saiyajin', nome: 'Meio-Saiyajin', apelidos: [], herdaDe: 'saiyajin' },
        { id: 'quarto', nome: 'Quarto-Saiyajin', herdaDe: 'meio-saiyajin' },
        { id: 'namekuseijin', nome: 'Namekuseijin', herdaDe: '' },
    ],
};
const fichaDe = (raca, racaId) => ({ bio: { raca, ...(racaId !== undefined ? { racaId } : {}) } });
const habRaca = (extra = {}) => ({ id: 1, nome: 'Zenkai', categoria: 'habilidadeRaca', racasAcesso: ['saiyajin'], ...extra });

describe('normalizarNomeRaca', () => {
    it('tira acento, caixa e espaços extras', () => {
        expect(normalizarNomeRaca('  SAIYAJÍN   Puro ')).toBe('saiyajin puro');
        expect(normalizarNomeRaca(null)).toBe('');
        expect(normalizarNomeRaca(undefined)).toBe('');
    });
});

describe('sanitizarRacas', () => {
    it('lista vazia ou inválida vira []', () => {
        expect(sanitizarRacas(undefined)).toEqual([]);
        expect(sanitizarRacas(null)).toEqual([]);
        expect(sanitizarRacas('x')).toEqual([]);
        expect(getRacas({})).toEqual([]);
        expect(getRacas(undefined)).toEqual([]);
    });
    it('descarta sem nome, aceita objeto no lugar de array e gera id por slug', () => {
        const r = sanitizarRacas({ 0: { nome: 'Elfo da Lua' }, 1: { nome: '   ' }, 2: null });
        expect(r).toHaveLength(1);
        expect(r[0]).toMatchObject({ id: 'elfo-da-lua', nome: 'Elfo da Lua', apelidos: [], herdaDe: '' });
        expect(r[0].icone).toBeTruthy();
    });
    it('mantém id válido e resolve ids repetidos', () => {
        const r = sanitizarRacas([{ id: 'a', nome: 'A' }, { id: 'a', nome: 'B' }, { nome: 'A' }]);
        expect(new Set(r.map(x => x.id)).size).toBe(3);
        expect(r[0].id).toBe('a');
    });
    it('respeita os limites de quantidade, nome e apelidos', () => {
        const muitas = Array.from({ length: LIMITE_RACAS + 10 }, (_, i) => ({ nome: `Raca ${i}` }));
        expect(sanitizarRacas(muitas)).toHaveLength(LIMITE_RACAS);
        expect(sanitizarRacas([{ nome: 'x'.repeat(100) }])[0].nome).toHaveLength(LIMITE_NOME_RACA);
        const ap = sanitizarRacas([{ nome: 'R', apelidos: Array.from({ length: 20 }, (_, i) => `ap${i}`) }])[0].apelidos;
        expect(ap).toHaveLength(LIMITE_APELIDOS_RACA);
        expect(sanitizarRacas([{ nome: 'R', apelidos: ['y'.repeat(90)] }])[0].apelidos[0]).toHaveLength(40);
    });
    it('apelidos: sem repetição, sem o próprio nome, sem vazios', () => {
        const r = sanitizarRacas([{ nome: 'Saiyajin', apelidos: ['saiyajin', 'Saiyan', 'SAIYAN', '', '  ', 'Sayajin'] }]);
        expect(r[0].apelidos).toEqual(['Saiyan', 'Sayajin']);
    });
    it('herdaDe inexistente e auto-herança são limpos', () => {
        const r = sanitizarRacas([{ id: 'a', nome: 'A', herdaDe: 'nao-existe' }, { id: 'b', nome: 'B', herdaDe: 'b' }]);
        expect(r.map(x => x.herdaDe)).toEqual(['', '']);
    });
    it('quebra ciclos de herança (A->B->A e A->B->C->A)', () => {
        const dois = sanitizarRacas([{ id: 'a', nome: 'A', herdaDe: 'b' }, { id: 'b', nome: 'B', herdaDe: 'a' }]);
        expect(dois.filter(x => x.herdaDe).length).toBe(1);
        const tres = sanitizarRacas([{ id: 'a', nome: 'A', herdaDe: 'b' }, { id: 'b', nome: 'B', herdaDe: 'c' }, { id: 'c', nome: 'C', herdaDe: 'a' }]);
        expect(tres.filter(x => x.herdaDe).length).toBe(2);
        // percorrer a cadeia termina
        expect(ancestraisDaRaca({ racas: tres }, 'a').length).toBeLessThanOrEqual(2);
    });
    it('é idempotente', () => {
        const uma = sanitizarRacas(cenario.racas);
        expect(sanitizarRacas(uma)).toEqual(uma);
    });
});

describe('gerarIdRaca', () => {
    it('slug do nome, único e com fallback', () => {
        expect(gerarIdRaca('Híbrido Élfico', [])).toBe('hibrido-elfico');
        expect(gerarIdRaca('Elfo', [{ id: 'elfo' }, 'elfo-2'])).toBe('elfo-3');
        expect(gerarIdRaca('!!!', [])).toBe('raca');
    });
});

describe('resolverRaca', () => {
    it('por racaId, ignorando o texto (renomear a raça não quebra a ficha)', () => {
        expect(resolverRaca(cenario, fichaDe('Nome Antigo', 'saiyajin'))).toEqual({ id: 'saiyajin', nome: 'Saiyajin', cadastrada: true });
    });
    it('por nome ou apelido, sem acento/caixa', () => {
        expect(resolverRaca(cenario, fichaDe('SAIYAJIN')).id).toBe('saiyajin');
        expect(resolverRaca(cenario, fichaDe('sayajin')).id).toBe('saiyajin');
        expect(resolverRaca(cenario, fichaDe('  meio-saiyajin ')).id).toBe('meio-saiyajin');
    });
    it('texto livre e racaId órfão = não cadastrada (com o texto)', () => {
        expect(resolverRaca(cenario, fichaDe('Humano'))).toEqual({ id: '', nome: 'Humano', cadastrada: false });
        expect(resolverRaca(cenario, fichaDe('Humano', 'sumiu'))).toEqual({ id: '', nome: 'Humano', cadastrada: false });
        expect(resolverRaca(cenario, {})).toEqual({ id: '', nome: '', cadastrada: false });
        expect(resolverRaca(undefined, undefined).cadastrada).toBe(false);
    });
    it('racaId órfão cai no texto quando ele casa', () => {
        expect(resolverRaca(cenario, fichaDe('Saiyajin', 'sumiu')).id).toBe('saiyajin');
    });
});

describe('herança e acesso', () => {
    it('ancestrais transitivos', () => {
        expect(ancestraisDaRaca(cenario, 'quarto')).toEqual(['meio-saiyajin', 'saiyajin']);
        expect(ancestraisDaRaca(cenario, 'saiyajin')).toEqual([]);
        expect(ancestraisDaRaca(cenario, 'nao-existe')).toEqual([]);
    });
    it('quem herda tem o acesso da raça-mãe (transitivo); a mãe não ganha o da filha', () => {
        const p = habRaca({ racasAcesso: ['saiyajin'] });
        expect(racaTemAcesso(cenario, fichaDe('Saiyajin'), p)).toBe(true);
        expect(racaTemAcesso(cenario, fichaDe('Meio-Saiyajin'), p)).toBe(true);
        expect(racaTemAcesso(cenario, fichaDe('', 'quarto'), p)).toBe(true);
        expect(racaTemAcesso(cenario, fichaDe('Namekuseijin'), p)).toBe(false);
        const soFilha = habRaca({ racasAcesso: ['meio-saiyajin'] });
        expect(racaTemAcesso(cenario, fichaDe('Saiyajin'), soFilha)).toBe(false);
    });
    it('lista vazia/ausente = ninguém; raça não cadastrada = ninguém', () => {
        expect(racaTemAcesso(cenario, fichaDe('Saiyajin'), habRaca({ racasAcesso: [] }))).toBe(false);
        expect(racaTemAcesso(cenario, fichaDe('Saiyajin'), habRaca({ racasAcesso: undefined }))).toBe(false);
        expect(racaTemAcesso(cenario, fichaDe('Humano'), habRaca())).toBe(false);
        expect(racaTemAcesso({}, fichaDe('Saiyajin'), habRaca())).toBe(false);
    });
    it('poder que não é Habilidade de Raça não tem restrição', () => {
        expect(racaTemAcesso(cenario, fichaDe('Humano'), { categoria: 'habilidade' })).toBe(true);
        expect(ehHabilidadeDeRaca({ categoria: 'habilidade' })).toBe(false);
        expect(ehHabilidadeDeRaca({ categoria: 'racial' })).toBe(true);
        expect(ehHabilidadeDeRaca(null)).toBe(false);
    });
    it('referências órfãs em racasAcesso são inofensivas', () => {
        const p = habRaca({ racasAcesso: ['removida'] });
        expect(racaTemAcesso(cenario, fichaDe('Saiyajin'), p)).toBe(false);
        expect(racasComAcessoTexto(cenario, p)).toMatch(/nenhuma/i);
    });
    it('textos em português', () => {
        expect(racasComAcessoTexto(cenario, habRaca({ racasAcesso: ['saiyajin', 'namekuseijin', 'x'] }))).toBe('Saiyajin, Namekuseijin');
        expect(motivoSemAcesso(cenario, fichaDe('Saiyajin'), habRaca())).toBe('');
        expect(motivoSemAcesso(cenario, fichaDe('Namekuseijin'), habRaca())).toMatch(/Raça Namekuseijin não tem acesso a "Zenkai"/);
        expect(motivoSemAcesso(cenario, fichaDe('Humano'), habRaca())).toMatch(/não está cadastrada/);
        expect(motivoSemAcesso(cenario, fichaDe(''), habRaca())).toMatch(/não tem Raça definida/);
    });
});

describe('verificarAcessoHabilidadeRaca', () => {
    it('com acesso: permitido', () => {
        expect(verificarAcessoHabilidadeRaca({ cenario, ficha: fichaDe('Saiyajin'), poder: habRaca(), isMestre: false })).toEqual({ permitido: true, precisaConfirmarExcecao: false, mensagem: '' });
    });
    it('jogador sem acesso é bloqueado, sem como confirmar', () => {
        const r = verificarAcessoHabilidadeRaca({ cenario, ficha: fichaDe('Humano'), poder: habRaca(), isMestre: false });
        expect(r.permitido).toBe(false);
        expect(r.precisaConfirmarExcecao).toBe(false);
        expect(r.mensagem).toMatch(/Só o Mestre pode conceder/);
    });
    it('Mestre sem acesso precisa confirmar a exceção', () => {
        const r = verificarAcessoHabilidadeRaca({ cenario, ficha: fichaDe('Humano'), poder: habRaca(), isMestre: true });
        expect(r.permitido).toBe(false);
        expect(r.precisaConfirmarExcecao).toBe(true);
        expect(r.mensagem).toMatch(/Raça sem acesso: conceder como exceção\?/);
    });
    it('exceção já concedida e poder comum passam', () => {
        expect(verificarAcessoHabilidadeRaca({ cenario, ficha: fichaDe('Humano'), poder: habRaca({ racaExcecao: true }), isMestre: false }).permitido).toBe(true);
        expect(verificarAcessoHabilidadeRaca({ cenario, ficha: fichaDe('Humano'), poder: { categoria: 'poder' }, isMestre: false }).permitido).toBe(true);
        expect(verificarAcessoHabilidadeRaca().permitido).toBe(true);
    });
});

describe('selo de incompatibilidade (derivado)', () => {
    it('aparece ao mudar de raça, não aparece com exceção e não grava nada', () => {
        const poder = habRaca();
        const antes = JSON.stringify(poder);
        expect(poderRacaIncompativel(cenario, fichaDe('Saiyajin'), poder)).toBe(false);
        expect(poderRacaIncompativel(cenario, fichaDe('Namekuseijin'), poder)).toBe(true);
        expect(poderRacaIncompativel(cenario, fichaDe('Namekuseijin'), habRaca({ racaExcecao: true }))).toBe(false);
        expect(poderRacaIncompativel(cenario, fichaDe('Namekuseijin'), { categoria: 'habilidade' })).toBe(false);
        expect(JSON.stringify(poder)).toBe(antes);
    });
});

describe('auxiliares', () => {
    it('limparReferenciasDeRaca', () => {
        const racas = sanitizarRacas(cenario.racas);
        const poderes = [habRaca({ racasAcesso: ['saiyajin', 'namekuseijin'] }), { id: 2, categoria: 'habilidade' }];
        const r = limparReferenciasDeRaca('saiyajin', { racas, poderes });
        expect(r.racas.some(x => x.id === 'saiyajin')).toBe(false);
        expect(r.racas.find(x => x.id === 'meio-saiyajin').herdaDe).toBe('');
        expect(r.poderes[0].racasAcesso).toEqual(['namekuseijin']);
        expect(poderes[0].racasAcesso).toEqual(['saiyajin', 'namekuseijin']); // não muta
        expect(r.alterados).toBe(2);
    });
    it('camposDaRacaNaFicha, padrão de racasAcesso e normalização', () => {
        expect(camposDaRacaNaFicha({ id: 'x', nome: 'X' })).toEqual({ 'bio/racaId': 'x', 'bio/raca': 'X' });
        expect(camposDaRacaNaFicha(null)).toEqual({ 'bio/racaId': '', 'bio/raca': '' });
        expect(racasAcessoPadraoParaFicha(cenario, fichaDe('Saiyajin'))).toEqual(['saiyajin']);
        expect(racasAcessoPadraoParaFicha(cenario, fichaDe('Humano'))).toEqual([]);
        expect(normalizarRacasAcesso(['a', 'a', ' b ', '', 3, null])).toEqual(['a', 'b']);
        expect(aplicarExcecaoRaca({ categoria: 'habilidadeRaca' }, true).racaExcecao).toBe(true);
        expect(aplicarExcecaoRaca({ categoria: 'habilidadeRaca', racaExcecao: true }, false).racaExcecao).toBeUndefined();
    });
    it('racaIdAposEdicaoDeTexto', () => {
        expect(racaIdAposEdicaoDeTexto(cenario, 'saiyajin', 'Saiyajin', 'Saiyajin')).toBe('saiyajin');
        expect(racaIdAposEdicaoDeTexto(cenario, 'saiyajin', 'Nome Antigo', 'Nome Antigo')).toBe('saiyajin');
        expect(racaIdAposEdicaoDeTexto(cenario, 'saiyajin', 'Saiyajin', 'Namekuseijin')).toBe('namekuseijin');
        expect(racaIdAposEdicaoDeTexto(cenario, 'saiyajin', 'Saiyajin', 'Humano')).toBe('');
    });
});

describe('categoria habilidadeRaca', () => {
    it('existe, com apelidos e flags', () => {
        expect(IDS_CATEGORIA_PODER).toContain('habilidadeRaca');
        ['habilidades de raca', 'habilidade de raca', 'racial', 'raciais', 'habilidade racial', 'habilidades raciais', 'raca', 'Habilidades de Raça', 'HABILIDADE RACIAL'].forEach((a) => {
            expect(idCategoriaPoder(a)).toBe('habilidadeRaca');
        });
        const c = CATEGORIAS_PODER.find(x => x.id === 'habilidadeRaca');
        expect(c).toMatchObject({ rotulo: '🧬 Habilidades de Raça', singular: 'Habilidade de Raça', artigo: ['uma', 'a'], pluralComArtigo: 'as Habilidades de Raça', copiavel: true, maestriaRequerida: true });
        expect(c.liberada({})).toBe(true);
        expect(poderEhCopiavel({ categoria: 'habilidadeRaca' })).toBe(true);
        expect(usaMaestriaRequerida('habilidadeRaca')).toBe(true);
    });
    it('aba só aparece com poderes dela ou para o Mestre; as outras categorias seguem como antes', () => {
        const ids = (f, o) => categoriasVisiveisNaFicha(f, o).map(c => c.id);
        expect(ids({ poderes: [] })).toEqual(['habilidade', 'forma', 'poder']);
        expect(ids({ poderes: [] }, { isMestre: false })).not.toContain('habilidadeRaca');
        expect(ids({ poderes: [] }, { isMestre: true })).toContain('habilidadeRaca');
        expect(ids({ poderes: [habRaca()] })).toContain('habilidadeRaca');
        expect(ids({ poderes: [{ categoria: 'racial' }] })).toContain('habilidadeRaca');
        expect(ids({ poderes: [], hierarquia: { infinity: true } })).toEqual(['habilidade', 'forma', 'poder', 'infinity']);
    });
});

describe('migração do Zenkai', () => {
    it('modelo zenkai em habilidade vira habilidadeRaca com exceção e sem selo', () => {
        const poderes = [
            { id: 1, nome: 'Zenkai', categoria: 'habilidade', modelo: { id: 'zenkai' } },
            { id: 2, nome: 'Outra', categoria: 'habilidade' },
            { id: 3, nome: 'Marcado', categoria: 'habilidade', modelo: { id: 'custom', habilidadeRaca: true }, racasAcesso: ['x'] },
            { id: 4, nome: 'Zenkai em Poder', categoria: 'poder', modelo: { id: 'zenkai' } },
            { id: 5, nome: 'Verg', categoria: 'infinity', modelo: { id: 'vergAvesta' } },
        ];
        const r = migrarHabilidadesDeRaca(poderes);
        expect(r.mudou).toBe(true);
        expect(r.poderes[0]).toMatchObject({ categoria: 'habilidadeRaca', racaExcecao: true, racasAcesso: [] });
        expect(r.poderes[1]).toBe(poderes[1]);
        expect(r.poderes[2]).toMatchObject({ categoria: 'habilidadeRaca', racaExcecao: true, racasAcesso: ['x'] });
        expect(r.poderes[3].categoria).toBe('poder');
        expect(r.poderes[4]).toBe(poderes[4]);
        expect(poderes[0].categoria).toBe('habilidade'); // não muta
        expect(poderRacaIncompativel(cenario, fichaDe('Humano'), r.poderes[0])).toBe(false);
    });
    it('é idempotente e devolve o mesmo array quando nada muda', () => {
        const lista = [{ id: 1, categoria: 'habilidade' }];
        expect(migrarHabilidadesDeRaca(lista)).toEqual({ poderes: lista, mudou: false });
        const uma = migrarHabilidadesDeRaca([{ id: 1, categoria: 'habilidade', modelo: { id: 'zenkai' } }]);
        const duas = migrarHabilidadesDeRaca(uma.poderes);
        expect(duas.mudou).toBe(false);
        expect(migrarHabilidadesDeRaca(undefined).mudou).toBe(false);
    });
});

describe('modelo Zenkai como Habilidade de Raça', () => {
    const params = {};
    const sel = ['calculoZenkai'];
    it('categoria habilidadeRaca e racasAcesso padrão = raça cadastrada da ficha-alvo', () => {
        const m = obterModelo('zenkai');
        expect(m.categoria).toBe('habilidadeRaca');
        const r = m.construir(sel, params, fichaDe('Saiyajin'), { cenario });
        expect(r.poder.categoria).toBe('habilidadeRaca');
        expect(r.poder.racasAcesso).toEqual(['saiyajin']);
        expect(m.construir(sel, params, fichaDe('Humano'), { cenario }).poder.racasAcesso).toEqual([]);
        expect(m.construir(sel, params, fichaDe('Humano'), { cenario, racasAcesso: ['namekuseijin'] }).poder.racasAcesso).toEqual(['namekuseijin']);
    });
    it('Ego e Verg continuam como estavam (sem racasAcesso)', () => {
        const ego = obterModelo('egoSuperior');
        expect(ego.categoria).not.toBe('habilidadeRaca');
        const r = ego.construir(ego.partes.filter(p => p.padrao).map(p => p.id), {}, fichaDe('Humano'), { cenario });
        expect(r.poder.racasAcesso).toBeUndefined();
    });
    it('planejarModelo informa o acesso de Raça', () => {
        expect(planejarModelo('zenkai', sel, params, fichaDe('Saiyajin'), { cenario }).acessoRaca).toMatchObject({ permitido: true, racasAcesso: ['saiyajin'] });
        const semAcesso = planejarModelo('zenkai', sel, params, fichaDe('Humano'), { cenario });
        expect(semAcesso.ok).toBe(true);
        expect(semAcesso.acessoRaca).toMatchObject({ permitido: false, precisaConfirmarExcecao: true });
        expect(planejarModelo('egoSuperior', ['x'], {}, fichaDe('Humano'), { cenario }).acessoRaca ?? null).toBeNull();
    });
    it('aplicar com acesso grava sem exceção', () => {
        const ficha = { ...fichaDe('Saiyajin'), poderes: [], contadores: [] };
        const r = aplicarModeloNaFicha(ficha, { modeloId: 'zenkai', selecao: sel, params, isMestre: true, cenario, id: 7 });
        expect(r.ok).toBe(true);
        expect(ficha.poderes[0]).toMatchObject({ categoria: 'habilidadeRaca', racasAcesso: ['saiyajin'] });
        expect(ficha.poderes[0].racaExcecao).toBeUndefined();
    });
    it('aplicar sem acesso exige a confirmação e nada é gravado antes dela', () => {
        const ficha = { ...fichaDe('Humano'), poderes: [], contadores: [] };
        const r = aplicarModeloNaFicha(ficha, { modeloId: 'zenkai', selecao: sel, params, isMestre: true, cenario, id: 7 });
        expect(r.ok).toBe(false);
        expect(r.precisaConfirmarExcecao).toBe(true);
        expect(ficha.poderes).toHaveLength(0);
        const r2 = aplicarModeloNaFicha(ficha, { modeloId: 'zenkai', selecao: sel, params, isMestre: true, cenario, id: 7, confirmarExcecao: true });
        expect(r2.ok).toBe(true);
        expect(ficha.poderes[0]).toMatchObject({ categoria: 'habilidadeRaca', racaExcecao: true, racasAcesso: [] });
    });
    it('editar partes mantém a lista e a exceção do poder já existente e migra a categoria', () => {
        const ficha = { ...fichaDe('Humano'), poderes: [], contadores: [] };
        aplicarModeloNaFicha(ficha, { modeloId: 'zenkai', selecao: sel, params, isMestre: true, cenario, id: 7, confirmarExcecao: true });
        ficha.poderes[0].racasAcesso = ['namekuseijin'];
        const r = aplicarModeloNaFicha(ficha, { modeloId: 'zenkai', selecao: sel, params, isMestre: true, cenario });
        expect(r.ok).toBe(true);
        expect(ficha.poderes).toHaveLength(1);
        expect(ficha.poderes[0].racasAcesso).toEqual(['namekuseijin']);
        expect(ficha.poderes[0].racaExcecao).toBe(true);
    });
    it('jogador continua sem poder aplicar modelo', () => {
        const ficha = { ...fichaDe('Saiyajin'), poderes: [], contadores: [] };
        expect(aplicarModeloNaFicha(ficha, { modeloId: 'zenkai', selecao: sel, params, isMestre: false, cenario }).ok).toBe(false);
    });
});

describe('ensinar / copiar Habilidade de Raça', () => {
    const oferta = (extra = {}) => ({ id: 'ens_1', de: 'Goku', tipo: 'poder', nivel: 40, em: 1, item: { nome: 'Zenkai', categoria: 'habilidadeRaca', racasAcesso: ['saiyajin'], ...extra } });
    const comOferta = (ficha, o) => ({ ...ficha, poderes: [], ensinamentos: { [o.id]: o } });
    it('jogador sem acesso é bloqueado e a oferta fica pendente', () => {
        const o = oferta();
        const f = comOferta(fichaDe('Humano'), o);
        expect(verificarAcessoOferta(f, o, { cenario, isMestre: false })).toMatchObject({ permitido: false, precisaConfirmarExcecao: false });
        expect(aceitarOferta(f, o, 99, { cenario, isMestre: false })).toBeNull();
        expect(f.poderes).toHaveLength(0);
        expect(f.ensinamentos.ens_1).toBeTruthy();
    });
    it('jogador com acesso aprende (inclusive por herança) sem exceção', () => {
        const o = oferta();
        const f = comOferta(fichaDe('Meio-Saiyajin'), o);
        const item = aceitarOferta(f, o, 99, { cenario, isMestre: false, fichaRemetente: { poderes: [{ nome: 'Zenkai', categoria: 'habilidadeRaca', racasAcesso: ['saiyajin'] }] } });
        expect(item).toMatchObject({ categoria: 'habilidadeRaca', maestria: 40 });
        expect(item.racaExcecao).toBeUndefined();
    });
    it('Mestre sem acesso só aprende com a confirmação, e fica racaExcecao', () => {
        const o = oferta();
        const f = comOferta(fichaDe('Humano'), o);
        expect(verificarAcessoOferta(f, o, { cenario, isMestre: true }).precisaConfirmarExcecao).toBe(true);
        expect(aceitarOferta(f, o, 99, { cenario, isMestre: true })).toBeNull();
        const item = aceitarOferta(f, o, 99, { cenario, isMestre: true, excecaoConfirmada: true });
        expect(item.racaExcecao).toBe(true);
        expect(f.ensinamentos.ens_1).toBeUndefined();
    });
    it('exceção que vem na oferta é ignorada e não é copiada ao ensinar', () => {
        expect(prepararItemEnsinado({ nome: 'X', categoria: 'habilidadeRaca', racaExcecao: true }).racaExcecao).toBeUndefined();
        const o = oferta({ racaExcecao: true });
        const f = comOferta(fichaDe('Humano'), o);
        expect(aceitarOferta(f, o, 99, { cenario, isMestre: false })).toBeNull();
    });
    it('outras categorias não são afetadas (sem contexto)', () => {
        const o = { id: 'e2', de: 'X', tipo: 'poder', nivel: 10, em: 1, item: { nome: 'Soco', categoria: 'habilidade' } };
        const f = comOferta(fichaDe('Humano'), o);
        expect(aceitarOferta(f, o, 5)).toMatchObject({ nome: 'Soco', maestria: 10 });
    });
});

describe('ofertas forjadas e contagem', () => {
    const remetente = (racasAcesso) => ({ poderes: [{ id: 3, nome: 'Zenkai', categoria: 'habilidadeRaca', racasAcesso }] });
    const oferta = (racasAcesso) => ({ id: 'e', de: 'Goku', tipo: 'poder', nivel: 10, em: 1, item: { nome: 'Zenkai', categoria: 'habilidadeRaca', racasAcesso } });
    it('oferta forjada com racasAcesso do aluno é bloqueada (vale a lista do remetente)', () => {
        const o = oferta(['namekuseijin']);
        const f = { ...fichaDe('Namekuseijin'), poderes: [], ensinamentos: { e: o } };
        expect(aceitarOferta(f, o, 1, { cenario, isMestre: false, fichaRemetente: remetente(['saiyajin']) })).toBeNull();
        expect(aceitarOferta(f, o, 1, { cenario, isMestre: false })).toBeNull(); // sem remetente = []
        expect(verificarAcessoOferta(f, o, { cenario, isMestre: true, fichaRemetente: remetente([]) }).precisaConfirmarExcecao).toBe(true);
    });
    it('oferta legítima entre jogadores da mesma raça passa e grava a lista do remetente', () => {
        const o = oferta([]);
        const f = { ...fichaDe('Saiyajin'), poderes: [], ensinamentos: { e: o } };
        const item = aceitarOferta(f, o, 1, { cenario, isMestre: false, fichaRemetente: remetente(['saiyajin']) });
        expect(item).toMatchObject({ categoria: 'habilidadeRaca', racasAcesso: ['saiyajin'] });
        expect(item.racaExcecao).toBeUndefined();
    });
    it('contarRacasComAcesso ignora órfãs; getRacas usa cache por referência', () => {
        expect(contarRacasComAcesso(cenario, habRaca({ racasAcesso: ['saiyajin', 'sumiu'] }))).toBe(1);
        expect(getRacas(cenario)).toBe(getRacas(cenario));
    });
});

describe('importador IA', () => {
    const item = (categoria) => ({ marcado: true, valido: true, objeto: { nome: 'Algo', categoria, racasAcesso: ['saiyajin'], racaExcecao: true } });
    it('categoria aceita; racasAcesso/racaExcecao da IA nunca valem', () => {
        const m = mudarCategoriaImportada({ nome: 'A', categoria: 'habilidade', racasAcesso: ['x'], racaExcecao: true }, 'habilidadeRaca');
        expect(m.racasAcesso).toEqual([]);
        const volta = mudarCategoriaImportada(m, 'habilidade');
        expect(volta.racasAcesso).toBeUndefined();
        expect(montarPoderFinal({ nome: 'A', categoria: 'habilidadeRaca', racasAcesso: ['saiyajin'], racaExcecao: true }, 1)).toMatchObject({ racasAcesso: [] });
        expect(montarPoderFinal({ nome: 'A', categoria: 'habilidadeRaca', racaExcecao: true }, 1).racaExcecao).toBeUndefined();
        expect(montarPoderFinal({ nome: 'A', categoria: 'habilidadeRaca' }, 1, { racaExcecao: true }).racaExcecao).toBe(true);
        expect(montarPoderFinal({ nome: 'A', categoria: 'habilidade', racasAcesso: ['x'] }, 1).racasAcesso).toBeUndefined();
    });
    it('Mestre concede com a Raça cadastrada do alvo (sem diálogo); sem raça cadastrada pede exceção', () => {
        const itens = [item('habilidadeRaca')];
        expect(separarItensPorAcessoRaca(itens, { cenario, ficha: fichaDe('Saiyajin'), isMestre: true }).liberados).toHaveLength(1);
        expect(separarItensPorAcessoRaca(itens, { cenario, ficha: fichaDe('Humano'), isMestre: true }).paraConfirmar).toHaveLength(1);
        expect(montarPoderFinal({ nome: 'A', categoria: 'habilidadeRaca' }, 1, { racasAcesso: ['saiyajin'] }).racasAcesso).toEqual(['saiyajin']);
    });
    it('jogador é bloqueado; Mestre confirma; outras categorias passam', () => {
        const itens = [item('habilidade'), item('habilidadeRaca')];
        const jog = separarItensPorAcessoRaca(itens, { cenario, ficha: fichaDe('Saiyajin'), isMestre: false });
        expect(jog.liberados).toHaveLength(1);
        expect(jog.bloqueados).toHaveLength(1); // racasAcesso da IA é ignorada: lista vazia
        const mes = separarItensPorAcessoRaca(itens, { cenario, ficha: fichaDe('Humano'), isMestre: true });
        expect(mes.paraConfirmar).toHaveLength(1);
        expect(mes.bloqueados).toHaveLength(0);
    });
});

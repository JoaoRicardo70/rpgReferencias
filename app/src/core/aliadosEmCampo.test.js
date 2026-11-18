import { describe, it, expect, beforeEach } from 'vitest';
import useStore from '../stores/useStore';
import {
    contarAliadosEmCampoDaMesa, listarAliadosEmCampoDaMesa, listarAliadosEmCampo, nomeDoPortador, normalizarFiltroAliado,
} from './aliadosEmCampo';
import { normalizarQuando, passaQuando, montarContextoDeCombate, coletarEfeitos, OPCOES_QUANDO } from './efeitosCondicionais';
import { resolverEfeitosEntidade } from './efeitos-resolver';
import { efeitosDeAliados } from './efeitosDeAliados';

const POS = { c1: { x: 1, y: 1 } };
const ficha = (extra = {}) => ({ bio: {}, posicoes: { ...POS }, poderes: [], ...extra });
const mesa = (personagens, extra = {}) => useStore.setState({
    personagens, dummies: {}, cenario: { ativa: 'c1' }, isMestre: false, meuNome: 'Logado', minhaFicha: null, ...extra,
});
const conta = (nome, personagens, filtro = null) => contarAliadosEmCampoDaMesa(personagens[nome], filtro, nome);

beforeEach(() => { mesa({}); });

describe('M9 contagem de aliados em campo', () => {
    it('conta aliados da cena ativa e exclui o portador', () => {
        const p = { Eu: ficha(), A: ficha(), B: ficha() };
        mesa(p);
        expect(conta('Eu', p)).toBe(2);
    });
    it('sozinho = 0', () => { const p = { Eu: ficha() }; mesa(p); expect(conta('Eu', p)).toBe(0); });
    it('aliado so posicionado em OUTRA cena nao conta', () => {
        const p = { Eu: ficha(), A: ficha({ posicoes: { c2: { x: 1, y: 1 } } }), B: ficha({ posicoes: {}, posicao: { x: 3, y: 3, cenaId: 'c2' } }) };
        mesa(p);
        expect(conta('Eu', p)).toBe(0);
    });
    it('sem x/y (nao posicionado) nao conta', () => {
        const p = { Eu: ficha(), A: ficha({ posicoes: {}, posicao: {} }), B: ficha({ posicoes: {} }) };
        mesa(p);
        expect(conta('Eu', p)).toBe(0);
    });
    it('posicao legada (ficha.posicao com cenaId igual a ativa) conta', () => {
        const p = { Eu: ficha(), A: ficha({ posicoes: {}, posicao: { x: 2, y: 2, cenaId: 'c1' } }) };
        mesa(p);
        expect(conta('Eu', p)).toBe(1);
    });
    it('sem nomePortador = 0 (falha fechada)', () => {
        const p = { Eu: ficha(), A: ficha() };
        mesa(p);
        expect(contarAliadosEmCampoDaMesa(p.Eu, null, '')).toBe(0);
        expect(contarAliadosEmCampoDaMesa(p.Eu, null, undefined)).toBe(0);
        expect(contarAliadosEmCampoDaMesa(p.Eu, null, '   ')).toBe(0);
        expect(listarAliadosEmCampoDaMesa(p.Eu)).toEqual([]);
    });
    it('ficha nula ou nao objeto = 0', () => {
        mesa({ A: ficha() });
        expect(contarAliadosEmCampoDaMesa(null, null, 'Eu')).toBe(0);
        expect(contarAliadosEmCampoDaMesa('x', null, 'Eu')).toBe(0);
    });
    it('nome com .#$[]/ e comparado por sanitizarNome dos dois lados', () => {
        const eu = ficha();
        const p = { 'Eu.X#1': eu, A: ficha() };
        mesa(p);
        expect(contarAliadosEmCampoDaMesa(eu, null, 'Eu_X_1')).toBe(1);
        expect(contarAliadosEmCampoDaMesa(eu, null, 'Eu.X#1')).toBe(1);
    });
    it('chave que sanitiza igual ao portador nao conta como aliado dele', () => {
        const eu = ficha();
        const p = { 'Eu_1': eu, 'Eu/1': ficha(), A: ficha() };
        mesa(p);
        expect(contarAliadosEmCampoDaMesa(eu, null, 'Eu_1')).toBe(1);
    });
    it('ficha sem nome NAO assume o jogador logado', () => {
        const logado = ficha(); const solta = ficha(); // nenhuma tem bio.nome
        mesa({ Logado: logado, Outro: ficha() }, { meuNome: 'Logado', minhaFicha: logado });
        expect(nomeDoPortador(solta, '')).toBe('');
        expect(contarAliadosEmCampoDaMesa(solta, null, nomeDoPortador(solta, ''))).toBe(0);
    });
    it('nomeDoPortador: por identidade na mesa, no minhaFicha, ou o informado', () => {
        const eu = ficha(); const logado = ficha();
        mesa({ Eu: eu, Logado: logado }, { meuNome: 'Logado', minhaFicha: logado });
        expect(nomeDoPortador(eu, '')).toBe('Eu');
        expect(nomeDoPortador(logado, '')).toBe('Logado');
        expect(nomeDoPortador({ ...eu }, '')).toBe('');
        expect(nomeDoPortador(eu, 'Dado')).toBe('Dado');
        expect(nomeDoPortador(null, '')).toBe('');
    });
    it('dummie aliado na cena ativa conta; dummie padrao (inimigo) e de outra cena nao', () => {
        const p = { Eu: ficha() };
        mesa(p, { dummies: {
            d1: { id: 'd1', nome: 'Boneco', equipe: 'aliados', cenaId: 'c1' },
            d2: { id: 'd2', nome: 'Inimigo', cenaId: 'c1' },
            d3: { id: 'd3', nome: 'Longe', equipe: 'aliados', cenaId: 'c2' },
        } });
        expect(conta('Eu', p)).toBe(1);
    });
    it('NPC aliado conta; NPC sem lado (inimigo), hostil e neutro nao', () => {
        const p = {
            Eu: ficha(),
            NpcAli: ficha({ isNPC: true, combate: { equipe: 'aliados' } }),
            NpcSem: ficha({ isNPC: true }),
            Hostil: ficha({ combate: { equipe: 'inimigos' } }),
            Neutro: ficha({ combate: { equipe: 'neutros' } }),
        };
        mesa(p);
        expect(conta('Eu', p)).toBe(1);
        expect(listarAliadosEmCampoDaMesa(p.Eu, null, 'Eu').map(a => a.nome)).toEqual(['NpcAli']);
    });
    it('equipes aliadas entre si via relacoes do cenario contam', () => {
        const p = { Eu: ficha({ combate: { equipe: 'x' } }), A: ficha({ combate: { equipe: 'y' } }) };
        mesa(p, { cenario: { ativa: 'c1', equipes: [{ id: 'x', nome: 'X' }, { id: 'y', nome: 'Y' }], relacoes: { 'x|y': 'aliada' } } });
        expect(conta('Eu', p)).toBe(1);
    });
    it('limite de 200', () => {
        const p = { Eu: ficha() };
        for (let i = 0; i < 230; i++) p[`A${i}`] = ficha();
        mesa(p);
        expect(conta('Eu', p)).toBe(200);
    });
    it('listarAliadosEmCampo puro: sem cenaId ou sem portador.ficha = vazio', () => {
        const eu = ficha();
        expect(listarAliadosEmCampo({ portador: { ficha: eu, nome: 'Eu' }, personagens: { A: ficha() }, cenaId: '' })).toEqual([]);
        expect(listarAliadosEmCampo({ portador: { nome: 'Eu' }, personagens: { A: ficha() }, cenaId: 'c1' })).toEqual([]);
    });
});

describe('M9 filtros', () => {
    const base = () => ({
        Eu: ficha(),
        A: ficha({ bio: { afiliacao: 'Guilda Estrela', classe: 'Mago', raca: 'Elfo' } }),
        B: ficha({ bio: { afiliacao: 'Outra', classe: 'Guerreiro', raca: 'Humano' } }),
        C: ficha({ bio: {} }),
        D: ficha({}),
    });
    it('afiliacao contem o texto, sem acento/maiusculas', () => {
        const p = base(); mesa(p);
        expect(conta('Eu', p, 'afiliacao=ESTRELA')).toBe(1);
        expect(conta('Eu', p, 'afiliacao=guilda')).toBe(1);
        expect(conta('Eu', p, 'afiliacao=xyz')).toBe(0);
    });
    it('classe igual (nao parcial)', () => {
        const p = base(); mesa(p);
        expect(conta('Eu', p, 'classe=mago')).toBe(1);
        expect(conta('Eu', p, 'classe=mag')).toBe(0);
    });
    it('raca por nome do bio', () => {
        const p = base(); mesa(p);
        expect(conta('Eu', p, 'raca=elfo')).toBe(1);
    });
    it('raca por id do catalogo ou nome cadastrado', () => {
        const p = { Eu: ficha(), A: ficha({ bio: { racaId: 'elf', raca: 'qualquer' } }) };
        mesa(p, { cenario: { ativa: 'c1', racas: [{ id: 'elf', nome: 'Elfo da Noite' }] } });
        expect(conta('Eu', p, 'raca=elf')).toBe(1);
        expect(conta('Eu', p, 'raca=elfo da noite')).toBe(1);
    });
    it('aliado sem o dado do filtro nao passa; filtro aceita objeto', () => {
        const p = base(); mesa(p);
        expect(conta('Eu', p, { tipo: 'classe', valor: 'mago' })).toBe(1);
        expect(conta('Eu', p, 'classe=')).toBe(4); // filtro invalido = sem filtro (normalizar devolve null)
    });
    it('normalizarFiltroAliado: invalidos viram null', () => {
        expect(normalizarFiltroAliado('')).toBeNull();
        expect(normalizarFiltroAliado('semigual')).toBeNull();
        expect(normalizarFiltroAliado('cor=azul')).toBeNull();
        expect(normalizarFiltroAliado(null)).toBeNull();
        expect(normalizarFiltroAliado('raca=Elfo:Negro|x')).toEqual({ tipo: 'raca', valor: 'elfo negro x' });
        expect(normalizarFiltroAliado(`raca=${'a'.repeat(100)}`).valor).toHaveLength(40);
    });
    it('PRIVACIDADE: Raca secreta/privada de terceiros nao conta para jogador', () => {
        const mk = (vis) => ({ Eu: ficha(), A: ficha({ bio: { raca: 'Elfo', racaVisibilidade: vis } }), B: ficha({ bio: { raca: 'Elfo' } }) });
        [{ _principal: 'secreta' }, { _principal: 'privada' }].forEach((vis) => {
            const p = mk(vis); mesa(p);
            expect(conta('Eu', p, 'raca=elfo')).toBe(1);
        });
    });
    it('PRIVACIDADE: nivel da Raca cadastrada (por id) oculta tambem', () => {
        const p = { Eu: ficha(), A: ficha({ bio: { racaId: 'elf', raca: 'Elfo', racaVisibilidade: { elf: 'secreta' } } }) };
        mesa(p, { cenario: { ativa: 'c1', racas: [{ id: 'elf', nome: 'Elfo' }] } });
        expect(conta('Eu', p, 'raca=elfo')).toBe(0);
    });
    it('PRIVACIDADE: Mestre efetivo ve tudo e o cache nao vaza entre jogador e Mestre', () => {
        const p = { Eu: ficha(), A: ficha({ bio: { raca: 'Elfo', racaVisibilidade: { _principal: 'secreta' } } }) };
        mesa(p);
        expect(conta('Eu', p, 'raca=elfo')).toBe(0);
        useStore.setState({ isMestre: true });
        expect(conta('Eu', p, 'raca=elfo')).toBe(1);
        useStore.setState({ isMestre: false });
        expect(conta('Eu', p, 'raca=elfo')).toBe(0);
    });
    it('PRIVACIDADE: Raca oculta e indistinguivel de Raca inexistente; filtros nao-raca nao sao afetados', () => {
        const p = { Eu: ficha(), A: ficha({ bio: { raca: 'Elfo', classe: 'Mago', racaVisibilidade: { _principal: 'secreta' } } }) };
        mesa(p);
        expect(conta('Eu', p, 'raca=elfo')).toBe(conta('Eu', p, 'raca=inexistente'));
        expect(conta('Eu', p, 'classe=mago')).toBe(1);
        expect(conta('Eu', p)).toBe(1);
    });
});

describe('M9 cache', () => {
    it('mesma mesa = mesma referencia; nova mesa/cena/filtro recalcula', () => {
        const p = { Eu: ficha(), A: ficha() };
        mesa(p);
        const l1 = listarAliadosEmCampoDaMesa(p.Eu, null, 'Eu');
        expect(listarAliadosEmCampoDaMesa(p.Eu, null, 'Eu')).toBe(l1);
        const p2 = { ...p, B: ficha() };
        useStore.setState({ personagens: p2 });
        const l2 = listarAliadosEmCampoDaMesa(p.Eu, null, 'Eu');
        expect(l2).not.toBe(l1); expect(l2).toHaveLength(2);
        useStore.setState({ cenario: { ativa: 'c2' } });
        expect(listarAliadosEmCampoDaMesa(p.Eu, null, 'Eu')).toHaveLength(0);
    });
    it('outro portador na mesma mesa nao reaproveita o resultado', () => {
        const p = { Eu: ficha(), A: ficha() };
        mesa(p);
        expect(listarAliadosEmCampoDaMesa(p.Eu, null, 'Eu').map(a => a.nome)).toEqual(['A']);
        expect(listarAliadosEmCampoDaMesa(p.A, null, 'A').map(a => a.nome)).toEqual(['Eu']);
    });
    it('nova ficha do portador (outra referencia) recalcula (equipe mudou)', () => {
        const p = { Eu: ficha(), A: ficha() };
        mesa(p);
        expect(conta('Eu', p)).toBe(1);
        const euInimigo = ficha({ combate: { equipe: 'inimigos' } });
        expect(contarAliadosEmCampoDaMesa(euInimigo, null, 'Eu')).toBe(0);
    });
});

describe('M9 condicao aliados_em_campo', () => {
    it('normalizarQuando valida N e filtro', () => {
        expect(normalizarQuando('aliados_em_campo:2')).toBe('aliados_em_campo:2');
        expect(normalizarQuando('aliados_em_campo:2:Raca=Elfo')).toBe('aliados_em_campo:2:raca=elfo');
        expect(normalizarQuando('aliados_em_campo:2:afiliacao=A:B')).toBe('aliados_em_campo:2:afiliacao=a b');
        ['aliados_em_campo', 'aliados_em_campo:0', 'aliados_em_campo:201', 'aliados_em_campo:-1', 'aliados_em_campo:x', 'aliados_em_campo:1.5',
            'aliados_em_campo:2:cor=azul', 'aliados_em_campo:2:raca=', 'aliados_em_campo:1000'].forEach(v => expect(normalizarQuando(v)).toBeNull());
    });
    it('passaQuando: N aliados presentes', () => {
        const p = { Eu: ficha(), A: ficha(), B: ficha() };
        mesa(p);
        const ctx = montarContextoDeCombate(p.Eu, null, 'Eu');
        expect(passaQuando({ quando: 'aliados_em_campo:2' }, ctx)).toBe(true);
        expect(passaQuando({ quando: 'aliados_em_campo:3' }, ctx)).toBe(false);
    });
    it('passaQuando: filtro por classe', () => {
        const p = { Eu: ficha(), A: ficha({ bio: { classe: 'Mago' } }), B: ficha() };
        mesa(p);
        const ctx = montarContextoDeCombate(p.Eu, null, 'Eu');
        expect(passaQuando({ quando: 'aliados_em_campo:1:classe=mago' }, ctx)).toBe(true);
        expect(passaQuando({ quando: 'aliados_em_campo:2:classe=mago' }, ctx)).toBe(false);
    });
    it('passaQuando falha fechada sem contexto ou sem nome do portador', () => {
        const p = { Eu: ficha(), A: ficha() };
        mesa(p);
        expect(passaQuando({ quando: 'aliados_em_campo:1' }, {})).toBe(false);
        expect(passaQuando({ quando: 'aliados_em_campo:1' }, montarContextoDeCombate({ ...p.Eu }, null, ''))).toBe(false);
        expect(passaQuando({ quando: 'aliados_em_campo:1' }, montarContextoDeCombate(null))).toBe(false);
    });
    it('contexto identifica o portador pela identidade da ficha quando nao ha nome', () => {
        const p = { Eu: ficha(), A: ficha() };
        mesa(p);
        expect(passaQuando({ quando: 'aliados_em_campo:1' }, montarContextoDeCombate(p.Eu))).toBe(true);
    });
    it('PRIVACIDADE: rotulos/descricoes de condicao nao citam nenhuma Raca', () => {
        const txt = JSON.stringify(OPCOES_QUANDO);
        expect(txt).not.toMatch(/elfo|humano|saiyajin/i);
        expect(OPCOES_QUANDO.find(o => o.id === 'aliados_em_campo').rotulo).not.toMatch(/ra[cç]a/i);
    });
});

describe('M9 escalaAliados', () => {
    const poder = (esc) => ({ id: 'p', efeitos: [{ atributo: 'forca', propriedade: 'base', valor: '1', escalaAliados: esc }], efeitosPassivos: [] });
    it('soma valor + fator x aliados', () => {
        const p = { Eu: ficha(), A: ficha(), B: ficha(), C: ficha() };
        mesa(p);
        expect(resolverEfeitosEntidade(poder({ fator: 2 }), p.Eu, 'Eu').efeitos[0].valor).toBe('7');
    });
    it('com filtro', () => {
        const p = { Eu: ficha(), A: ficha({ bio: { classe: 'Mago' } }), B: ficha() };
        mesa(p);
        expect(resolverEfeitosEntidade(poder({ fator: 10, filtro: 'classe=mago' }), p.Eu, 'Eu').efeitos[0].valor).toBe('11');
    });
    it('sem nome do portador (ficha solta) = 0 aliados, efeito inalterado', () => {
        const p = { Eu: ficha(), A: ficha() };
        mesa(p);
        const r = resolverEfeitosEntidade(poder({ fator: 2 }), { ...p.Eu }, '');
        expect(r.efeitos[0].valor).toBe('1');
    });
    it.each([[0], [NaN], [Infinity], [1e7], ['x']])('fator %s = sem escala', (fator) => {
        const p = { Eu: ficha(), A: ficha() };
        mesa(p);
        expect(resolverEfeitosEntidade(poder({ fator }), p.Eu, 'Eu').efeitos[0].valor).toBe('1');
    });
    it('soma com escalaContador', () => {
        const p = { Eu: ficha({ contadores: [{ id: 'c', valor: 2 }] }), A: ficha() };
        mesa(p);
        const pd = { id: 'p', efeitos: [{ atributo: 'forca', propriedade: 'base', valor: '1', escalaContador: { contadorId: 'c', fator: 10 }, escalaAliados: { fator: 100 } }] };
        expect(resolverEfeitosEntidade(pd, p.Eu, 'Eu').efeitos[0].valor).toBe('121');
    });
});

describe('M14 efeitos que valem para aliados', () => {
    const dado = (extra = {}) => ({ atributo: 'dano_dados', propriedade: 'base', valor: '1d6', quando: 'alvo_com_estado:presa', valeParaAliados: true, ...extra });
    const poderAli = (nome, efeitos, extra = {}) => ({ id: nome, nome, ativa: true, efeitos, efeitosPassivos: [], ...extra });
    const marcados = (f, nome) => coletarEfeitos(f, nome).filter(e => e.valeParaAliados === true);

    it('o atacante recebe o dano_dados condicional de aliado da cena ativa', () => {
        const p = { Eu: ficha(), A: ficha({ poderes: [poderAli('Marca', [dado()])] }) };
        mesa(p);
        expect(marcados(p.Eu, 'Eu')).toHaveLength(1);
        expect(efeitosDeAliados(p.Eu, 'Eu')).toHaveLength(1);
    });
    it('condicao alvo_com_estado:presa vale so com o alvo em Presa', () => {
        const p = { Eu: ficha(), A: ficha({ poderes: [poderAli('Marca', [dado()])] }) };
        mesa(p);
        const comPresa = montarContextoDeCombate(p.Eu, { isPersonagem: true, ficha: { condicoes: [{ id: 'presa', stacks: 1 }] } }, 'Eu');
        const semPresa = montarContextoDeCombate(p.Eu, { isPersonagem: true, ficha: { condicoes: [] } }, 'Eu');
        const e = marcados(p.Eu, 'Eu')[0];
        expect(passaQuando(e, comPresa)).toBe(true);
        expect(passaQuando(e, semPresa)).toBe(false);
    });
    it('atributo de defesa/fora da lista nao passa', () => {
        const p = { Eu: ficha(), A: ficha({ poderes: [poderAli('X', [dado({ atributo: 'forca', quando: undefined }), dado({ atributo: 'evasiva', quando: undefined })])] }) };
        mesa(p);
        expect(marcados(p.Eu, 'Eu')).toHaveLength(0);
    });
    it('efeito sem a marca nao passa', () => {
        const p = { Eu: ficha(), A: ficha({ poderes: [poderAli('X', [dado({ valeParaAliados: false }), dado({ valeParaAliados: 'true' }), dado({ valeParaAliados: undefined })])] }) };
        mesa(p);
        expect(marcados(p.Eu, 'Eu')).toHaveLength(0);
    });
    it('no maximo UM efeito por (nome do Poder, atributo) de portadores diferentes', () => {
        const mk = () => ficha({ poderes: [poderAli('Marca Comum', [dado()])] });
        const p = { Eu: ficha(), A: mk(), B: mk(), C: mk() };
        mesa(p);
        expect(marcados(p.Eu, 'Eu')).toHaveLength(1);
    });
    it('Poderes de nomes diferentes (ou atributos diferentes) acumulam', () => {
        const p = { Eu: ficha(), A: ficha({ poderes: [poderAli('M1', [dado(), dado({ atributo: 'acerto', valor: '2' })])] }), B: ficha({ poderes: [poderAli('M2', [dado()])] }) };
        mesa(p);
        expect(marcados(p.Eu, 'Eu')).toHaveLength(3);
    });
    it('nome do Poder compara sem caixa/espacos', () => {
        const p = { Eu: ficha(), A: ficha({ poderes: [poderAli('Marca', [dado()])] }), B: ficha({ poderes: [poderAli('  MARCA ', [dado()])] }) };
        mesa(p);
        expect(marcados(p.Eu, 'Eu')).toHaveLength(1);
    });
    it('o proprio Poder do atacante entra uma vez so', () => {
        const p = { Eu: ficha({ poderes: [poderAli('Marca', [dado()])] }), A: ficha() };
        mesa(p);
        expect(marcados(p.Eu, 'Eu')).toHaveLength(1);
        expect(efeitosDeAliados(p.Eu, 'Eu')).toHaveLength(0);
    });
    it('aliado de outra cena nao entra', () => {
        const p = { Eu: ficha(), A: ficha({ posicoes: { c2: { x: 1, y: 1 } }, poderes: [poderAli('Marca', [dado()])] }) };
        mesa(p);
        expect(marcados(p.Eu, 'Eu')).toHaveLength(0);
    });
    it('hostil e neutro nao entram', () => {
        const p = {
            Eu: ficha(),
            H: ficha({ combate: { equipe: 'inimigos' }, poderes: [poderAli('M1', [dado()])] }),
            N: ficha({ combate: { equipe: 'neutros' }, poderes: [poderAli('M2', [dado()])] }),
        };
        mesa(p);
        expect(marcados(p.Eu, 'Eu')).toHaveLength(0);
    });
    it('Poder ativo desligado nao entra; passivo entra sempre', () => {
        const p = { Eu: ficha(), A: ficha({ poderes: [poderAli('Off', [dado()], { ativa: false }), poderAli('Pass', [], { ativa: false, efeitosPassivos: [dado()] })] }) };
        mesa(p);
        const m = marcados(p.Eu, 'Eu');
        expect(m).toHaveLength(1);
    });
    it('dummie aliado nao fornece efeitos', () => {
        const p = { Eu: ficha() };
        mesa(p, { dummies: { d1: { id: 'd1', nome: 'B', equipe: 'aliados', cenaId: 'c1', poderes: [poderAli('M', [dado()])] } } });
        expect(marcados(p.Eu, 'Eu')).toHaveLength(0);
    });
    it('sem nome do portador (ficha solta) = nenhum efeito (falha fechada)', () => {
        const p = { Eu: ficha(), A: ficha({ poderes: [poderAli('Marca', [dado()])] }) };
        mesa(p);
        expect(efeitosDeAliados({ ...p.Eu }, '')).toEqual([]);
        expect(efeitosDeAliados(null, 'Eu')).toEqual([]);
    });
    it(' ficha sem aliados / mesa vazia = []', () => {
        const p = { Eu: ficha() };
        mesa(p);
        expect(efeitosDeAliados(p.Eu, 'Eu')).toEqual([]);
    });
    it('nao recursivo: aliado nao recebe de si mesmo nem dos efeitos de aliados dos aliados', () => {
        const p = { Eu: ficha(), A: ficha({ poderes: [poderAli('Marca', [dado()])] }), B: ficha() };
        mesa(p);
        expect(marcados(p.A, 'A')).toHaveLength(1); // so a sua, vinda do caminho normal
        expect(marcados(p.B, 'B')).toHaveLength(1);
    });
});

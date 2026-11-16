import { describe, it, expect } from 'vitest';
import {
    getComposicaoRacial, racaTemAcesso, racasEfetivas, poderBloqueado, poderUsavel, poderRacaIncompativel, racasQueDaoAcesso,
    percentualMinimoDoPoder, composicaoComPrincipal, verificarAcessoHabilidadeRaca, sanitizarRacas, dominioDaRaca,
} from './racas';
import { prepararItemEnsinado, aceitarOferta, percentualMinimoConfiavelDaOferta, montarOferta } from './ensinar';
import { montarPoderFinal } from './importadorIA';

const cenario = { racas: [
    { id: 'saiyajin', nome: 'Saiyajin' },
    { id: 'humano', nome: 'Humano' },
    { id: 'primordial', nome: 'Primordial', acessoTotalDescendentes: true },
    { id: 'a', nome: 'A', descendeDe: 'primordial' },
    { id: 'b', nome: 'B', descendeDe: 'a' },
    { id: 'x', nome: 'X' },
    { id: 'y', nome: 'Y', acessoTotalDescendentes: true },
    { id: 'misto', nome: 'Misto', herdaDe: 'x', descendeDe: 'y' },
] };
const hab = (acesso, extra = {}) => ({ id: 1, nome: 'H', categoria: 'habilidadeRaca', racasAcesso: acesso, ...extra });
const ficha = (comp, bio = {}) => ({ bio: { raca: 'Saiyajin', racaId: 'saiyajin', ...(comp ? { composicaoRacial: comp } : {}), ...bio } });
const mest = ficha([{ racaId: 'saiyajin', percentual: 70, origem: 'nativa' }, { racaId: 'humano', percentual: 30, origem: 'adquirida' }]);

describe('(a) mestiço 70% Saiyajin / 30% Humano', () => {
    const hSai = hab(['saiyajin'], { percentualMinimo: 50 });
    const hHum = hab(['humano'], { percentualMinimo: 40 });
    it('acessos exatos: Saiyajin(min 50) sim, Humano(min 40) nao', () => {
        expect(racaTemAcesso(cenario, mest, hSai)).toBe(true);
        expect(racaTemAcesso(cenario, mest, hHum)).toBe(false);
        expect(poderBloqueado(cenario, mest, hHum)).toMatchObject({ bloqueado: true, origem: 'percentual', percentual: 30, minimo: 40, selo: '🔒 Domínio insuficiente (30% de 40%)' });
        expect(poderBloqueado(cenario, mest, hSai).bloqueado).toBe(false);
        expect(poderRacaIncompativel(cenario, mest, hHum)).toBe(false);
    });
    it('prática +25 no Humano (30 -> 55) libera a segunda habilidade', () => {
        const depois = ficha([{ racaId: 'saiyajin', percentual: 70 }, { racaId: 'humano', percentual: 55, origem: 'adquirida' }]);
        expect(racaTemAcesso(cenario, depois, hHum)).toBe(true);
        expect(poderUsavel(depois, cenario, hHum)).toBe(true);
        expect(racaTemAcesso(cenario, depois, hSai)).toBe(true);
    });
    it('habilidade com acesso por duas raças: vale a melhor', () => {
        const p = hab(['saiyajin', 'humano'], { percentualMinimo: 60 });
        expect(racasQueDaoAcesso(cenario, mest, p).map(e => e.racaId)).toEqual(['saiyajin']);
        expect(racasQueDaoAcesso(cenario, mest, p, { ignorarPercentual: true })).toHaveLength(2);
    });
    it('percentuais independentes: 100 + 100 e 0 + 0 sao aceitos', () => {
        const dois = ficha([{ racaId: 'saiyajin', percentual: 100 }, { racaId: 'humano', percentual: 100 }]);
        expect(getComposicaoRacial(cenario, dois).map(e => e.percentual)).toEqual([100, 100]);
        const zero = ficha([{ racaId: 'saiyajin', percentual: 0 }, { racaId: 'humano', percentual: 0 }]);
        expect(racaTemAcesso(cenario, zero, hab(['saiyajin']))).toBe(true); // minimo 0
        expect(racaTemAcesso(cenario, zero, hab(['saiyajin'], { percentualMinimo: 1 }))).toBe(false);
    });
});

describe('(b) Primordial em 3 niveis e inverso; herdaDe + descendeDe juntos', () => {
    it('Primordial -> A -> B: Primordial acessa tudo; B nao acessa A nem Primordial; A nao acessa B', () => {
        const prim = ficha(null, { racaId: 'primordial', raca: 'Primordial' });
        ['primordial', 'a', 'b'].forEach(id => expect(racaTemAcesso(cenario, prim, hab([id]))).toBe(true));
        const fb = ficha(null, { racaId: 'b', raca: 'B' });
        expect(racaTemAcesso(cenario, fb, hab(['b']))).toBe(true);
        expect(racaTemAcesso(cenario, fb, hab(['a']))).toBe(false);
        expect(racaTemAcesso(cenario, fb, hab(['primordial']))).toBe(false);
        const fa = ficha(null, { racaId: 'a', raca: 'A' });
        expect(racaTemAcesso(cenario, fa, hab(['b']))).toBe(false);
        expect(racaTemAcesso(cenario, fa, hab(['primordial']))).toBe(false);
    });
    it('Primordial com percentual baixo: o minimo vale pela entrada da Primordial', () => {
        const f = ficha([{ racaId: 'primordial', percentual: 30, origem: 'adquirida' }]);
        expect(racaTemAcesso(cenario, f, hab(['b'], { percentualMinimo: 30 }))).toBe(true);
        expect(racaTemAcesso(cenario, f, hab(['b'], { percentualMinimo: 31 }))).toBe(false);
        expect(poderBloqueado(cenario, f, hab(['b'], { percentualMinimo: 31 })).percentual).toBe(30);
    });
    it('raca com herdaDe X e descendeDe Y (Y acessoTotal): herdaDe independe de descendeDe', () => {
        // Misto acessa as proprias + X (herdaDe); NAO acessa Y (descendeDe so beneficia Y).
        expect(racasEfetivas(cenario, 'misto')).toEqual(['misto', 'x']);
        const fm = ficha(null, { racaId: 'misto', raca: 'Misto' });
        expect(racaTemAcesso(cenario, fm, hab(['x']))).toBe(true);
        expect(racaTemAcesso(cenario, fm, hab(['y']))).toBe(false);
        // Y acessa Misto (descendente) mas NAO X (herdaDe do Misto nao sobe pela descendencia).
        expect(racasEfetivas(cenario, 'y')).toEqual(['y', 'misto']);
        const fy = ficha(null, { racaId: 'y', raca: 'Y' });
        expect(racaTemAcesso(cenario, fy, hab(['misto']))).toBe(true);
        expect(racaTemAcesso(cenario, fy, hab(['x']))).toBe(false);
    });
});

describe('(c) composicao explicita sem a raca principal', () => {
    it('perde o acesso pela principal; composicaoComPrincipal sugere o alinhamento', () => {
        const f = ficha([{ racaId: 'humano', percentual: 80, origem: 'nativa' }]); // principal saiyajin fora
        expect(racaTemAcesso(cenario, f, hab(['saiyajin']))).toBe(false);
        expect(poderRacaIncompativel(cenario, f, hab(['saiyajin']))).toBe(true);
        expect(racaTemAcesso(cenario, f, hab(['humano']))).toBe(true);
        expect(dominioDaRaca(cenario, f, 'saiyajin')).toBe(0);
        const alinhada = composicaoComPrincipal(cenario, f);
        expect(alinhada.map(e => [e.racaId, e.percentual])).toEqual([['humano', 80], ['saiyajin', 100]]);
        expect(composicaoComPrincipal(cenario, ficha(null))).toBeNull();
        expect(composicaoComPrincipal(cenario, mest)).toBeNull();
    });
    it('personagem sem composicao explicita = antigo (principal a 100%, minimo 100 passa)', () => {
        const f = ficha(null);
        expect(racaTemAcesso(cenario, f, hab(['saiyajin'], { percentualMinimo: 100 }))).toBe(true);
        expect(poderBloqueado(cenario, f, hab(['saiyajin'], { percentualMinimo: 100 })).bloqueado).toBe(false);
        expect(racaTemAcesso(cenario, f, hab(['humano']))).toBe(false);
    });
});

describe('(e) excecao do Mestre', () => {
    const f = ficha([{ racaId: 'saiyajin', percentual: 10 }]);
    it('excecao + percentual baixo = usavel; + bloqueio manual = bloqueada', () => {
        const p = hab(['saiyajin'], { percentualMinimo: 50, racaExcecao: true });
        expect(poderUsavel(f, cenario, p)).toBe(true);
        expect(poderUsavel(f, cenario, { ...p, bloqueio: { ativo: true } })).toBe(false);
        expect(poderBloqueado(cenario, f, { ...p, bloqueio: { ativo: true } }).motivo).toBe('Habilidade ainda não despertada.');
    });
    it('excecao com raca totalmente sem acesso: usavel e sem selo incompatível', () => {
        const p = hab(['humano'], { racaExcecao: true });
        expect(poderRacaIncompativel(cenario, f, p)).toBe(false);
        expect(poderUsavel(f, cenario, p)).toBe(true);
    });
    it('verificarAcesso: Mestre precisa confirmar excecao, jogador nao', () => {
        const p = hab(['humano']);
        expect(verificarAcessoHabilidadeRaca({ cenario, ficha: f, poder: p, isMestre: true })).toMatchObject({ permitido: false, precisaConfirmarExcecao: true });
        expect(verificarAcessoHabilidadeRaca({ cenario, ficha: f, poder: p, isMestre: false })).toMatchObject({ permitido: false, precisaConfirmarExcecao: false });
    });
});

describe('(g) copia/ensino/importador nao carregam marcas do Mestre', () => {
    const marcado = { id: 5, nome: 'Gene', categoria: 'habilidadeRaca', racasAcesso: ['saiyajin'], percentualMinimo: 50, bloqueio: { ativo: true }, manipulaDNA: true, racaExcecao: true, ativa: true };
    it('prepararItemEnsinado remove bloqueio, manipulaDNA, racaExcecao e id', () => {
        const c = prepararItemEnsinado(marcado);
        expect(c.bloqueio).toBeUndefined();
        expect(c.manipulaDNA).toBeUndefined();
        expect(c.racaExcecao).toBeUndefined();
        expect(c.id).toBeUndefined();
        expect(c.ativa).toBe(false);
    });
    it('aceitarOferta: percentualMinimo so vale o da ficha real do remetente; forjado vira 0', () => {
        const remetente = { poderes: [{ ...marcado, percentualMinimo: 70 }] };
        const forjada = { ...prepararItemEnsinado(marcado), nome: 'Gene', percentualMinimo: 1, bloqueio: { ativo: false }, manipulaDNA: true };
        expect(percentualMinimoConfiavelDaOferta({ nome: 'Gene' }, remetente)).toBe(70);
        expect(percentualMinimoConfiavelDaOferta({ nome: 'Gene' }, null)).toBe(0);
        const aluno = { bio: { raca: 'Saiyajin', racaId: 'saiyajin' }, poderes: [], ensinamentos: { o1: { id: 'o1', de: 'Prof', tipo: 'poder', nivel: 10, item: forjada } } };
        const item = aceitarOferta(aluno, aluno.ensinamentos.o1, 99, { cenario, isMestre: false, fichaRemetente: remetente });
        expect(item).toBeTruthy();
        expect(item.percentualMinimo).toBe(70);
        expect(item.bloqueio).toBeUndefined();
        expect(item.manipulaDNA).toBeUndefined();
        const aluno2 = { bio: { raca: 'Saiyajin', racaId: 'saiyajin' }, poderes: [], ensinamentos: { o2: { id: 'o2', de: 'Prof', tipo: 'poder', nivel: 10, item: forjada } } };
        const item2 = aceitarOferta(aluno2, aluno2.ensinamentos.o2, 100, { cenario, isMestre: false, fichaRemetente: null });
        // sem ficha do remetente: racasAcesso = [] => jogador sem acesso => nao aceita
        expect(item2).toBeNull();
    });
    it('montarOferta usa copia limpa', () => {
        const r = montarOferta({ professor: 'Goku', tipo: 'poder', item: marcado, nivel: 5 });
        expect(r.ok).toBe(true);
        expect(r.oferta.item.bloqueio).toBeUndefined();
        expect(r.oferta.item.manipulaDNA).toBeUndefined();
    });
    it('importador (montarPoderFinal) descarta bloqueio, manipulaDNA e percentualMinimo, mesmo da IA', () => {
        const p = montarPoderFinal({ nome: 'Gene', categoria: 'habilidadeRaca', bloqueio: { ativo: true }, manipulaDNA: true, percentualMinimo: 80, racaExcecao: true }, 3, {});
        expect(p.bloqueio).toBeUndefined();
        expect(p.manipulaDNA).toBeUndefined();
        expect(p.percentualMinimo).toBeUndefined();
        expect(p.racaExcecao).toBeUndefined();
        const outro = montarPoderFinal({ nome: 'Soco', categoria: 'habilidade', bloqueio: { ativo: true }, manipulaDNA: true }, 4, {});
        expect(outro.bloqueio).toBeUndefined();
        expect(outro.manipulaDNA).toBeUndefined();
    });
});

describe('(h) regressao: outras categorias nunca sao bloqueadas', () => {
    it.each(['habilidade', 'poder', 'forma', 'infinity', 'singularidade', 'ocular', 'zenkai', 'adaptacao', undefined])('categoria %s ignora bloqueio/minimo/racasAcesso', (categoria) => {
        const p = { id: 2, nome: 'P', categoria, racasAcesso: ['humano'], percentualMinimo: 99, bloqueio: { ativo: true } };
        expect(poderBloqueado(cenario, mest, p).bloqueado).toBe(false);
        expect(poderUsavel(mest, cenario, p)).toBe(true);
        expect(racaTemAcesso(cenario, mest, p)).toBe(true);
        expect(poderRacaIncompativel(cenario, mest, p)).toBe(false);
        expect(racasQueDaoAcesso(cenario, mest, p)).toEqual([]);
    });
});

describe('(i) clamp, NaN e orfas', () => {
    it('percentuais invalidos viram padrao/clamp', () => {
        const f = ficha([
            { racaId: 'saiyajin', percentual: NaN }, { racaId: 'humano', percentual: Infinity, origem: 'adquirida' },
            { racaId: 'x', percentual: '55.555' }, { racaId: 'y', percentual: null, origem: 'adquirida' }, { racaId: 'a', percentual: -Infinity },
        ]);
        const c = Object.fromEntries(getComposicaoRacial(cenario, f).map(e => [e.racaId, e.percentual]));
        expect(c).toEqual({ saiyajin: 100, humano: 10, x: 55.56, y: 10, a: 100 });
    });
    it('minimo invalido: NaN/negativo/texto = 0; >100 = 100; string numerica ok', () => {
        expect(percentualMinimoDoPoder({ percentualMinimo: NaN })).toBe(0);
        expect(percentualMinimoDoPoder({ percentualMinimo: -5 })).toBe(0);
        expect(percentualMinimoDoPoder({ percentualMinimo: 'abc' })).toBe(0);
        expect(percentualMinimoDoPoder({ percentualMinimo: 250 })).toBe(100);
        expect(percentualMinimoDoPoder({ percentualMinimo: '45' })).toBe(45);
        expect(percentualMinimoDoPoder(null)).toBe(0);
        expect(percentualMinimoDoPoder({})).toBe(0);
    });
    it('lista com raca orfa (fora do catalogo) e entradas lixo', () => {
        const f = ficha([null, 'x', 7, { racaId: 'fantasma', percentual: 90 }, { racaId: '', percentual: 5 }, { percentual: 5 }, { racaId: 'humano', percentual: 20 }]);
        expect(getComposicaoRacial(cenario, f).map(e => e.racaId)).toEqual(['humano']);
        // so orfas => deriva da principal
        expect(getComposicaoRacial(cenario, ficha([{ racaId: 'fantasma', percentual: 90 }])).map(e => [e.racaId, e.percentual])).toEqual([['saiyajin', 100]]);
        // racasAcesso orfao no poder nao quebra
        expect(racaTemAcesso(cenario, mest, hab(['fantasma']))).toBe(false);
        expect(racaTemAcesso(cenario, mest, hab([]))).toBe(false);
        expect(racaTemAcesso(cenario, mest, hab(undefined))).toBe(false);
    });
    it('ficha/cenario nulos nao lancam', () => {
        expect(getComposicaoRacial(null, null)).toEqual([]);
        expect(getComposicaoRacial({}, {})).toEqual([]);
        expect(() => poderBloqueado(null, null, hab(['x'], { percentualMinimo: 10 }))).not.toThrow();
        expect(sanitizarRacas(null)).toEqual([]);
    });
});

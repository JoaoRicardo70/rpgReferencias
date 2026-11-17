import { describe, it, expect } from 'vitest';
import { sanitizarRacas, resolverRaca, ancestraisDaRaca, racaTemAcesso, poderRacaIncompativel, racasAcessoPadraoParaFicha, limparReferenciasDeRaca, migrarHabilidadesDeRaca, racaIdAposEdicaoDeTexto } from './racas';
import { verificarAcessoHabilidadeRaca } from './racasAcesso';
import { idCategoriaPoder, categoriasVisiveisNaFicha, poderEhCopiavel, CATEGORIAS_PODER } from './categoriasPoder';
import { verificarAcessoOferta, aceitarOferta } from './ensinar';
import { planejarModelo, aplicarModeloNaFicha } from './modelosPoder';
import { separarItensPorAcessoRaca, montarPoderFinal } from './importadorIA';
import { calcularZenkai, novaTelemetriaZenkai } from './zenkai';
import { racaDeDragao, riderMontado } from './classesMecanicas';

const cenario = { racas: [
    { id: 'humanoide', nome: 'Humanoide' },
    { id: 'saiyajin', nome: 'Saiyajin', apelidos: ['Sáyajin', 'Saiyan'], herdaDe: 'humanoide' },
    { id: 'meio', nome: 'Meio-Saiyajin', herdaDe: 'saiyajin' },
    { id: 'namek', nome: 'Namekuseijin' },
] };
const f = (raca, racaId) => ({ bio: { raca, ...(racaId !== undefined ? { racaId } : {}) } });
const hab = (acesso, extra = {}) => ({ id: 1, nome: 'Zenkai', categoria: 'habilidadeRaca', racasAcesso: acesso, ...extra });

describe('(a) heranca em 3 niveis e ciclo', () => {
    it('Meio-Saiyajin -> Saiyajin -> Humanoide: acesso do ancestral mais distante; inverso nao vale', () => {
        expect(ancestraisDaRaca(cenario, 'meio')).toEqual(['saiyajin', 'humanoide']);
        expect(racaTemAcesso(cenario, f('Meio-Saiyajin'), hab(['humanoide']))).toBe(true);
        expect(racaTemAcesso(cenario, f('Saiyajin'), hab(['meio']))).toBe(false);
        expect(racaTemAcesso(cenario, f('Humanoide'), hab(['saiyajin']))).toBe(false);
        expect(racaTemAcesso(cenario, f('Namekuseijin'), hab(['humanoide']))).toBe(false);
    });
    it('ciclo A->B->A nao trava nada: sanitiza, resolve e verifica acesso', () => {
        const ciclo = { racas: [{ id: 'a', nome: 'A', herdaDe: 'b' }, { id: 'b', nome: 'B', herdaDe: 'a' }] };
        const s = sanitizarRacas(ciclo.racas);
        expect(s.filter(r => r.herdaDe).length).toBeLessThanOrEqual(1);
        expect(ancestraisDaRaca(ciclo, 'a').length).toBeLessThanOrEqual(1);
        expect(() => racaTemAcesso(ciclo, f('A'), hab(['zzz']))).not.toThrow();
        expect(racaTemAcesso(ciclo, f('A'), hab(['b']))).toBeTypeOf('boolean');
    });
});

describe('(b) nome, apelido, acento, caixa; orfaos', () => {
    it('resolve por nome/apelido sem acento nem caixa', () => {
        ['saiyajin', 'SAIYAJIN', ' Sáiyajin ', 'SAIYAN', 'sayajin', 'SÁYAJIN', 'Saiyan'].forEach((t) => {
            expect(resolverRaca(cenario, f(t)).id).toBe('saiyajin');
        });
        expect(resolverRaca(cenario, f('Saiyajins')).cadastrada).toBe(false);
        expect(resolverRaca(cenario, f('')).cadastrada).toBe(false);
        expect(resolverRaca(cenario, {}).cadastrada).toBe(false);
        expect(resolverRaca(undefined, f('Saiyajin')).cadastrada).toBe(false);
    });
    it('racaId vence o texto', () => {
        expect(resolverRaca(cenario, f('Namekuseijin', 'saiyajin')).id).toBe('saiyajin');
    });
    it('raca removida: ids orfaos inofensivos', () => {
        const sem = { racas: cenario.racas.filter(r => r.id !== 'saiyajin') };
        expect(() => ancestraisDaRaca(sem, 'meio')).not.toThrow();
        expect(racaTemAcesso(sem, f('Meio-Saiyajin'), hab(['saiyajin']))).toBe(false);
        expect(resolverRaca(sem, f('Saiyajin', 'saiyajin')).cadastrada).toBe(false);
        expect(racaTemAcesso(sem, f('Humanoide'), hab(['saiyajin', 'sumiu']))).toBe(false);
        expect(racaTemAcesso(sem, f('Humanoide'), hab(['sumiu', 'humanoide']))).toBe(true);
        const l = limparReferenciasDeRaca('saiyajin', { racas: cenario.racas, poderes: [hab(['saiyajin', 'namek'])] });
        expect(l.racas.find(r => r.id === 'meio').herdaDe).toBe('');
        expect(l.poderes[0].racasAcesso).toEqual(['namek']);
        expect(l.racas.some(r => r.id === 'saiyajin')).toBe(false);
    });
});

describe('(c) quatro combinacoes jogador/Mestre x com/sem acesso', () => {
    const p = hab(['saiyajin']);
    const com = f('Saiyajin'); const sem = f('Namekuseijin');
    const casos = [
        ['jogador com', com, false, true, false], ['jogador sem', sem, false, false, false],
        ['Mestre com', com, true, true, false], ['Mestre sem', sem, true, false, true],
    ];
    casos.forEach(([nome, ficha, isMestre, permitido, confirmar]) => {
        it(`verificar: ${nome}`, () => {
            expect(verificarAcessoHabilidadeRaca({ cenario, ficha, poder: p, isMestre })).toMatchObject({ permitido, precisaConfirmarExcecao: confirmar });
        });
    });
    it('isMestre ausente ou nao-true = tratado como jogador (Modo Jogador)', () => {
        expect(verificarAcessoHabilidadeRaca({ cenario, ficha: sem, poder: p }).precisaConfirmarExcecao).toBe(false);
        expect(verificarAcessoHabilidadeRaca({ cenario, ficha: sem, poder: p, isMestre: 1 }).precisaConfirmarExcecao).toBe(false);
        expect(verificarAcessoHabilidadeRaca().permitido).toBe(true);
    });
    it('ensinar: 4 combinacoes com oferta forjada (racasAcesso do aluno + racaExcecao)', () => {
        const remet = (acesso) => ({ poderes: [{ nome: 'Zenkai', categoria: 'habilidadeRaca', racasAcesso: acesso }] });
        const forjada = { id: 'e', de: 'Goku', tipo: 'poder', nivel: 5, em: 1, item: { nome: 'Zenkai', categoria: 'habilidadeRaca', racasAcesso: ['namek'], racaExcecao: true } };
        const mk = (ficha) => ({ ...ficha, poderes: [], ensinamentos: { e: forjada } });
        expect(aceitarOferta(mk(sem), forjada, 1, { cenario, isMestre: false, fichaRemetente: remet(['saiyajin']) })).toBeNull();
        const item = aceitarOferta(mk(com), forjada, 1, { cenario, isMestre: false, fichaRemetente: remet(['saiyajin']) });
        expect(item).toBeTruthy(); expect(item.racaExcecao).toBeUndefined(); expect(item.racasAcesso).toEqual(['saiyajin']);
        expect(verificarAcessoOferta(mk(com), forjada, { cenario, isMestre: true, fichaRemetente: remet(['saiyajin']) })).toMatchObject({ permitido: true, precisaConfirmarExcecao: false });
        expect(verificarAcessoOferta(mk(sem), forjada, { cenario, isMestre: true, fichaRemetente: remet(['saiyajin']) }).precisaConfirmarExcecao).toBe(true);
        expect(aceitarOferta(mk(sem), forjada, 1, { cenario, isMestre: true, fichaRemetente: remet(['saiyajin']) })).toBeNull();
        expect(aceitarOferta(mk(sem), forjada, 1, { cenario, isMestre: true, fichaRemetente: remet(['saiyajin']), excecaoConfirmada: true }).racaExcecao).toBe(true);
        expect(aceitarOferta(mk(sem), forjada, 1, { cenario, isMestre: false, fichaRemetente: remet(['saiyajin']), excecaoConfirmada: true })).toBeNull();
    });
    it('importar: 4 combinacoes', () => {
        const it1 = [{ marcado: true, valido: true, objeto: { nome: 'X', categoria: 'habilidadeRaca' } }];
        const r = (ficha, isMestre) => separarItensPorAcessoRaca(it1, { cenario, ficha, isMestre });
        expect(r(com, false).bloqueados).toHaveLength(1);
        expect(r(sem, false).bloqueados).toHaveLength(1);
        expect(r(com, true).liberados).toHaveLength(1);
        expect(r(f('Humano'), true).paraConfirmar).toHaveLength(1);
        expect(racasAcessoPadraoParaFicha(cenario, com)).toEqual(['saiyajin']);
        expect(montarPoderFinal({ nome: 'X', categoria: 'habilidadeRaca' }, 1, { racasAcesso: racasAcessoPadraoParaFicha(cenario, com) }).racasAcesso).toEqual(['saiyajin']);
    });
    it('aplicar modelo: 4 combinacoes', () => {
        const base = (ficha) => ({ ...ficha, poderes: [], contadores: [] });
        const args = (isMestre, extra = {}) => ({ modeloId: 'zenkai', selecao: ['calculoZenkai'], params: {}, isMestre, cenario, id: 1, ...extra });
        expect(aplicarModeloNaFicha(base(com), args(false)).ok).toBe(false);
        expect(aplicarModeloNaFicha(base(f('Humano')), args(false, { confirmarExcecao: true })).ok).toBe(false);
        expect(aplicarModeloNaFicha(base(sem), args(true)).ok).toBe(true); // Mestre: padrao = raca cadastrada do alvo
        expect(aplicarModeloNaFicha(base(com), args(true)).ok).toBe(true);
        const s = base(f('Humano'));
        expect(aplicarModeloNaFicha(s, args(true)).precisaConfirmarExcecao).toBe(true);
        expect(s.poderes).toHaveLength(0);
    });
    it('Zenkai: alvo sem raca cadastrada (texto livre ou vazio) exige excecao', () => {
        ['Humano', '', undefined].forEach((r) => {
            const pl = planejarModelo('zenkai', ['calculoZenkai'], {}, f(r), { cenario });
            expect(pl.acessoRaca).toMatchObject({ permitido: false, precisaConfirmarExcecao: true });
        });
    });
});

describe('(d) mudar a Raca depois: habilidade permanece e ganha selo', () => {
    it('selo derivado, sem tocar no poder', () => {
        const ficha = { ...f('Saiyajin', 'saiyajin'), poderes: [hab(['saiyajin'])] };
        const antes = JSON.stringify(ficha.poderes);
        expect(poderRacaIncompativel(cenario, ficha, ficha.poderes[0])).toBe(false);
        ficha.bio = { raca: 'Namekuseijin', racaId: 'namek' };
        expect(poderRacaIncompativel(cenario, ficha, ficha.poderes[0])).toBe(true);
        expect(JSON.stringify(ficha.poderes)).toBe(antes);
        ficha.bio = { raca: 'Meio-Saiyajin', racaId: 'meio' };
        expect(poderRacaIncompativel(cenario, ficha, ficha.poderes[0])).toBe(false);
        ficha.bio = { raca: '', racaId: '' };
        expect(poderRacaIncompativel(cenario, ficha, ficha.poderes[0])).toBe(true);
        expect(poderRacaIncompativel(cenario, ficha, hab(['saiyajin'], { racaExcecao: true }))).toBe(false);
        expect(poderRacaIncompativel(cenario, ficha, { categoria: 'habilidade' })).toBe(false);
    });
});

describe('(e) Zenkai segue funcionando como habilidadeRaca', () => {
    it('migracao idempotente ao rodar 3 vezes e calcularZenkai nao depende da categoria', () => {
        const ps = [{ id: 1, categoria: 'habilidade', modelo: { id: 'zenkai' } }];
        const a = migrarHabilidadesDeRaca(ps); const b = migrarHabilidadesDeRaca(a.poderes); const c = migrarHabilidadesDeRaca(b.poderes);
        expect(a.mudou).toBe(true); expect(b.mudou).toBe(false); expect(c.poderes).toBe(a.poderes);
        const ficha = { vida: { atual: 50000 }, combate: { zenkaiLigado: true, zenkai: { ...novaTelemetriaZenkai(), vidaMax: 100000, danoRecebido: 50000, turnos: 10, fadigaPico: 60, razaoSoma: 10, razaoTurnos: 10 } }, poderes: a.poderes };
        const r = calcularZenkai(ficha, { vidaMaxBruta: 100000 });
        expect(r.ativo).toBe(true); expect(r.pct).toBeGreaterThan(0);
    });
    it('migracao ignora categoria vazia e valores estranhos', () => {
        expect(migrarHabilidadesDeRaca([null, 3, { modelo: { id: 'zenkai' } }, { categoria: '', modelo: { id: 'zenkai' } }]).mudou).toBe(false);
        expect(migrarHabilidadesDeRaca([{ categoria: 'Habilidades', modelo: { id: 'zenkai' } }]).poderes[0].categoria).toBe('habilidadeRaca');
    });
});

describe('(f) demais categorias intactas', () => {
    it('ids e apelidos antigos', () => {
        expect(['habilidade', 'forma', 'poder', 'ocular', 'infinity', 'singularidade'].every(id => CATEGORIAS_PODER.some(c => c.id === id))).toBe(true);
        expect(idCategoriaPoder('Habilidades')).toBe('habilidade');
        expect(idCategoriaPoder('Poderes Oculares')).toBe('ocular');
        expect(idCategoriaPoder('Infinities')).toBe('infinity');
        expect(idCategoriaPoder('Singularidades')).toBe('singularidade');
        expect(idCategoriaPoder('formas')).toBe('forma');
        expect(idCategoriaPoder('nada')).toBe('');
        expect(poderEhCopiavel({ categoria: 'singularidade' })).toBe(false);
        expect(poderEhCopiavel({ categoria: 'habilidade' })).toBe(true);
    });
    it('abas: habilidadeRaca so com poder dela ou Mestre', () => {
        const ids = (ficha, o) => categoriasVisiveisNaFicha(ficha, o).map(c => c.id);
        expect(ids({ poderes: [{ categoria: 'habilidade' }] })).not.toContain('habilidadeRaca');
        expect(ids({ poderes: [] }, { isMestre: true })).toContain('habilidadeRaca');
        expect(ids({ poderes: [hab([])] }, { isMestre: false })).toContain('habilidadeRaca');
        expect(ids({ poderes: [], hierarquia: { singularidade: 1 } }, { isMestre: false })).not.toContain('habilidadeRaca');
    });
    it('demais categorias nao sofrem restricao de raca', () => {
        ['habilidade', 'forma', 'poder', 'ocular', 'infinity', 'singularidade'].forEach((c) => {
            expect(verificarAcessoHabilidadeRaca({ cenario, ficha: f('Namekuseijin'), poder: { categoria: c, racasAcesso: ['saiyajin'] }, isMestre: false }).permitido).toBe(true);
            expect(poderRacaIncompativel(cenario, f('x'), { categoria: c })).toBe(false);
        });
    });
});

describe('(i/j) catalogo, texto livre e racaDeDragao', () => {
    it('renomear raca no catalogo nao quebra fichas com racaId', () => {
        const renomeado = { racas: [{ id: 'saiyajin', nome: 'Sayajin Puro' }] };
        expect(resolverRaca(renomeado, f('Saiyajin', 'saiyajin'))).toMatchObject({ id: 'saiyajin', nome: 'Sayajin Puro', cadastrada: true });
        expect(racaTemAcesso(renomeado, f('Saiyajin', 'saiyajin'), hab(['saiyajin']))).toBe(true);
    });
    it('racaIdAposEdicaoDeTexto', () => {
        expect(racaIdAposEdicaoDeTexto(undefined, '', 'a', 'Elfo')).toBe('');
        expect(racaIdAposEdicaoDeTexto(cenario, 'saiyajin', 'Saiyajin', 'Elfo')).toBe('');
        expect(racaIdAposEdicaoDeTexto(cenario, 'saiyajin', 'Saiyajin', 'Saiyajin')).toBe('saiyajin');
        expect(racaIdAposEdicaoDeTexto(cenario, '', 'x', 'namekuseijin')).toBe('namek');
    });
    it('classesMecanicas.racaDeDragao continua usando bio.raca (com ou sem racaId)', () => {
        expect(racaDeDragao({ bio: { raca: 'Dragão', racaId: 'dragao' } })).toBe(true);
        expect(racaDeDragao({ bio: { raca: 'Draconiano', racaId: '' } })).toBe(true);
        expect(racaDeDragao({ bio: { raca: 'Saiyajin', racaId: 'saiyajin' } })).toBe(false);
        expect(racaDeDragao({ bio: { racaId: 'dragao' } })).toBe(false);
        expect(riderMontado({ bio: { raca: 'Dragon' } })).toBe(false);
    });
});

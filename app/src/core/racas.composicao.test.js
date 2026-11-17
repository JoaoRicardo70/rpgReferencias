import { describe, it, expect } from 'vitest';
import { sanitizarRacas, getComposicaoRacial, racaTemAcesso, racasEfetivas, dominioDaRaca, poderBloqueado, poderUsavel, poderRacaIncompativel, motivoSemAcesso, racasQueDaoAcesso, descendentesDaRaca, limparReferenciasDeRaca } from './racas';
import { verificarAcessoHabilidadeRaca } from './racasAcesso';

const cenario = { racas: [
    { id: 'saiyajin', nome: 'Saiyajin' },
    { id: 'humano', nome: 'Humano' },
    { id: 'meio', nome: 'Meio-Saiyajin', herdaDe: 'saiyajin' },
    { id: 'primordial', nome: 'Primordial', acessoTotalDescendentes: true },
    { id: 'filha', nome: 'Filha', descendeDe: 'primordial' },
    { id: 'neta', nome: 'Neta', descendeDe: 'filha' },
    { id: 'bisneta', nome: 'Bisneta', descendeDe: 'neta' },
] };
const hab = (acesso, extra = {}) => ({ id: 1, nome: 'H', categoria: 'habilidadeRaca', racasAcesso: acesso, ...extra });
const ficha = (comp, bio = {}) => ({ bio: { raca: 'Saiyajin', racaId: 'saiyajin', ...(comp ? { composicaoRacial: comp } : {}), ...bio } });

describe('composição racial', () => {
    it('derivada: raça principal a 100%; sem raça = []', () => {
        expect(getComposicaoRacial(cenario, ficha(null)).map(e => [e.racaId, e.percentual, e.origem])).toEqual([['saiyajin', 100, 'nativa']]);
        expect(getComposicaoRacial(cenario, { bio: { raca: 'Elfo' } })).toEqual([]);
        expect(getComposicaoRacial(cenario, ficha([]))).toHaveLength(1);
        expect(getComposicaoRacial(cenario, ficha(null, { raca: 'saiyajin', racaId: '' }))[0].racaId).toBe('saiyajin');
    });
    it('explícita: normaliza, clamp, sem repetir, ids válidos; tudo inválido cai na derivada', () => {
        const c = getComposicaoRacial(cenario, ficha([{ racaId: 'humano', percentual: 150 }, { racaId: 'humano', percentual: 5 }, { racaId: 'x', percentual: 5 }, { racaId: 'saiyajin', percentual: -4, origem: 'adquirida' }, { racaId: 'meio', percentual: 'abc', origem: 'adquirida' }]));
        expect(c.map(e => [e.racaId, e.percentual])).toEqual([['humano', 100], ['saiyajin', 0], ['meio', 10]]);
        expect(getComposicaoRacial(cenario, ficha([{ racaId: 'x', percentual: 5 }]))[0].racaId).toBe('saiyajin');
    });
    it('aceita objeto vindo do Firebase e calcula o Domínio', () => {
        expect(getComposicaoRacial(cenario, ficha({ 0: { racaId: 'humano', percentual: 40 } }))[0].percentual).toBe(40);
        expect(dominioDaRaca(cenario, ficha([{ racaId: 'humano', percentual: 40 }]), 'humano')).toBe(40);
        expect(dominioDaRaca(cenario, ficha([{ racaId: 'humano', percentual: 40 }]), 'saiyajin')).toBe(0);
    });
});

describe('percentual mínimo', () => {
    it('49% bloqueia, 50% libera (mínimo 50)', () => {
        const p = hab(['saiyajin'], { percentualMinimo: 50 });
        expect(racaTemAcesso(cenario, ficha([{ racaId: 'saiyajin', percentual: 49 }]), p)).toBe(false);
        expect(racaTemAcesso(cenario, ficha([{ racaId: 'saiyajin', percentual: 50 }]), p)).toBe(true);
        expect(poderBloqueado(cenario, ficha([{ racaId: 'saiyajin', percentual: 49 }]), p)).toMatchObject({ bloqueado: true, origem: 'percentual', selo: '🔒 Domínio insuficiente (49% de 50%)' });
        expect(poderUsavel(ficha([{ racaId: 'saiyajin', percentual: 50 }]), cenario, p)).toBe(true);
        expect(poderUsavel(ficha([{ racaId: 'saiyajin', percentual: 49 }]), cenario, p)).toBe(false);
        expect(motivoSemAcesso(cenario, ficha([{ racaId: 'saiyajin', percentual: 49 }]), p)).toMatch(/49%.*50%/);
    });
    it('sem composição = 100% (comportamento atual); mínimo 0 sempre passa', () => {
        expect(racaTemAcesso(cenario, ficha(null), hab(['saiyajin'], { percentualMinimo: 100 }))).toBe(true);
        expect(racaTemAcesso(cenario, ficha([{ racaId: 'saiyajin', percentual: 0 }]), hab(['saiyajin']))).toBe(true);
    });
    it('mestiço 70/30 com mínimos diferentes', () => {
        const f = ficha([{ racaId: 'saiyajin', percentual: 70 }, { racaId: 'humano', percentual: 30 }]);
        expect(racaTemAcesso(cenario, f, hab(['saiyajin'], { percentualMinimo: 60 }))).toBe(true);
        expect(racaTemAcesso(cenario, f, hab(['humano'], { percentualMinimo: 60 }))).toBe(false);
        expect(racaTemAcesso(cenario, f, hab(['humano'], { percentualMinimo: 30 }))).toBe(true);
        expect(racasQueDaoAcesso(cenario, f, hab(['saiyajin', 'humano'], { percentualMinimo: 50 })).map(e => e.racaId)).toEqual(['saiyajin']);
        expect(poderRacaIncompativel(cenario, f, hab(['humano'], { percentualMinimo: 60 }))).toBe(false);
    });
    it('raça adquirida a 10% sobe com a prática', () => {
        const p = hab(['humano'], { percentualMinimo: 20 });
        expect(racaTemAcesso(cenario, ficha([{ racaId: 'saiyajin', percentual: 100 }, { racaId: 'humano', percentual: 10, origem: 'adquirida' }]), p)).toBe(false);
        expect(racaTemAcesso(cenario, ficha([{ racaId: 'saiyajin', percentual: 100 }, { racaId: 'humano', percentual: 20, origem: 'adquirida' }]), p)).toBe(true);
    });
    it('herdaDe respeita o percentual da raça da composição', () => {
        expect(racaTemAcesso(cenario, ficha([{ racaId: 'meio', percentual: 40 }]), hab(['saiyajin'], { percentualMinimo: 50 }))).toBe(false);
        expect(racaTemAcesso(cenario, ficha([{ racaId: 'meio', percentual: 60 }]), hab(['saiyajin'], { percentualMinimo: 50 }))).toBe(true);
    });
});

describe('Primordial e genealogia', () => {
    it('Primordial acessa descendentes em 3 níveis e as próprias; descendentes não acessam a da Primordial', () => {
        const f = ficha(null, { raca: 'Primordial', racaId: 'primordial' });
        ['primordial', 'filha', 'neta', 'bisneta'].forEach(id => expect(racaTemAcesso(cenario, f, hab([id]))).toBe(true));
        expect(racaTemAcesso(cenario, f, hab(['saiyajin']))).toBe(false);
        const fi = ficha(null, { raca: 'Filha', racaId: 'filha' });
        expect(racaTemAcesso(cenario, fi, hab(['primordial']))).toBe(false);
        expect(racaTemAcesso(cenario, fi, hab(['neta']))).toBe(false);
    });
    it('herdaDe e descendeDe independentes; sem a marca, descendeDe não dá acesso', () => {
        expect(racasEfetivas(cenario, 'meio')).toEqual(['meio', 'saiyajin']);
        expect(racasEfetivas(cenario, 'filha')).toEqual(['filha']);
        expect(racasEfetivas(cenario, 'primordial')).toEqual(['primordial', 'filha', 'neta', 'bisneta']);
        expect(racasEfetivas(cenario, { racaId: 'nada' })).toEqual([]);
        const sem = { racas: cenario.racas.map(r => ({ ...r, acessoTotalDescendentes: false })) };
        expect(racaTemAcesso(sem, ficha(null, { raca: 'Primordial', racaId: 'primordial' }), hab(['filha']))).toBe(false);
    });
    it('ciclos e auto-referência de descendeDe são cortados', () => {
        const s = sanitizarRacas([{ id: 'a', nome: 'A', descendeDe: 'b' }, { id: 'b', nome: 'B', descendeDe: 'a' }, { id: 'c', nome: 'C', descendeDe: 'c' }]);
        expect(s[0].descendeDe === '' || s[1].descendeDe === '').toBe(true);
        expect(s[2].descendeDe).toBe('');
        expect(() => descendentesDaRaca({ racas: s }, 'a')).not.toThrow();
        expect(sanitizarRacas([{ nome: 'X', acessoTotalDescendentes: 'sim' }])[0].acessoTotalDescendentes).toBe(false);
    });
    it('limparReferenciasDeRaca limpa descendeDe', () => {
        const r = limparReferenciasDeRaca('primordial', { racas: cenario.racas });
        expect(r.racas.find(x => x.id === 'filha').descendeDe).toBe('');
    });
});

describe('bloqueio e exceção', () => {
    it('exceção ignora o mínimo mas não o bloqueio manual', () => {
        const f = ficha([{ racaId: 'saiyajin', percentual: 5 }]);
        const p = hab(['saiyajin'], { percentualMinimo: 50, racaExcecao: true });
        expect(poderBloqueado(cenario, f, p).bloqueado).toBe(false);
        const pb = { ...p, bloqueio: { ativo: true, requisito: 'Despertar', motivo: 'Lacrada' } };
        expect(poderBloqueado(cenario, f, pb)).toMatchObject({ bloqueado: true, origem: 'manual', requisito: 'Despertar', selo: '🔒 Bloqueada' });
        expect(poderBloqueado(cenario, f, pb).motivo).toMatch(/Lacrada.*Despertar/);
        expect(poderUsavel(f, cenario, pb)).toBe(false);
        expect(poderUsavel(f, cenario, { ...pb, bloqueio: { ativo: false } })).toBe(true);
    });
    it('outras categorias e entradas vazias nunca bloqueiam', () => {
        expect(poderBloqueado(cenario, ficha(null), { categoria: 'poder', bloqueio: { ativo: true }, percentualMinimo: 90 }).bloqueado).toBe(false);
        expect(poderUsavel(null, null, null)).toBe(true);
        expect(poderUsavel({}, {}, hab(['saiyajin']))).toBe(true);
    });
    it('sem nenhuma raça com acesso: incompatível (não bloqueada por percentual)', () => {
        const f = ficha([{ racaId: 'humano', percentual: 5 }]);
        const p = hab(['saiyajin'], { percentualMinimo: 50 });
        expect(poderRacaIncompativel(cenario, f, p)).toBe(true);
        expect(poderBloqueado(cenario, f, p).bloqueado).toBe(false);
    });
    it('verificarAcessoHabilidadeRaca: tem a raça mas percentual baixo = permitido (concedida bloqueada)', () => {
        const f = ficha([{ racaId: 'saiyajin', percentual: 10 }]);
        expect(verificarAcessoHabilidadeRaca({ cenario, ficha: f, poder: hab(['saiyajin'], { percentualMinimo: 50 }), isMestre: false })).toMatchObject({ permitido: true, dominioInsuficiente: true });
        expect(verificarAcessoHabilidadeRaca({ cenario, ficha: f, poder: hab(['humano']), isMestre: false }).permitido).toBe(false);
    });
});

import { describe, it, expect } from 'vitest';
import {
    NIVEIS, ROTULO_RACA_OCULTA, nivelDaRaca, visivelPara, contextoDoViewer, composicaoVisivel, racasDesconhecidasDoDono, racaPrincipalVisivel,
    racaOcultaParaViewer, habilidadeRevelaRaca, sanitizarVisibilidade, nivelPermitidoAoJogador, mascararTextoRaca, motivoSemAcessoVisivel,
    poderBloqueadoVisivel, habilidadeComRacaOcultaDoJogador, VIEWER_MESTRE, VIEWER_OUTRO_JOGADOR, VIEWER_DONO_JOGADOR, MENSAGEM_SEM_ACESSO_GENERICA,
} from './racasVisibilidade';
import { racaTemAcesso, poderBloqueado, getComposicaoRacial } from './racas';
import { verificarAcessoHabilidadeRaca } from './racasAcesso';

const cenario = { racas: [{ id: 'saiyajin', nome: 'Saiyajin', apelidos: ['Macaco'] }, { id: 'humano', nome: 'Humano' }, { id: 'namek', nome: 'Namek' }] };
const ficha = (vis, extra = {}) => ({
    bio: { raca: 'Saiyajin', racaId: 'saiyajin', composicaoRacial: [{ racaId: 'saiyajin', percentual: 70, origem: 'nativa' }, { racaId: 'humano', percentual: 30, origem: 'adquirida' }], ...(vis ? { racaVisibilidade: vis } : {}) },
    ...extra,
});
const hab = (extra = {}) => ({ id: 1, nome: 'Zenkai', categoria: 'habilidadeRaca', racasAcesso: ['saiyajin'], percentualMinimo: 50, ...extra });

describe('visivelPara: matriz dono x Mestre x outro jogador', () => {
    const casos = [
        ['publica', { souDono: true }, true], ['publica', {}, true], ['publica', { souMestre: true }, true],
        ['privada', { souDono: true }, true], ['privada', {}, false], ['privada', { souMestre: true }, true],
        ['secreta', { souDono: true }, false], ['secreta', {}, false], ['secreta', { souMestre: true }, true],
    ];
    it.each(casos)('%s para %j = %s', (nivel, quem, esperado) => { expect(visivelPara({ nivel, ...quem })).toBe(esperado); });
    it('constantes', () => { expect(NIVEIS).toEqual(['publica', 'privada', 'secreta']); });
});

describe('nivelDaRaca / contextoDoViewer', () => {
    it('ausente ou inválido = publica', () => {
        expect(nivelDaRaca(ficha(), 'saiyajin')).toBe('publica');
        expect(nivelDaRaca(ficha({ saiyajin: 'xpto' }), 'saiyajin')).toBe('publica');
        expect(nivelDaRaca(null, 'saiyajin')).toBe('publica');
        expect(nivelDaRaca(ficha({ saiyajin: 'secreta' }), 'saiyajin')).toBe('secreta');
    });
    it('dono por nome sanitizado; isMestre só com true', () => {
        expect(contextoDoViewer({ nomeDono: 'Goku', meuNome: 'Goku', isMestre: false })).toEqual({ souDono: true, souMestre: false });
        expect(contextoDoViewer({ nomeDono: 'Goku', meuNome: 'Vegeta', isMestre: true })).toEqual({ souDono: false, souMestre: true });
        expect(contextoDoViewer({ souDono: true })).toEqual({ souDono: true, souMestre: false });
        expect(contextoDoViewer({})).toEqual({ souDono: false, souMestre: false });
    });
});

describe('composicaoVisivel / racaPrincipalVisivel', () => {
    const f = ficha({ humano: 'privada', saiyajin: 'secreta' });
    it('Mestre vê tudo; dono só o que não é secreto; outro só o público', () => {
        expect(composicaoVisivel(cenario, f, VIEWER_MESTRE)).toHaveLength(2);
        expect(composicaoVisivel(cenario, f, VIEWER_DONO_JOGADOR).map(e => e.racaId)).toEqual(['humano']);
        expect(composicaoVisivel(cenario, f, VIEWER_OUTRO_JOGADOR)).toHaveLength(0);
    });
    it('sem racaVisibilidade nada muda', () => {
        expect(composicaoVisivel(cenario, ficha(), VIEWER_OUTRO_JOGADOR)).toEqual(getComposicaoRacial(cenario, ficha()));
    });
    it('dono vê "Raça desconhecida" por secreta; outros nem sabem', () => {
        expect(racasDesconhecidasDoDono(cenario, f, VIEWER_DONO_JOGADOR).map(e => e.racaId)).toEqual(['saiyajin']);
        expect(racasDesconhecidasDoDono(cenario, f, VIEWER_OUTRO_JOGADOR)).toEqual([]);
        expect(racasDesconhecidasDoDono(cenario, f, VIEWER_MESTRE)).toEqual([]);
    });
    it('principal: motivo e texto', () => {
        expect(racaPrincipalVisivel(cenario, f, VIEWER_DONO_JOGADOR)).toMatchObject({ oculta: true, motivo: 'secreta', texto: ROTULO_RACA_OCULTA });
        expect(racaPrincipalVisivel(cenario, ficha({ saiyajin: 'privada' }), VIEWER_OUTRO_JOGADOR)).toMatchObject({ oculta: true, motivo: 'privada' });
        expect(racaPrincipalVisivel(cenario, ficha({ saiyajin: 'privada' }), VIEWER_DONO_JOGADOR)).toMatchObject({ oculta: false, texto: 'Saiyajin' });
        expect(racaPrincipalVisivel(cenario, f, VIEWER_MESTRE)).toMatchObject({ oculta: false, texto: 'Saiyajin' });
    });
    it('texto livre usa _principal; sem raça nada a ocultar', () => {
        const livre = { bio: { raca: 'Alienígena', racaVisibilidade: { _principal: 'secreta' } } };
        expect(racaPrincipalVisivel(cenario, livre, VIEWER_DONO_JOGADOR).oculta).toBe(true);
        expect(racaPrincipalVisivel(cenario, { bio: {} }, VIEWER_OUTRO_JOGADOR)).toMatchObject({ oculta: false, texto: '' });
    });
    it('racaOcultaParaViewer', () => {
        expect(racaOcultaParaViewer(cenario, f, 'humano', VIEWER_OUTRO_JOGADOR)).toBe(true);
        expect(racaOcultaParaViewer(cenario, f, 'humano', VIEWER_DONO_JOGADOR)).toBe(false);
    });
});

describe('habilidadeRevelaRaca e máscaras', () => {
    const f = ficha({ saiyajin: 'secreta' });
    it('revela quando o acesso passa por Raça que o viewer não vê', () => {
        expect(habilidadeRevelaRaca(cenario, f, hab(), VIEWER_DONO_JOGADOR)).toBe(true);
        expect(habilidadeRevelaRaca(cenario, f, hab(), VIEWER_MESTRE)).toBe(false);
        expect(habilidadeRevelaRaca(cenario, f, hab({ racasAcesso: ['humano'] }), VIEWER_DONO_JOGADOR)).toBe(false);
        expect(habilidadeRevelaRaca(cenario, f, { categoria: 'habilidade', racasAcesso: ['saiyajin'] }, VIEWER_DONO_JOGADOR)).toBe(false);
        expect(habilidadeComRacaOcultaDoJogador(cenario, f, hab())).toBe(true);
    });
    it('privada: o dono vê, outro jogador não', () => {
        const p = ficha({ saiyajin: 'privada' });
        expect(habilidadeRevelaRaca(cenario, p, hab(), VIEWER_DONO_JOGADOR)).toBe(false);
        expect(habilidadeRevelaRaca(cenario, p, hab(), VIEWER_OUTRO_JOGADOR)).toBe(true);
    });
    it('mascararTextoRaca troca nome e apelido ocultos', () => {
        expect(mascararTextoRaca(cenario, f, 'Domínio de Saiyajin e Macaco; Humano ok', VIEWER_DONO_JOGADOR)).toBe(`Domínio de ${ROTULO_RACA_OCULTA} e ${ROTULO_RACA_OCULTA}; Humano ok`);
        expect(mascararTextoRaca(cenario, f, 'Saiyajin', VIEWER_MESTRE)).toBe('Saiyajin');
        expect(mascararTextoRaca(cenario, ficha(), 'Saiyajin', VIEWER_OUTRO_JOGADOR)).toBe('Saiyajin');
    });
    it('motivo e bloqueio genéricos, mecânica real intacta', () => {
        const baixa = ficha({ saiyajin: 'secreta' });
        baixa.bio.composicaoRacial[0].percentual = 20;
        expect(poderBloqueado(cenario, baixa, hab()).bloqueado).toBe(true);
        const v = poderBloqueadoVisivel(cenario, baixa, hab(), VIEWER_DONO_JOGADOR);
        expect(v.bloqueado).toBe(true);
        expect(v.selo).toBe('🔒 Bloqueada');
        expect(JSON.stringify(v)).not.toMatch(/Saiyajin|20%|50%/);
        expect(poderBloqueadoVisivel(cenario, baixa, hab(), VIEWER_MESTRE).selo).toMatch(/Domínio insuficiente \(20% de 50%\)/);
        const naoTem = ficha({ humano: 'secreta' });
        naoTem.bio.composicaoRacial = [{ racaId: 'humano', percentual: 100, origem: 'nativa' }];
        naoTem.bio.raca = 'Humano';
        naoTem.bio.racaId = 'humano';
        expect(motivoSemAcessoVisivel(cenario, naoTem, hab(), VIEWER_DONO_JOGADOR)).toBe(MENSAGEM_SEM_ACESSO_GENERICA);
        expect(motivoSemAcessoVisivel(cenario, naoTem, hab(), VIEWER_MESTRE)).toMatch(/Humano/);
    });
    it('verificarAcessoHabilidadeRaca: mensagem genérica ao jogador, decisão igual', () => {
        const naoTem = { bio: { raca: 'Humano', racaId: 'humano', racaVisibilidade: { humano: 'secreta' } } };
        const jogador = verificarAcessoHabilidadeRaca({ cenario, ficha: naoTem, poder: hab(), isMestre: false });
        expect(jogador.permitido).toBe(false);
        expect(jogador.mensagem).not.toMatch(/Humano|Saiyajin/);
        const mestre = verificarAcessoHabilidadeRaca({ cenario, ficha: naoTem, poder: hab(), isMestre: true });
        expect(mestre.precisaConfirmarExcecao).toBe(true);
        expect(mestre.mensagem).toMatch(/Humano/);
        expect(racaTemAcesso(cenario, naoTem, hab())).toBe(false);
    });
});

describe('sanitizarVisibilidade / nivelPermitidoAoJogador', () => {
    it('limpa chaves e níveis inválidos e descarta publica', () => {
        expect(sanitizarVisibilidade({ saiyajin: 'secreta', humano: 'publica', 'x y': 'privada', namek: 'zzz', _principal: 'privada' })).toEqual({ saiyajin: 'secreta', _principal: 'privada' });
        expect(sanitizarVisibilidade(null)).toEqual({});
        expect(sanitizarVisibilidade([1])).toEqual({});
    });
    it('jogador só alterna publica e privada e nunca mexe em secreta', () => {
        expect(nivelPermitidoAoJogador('publica', 'privada')).toBe(true);
        expect(nivelPermitidoAoJogador('privada', 'publica')).toBe(true);
        expect(nivelPermitidoAoJogador('publica', 'secreta')).toBe(false);
        expect(nivelPermitidoAoJogador('secreta', 'publica')).toBe(false);
        expect(nivelPermitidoAoJogador('secreta', 'privada')).toBe(false);
        expect(nivelPermitidoAoJogador(undefined, 'privada')).toBe(true);
    });
});

describe('placeholder só para o dono, fail-closed e motivo por viewer', () => {
    it('terceiro não vê nem o placeholder', () => {
        expect(racaPrincipalVisivel(cenario, ficha({ saiyajin: 'privada' }), VIEWER_OUTRO_JOGADOR)).toMatchObject({ oculta: true, texto: '' });
        expect(racaPrincipalVisivel(cenario, ficha({ saiyajin: 'secreta' }), VIEWER_OUTRO_JOGADOR)).toMatchObject({ oculta: true, texto: '' });
        expect(racaPrincipalVisivel(cenario, ficha({ saiyajin: 'secreta' }), VIEWER_DONO_JOGADOR).texto).toBe(ROTULO_RACA_OCULTA);
    });
    it('motivo útil quando o viewer vê as Raças; genérico quando oculta', () => {
        const hum = (vis) => ({ bio: { raca: 'Humano', racaId: 'humano', ...(vis ? { racaVisibilidade: vis } : {}) } });
        expect(motivoSemAcessoVisivel(cenario, hum({ humano: 'privada' }), hab(), VIEWER_DONO_JOGADOR)).toMatch(/Humano/);
        expect(motivoSemAcessoVisivel(cenario, hum({ humano: 'privada' }), hab(), VIEWER_OUTRO_JOGADOR)).toBe(MENSAGEM_SEM_ACESSO_GENERICA);
        const r = verificarAcessoHabilidadeRaca({ cenario, ficha: hum({ humano: 'privada' }), poder: hab(), isMestre: false });
        expect(r.mensagem).toMatch(/Humano/);
        const s = verificarAcessoHabilidadeRaca({ cenario, ficha: hum({ humano: 'secreta' }), poder: hab(), isMestre: false });
        expect(s.mensagem).not.toMatch(/Humano/);
    });
});

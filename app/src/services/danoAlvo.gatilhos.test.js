import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./firebase-sync', () => ({
    salvarCamposPersonagem: vi.fn(), salvarDummie: vi.fn(),
    aplicarDanoDireto: vi.fn(), aplicarFadigaDireta: vi.fn(), aplicarElementoDireto: vi.fn(), aplicarElementoNivelDireto: vi.fn(),
}));

import { salvarCamposPersonagem, salvarDummie, aplicarDanoDireto } from './firebase-sync';
import { absorverEmPersonagem, gravarDanoEmPersonagem, gravarVidaDoAlvo, aplicarDanoEmPersonagem } from './danoAlvo';
import { criarPosGolpe } from './posGolpe';
import useStore from '../stores/useStore';

// Dano em OUTRO personagem (Ataque e Dano Rapido) com gatilhos do alvo, Imunidade total e fichas sem nada disso (transparencia).

const F = 1000;
const NEGAR_MORTE = { id: 'nm', nome: 'Negar morte', evento: { tipo: 'danoQueZeraria' }, condicoes: ['vida_maior_que:1'], limite: { max: 1, por: 'cena' }, acoes: [{ tipo: 'anularDano' }, { tipo: 'definirVida', valor: 1 }] };
const ficha = (extra = {}) => ({ vida: { atual: 500 * F }, poderes: [], inventario: [], passivas: [], ...extra });
const comNegar = () => ficha({ poderes: [{ id: 'p1', nome: 'Poder', ativa: true, gatilhos: [NEGAR_MORTE] }] });
const God = { turnosRestantes: 1, origem: 'x' };

beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState({ personagens: {}, cenario: { ativa: 'cena1' } });
});

describe('absorverEmPersonagem com Imunidade total', () => {
    it('nada e absorvido nem gravado; resto 0 e texto avisa', () => {
        const r = absorverEmPersonagem('Ana', ficha({ combate: { imunidadeTotal: God }, escudos: [{ id: 'a', nome: 'D', valor: 100, tipo: 'escudo' }] }), 40, 'Ana');
        expect(r).toMatchObject({ restante: 0, absorvido: 0, imune: true });
        expect(r.texto).toContain('Imunidade total');
        expect(salvarCamposPersonagem).not.toHaveBeenCalled();
    });
});

describe('gravarDanoEmPersonagem - transparente sem gatilhos', () => {
    it('so a vida/fadiga/elemento de sempre; nenhuma escrita de campos extras', () => {
        const r = gravarDanoEmPersonagem('Ana', ficha(), 100 * F, { elemento: 'fogo' });
        expect(aplicarDanoDireto).toHaveBeenCalledWith('Ana', 100 * F);
        expect(salvarCamposPersonagem).not.toHaveBeenCalled();
        expect(r).toEqual({ textos: [], vidaFinalBruta: 100 * F });
    });
});

describe('gravarDanoEmPersonagem - Ataque contra jogador com Negar morte', () => {
    it('executa o gatilho sobre a ficha mais fresca e grava so os campos tocados', () => {
        useStore.setState({ personagens: { Ana: comNegar() } });
        const r = gravarDanoEmPersonagem('Ana', ficha(), 0, { elemento: 'fogo', nomeNoFeed: 'Ana' });
        expect(aplicarDanoDireto).toHaveBeenCalledWith('Ana', 1 * F);
        const campos = salvarCamposPersonagem.mock.calls[0][1];
        expect(Object.keys(campos).sort()).toEqual(['combate/usosPoderes']);
        expect(JSON.stringify(campos)).not.toContain('undefined');
        expect(r.textos.join(' ')).toContain('Negar morte segurou em 1 de vida');
    });
    it('Dano que nao zera nao dispara nem grava campos extras', () => {
        useStore.setState({ personagens: { Ana: comNegar() } });
        gravarDanoEmPersonagem('Ana', ficha(), 400 * F);
        expect(aplicarDanoDireto).toHaveBeenCalledWith('Ana', 400 * F);
        expect(salvarCamposPersonagem).not.toHaveBeenCalled();
    });
    it('gravarVidaDoAlvo devolve os textos e o posGolpe os leva ao resumo do golpe', () => {
        useStore.setState({ personagens: { Ana: comNegar() } });
        const alvo = { isPersonagem: true, personagemNome: 'Ana', nome: 'Ana', ficha: ficha() };
        const pg = criarPosGolpe({ estados: [], danoOriginal: 9999, nomeAtacante: 'Eu' });
        pg.adicionarTextos(gravarVidaDoAlvo('Ana', alvo, 0, { elemento: 'fogo' }));
        expect(pg.resultado().textos.join(' ')).toContain('🔔 Negar morte segurou em 1 de vida');
        pg.adicionarTextos(undefined); // resultado ausente (mocks) nao quebra
    });
    it('Dummie sem ficha segue o fluxo antigo', () => {
        const r = gravarVidaDoAlvo('d1', { isDummie: true, nome: 'Boneco', hpAtual: 100 }, 40);
        expect(salvarDummie).toHaveBeenCalledWith('d1', expect.objectContaining({ hpAtual: 40 }));
        expect(r).toEqual({ textos: [], vidaFinalBruta: 40 });
    });
});

describe('aplicarDanoEmPersonagem (Dano Rapido em outro jogador)', () => {
    it('sem gatilhos e sem Imunidade: igual a antes (escudo, depois a vida)', () => {
        const a = ficha({ escudos: [{ id: 'a', nome: 'Domo', valor: 30, tipo: 'escudo' }] });
        const r = aplicarDanoEmPersonagem('Ana', a, 100, 100 * F, {});
        expect(r.texto).toContain('Ana absorveu 30');
        expect(aplicarDanoDireto).toHaveBeenCalledWith('Ana', (500 - 70) * F);
    });
    it('Imunidade total: a vida fica como estava', () => {
        const a = ficha({ combate: { imunidadeTotal: God } });
        const r = aplicarDanoEmPersonagem('Ana', a, 100, 100 * F, {});
        expect(r.texto).toContain('Imunidade total');
        expect(aplicarDanoDireto).toHaveBeenCalledWith('Ana', 500 * F);
    });
});

describe('Revisao Fase 1 - escudos, Vida final e idempotencia', () => {
    const comEscudoGatilho = () => ficha({
        escudos: [{ id: 'a', nome: 'Domo', valor: 100, tipo: 'escudo' }],
        poderes: [{ id: 'p1', nome: 'Poder', ativa: true, gatilhos: [{ id: 'g', nome: 'Reacao', evento: { tipo: 'danoQueZeraria' }, acoes: [{ tipo: 'escudo', nome: 'Extra', valor: 30 }] }] }],
        vida: { atual: 100000 * F },
    });
    it('absorverEmPersonagem devolve escudosNovos e o escudo do gatilho SOMA a absorcao (40 + novo)', () => {
        const f = comEscudoGatilho();
        useStore.setState({ personagens: { Ana: f } });
        const abs = absorverEmPersonagem('Ana', f, 60, 'Ana');
        expect(abs.escudosNovos).toEqual([expect.objectContaining({ id: 'a', valor: 40 })]);
        vi.clearAllMocks();
        gravarDanoEmPersonagem('Ana', f, 0, { escudosNovos: abs.escudosNovos });
        const campos = salvarCamposPersonagem.mock.calls.find(c => c[1].escudos)[1];
        expect(campos.escudos.map(e => [e.id, e.valor])).toEqual([['a', 40], ['esc_g_p1:g', 30]]);
        expect(campos.escudos[1].poderId).toBe('p1');
    });
    it('gravarVidaDoAlvo devolve a Vida final; com Negar morte o alvo sobrevive', () => {
        useStore.setState({ personagens: { Ana: comNegar() } });
        const alvo = { isPersonagem: true, personagemNome: 'Ana', nome: 'Ana', ficha: ficha() };
        const r = gravarVidaDoAlvo('Ana', alvo, 0);
        expect(r.vidaFinalBruta).toBe(1 * F);
        expect(r.textos.length).toBeGreaterThan(0);
        const semGatilho = gravarVidaDoAlvo('Ana', { ...alvo, personagemNome: 'Bia', ficha: ficha() }, 0);
        expect(semGatilho).toEqual({ textos: [], vidaFinalBruta: 0 });
    });
    it('eventoId real grava ultimoEvento; sem ele nao grava', () => {
        useStore.setState({ personagens: { Ana: comNegar() } });
        gravarDanoEmPersonagem('Ana', ficha(), 0, { eventoId: 'golpe_1' });
        const campos = salvarCamposPersonagem.mock.calls[0][1];
        expect(campos['combate/gatilhos']['p1:nm']).toEqual({ ultimoEvento: 'golpe_1' });
    });
});

describe('posGolpe - God Mode do alvo ignora TUDO', () => {
    const estados = [{ id: 'sangrando', stacks: 1 }];
    it('com Imunidade total: dano 0, sem estados, sem ao acertar, sem efeito no atacante', () => {
        useStore.setState({ personagens: { Ana: ficha({ combate: { imunidadeTotal: God } }) } });
        const alvo = { isPersonagem: true, personagemNome: 'Ana', nome: 'Ana', ficha: ficha() };
        const pg = criarPosGolpe({ estados, danoOriginal: 100, nomeAtacante: 'Eu', aoAcertar: [{ tipo: 'curarAtacante', valor: 10 }] });
        expect(pg.aplicar('Ana', alvo, 100)).toBe(0);
        const r = pg.resultado();
        expect(r.textos.join(' ')).toContain('Ana está com Imunidade total: o golpe não surtiu efeito');
        expect(r.aoAcertar).toEqual([]);
        expect(r.danoAtacante).toBe(0);
        expect(salvarCamposPersonagem).not.toHaveBeenCalled();
        expect(pg.alvoParaGravar('Ana', alvo)).toBe(alvo);
    });
    it('sem Imunidade total o dano passa inalterado', () => {
        useStore.setState({ personagens: { Ana: ficha() } });
        const alvo = { isPersonagem: true, personagemNome: 'Ana', nome: 'Ana', ficha: ficha() };
        const pg = criarPosGolpe({ estados: [], danoOriginal: 100, nomeAtacante: 'Eu', aoAcertar: [{ tipo: 'curarAtacante', valor: 10 }] });
        expect(pg.aplicar('Ana', alvo, 100)).toBe(100);
        expect(pg.resultado().aoAcertar).toHaveLength(1);
    });
});

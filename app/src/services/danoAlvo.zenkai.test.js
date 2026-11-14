import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./firebase-sync', () => ({
    salvarCamposPersonagem: vi.fn(), salvarDummie: vi.fn(),
    aplicarDanoDireto: vi.fn(), aplicarFadigaDireta: vi.fn(), aplicarElementoDireto: vi.fn(), aplicarElementoNivelDireto: vi.fn(),
}));
vi.mock('../core/gavetaNpc', () => ({ getVidaMaxBrutaNpc: vi.fn(() => 1000000) }));

import { salvarCamposPersonagem, aplicarDanoDireto } from './firebase-sync';
import { gravarDanoEmPersonagem } from './danoAlvo';
import useStore from '../stores/useStore';
import { novaTelemetriaZenkai } from '../core/zenkai';

// Zenkai do ALVO-personagem: o dano que o Ataque/Dano Rapido grava em outro jogador entra na telemetria dele (combate/zenkai), com ou sem gatilhos.

const F = 1000;
const comZenkai = (extra = {}) => ({ vida: { atual: 500 * F }, poderes: [], inventario: [], passivas: [], combate: { zenkaiLigado: true, zenkai: { ...novaTelemetriaZenkai(), vidaMax: 1000 * F } }, ...extra });
const NEGAR_MORTE = { id: 'nm', nome: 'Negar morte', evento: { tipo: 'danoQueZeraria' }, condicoes: ['vida_maior_que:1'], limite: { max: 1, por: 'cena' }, acoes: [{ tipo: 'anularDano' }, { tipo: 'definirVida', valor: 1 }] };

beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState({ personagens: {}, cenario: { ativa: 'cena1' } });
});

describe('gravarDanoEmPersonagem + Zenkai', () => {
    it('sem gatilhos: grava a Vida de sempre E combate/zenkai (dano e Vida minima), sem mutar a ficha local', () => {
        const alvo = comZenkai();
        useStore.setState({ personagens: { Ana: alvo } });
        gravarDanoEmPersonagem('Ana', alvo, 200 * F, { nomeNoFeed: 'Ana' });
        expect(aplicarDanoDireto).toHaveBeenCalledWith('Ana', 200 * F);
        const campos = salvarCamposPersonagem.mock.calls.find(([, c]) => 'combate/zenkai/danoRecebido' in c)[1];
        // so os campos alterados (caminhos aninhados), nunca o no inteiro
        expect(campos).toEqual({ 'combate/zenkai/danoRecebido': 300 * F, 'combate/zenkai/vidaMinimaFracao': 0.2 });
        expect(campos).not.toHaveProperty('combate/zenkai');
        expect(alvo.combate.zenkai.danoRecebido).toBe(0);
    });
    it('Zenkai desligado (ou telemetria fechada): nenhuma escrita extra (transparencia)', () => {
        const a = comZenkai(); a.combate.zenkaiLigado = false;
        gravarDanoEmPersonagem('Ana', a, 200 * F, {});
        const b = comZenkai(); delete b.combate.zenkai;
        gravarDanoEmPersonagem('Bia', b, 200 * F, {});
        expect(salvarCamposPersonagem).not.toHaveBeenCalled();
    });
    it('dano auto-infligido (Dano Rapido de si em si) nao conta', () => {
        const alvo = comZenkai();
        useStore.setState({ personagens: { Ana: alvo } });
        gravarDanoEmPersonagem('Ana', alvo, 200 * F, { autoInfligido: true });
        expect(salvarCamposPersonagem).not.toHaveBeenCalled();
    });
    it('dano 0 (tudo absorvido): nada a registrar', () => {
        const alvo = comZenkai();
        useStore.setState({ personagens: { Ana: alvo } });
        gravarDanoEmPersonagem('Ana', alvo, 500 * F, {});
        expect(salvarCamposPersonagem).not.toHaveBeenCalled();
    });
    it('com gatilhos: o dano e registrado pelo ponto unico e vai junto dos campos tocados', () => {
        const alvo = comZenkai({ poderes: [{ id: 'p1', nome: 'Poder', ativa: true, gatilhos: [NEGAR_MORTE] }] });
        useStore.setState({ personagens: { Ana: alvo } });
        gravarDanoEmPersonagem('Ana', alvo, 100 * F, { nomeNoFeed: 'Ana' });
        const campos = salvarCamposPersonagem.mock.calls.map(([, c]) => c).find(c => 'combate/zenkai/danoRecebido' in c);
        expect(campos['combate/zenkai/danoRecebido']).toBe(400 * F);
        expect(campos).not.toHaveProperty('combate/zenkai');
    });
});

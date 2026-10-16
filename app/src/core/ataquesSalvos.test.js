import { describe, it, expect } from 'vitest';
import { montarAtaqueSalvo, resolverAtaqueSalvo, formulaDesatualizada, VERSAO_ATAQUE_SALVO } from './ataquesSalvos.js';

const poderes = [{ id: 'p1', nome: 'Golpe' }, { id: 'p2', nome: 'Rajada' }];
const magias = [{ id: 'm1', nome: 'Bola de Fogo' }];

describe('montarAtaqueSalvo', () => {
    it('guarda a configuração, não números nem fórmula', () => {
        const r = montarAtaqueSalvo({
            nome: '  Combo  ', armaStatusUsados: ['forca', 'destreza'], armaEnergiaCombustao: 'aura', armaPercEnergia: '5',
            poderesAtivos: poderes, magiasOfensivas: magias,
            skillConfigs: { p1: { statusUsados: ['inteligencia'], energiaCombustao: 'chakra', comoPoder: true, percComoPoder: 20 } },
            agora: 123
        });
        expect(r.id).toBe(123);
        expect(r.nome).toBe('Combo');
        expect(r.versao).toBe(VERSAO_ATAQUE_SALVO);
        expect(r.config.armaStatusUsados).toEqual(['forca', 'destreza']);
        expect(r.config.armaEnergiaCombustao).toBe('aura');
        expect(r.config.armaPercEnergia).toBe(5);
        expect(r.config.poderesIds).toEqual(['p1', 'p2']);
        expect(r.config.magiasIds).toEqual(['m1']);
        expect(r.config.skillConfigs.p1).toEqual({ statusUsados: ['inteligencia'], energiaCombustao: 'chakra', comoPoder: true, percComoPoder: 20 });
        expect(JSON.stringify(r)).not.toMatch(/formula|dano/i);
    });

    it('habilidade sem configuração ganha o padrão (Força, Mana, sem Como Poder)', () => {
        const r = montarAtaqueSalvo({ nome: 'x', poderesAtivos: poderes, magiasOfensivas: [], skillConfigs: {} });
        expect(r.config.skillConfigs.p2).toEqual({ statusUsados: ['forca'], energiaCombustao: 'mana', comoPoder: false, percComoPoder: undefined });
        expect(r.config.armaStatusUsados).toEqual(['forca']);
    });

    it('não compartilha referência com a configuração viva', () => {
        const status = ['forca'];
        const r = montarAtaqueSalvo({ nome: 'x', armaStatusUsados: status, poderesAtivos: [], magiasOfensivas: [], skillConfigs: {} });
        status.push('destreza');
        expect(r.config.armaStatusUsados).toEqual(['forca']);
    });

    it('entradas vazias não quebram', () => {
        const r = montarAtaqueSalvo({});
        expect(r.nome).toBe('');
        expect(r.config.poderesIds).toEqual([]);
        expect(r.config.armaPercEnergia).toBe(0);
    });
});

describe('resolverAtaqueSalvo', () => {
    const salvo = montarAtaqueSalvo({ nome: 'x', poderesAtivos: poderes, magiasOfensivas: magias, skillConfigs: {} });

    it('usa só o que continua ativo e conta o que faltou', () => {
        const r = resolverAtaqueSalvo(salvo, { poderesAtivos: [poderes[0]], magiasOfensivas: [] });
        expect(r.poderes.map(p => p.id)).toEqual(['p1']);
        expect(r.magias).toEqual([]);
        expect(r.faltando).toBe(2);
    });

    it('ignora habilidades ativas que não estavam no ataque salvo', () => {
        const r = resolverAtaqueSalvo(salvo, { poderesAtivos: [...poderes, { id: 'novo' }], magiasOfensivas: magias });
        expect(r.poderes.map(p => p.id)).toEqual(['p1', 'p2']);
        expect(r.faltando).toBe(0);
    });

    it('ataque sem configuração devolve null', () => {
        expect(resolverAtaqueSalvo({ nome: 'velho' }, { poderesAtivos: [], magiasOfensivas: [] })).toBeNull();
        expect(resolverAtaqueSalvo(null, {})).toBeNull();
    });
});

describe('formulaDesatualizada', () => {
    it('fórmula salva antes da mudança (sem versao) é antiga; nova não', () => {
        expect(formulaDesatualizada({ id: 1, formula: '((5d10 x 61000) x 2) x 20' })).toBe(true);
        expect(formulaDesatualizada({ id: 2, versao: VERSAO_ATAQUE_SALVO, formula: '5d10' })).toBe(false);
        expect(formulaDesatualizada(null)).toBe(false);
    });
});

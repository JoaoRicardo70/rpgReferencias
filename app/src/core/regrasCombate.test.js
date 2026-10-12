import { describe, it, expect } from 'vitest';
import { ehNpc, getTipoPersonagem, rotuloTipoPersonagem, iconeTipoPersonagem } from './tipoPersonagem.js';
import { getPosicaoEntidade, getAlcanceMaximo, distanciaQuadrados, verificarAlvoNoAlcance } from './alcance.js';
import { listarAtoresDaCena, resolverAtorCombate, valorDoAtor, atorDeValor } from './atorCombate.js';
import { motivoBloqueioAlvo, resolverAlvoCombate } from './alvoCombate.js';
import { ehNpc as ehNpcGaveta } from './gavetaNpc.js';

describe('tipo de personagem (jogador x NPC)', () => {
    it('NPC por isNPC ou bio.mesa; o resto é jogador', () => {
        expect(ehNpc({ isNPC: true })).toBe(true);
        expect(ehNpc({ bio: { mesa: 'npc' } })).toBe(true);
        expect(ehNpc({ bio: { mesa: 'presente' } })).toBe(false);
        expect(ehNpc(null)).toBe(false);
        expect(getTipoPersonagem({ isNPC: true })).toBe('npc');
        expect(getTipoPersonagem({})).toBe('jogador');
        expect(rotuloTipoPersonagem({ isNPC: true })).toContain('NPC');
        expect(iconeTipoPersonagem({})).toBe('🧑');
    });

    it('a Gaveta usa a mesma regra (re-exportada)', () => {
        expect(ehNpcGaveta).toBe(ehNpc);
    });
});

describe('alcance e cena', () => {
    it('posição na cena pedida, ou a última conhecida', () => {
        const f = { posicoes: { a: { x: 1, y: 2 } }, posicao: { x: 9, y: 9, cenaId: 'b' } };
        expect(getPosicaoEntidade(f, 'a')).toEqual({ x: 1, y: 2, cenaId: 'a' });
        expect(getPosicaoEntidade(f, 'b')).toEqual({ x: 9, y: 9, z: 0, cenaId: 'b' });
        expect(getPosicaoEntidade({ posicao: { x: 1, y: 1 }, cenaId: 'c' }, 'c').cenaId).toBe('c');
        expect(getPosicaoEntidade({}, 'a')).toBeNull();
        expect(getPosicaoEntidade(null, 'a')).toBeNull();
    });

    it('alcance máximo: declarado ou o padrão pedido', () => {
        const f = { inventario: [{ equipado: true, tipo: 'arma', alcance: 3 }], poderes: [{ ativa: true, alcance: 6 }, { ativa: false, alcance: 99 }], ataquesElementais: [{ equipado: true, alcanceQuad: 4 }] };
        expect(getAlcanceMaximo(f)).toBe(6);
        expect(getAlcanceMaximo({ poderes: [{ ativa: true }] })).toBe(1);
        expect(getAlcanceMaximo({ poderes: [{ ativa: true }] }, { padrao: null })).toBeNull();
        expect(getAlcanceMaximo(null, { padrao: null })).toBeNull();
    });

    it('distância usa a maior entre x, y e altura/escala', () => {
        expect(distanciaQuadrados({ x: 0, y: 0 }, { x: 3, y: 1 })).toBe(3);
        expect(distanciaQuadrados({ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 6 }, 1.5)).toBe(4);
    });

    it('só bloqueia quando as duas posições são conhecidas e o problema é claro', () => {
        const a = { x: 0, y: 0, cenaId: 's1' };
        expect(verificarAlvoNoAlcance({ posAtor: a, posAlvo: null, alcance: 1 })).toEqual({ ok: true, verificado: false });
        expect(verificarAlvoNoAlcance({ posAtor: null, posAlvo: a, alcance: 1 }).ok).toBe(true);
        expect(verificarAlvoNoAlcance({ posAtor: a, posAlvo: { x: 1, y: 0, cenaId: 's2' }, alcance: 5 }).ok).toBe(false);
        expect(verificarAlvoNoAlcance({ posAtor: a, posAlvo: { x: 5, y: 0, cenaId: 's1' }, alcance: 3 }).motivo).toContain('fora de alcance');
        expect(verificarAlvoNoAlcance({ posAtor: a, posAlvo: { x: 3, y: 0, cenaId: 's1' }, alcance: 3 }).ok).toBe(true);
        // sem alcance declarado (null): só a cena importa
        expect(verificarAlvoNoAlcance({ posAtor: a, posAlvo: { x: 50, y: 0, cenaId: 's1' }, alcance: null }).ok).toBe(true);
        // cenaId ausente conta como 'default' nos dois lados (sem falso bloqueio)
        expect(verificarAlvoNoAlcance({ posAtor: { x: 0, y: 0 }, posAlvo: { x: 1, y: 0 }, alcance: 2 }).ok).toBe(true);
    });
});

describe('regra de PvP: jogador x jogador só em combate', () => {
    const jogadorA = { iniciativa: 12 };
    const alvoJogador = (iniciativa) => ({ isPersonagem: true, tipoPersonagem: 'jogador', ficha: { iniciativa } });

    it('libera quando os dois estão na iniciativa; bloqueia caso contrário', () => {
        expect(motivoBloqueioAlvo({ fichaAtor: jogadorA, alvo: alvoJogador(8) })).toBeNull();
        expect(motivoBloqueioAlvo({ fichaAtor: jogadorA, alvo: alvoJogador(0) })).toContain('combate');
        expect(motivoBloqueioAlvo({ fichaAtor: {}, alvo: alvoJogador(8) })).toContain('combate');
    });

    it('Mestre, NPC atacando e NPC atacado nunca são limitados; sem ator não checa', () => {
        expect(motivoBloqueioAlvo({ fichaAtor: {}, atorEhMestre: true, alvo: alvoJogador(0) })).toBeNull();
        expect(motivoBloqueioAlvo({ fichaAtor: { isNPC: true }, alvo: alvoJogador(0) })).toBeNull();
        expect(motivoBloqueioAlvo({ fichaAtor: {}, alvo: { isPersonagem: true, tipoPersonagem: 'npc', ficha: {} } })).toBeNull();
        expect(motivoBloqueioAlvo({ alvo: alvoJogador(0) })).toBeNull();
        expect(motivoBloqueioAlvo({ fichaAtor: {}, alvo: { isDummie: true } })).toBeNull();
    });

    it('o resolver marca o alvo bloqueado em vez de escondê-lo', () => {
        const personagens = { Ana: { vida: { base: 1000000, atual: 1000000 }, iniciativa: 0 }, Orc: { isNPC: true, vida: { base: 1000000, atual: 1000000 } } };
        const comRegra = { personagens, meuNome: 'Bia', fichaAtor: { iniciativa: 5 }, atorEhMestre: false };
        expect(resolverAlvoCombate('pj:Ana', comRegra).bloqueado).toContain('combate');
        expect(resolverAlvoCombate('pj:Ana', comRegra).tipoPersonagem).toBe('jogador');
        expect(resolverAlvoCombate('pj:Orc', comRegra).bloqueado).toBeUndefined();
        expect(resolverAlvoCombate('pj:Orc', comRegra).tipoPersonagem).toBe('npc');
        expect(resolverAlvoCombate('pj:Ana', { ...comRegra, atorEhMestre: true }).bloqueado).toBeUndefined();
    });
});

describe('ator de combate (Mestre atuando como NPC)', () => {
    const personagens = {
        Goblin: { isNPC: true, posicao: { x: 2, y: 2, cenaId: 'c1' } },
        Orc: { isNPC: true, posicoes: { c1: { x: 5, y: 5 } } },
        Ana: { posicao: { x: 1, y: 1, cenaId: 'c1' } },
        Fora: { isNPC: true, posicao: { x: 1, y: 1, cenaId: 'c2' } },
    };
    const dummies = {
        d1: { nome: 'Goblin #1', fichaOrigem: 'Goblin', cenaId: 'c1', posicao: { x: 7, y: 7 } },
        d2: { nome: 'Boneco', cenaId: 'c1', posicao: { x: 0, y: 0 } },
    };

    it('lista tokens da Gaveta com ficha e NPCs posicionados na cena', () => {
        const lista = listarAtoresDaCena({ personagens, dummies, cenaId: 'c1' });
        const valores = lista.map(a => a.valor);
        expect(valores).toContain('d:d1');
        expect(valores).toContain('n:Goblin');
        expect(valores).toContain('n:Orc');
        expect(valores).not.toContain('n:Ana');
        expect(valores).not.toContain('n:Fora');
        expect(valores).not.toContain('d:d2');
    });

    it('resolve o ator: ficha do NPC, nome do token e posição do token', () => {
        const ator = resolverAtorCombate({ nome: 'Goblin', dummieId: 'd1' }, { personagens, dummies, isMestre: true, cenaId: 'c1' });
        expect(ator.nomeFicha).toBe('Goblin');
        expect(ator.nomeExibido).toBe('Goblin #1');
        expect(ator.ficha).toBe(personagens.Goblin);
        expect(ator.posicao).toMatchObject({ x: 7, y: 7, cenaId: 'c1' });
        const direto = resolverAtorCombate({ nome: 'Orc' }, { personagens, dummies, isMestre: true, cenaId: 'c1' });
        expect(direto.nomeExibido).toBe('Orc');
        expect(direto.posicao).toMatchObject({ x: 5, y: 5 });
    });

    it('só vale pro Mestre e enquanto a ficha/token existirem', () => {
        expect(resolverAtorCombate({ nome: 'Goblin' }, { personagens, dummies, isMestre: false })).toBeNull();
        expect(resolverAtorCombate(null, { personagens, dummies, isMestre: true })).toBeNull();
        expect(resolverAtorCombate({ nome: 'Sumiu' }, { personagens, dummies, isMestre: true })).toBeNull();
        expect(resolverAtorCombate({ nome: 'Goblin', dummieId: 'x' }, { personagens, dummies, isMestre: true })).toBeNull();
    });

    it('serializa e lê o valor do select', () => {
        expect(valorDoAtor({ nome: 'Goblin', dummieId: 'd1' })).toBe('d:d1');
        expect(valorDoAtor({ nome: 'Orc' })).toBe('n:Orc');
        expect(valorDoAtor(null)).toBe('');
        expect(atorDeValor('d:d1', dummies)).toEqual({ nome: 'Goblin', dummieId: 'd1' });
        expect(atorDeValor('n:Orc', dummies)).toEqual({ nome: 'Orc' });
        expect(atorDeValor('d:d2', dummies)).toBeNull();
        expect(atorDeValor('', dummies)).toBeNull();
    });
});

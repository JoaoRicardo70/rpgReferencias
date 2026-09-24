import { describe, it, expect, beforeEach } from 'vitest';
import useStore from './useStore.js';

// ---------------------------------------------------------------------------
// QA — updateFichaAlvo(nome, callback): a mutação Immer que sustenta o
// Grimório da Entidade (Mestre editando a Ficha Definitiva de OUTRA entidade
// ao vivo, via FichaAlvoContext.jsx). Cobre "cross-talk safety": editar a
// entidade A nunca pode vazar pra minhaFicha nem pra outras entidades de
// personagens, e mirar o PRÓPRIO nome do jogador logado precisa se comportar
// byte a byte como updateFicha() já sempre se comportou.
//
// Usa o useStore REAL (sem mocks), mesmo padrão de useStore.combate.test.js.
// ---------------------------------------------------------------------------

describe('useStore.updateFichaAlvo — cross-talk safety (Grimório da Entidade)', () => {
    beforeEach(() => {
        useStore.getState().resetFicha();
        useStore.getState().setMeuNome('Kiriya');
        useStore.getState().setPersonagens({
            'NPC Sombrio': { vida: { atual: 500 }, bio: { classe: 'vilao' } },
            'Outro Personagem': { vida: { atual: 300 } },
        });
    });

    it('mirando uma entidade que NÃO é o jogador logado muta personagens[nome] e deixa minhaFicha intocada', () => {
        const minhaFichaAntes = useStore.getState().minhaFicha;

        useStore.getState().updateFichaAlvo('NPC Sombrio', (f) => { f.vida.atual = 1; });

        expect(useStore.getState().personagens['NPC Sombrio'].vida.atual).toBe(1);
        // minhaFicha nem foi tocada -- Immer preserva a MESMA referência de ramos não mutados.
        expect(useStore.getState().minhaFicha).toBe(minhaFichaAntes);
    });

    it('mirando o próprio nome do jogador logado muta minhaFicha e não toca personagens', () => {
        const personagensAntes = useStore.getState().personagens;

        useStore.getState().updateFichaAlvo('Kiriya', (f) => { f.vida.atual = 42; });

        expect(useStore.getState().minhaFicha.vida.atual).toBe(42);
        expect(useStore.getState().personagens).toBe(personagensAntes);
        expect(useStore.getState().personagens['NPC Sombrio'].vida.atual).toBe(500);
    });

    it('mutar personagens["NPC Sombrio"] não afeta "Outro Personagem" (isolamento entre entidades diferentes)', () => {
        useStore.getState().updateFichaAlvo('NPC Sombrio', (f) => { f.vida.atual = 999; });

        expect(useStore.getState().personagens['Outro Personagem'].vida.atual).toBe(300);
        expect(useStore.getState().personagens['Outro Personagem']).toEqual({ vida: { atual: 300 } });
    });

    it('não lança e não muta nada quando o nome-alvo não existe em personagens nem é o jogador logado', () => {
        const personagensAntes = useStore.getState().personagens;
        const minhaFichaAntes = useStore.getState().minhaFicha;

        expect(() => {
            useStore.getState().updateFichaAlvo('Fantasma Inexistente', (f) => { f.vida.atual = 1; });
        }).not.toThrow();

        expect(useStore.getState().personagens).toEqual(personagensAntes);
        expect(useStore.getState().minhaFicha).toBe(minhaFichaAntes);
    });

    it('não muta nada quando nome é vazio/undefined/null (guarda `if (!nome) return`)', () => {
        const minhaFichaAntes = useStore.getState().minhaFicha;
        const personagensAntes = useStore.getState().personagens;

        useStore.getState().updateFichaAlvo('', (f) => { f.vida.atual = 1; });
        useStore.getState().updateFichaAlvo(undefined, (f) => { f.vida.atual = 1; });
        useStore.getState().updateFichaAlvo(null, (f) => { f.vida.atual = 1; });

        expect(useStore.getState().minhaFicha).toBe(minhaFichaAntes);
        expect(useStore.getState().personagens).toBe(personagensAntes);
    });

    it('mirando o próprio nome se comporta EXATAMENTE como updateFicha (mesma mutação, mesmo resultado final)', () => {
        useStore.getState().resetFicha();
        useStore.getState().updateFicha((f) => { f.bio.nivel = 7; });
        const viaUpdateFicha = useStore.getState().minhaFicha.bio.nivel;

        useStore.getState().resetFicha();
        useStore.getState().updateFichaAlvo('Kiriya', (f) => { f.bio.nivel = 7; });
        const viaUpdateFichaAlvo = useStore.getState().minhaFicha.bio.nivel;

        expect(viaUpdateFichaAlvo).toBe(viaUpdateFicha);
        expect(viaUpdateFichaAlvo).toBe(7);
    });

    it('duas chamadas seguidas mirando entidades DIFERENTES não se atropelam (cada uma muta só o seu próprio ramo)', () => {
        useStore.getState().updateFichaAlvo('NPC Sombrio', (f) => { f.vida.atual = 10; });
        useStore.getState().updateFichaAlvo('Outro Personagem', (f) => { f.vida.atual = 20; });

        expect(useStore.getState().personagens['NPC Sombrio'].vida.atual).toBe(10);
        expect(useStore.getState().personagens['Outro Personagem'].vida.atual).toBe(20);
    });
});

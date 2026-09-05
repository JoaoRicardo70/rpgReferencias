import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import useStore from '../stores/useStore.js';
import { getEfeitosDeClasse } from '../core/attributes.js';

// ---------------------------------------------------------------------------
// QA — Regressão do vazamento de bônus de Classe Mística do Mestre
//
// getEfeitosDeClasse() lia os overrides do Compêndio via lookup FLAT
// (`mestreOverrides[classeHeroica]`), mas o único lugar que ESCREVE esses
// overrides (CompendioFormContext.jsx > salvarEdicao) sempre aninha em
// `compendioOverrides.classes[id]`. Com isso, bônus de classe cadastrados
// pelo Mestre no Compêndio (ex: multiplicador x10 do Avenger) NUNCA eram
// aplicados a nenhum personagem, custe qual sheet (antiga ou "Ficha
// Definitiva") tivesse definido `bio.classe`. Corrigido para ler
// `mestreOverrides.classes?.[id]`.
// ---------------------------------------------------------------------------

function fichaComClasse(classe, subClasse) {
    return { bio: { classe, subClasse } };
}

function efeitosFake(valor = '10') {
    return [{ propriedade: 'mgeral', atributo: 'geral', valor }];
}

describe('getEfeitosDeClasse — overrides do Mestre (leitura aninhada em .classes)', () => {
    beforeEach(() => {
        useStore.getState().resetFicha();
        useStore.getState().setIsMestre(false);
        useStore.getState().setPersonagens({});
    });

    afterEach(() => {
        useStore.getState().resetFicha();
        useStore.getState().setIsMestre(false);
        useStore.getState().setPersonagens({});
    });

    it('retorna [] quando a ficha nao tem classe definida', () => {
        expect(getEfeitosDeClasse(fichaComClasse(''))).toEqual([]);
        expect(getEfeitosDeClasse({})).toEqual([]);
    });

    it('BUG FIX: aplica os efeitos matematicos do Mestre quando aninhados em compendioOverrides.classes[id] (isMestre=true)', () => {
        useStore.getState().setIsMestre(true);
        const efeitos = efeitosFake('10');
        useStore.getState().updateFicha((f) => {
            f.compendioOverrides = { classes: { avenger: { efeitosMatematicos: efeitos } } };
        });

        const ficha = fichaComClasse('avenger');
        expect(getEfeitosDeClasse(ficha)).toEqual(efeitos);
    });

    it('a comparacao do id da classe e case-insensitive (classe salva com maiusculas)', () => {
        useStore.getState().setIsMestre(true);
        const efeitos = efeitosFake('5');
        useStore.getState().updateFicha((f) => {
            f.compendioOverrides = { classes: { saber: { efeitosMatematicos: efeitos } } };
        });

        expect(getEfeitosDeClasse(fichaComClasse('Saber'))).toEqual(efeitos);
    });

    it('BUG FIX: aplica tambem os efeitos da subClasse (alterego) quando aninhados em .classes', () => {
        useStore.getState().setIsMestre(true);
        const efeitosAlterego = efeitosFake('10');
        const efeitosSub = efeitosFake('20');
        useStore.getState().updateFicha((f) => {
            f.compendioOverrides = {
                classes: {
                    alterego: { efeitosMatematicos: efeitosAlterego },
                    'minha-sub-classe': { efeitosMatematicos: efeitosSub },
                },
            };
        });

        const ficha = fichaComClasse('alterego', 'minha-sub-classe');
        expect(getEfeitosDeClasse(ficha)).toEqual([...efeitosAlterego, ...efeitosSub]);
    });

    it('BUG FIX: aplica tambem os efeitos da subClasse (pretender) quando aninhados em .classes', () => {
        useStore.getState().setIsMestre(true);
        const efeitosPretender = efeitosFake('7');
        const efeitosSub = efeitosFake('3');
        useStore.getState().updateFicha((f) => {
            f.compendioOverrides = {
                classes: {
                    pretender: { efeitosMatematicos: efeitosPretender },
                    outrasub: { efeitosMatematicos: efeitosSub },
                },
            };
        });

        const ficha = fichaComClasse('pretender', 'outrasub');
        expect(getEfeitosDeClasse(ficha)).toEqual([...efeitosPretender, ...efeitosSub]);
    });

    it('subClasse NAO e aplicada quando a classe principal nao e alterego/pretender', () => {
        useStore.getState().setIsMestre(true);
        useStore.getState().updateFicha((f) => {
            f.compendioOverrides = {
                classes: {
                    saber: { efeitosMatematicos: efeitosFake('1') },
                    umaSub: { efeitosMatematicos: efeitosFake('999') },
                },
            };
        });

        const ficha = fichaComClasse('saber', 'umaSub');
        expect(getEfeitosDeClasse(ficha)).toEqual(efeitosFake('1'));
    });

    it('retorna [] com seguranca quando compendioOverrides e {} (sem crash)', () => {
        useStore.getState().setIsMestre(true);
        useStore.getState().updateFicha((f) => { f.compendioOverrides = {}; });
        expect(() => getEfeitosDeClasse(fichaComClasse('avenger'))).not.toThrow();
        expect(getEfeitosDeClasse(fichaComClasse('avenger'))).toEqual([]);
    });

    it('retorna [] com seguranca quando compendioOverrides.classes esta ausente (sem crash)', () => {
        useStore.getState().setIsMestre(true);
        useStore.getState().updateFicha((f) => {
            f.compendioOverrides = { grands: { algumaCoisa: true } };
        });
        expect(() => getEfeitosDeClasse(fichaComClasse('avenger'))).not.toThrow();
        expect(getEfeitosDeClasse(fichaComClasse('avenger'))).toEqual([]);
    });

    it('retorna [] com seguranca quando minhaFicha.compendioOverrides e undefined', () => {
        useStore.getState().setIsMestre(true);
        // resetFicha() no beforeEach ja deixa compendioOverrides como {} (default de fichaPadrao),
        // aqui forcamos undefined pra cobrir o optional chaining `state.minhaFicha?.compendioOverrides`.
        useStore.getState().updateFicha((f) => { delete f.compendioOverrides; });
        expect(() => getEfeitosDeClasse(fichaComClasse('avenger'))).not.toThrow();
        expect(getEfeitosDeClasse(fichaComClasse('avenger'))).toEqual([]);
    });

    it('REGRESSAO: uma estrutura FLAT antiga (sem .classes) NAO e mais lida — nao deve haver suporte a dois formatos', () => {
        useStore.getState().setIsMestre(true);
        useStore.getState().updateFicha((f) => {
            // Formato antigo/errado que o codigo real NUNCA escreve — nao deveria ser
            // reconhecido pelo fix (o fix so entende o formato aninhado em .classes).
            f.compendioOverrides = { avenger: { efeitosMatematicos: efeitosFake('999') } };
        });

        expect(getEfeitosDeClasse(fichaComClasse('avenger'))).toEqual([]);
    });

    it('BUG FIX: le overrides de state.personagens quando isMestre=false (ficha de outro jogador com compendioOverrides)', () => {
        useStore.getState().setIsMestre(false);
        const efeitos = efeitosFake('42');
        useStore.getState().setPersonagens({
            'Jogador Um': { compendioOverrides: { classes: { caster: { efeitosMatematicos: efeitos } } } },
        });

        expect(getEfeitosDeClasse(fichaComClasse('caster'))).toEqual(efeitos);
    });

    it('retorna [] quando nenhum personagem em state.personagens tem compendioOverrides', () => {
        useStore.getState().setIsMestre(false);
        useStore.getState().setPersonagens({
            'Jogador Um': { bio: { classe: 'caster' } },
        });

        expect(getEfeitosDeClasse(fichaComClasse('caster'))).toEqual([]);
    });

    it('classe sem efeitosMatematicos cadastrados retorna [] (override so tem nome/desc, por exemplo)', () => {
        useStore.getState().setIsMestre(true);
        useStore.getState().updateFicha((f) => {
            f.compendioOverrides = { classes: { saber: { nome: 'Saber', desc: 'texto' } } };
        });

        expect(getEfeitosDeClasse(fichaComClasse('saber'))).toEqual([]);
    });
});

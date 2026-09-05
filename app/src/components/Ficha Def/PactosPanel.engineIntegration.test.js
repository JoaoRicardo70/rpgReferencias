import { describe, it, expect } from 'vitest';
import { calcularPoderAtual } from '../../core/poder';

// ---------------------------------------------------------------------------
// QA — integração REAL (sem mocks) entre o shape de dado gravado por
// PactosPanel.jsx em ficha.seresSelados e core/attributes.js > getBuffs /
// core/poder.js > getGlobalMultipliers: prova que o gate ".ativo" de um Pacto
// realmente entra no cálculo de Poder do Scouter, não só na UI.
//
// getBuffs() (core/attributes.js linhas ~147-178) só lê ficha.seresSelados[i]
// quando "ser.ativo" é truthy. getGlobalMultipliers() (core/poder.js) chama
// getBuffs(ficha, 'dano', ...) e empurra qualquer efeito com
// atributo:'dano' + propriedade:'munico' pro multiplicador final (finalUni),
// que multiplica direto o poderGlobal — por isso um único efeito munico=5
// deve escalar o Poder por 5x quando o Pacto está sincronizado.
//
// Ficha mínima baseada na mesma fixture usada em core/poder.test.js
// (criarFichaMinima), só que com stats simples (sem multiplicadores mBase/
// mGeral/mFormas custom) pra manter a matemática legível.
// ---------------------------------------------------------------------------

const STATUS_FISICOS = ['forca', 'destreza', 'inteligencia', 'sabedoria', 'energiaEsp', 'carisma', 'stamina', 'constituicao'];

function criarStat(base) {
    return { base, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mUnico: '1.0', mAbsoluto: 1.0, reducaoCusto: 0, regeneracao: 0 };
}

function criarFichaMinima(overrides = {}) {
    const ficha = {
        ascensaoBase: 1,
        vida: criarStat(100000000),
        mana: criarStat(10000000),
        aura: criarStat(10000000),
        chakra: criarStat(10000000),
        corpo: criarStat(10000000),
        divisores: { vida: 1, status: 1, mana: 1, aura: 1, chakra: 1, corpo: 1 },
        divisorPoder: 0,
        supressaoPoder: 100,
        limiteSupressao: 1,
    };
    STATUS_FISICOS.forEach(s => { ficha[s] = criarStat(100000); });
    return { ...ficha, ...overrides };
}

function pactoComMunico(ativo) {
    return {
        id: 'p1',
        nome: 'Kurama',
        descricao: '',
        elemento: 'Fogo',
        classe: '',
        zeraCusto: false,
        ativo,
        efeitos: [{ nome: 'Chakra da Raposa', atributo: 'dano', propriedade: 'munico', valor: '5' }],
        efeitosPassivos: [],
        formas: [],
        formaAtivaId: null,
        configAtivaId: null,
    };
}

describe('PactosPanel (shape de dado) — integração real com core/poder.calcularPoderAtual via ficha.seresSelados', () => {
    it('um Pacto ATIVO com efeito dano/munico=5 produz um poderGlobal 5x MAIOR que o mesmo Pacto INATIVO (gate .ativo realmente entra no cálculo de Poder)', () => {
        const fichaAtiva = criarFichaMinima({ seresSelados: [pactoComMunico(true)] });
        const fichaInativa = criarFichaMinima({ seresSelados: [pactoComMunico(false)] });

        const poderAtivo = calcularPoderAtual(fichaAtiva, 1).poderGlobal;
        const poderInativo = calcularPoderAtual(fichaInativa, 1).poderGlobal;

        expect(poderAtivo).not.toBe(poderInativo);
        expect(poderAtivo).toBeGreaterThan(poderInativo);
        // Multiplicador do munico (5x) aplicado sobre o poderGlobal — comparado por razão
        // (não igualdade exata) porque dois Math.floor() independentes (um por lado) podem
        // arredondar a fração de forma levemente diferente sem isso indicar um bug real.
        const razao = poderAtivo / poderInativo;
        expect(razao).toBeGreaterThan(4.999);
        expect(razao).toBeLessThan(5.001);
    });

    it('uma ficha SEM nenhum seresSelados produz o MESMO poderGlobal que uma ficha com o Pacto INATIVO (Pacto adormecido é totalmente transparente pro Poder)', () => {
        const fichaSemPacto = criarFichaMinima({ seresSelados: [] });
        const fichaComPactoInativo = criarFichaMinima({ seresSelados: [pactoComMunico(false)] });

        const poderSemPacto = calcularPoderAtual(fichaSemPacto, 1).poderGlobal;
        const poderComPactoInativo = calcularPoderAtual(fichaComPactoInativo, 1).poderGlobal;

        expect(poderComPactoInativo).toBe(poderSemPacto);
    });

    it('desativar o Pacto (ativo:true -> false) na mesma ficha reduz o poderGlobal de volta ao nível sem o buff', () => {
        const ficha = criarFichaMinima({ seresSelados: [pactoComMunico(true)] });
        const poderComBuff = calcularPoderAtual(ficha, 1).poderGlobal;

        ficha.seresSelados[0].ativo = false;
        const poderSemBuff = calcularPoderAtual(ficha, 1).poderGlobal;

        expect(poderSemBuff).toBeLessThan(poderComBuff);
    });
});

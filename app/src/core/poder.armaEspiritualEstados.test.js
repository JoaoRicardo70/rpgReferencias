import { describe, it, expect } from 'vitest';
import { calcularPoderAtual } from './poder';

const STATUS_FISICOS = ['forca', 'destreza', 'inteligencia', 'sabedoria', 'energiaEsp', 'carisma', 'stamina', 'constituicao'];

function criarStat(base) {
    return { base, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mUnico: '1.0', mAbsoluto: 1.0, reducaoCusto: 0, regeneracao: 0 };
}

// Ficha mínima porém "completa" o suficiente para passar por todo o pipeline de
// calcularPoderAtual (vitais + 8 status físicos + ascensaoBase + divisorPoder).
// Réplica exata de criarFichaMinima em core/poder.test.js.
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

function poderCom(armaEspiritual) {
    return calcularPoderAtual(criarFichaMinima({ armaEspiritual }), 1).poderGlobal;
}

// ---------------------------------------------------------------------------
// QA — Arma Espiritual / Fantasma Nobre: 3 ESTADOS mutuamente EXCLUDENTES
// (Base / Forma Verdadeira / Fantasma Nobre) em ficha.armaEspiritual, cada um
// com seus próprios arrays de Passivas/Runas. Só as tags MBASE/MGERAL/MFORMAS/
// MABS/MUNICO do estado ATIVO (armaEsp.estadoAtivo) contam pro Scouter — NÃO
// empilha com os estados abaixo. Se o acesso ao estado ativo tiver sido
// revogado (acessoVerdadeira/acessoFantasma), o cálculo cai automaticamente
// pro estado inferior. Ver core/poder.js > getGlobalMultipliers (réplica
// idêntica em Ficha Def/Marcados.jsx, comparada em
// poder.parityMarcadosEstados.test.jsx).
// ---------------------------------------------------------------------------
describe('core/poder - calcularPoderAtual: Arma Espiritual - estados excludentes (Base/Forma Verdadeira/Fantasma Nobre)', () => {
    const semArma = () => calcularPoderAtual(criarFichaMinima(), 1).poderGlobal;

    it('REGRESSÃO: estadoAtivo ausente (undefined) usa passivas/runas do Base normalmente, igual ao comportamento antigo (equipada sempre conta)', () => {
        const comEstadoAusente = poderCom({
            passivas: [{ id: 'p1', texto: 'MGERAL: +50' }],
            runas: [{ id: 'r1', texto: 'MUNICO: 2' }],
        });
        const comEstadoBaseExplicito = poderCom({
            estadoAtivo: 'base',
            passivas: [{ id: 'p1', texto: 'MGERAL: +50' }],
            runas: [{ id: 'r1', texto: 'MUNICO: 2' }],
        });

        expect(comEstadoAusente).toBeGreaterThan(semArma());
        expect(comEstadoAusente).toBe(comEstadoBaseExplicito);
    });

    it('REGRESSÃO: estadoAtivo ausente + armaEspiritual sem nenhum campo de estado superior não lança exceção e produz o mesmo poder que sem armaEspiritual (no-op)', () => {
        const resultado = poderCom({ passivas: [], runas: [] });
        expect(resultado).toBe(semArma());
    });

    it('estadoAtivo="verdadeira" com acessoVerdadeira=true conta SOMENTE passivasVerdadeira/runasVerdadeira, ignorando as tags do Base (exclusão, não cumulativo)', () => {
        const arma = {
            estadoAtivo: 'verdadeira',
            acessoVerdadeira: true,
            passivas: [{ id: 'p1', texto: 'MGERAL: +9999' }],
            runas: [{ id: 'r1', texto: 'MABS: +9999' }],
            passivasVerdadeira: [{ id: 'pv1', texto: 'MGERAL: +50' }],
            runasVerdadeira: [{ id: 'rv1', texto: 'MUNICO: 2' }],
        };
        const poderComEstadoVerdadeiro = poderCom(arma);

        // Prova de exclusão: usar SÓ as tags do Base (que aqui são gigantes, MGERAL:+9999)
        // produziria um poder MAIOR que usar só as tags (pequenas) da Forma Verdadeira —
        // então se o resultado bater com "só Verdadeira" e não com "Base gigante", prova
        // que o Base foi mesmo ignorado.
        const poderSoComBaseGigante = poderCom({
            estadoAtivo: 'base',
            passivas: arma.passivas,
            runas: arma.runas,
        });
        const poderSoComVerdadeiraEquivalente = poderCom({
            estadoAtivo: 'verdadeira',
            acessoVerdadeira: true,
            passivasVerdadeira: arma.passivasVerdadeira,
            runasVerdadeira: arma.runasVerdadeira,
        });

        expect(poderComEstadoVerdadeiro).toBe(poderSoComVerdadeiraEquivalente);
        expect(poderComEstadoVerdadeiro).toBeLessThan(poderSoComBaseGigante);
        expect(poderComEstadoVerdadeiro).toBeGreaterThan(semArma());
    });

    it('estadoAtivo="fantasma" com acessoFantasma=true conta SOMENTE passivasFantasma/runasFantasma, ignorando Base e Forma Verdadeira', () => {
        const arma = {
            estadoAtivo: 'fantasma',
            acessoVerdadeira: true,
            acessoFantasma: true,
            passivas: [{ id: 'p1', texto: 'MGERAL: +9999' }],
            passivasVerdadeira: [{ id: 'pv1', texto: 'MGERAL: +9999' }],
            passivasFantasma: [{ id: 'pf1', texto: 'MGERAL: +50' }],
            runasFantasma: [{ id: 'rf1', texto: 'MUNICO: 2' }],
        };
        const poderComFantasma = poderCom(arma);
        const poderSoComFantasmaEquivalente = poderCom({
            estadoAtivo: 'fantasma',
            acessoFantasma: true,
            passivasFantasma: arma.passivasFantasma,
            runasFantasma: arma.runasFantasma,
        });
        const poderSoComBaseGigante = poderCom({
            estadoAtivo: 'base',
            passivas: arma.passivas,
        });

        expect(poderComFantasma).toBe(poderSoComFantasmaEquivalente);
        expect(poderComFantasma).toBeLessThan(poderSoComBaseGigante);
        expect(poderComFantasma).toBeGreaterThan(semArma());
    });

    it('estadoAtivo="fantasma" sem acessoFantasma (ausente) cai para "verdadeira" quando há acessoVerdadeira=true', () => {
        const passivasVerdadeira = [{ id: 'pv1', texto: 'MGERAL: +50' }];
        const passivasFantasma = [{ id: 'pf1', texto: 'MGERAL: +777' }];

        const poderComFantasmaSemAcesso = poderCom({
            estadoAtivo: 'fantasma',
            acessoVerdadeira: true,
            // acessoFantasma ausente => false
            passivasVerdadeira,
            passivasFantasma,
        });
        const poderEquivalenteVerdadeira = poderCom({
            estadoAtivo: 'verdadeira',
            acessoVerdadeira: true,
            passivasVerdadeira,
        });

        expect(poderComFantasmaSemAcesso).toBe(poderEquivalenteVerdadeira);
    });

    it('estadoAtivo="fantasma" com acessoFantasma=false explícito cai para "verdadeira" quando há acessoVerdadeira=true', () => {
        const passivasVerdadeira = [{ id: 'pv1', texto: 'MGERAL: +50' }];
        const passivasFantasma = [{ id: 'pf1', texto: 'MGERAL: +777' }];

        const poderComFantasmaAcessoFalso = poderCom({
            estadoAtivo: 'fantasma',
            acessoVerdadeira: true,
            acessoFantasma: false,
            passivasVerdadeira,
            passivasFantasma,
        });
        const poderEquivalenteVerdadeira = poderCom({
            estadoAtivo: 'verdadeira',
            acessoVerdadeira: true,
            passivasVerdadeira,
        });

        expect(poderComFantasmaAcessoFalso).toBe(poderEquivalenteVerdadeira);
    });

    it('estadoAtivo="fantasma" sem acessoFantasma E sem acessoVerdadeira (revogado) cai direto pro Base', () => {
        const passivasBase = [{ id: 'p1', texto: 'MGERAL: +50' }];
        const passivasVerdadeira = [{ id: 'pv1', texto: 'MGERAL: +777' }];
        const passivasFantasma = [{ id: 'pf1', texto: 'MGERAL: +9999' }];

        const poderComFantasmaSemNenhumAcesso = poderCom({
            estadoAtivo: 'fantasma',
            acessoVerdadeira: false,
            acessoFantasma: false,
            passivas: passivasBase,
            passivasVerdadeira,
            passivasFantasma,
        });
        const poderEquivalenteBase = poderCom({
            estadoAtivo: 'base',
            passivas: passivasBase,
        });

        expect(poderComFantasmaSemNenhumAcesso).toBe(poderEquivalenteBase);
    });

    it('estadoAtivo="verdadeira" com acessoVerdadeira=false cai DIRETO pro Base, ignorando totalmente as tags do Fantasma Nobre (mesmo com acessoFantasma=true)', () => {
        const passivasBase = [{ id: 'p1', texto: 'MGERAL: +50' }];
        const passivasVerdadeira = [{ id: 'pv1', texto: 'MGERAL: +777' }];
        const passivasFantasma = [{ id: 'pf1', texto: 'MGERAL: +9999' }];

        const poderComVerdadeiraSemAcesso = poderCom({
            estadoAtivo: 'verdadeira',
            acessoVerdadeira: false,
            acessoFantasma: true, // não deve importar -- estadoAtivo pedido foi "verdadeira", não "fantasma"
            passivas: passivasBase,
            passivasVerdadeira,
            passivasFantasma,
        });
        const poderEquivalenteBase = poderCom({
            estadoAtivo: 'base',
            passivas: passivasBase,
        });

        expect(poderComVerdadeiraSemAcesso).toBe(poderEquivalenteBase);
    });

    it('equipada=false: nenhum estado conta, independente de estadoAtivo/acessos (comportamento pré-existente preservado)', () => {
        const armaBase = {
            equipada: false,
            estadoAtivo: 'base',
            passivas: [{ id: 'p1', texto: 'MGERAL: +50' }],
            runas: [{ id: 'r1', texto: 'MUNICO: 2' }],
        };
        const armaVerdadeira = {
            equipada: false,
            estadoAtivo: 'verdadeira',
            acessoVerdadeira: true,
            passivasVerdadeira: [{ id: 'pv1', texto: 'MGERAL: +50' }],
            runasVerdadeira: [{ id: 'rv1', texto: 'MUNICO: 2' }],
        };
        const armaFantasma = {
            equipada: false,
            estadoAtivo: 'fantasma',
            acessoVerdadeira: true,
            acessoFantasma: true,
            passivasFantasma: [{ id: 'pf1', texto: 'MGERAL: +50' }],
            runasFantasma: [{ id: 'rf1', texto: 'MUNICO: 2' }],
        };

        expect(poderCom(armaBase)).toBe(semArma());
        expect(poderCom(armaVerdadeira)).toBe(semArma());
        expect(poderCom(armaFantasma)).toBe(semArma());
    });

    it('não lança exceção e mantém poderGlobal finito para arrays por-estado ausentes/undefined nos estados superiores', () => {
        const ficha1 = criarFichaMinima({ armaEspiritual: { estadoAtivo: 'verdadeira', acessoVerdadeira: true } });
        const ficha2 = criarFichaMinima({ armaEspiritual: { estadoAtivo: 'fantasma', acessoFantasma: true } });

        expect(() => calcularPoderAtual(ficha1, 1)).not.toThrow();
        expect(() => calcularPoderAtual(ficha2, 1)).not.toThrow();
        expect(Number.isFinite(calcularPoderAtual(ficha1, 1).poderGlobal)).toBe(true);
        expect(Number.isFinite(calcularPoderAtual(ficha2, 1).poderGlobal)).toBe(true);
    });
});

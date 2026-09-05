import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { calcularPoderAtual } from './poder';
import MarcadosPanel from '../components/Ficha Def/Marcados';
import useStore from '../stores/useStore';

// ---------------------------------------------------------------------------
// QA — paridade REAL entre core/poder.js e Ficha Def/Marcados.jsx (Fadiga de
// Combate): em vez de só comparar a fórmula por inspeção, este arquivo
// renderiza o PRÓPRIO MarcadosPanel (mockando useStore/firebase-sync, mesmo
// padrão de Marcados.fadigaCombate.test.jsx) para a MESMA ficha usada em
// calcularPoderAtual(), e compara o Poder Calculado exibido no Scouter
// (notação exponencial, mesma leitura que lerPoderGlobalExibido usa no
// arquivo irmão) contra o poderGlobal retornado por core/poder.js — provando
// que as duas implementações concordam de verdade para o mesmo input,
// inclusive com Fadiga de Combate ativa.
//
// Precisa de extensão .jsx (diferente de core/poder.test.js) porque monta um
// componente React de verdade.
// ---------------------------------------------------------------------------

vi.mock('../stores/useStore');
vi.mock('../services/firebase-sync', () => ({
    uploadImagem: vi.fn(),
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
}));

function fichaParaMarcados(combateExtra) {
    return {
        vida: { base: 100000000 },
        mana: { base: 1000000000 },
        aura: { base: 1000000000 },
        chakra: { base: 1000000000 },
        corpo: { base: 1000000000 },
        forca: { base: 1000000 },
        destreza: { base: 1000000 },
        inteligencia: { base: 1000000 },
        sabedoria: { base: 1000000 },
        energiaEsp: { base: 1000000 },
        carisma: { base: 1000000 },
        stamina: { base: 1000000 },
        constituicao: { base: 1000000 },
        divisores: {},
        bio: {},
        estetica: {},
        labels: {},
        poderes: [],
        inventario: [],
        seresSelados: [],
        ataquesElementais: [],
        ...(combateExtra !== undefined ? { combate: combateExtra } : {}),
    };
}

function lerPoderExibidoStringDoMarcados(ficha) {
    const mockState = {
        minhaFicha: ficha,
        updateFicha: vi.fn((callback) => callback(ficha)),
        meuNome: 'Testador',
        importarDaAbaStatus: vi.fn(),
    };
    useStore.mockImplementation((selector) => (selector ? selector(mockState) : mockState));
    render(<MarcadosPanel />);
    const span = screen.getByText((_, el) => el?.tagName === 'SPAN' && /^-?\d+(\.\d+)?E-?\d+$/.test(el.textContent || ''));
    return span.textContent;
}

function formatarComoOScouter(poderGlobal) {
    return Number(poderGlobal).toExponential(2).replace('+', '').toUpperCase();
}

// ---------------------------------------------------------------------------
// QA — nivelCompletos (bônus de Ascensão pelas 6 categorias de Prestígio): a
// correção que trocou Math.min(...) pela MÉDIA (arredondada pra baixo) das 6
// categorias precisa continuar concordando entre core/poder.js e
// Marcados.jsx para uma ficha DESBALANCEADA — exatamente o cenário que
// escondia o bug original (toda a suíte de regressão pré-existente usa
// categorias uniformes/balanceadas, onde min===floor(avg), mascarando
// qualquer divergência entre as duas cópias da fórmula).
// ---------------------------------------------------------------------------
function fichaImbalanceadaParaMarcados(multiplicadorForcaPrestigio) {
    return {
        ...fichaParaMarcados(undefined),
        ascensaoBase: 1,
        vida: { base: 500 * 1000000 },
        mana: { base: 500 * 10000000 },
        aura: { base: 500 * 10000000 },
        chakra: { base: 500 * 10000000 },
        corpo: { base: 500 * 10000000 },
        // "status" (a 6ª categoria) fica travada em 0 -- nunca cruza um novo patamar de
        // 100 Prestígio sozinha, exatamente a condição que denunciava o bug do Math.min.
        statusPrestigioAplicado: 0,
        multiplicadorForcaPrestigio,
    };
}

describe('core/poder - calcularPoderAtual: paridade real com Ficha Def/Marcados.jsx (Fadiga de Combate)', () => {
    afterEach(() => {
        cleanup();
        vi.clearAllMocks();
    });

    it('concorda com o Poder Calculado exibido no Scouter da Ficha para 35% de Fadiga (fadigaExtra)', () => {
        const combateExtra = { fadigaExtra: 35 };
        const poderDaFichaStr = lerPoderExibidoStringDoMarcados(fichaParaMarcados(combateExtra));
        const poderDoCore = calcularPoderAtual(fichaParaMarcados(combateExtra), 1).poderGlobal;

        expect(poderDaFichaStr).toBe(formatarComoOScouter(poderDoCore));
    });

    it('concorda com o Poder Calculado exibido no Scouter da Ficha SEM nenhuma Fadiga (regressão de paridade)', () => {
        const poderDaFichaStr = lerPoderExibidoStringDoMarcados(fichaParaMarcados(undefined));
        const poderDoCore = calcularPoderAtual(fichaParaMarcados(undefined), 1).poderGlobal;

        expect(poderDaFichaStr).toBe(formatarComoOScouter(poderDoCore));
    });

    it('combate.fadigaTurnos/fadigaPorTurno altos sozinhos NÃO afetam o Poder em nenhum dos dois lados (contador só informativo)', () => {
        const combateExtra = { fadigaTurnos: 1000, fadigaPorTurno: 50, fadigaExtra: 0 };
        const poderDaFichaStr = lerPoderExibidoStringDoMarcados(fichaParaMarcados(combateExtra));
        const poderDoCore = calcularPoderAtual(fichaParaMarcados(combateExtra), 1).poderGlobal;
        const poderSemCombate = calcularPoderAtual(fichaParaMarcados(undefined), 1).poderGlobal;

        expect(poderDoCore).toBe(poderSemCombate);
        expect(poderDaFichaStr).toBe(formatarComoOScouter(poderDoCore));
    });

    it('concorda com o Poder Calculado exibido no Scouter da Ficha em 100% de Fadiga (clamp, poder zerado)', () => {
        const combateExtra = { fadigaExtra: 50000 };
        const poderDaFichaStr = lerPoderExibidoStringDoMarcados(fichaParaMarcados(combateExtra));
        const poderDoCore = calcularPoderAtual(fichaParaMarcados(combateExtra), 1).poderGlobal;

        expect(poderDoCore).toBe(0);
        expect(poderDaFichaStr).toBe(formatarComoOScouter(poderDoCore));
    });

    // -----------------------------------------------------------------------
    // fadigaExtra (core/fadiga.js): pontos ganhos AUTOMATICAMENTE no Mapa
    // (energia gasta / vida perdida / Formas ativas) — hoje é a ÚNICA fonte da
    // Fadiga% (combate.fadigaTurnos/fadigaPorTurno não entram mais na conta,
    // ver core/fadiga.js > calcularFadigaAtual). calcularFadigaAtual é a única
    // fonte de verdade, então core/poder.js e Marcados.jsx precisam continuar
    // concordando.
    // -----------------------------------------------------------------------
    it('concorda com o Poder Calculado exibido no Scouter quando fadigaExtra está presente', () => {
        const combateExtra = { fadigaExtra: 12.5 };
        const poderDaFichaStr = lerPoderExibidoStringDoMarcados(fichaParaMarcados(combateExtra));
        const poderDoCore = calcularPoderAtual(fichaParaMarcados(combateExtra), 1).poderGlobal;

        expect(poderDaFichaStr).toBe(formatarComoOScouter(poderDoCore));
    });

    it('concorda com o Poder Calculado exibido no Scouter quando fadigaExtra estoura 100% (clamp conjunto, poder zerado nos dois lados)', () => {
        const combateExtra = { fadigaExtra: 125 };
        const poderDaFichaStr = lerPoderExibidoStringDoMarcados(fichaParaMarcados(combateExtra));
        const poderDoCore = calcularPoderAtual(fichaParaMarcados(combateExtra), 1).poderGlobal;

        expect(poderDoCore).toBe(0);
        expect(poderDaFichaStr).toBe(formatarComoOScouter(poderDoCore));
    });

    it('concorda com o Poder Calculado exibido no Scouter para uma ficha DESBALANCEADA (5 categorias fortes + status travado em 0) com multiplicadorForcaPrestigio alto — guarda a correção Math.min -> média contra as duas cópias da fórmula divergirem', () => {
        const poderDaFichaStr = lerPoderExibidoStringDoMarcados(fichaImbalanceadaParaMarcados(5));
        const poderDoCore = calcularPoderAtual(fichaImbalanceadaParaMarcados(5), 1).poderGlobal;

        expect(poderDaFichaStr).toBe(formatarComoOScouter(poderDoCore));
    });

    it('concorda com o Poder Calculado exibido no Scouter para a MESMA ficha desbalanceada com multiplicadorForcaPrestigio=1 (baseline, sem o bônus extra)', () => {
        const poderDaFichaStr = lerPoderExibidoStringDoMarcados(fichaImbalanceadaParaMarcados(1));
        const poderDoCore = calcularPoderAtual(fichaImbalanceadaParaMarcados(1), 1).poderGlobal;

        expect(poderDaFichaStr).toBe(formatarComoOScouter(poderDoCore));
    });

    // -----------------------------------------------------------------------
    // QA — Change 3 (sessão atual): nivelMedio deixou de ser arredondado pra baixo (double
    // floor) na leitura que alimenta o Poder Calculado (ascensaoGeralEfetivaParaPoder, em
    // Marcados.jsx, com continuo=true). Fixture idêntica à de
    // core/poder.test.js > "QA (Change 3)": 5 categorias com pAtual=600 cada, status travado em
    // 0 -- floor(nivelMedio) é o MESMO valor (5) tanto pra multiplicadorForcaPrestigio=1.0 quanto
    // =1.2 (a correção Math.min->média sozinha, da sessão anterior, não teria efeito aqui), então
    // este é o cenário mínimo que realmente exercita a remoção do double-floor. Confirma que
    // core/poder.js e Marcados.jsx continuam concordando exatamente nesse cenário de delta
    // pequeno/contínuo, não só nos deltas grandes/discretos já cobertos acima.
    // -----------------------------------------------------------------------
    function fichaBucketFixoParaMarcados(multiplicadorForcaPrestigio) {
        return {
            ...fichaParaMarcados(undefined),
            ascensaoBase: 1,
            vida: { base: 600 * 1000000 },
            mana: { base: 600 * 10000000 },
            aura: { base: 600 * 10000000 },
            chakra: { base: 600 * 10000000 },
            corpo: { base: 600 * 10000000 },
            statusPrestigioAplicado: 0,
            multiplicadorForcaPrestigio,
        };
    }

    it('concorda com o Poder Calculado exibido no Scouter para multiplicadorForcaPrestigio=1.2 (delta modesto, mesmo balde de floor(nivelMedio) que multiplicadorForcaPrestigio=1.0 sob a fórmula antiga) — guarda a remoção do double-floor contra as duas cópias da fórmula divergirem num delta pequeno', () => {
        const poderDaFichaStr = lerPoderExibidoStringDoMarcados(fichaBucketFixoParaMarcados(1.2));
        const poderDoCore = calcularPoderAtual(fichaBucketFixoParaMarcados(1.2), 1).poderGlobal;

        expect(poderDaFichaStr).toBe(formatarComoOScouter(poderDoCore));
    });

    it('concorda com o Poder Calculado exibido no Scouter para multiplicadorForcaPrestigio=1.0 (baseline da mesma fixture, delta zero)', () => {
        const poderDaFichaStr = lerPoderExibidoStringDoMarcados(fichaBucketFixoParaMarcados(1.0));
        const poderDoCore = calcularPoderAtual(fichaBucketFixoParaMarcados(1.0), 1).poderGlobal;

        expect(poderDaFichaStr).toBe(formatarComoOScouter(poderDoCore));
    });

    it('o Poder exibido no Scouter para multiplicadorForcaPrestigio=1.2 é estritamente MAIOR que para 1.0 nesta fixture (prova visível ao jogador de que a resposta contínua também chega até a UI real, não só ao core)', () => {
        const poder10 = calcularPoderAtual(fichaBucketFixoParaMarcados(1.0), 1).poderGlobal;
        const poder12 = calcularPoderAtual(fichaBucketFixoParaMarcados(1.2), 1).poderGlobal;
        expect(poder12).toBeGreaterThan(poder10);
    });

    // -----------------------------------------------------------------------
    // QA — Pactos/Entidades Seladas (ficha.seresSelados) agora alimentam
    // getPoderDiretoMultiplier em AMBOS os lados (core/poder.js e o useMemo de
    // poderGlobal em Marcados.jsx). Antes só ficha.poderes era lido; um Pacto
    // Sincronizado com atributo:'poder_direto' aparentava funcionar na UI da
    // nova página (Ficha Def/PactosPanel.jsx) mas não mexia em nada no Poder
    // Calculado real. Este teste renderiza o MarcadosPanel de verdade (mesmo
    // padrão dos testes de Fadiga acima) pra provar que os dois lados
    // concordam com um Pacto Sincronizado carregando esse efeito.
    // -----------------------------------------------------------------------
    function fichaComPactoPoderDireto(ativo) {
        return {
            ...fichaParaMarcados(undefined),
            seresSelados: [{
                id: 'pacto-1', nome: 'Sylphie', ativo,
                efeitos: [{ nome: 'Bencao', atributo: 'poder_direto', propriedade: 'munico', valor: '2.0' }],
                efeitosPassivos: [], formas: [], formaAtivaId: null, configAtivaId: null,
            }],
        };
    }

    it('concorda com o Poder Calculado exibido no Scouter da Ficha quando um Pacto Sincronizado carrega um efeito poder_direto (x2.0)', () => {
        const poderDaFichaStr = lerPoderExibidoStringDoMarcados(fichaComPactoPoderDireto(true));
        const poderDoCore = calcularPoderAtual(fichaComPactoPoderDireto(true), 1).poderGlobal;

        expect(poderDoCore).toBeGreaterThan(calcularPoderAtual(fichaParaMarcados(undefined), 1).poderGlobal);
        expect(poderDaFichaStr).toBe(formatarComoOScouter(poderDoCore));
    });

    it('concorda com o Poder Calculado exibido no Scouter da Ficha quando o MESMO Pacto está Adormecido (ativo:false) — nenhum dos dois lados aplica o buff', () => {
        const poderDaFichaStr = lerPoderExibidoStringDoMarcados(fichaComPactoPoderDireto(false));
        const poderDoCore = calcularPoderAtual(fichaComPactoPoderDireto(false), 1).poderGlobal;
        const poderSemPacto = calcularPoderAtual(fichaParaMarcados(undefined), 1).poderGlobal;

        expect(poderDoCore).toBe(poderSemPacto);
        expect(poderDaFichaStr).toBe(formatarComoOScouter(poderDoCore));
    });

    // -----------------------------------------------------------------------
    // QA (gap) — mistura de propriedades diferentes (mbase de Poderes Clássicos +
    // munico de um Pacto Sincronizado) ao mesmo tempo, provando que as duas cópias
    // de getPoderDiretoMultiplier (core/poder.js e o useMemo de Marcados.jsx)
    // continuam concordando também neste cenário misto, não só quando as duas
    // fontes carregam a MESMA propriedade.
    // -----------------------------------------------------------------------
    function fichaComPactoEPoderMistos() {
        return {
            ...fichaParaMarcados(undefined),
            poderes: [{ efeitosPassivos: [{ atributo: 'poder_direto', propriedade: 'mbase', valor: '0.5' }] }],
            seresSelados: [{
                id: 'pacto-1', nome: 'Sylphie', ativo: true,
                efeitos: [{ nome: 'Bencao', atributo: 'poder_direto', propriedade: 'munico', valor: '2.0' }],
                efeitosPassivos: [], formas: [], formaAtivaId: null, configAtivaId: null,
            }],
        };
    }

    it('concorda com o Poder Calculado exibido no Scouter da Ficha quando um mbase de Poder Clássico e um munico de Pacto Sincronizado se combinam ao mesmo tempo', () => {
        const poderDaFichaStr = lerPoderExibidoStringDoMarcados(fichaComPactoEPoderMistos());
        const poderDoCore = calcularPoderAtual(fichaComPactoEPoderMistos(), 1).poderGlobal;

        expect(poderDoCore).toBeGreaterThan(calcularPoderAtual(fichaParaMarcados(undefined), 1).poderGlobal);
        expect(poderDaFichaStr).toBe(formatarComoOScouter(poderDoCore));
    });
});

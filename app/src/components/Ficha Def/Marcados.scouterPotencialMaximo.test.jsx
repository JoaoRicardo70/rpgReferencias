import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MarcadosPanel from './Marcados';
import useStore from '../../stores/useStore';

// ---------------------------------------------------------------------------
// QA — Scouter Holográfico (poderGlobal / vitalidadeGlobal) x
// construirFichaPotencialMaximo(ficha)
//
// Regra de Game Design corrigida: o número do Scouter Holográfico não pode
// oscilar quando o jogador liga/desliga poderes, itens do inventário ou
// pactos com Seres Selados — ele deve sempre refletir o POTENCIAL MÁXIMO
// (tudo que o personagem possui, como se estivesse tudo ativo). Isso é feito
// por um clone raso local `construirFichaPotencialMaximo(ficha)`, dentro do
// useMemo de poderGlobal/vitalidadeGlobal (Marcados.jsx, ~L134-146 e
// ~L669-715), que força `ativa`/`equipado`/`ativo` = true em poderes,
// inventario e seresSelados antes de alimentar safeGetMaximo /
// getGhostAscensionBonus / getEfetivoMFormas / getEfetivoDanoGlobal.
//
// `construirFichaPotencialMaximo` é uma const local, não exportada, dentro de
// um .jsx cheio de dependências de UI (React/Zustand/Firebase) — replicá-la
// isoladamente em um módulo à parte testaria uma CÓPIA da lógica, não a
// lógica real usada pelo componente. Seguindo o mesmo padrão já estabelecido
// em Marcados.forca.test.jsx e Marcados.multiplicadorForca.test.jsx (testes
// colocados ao lado de Marcados.jsx), validamos aqui renderizando o
// componente real e lendo o texto exibido no Scouter (e, em contraste, na
// barra "Poder:" de LinhaVital, que continua lendo a ficha real/toggled).
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    uploadImagem: vi.fn(),
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
}));

function fichaBase() {
    return {
        vida: { base: 0 }, mana: { base: 0 }, aura: { base: 0 }, chakra: { base: 0 }, corpo: { base: 0 },
        forca: { base: 0 }, destreza: { base: 0 }, inteligencia: { base: 0 }, sabedoria: { base: 0 },
        energiaEsp: { base: 0 }, carisma: { base: 0 }, stamina: { base: 0 }, constituicao: { base: 0 },
        divisores: {}, bio: {}, estetica: {}, labels: {},
    };
}

// `ligado` controla o estado real de toggle (ativa/equipado/ativo) dos três
// tipos de fonte de buff lidos por construirFichaPotencialMaximo. Cada fonte
// usa `efeitos` (não `efeitosPassivos`, que são sempre lidos independente de
// `ativa` em getBuffs — não serviriam para provar o fix) somando +900.000.000
// a vida/mana/aura respectivamente.
function fichaComFontesDeBuff(ligado) {
    const ficha = fichaBase();
    ficha.poderes = [{
        nome: 'Kaioken',
        ativa: ligado,
        efeitos: [{ atributo: 'vida', propriedade: 'base', valor: 900000000 }],
    }];
    ficha.inventario = [{
        nome: 'Espada Amaldiçoada',
        equipado: ligado,
        efeitos: [{ atributo: 'mana', propriedade: 'base', valor: 900000000 }],
    }];
    ficha.seresSelados = [{
        nome: 'Kurama',
        ativo: ligado,
        efeitos: [{ atributo: 'aura', propriedade: 'base', valor: 900000000 }],
    }];
    return ficha;
}

function montarMockUseStore(minhaFicha) {
    const mockState = {
        minhaFicha,
        updateFicha: vi.fn((callback) => callback(minhaFicha)),
        meuNome: 'Testador',
        importarDaAbaStatus: vi.fn(),
    };
    useStore.mockImplementation((selector) => (selector ? selector(mockState) : mockState));
    return mockState;
}

// O Scouter Holográfico fica na Página 1 (padrão de abertura do componente),
// dentro de um bloco identificado pelo nome do tema de supressão. Com
// supressaoPoder/limiteSupressao ausentes da ficha, o tema é sempre
// determinístico: "Poder Máximo (Liberto)" (getTemaScouter(100, 1)).
function lerScouter(container) {
    const nomeSpan = Array.from(container.querySelectorAll('span'))
        .find(s => s.textContent === 'Poder Máximo (Liberto)');
    if (!nomeSpan) throw new Error('Bloco do Scouter não encontrado (tema inesperado).');
    // nomeSpan -> linha do "ponto + nome do tema" -> coluna que também contém
    // a linha com os dois spans (número cósmico + notação exponencial).
    const outerCol = nomeSpan.parentElement.parentElement;
    const baselineRow = outerCol.children[1];
    const spans = baselineRow.querySelectorAll('span');
    return { cosmico: spans[0].textContent, exponencial: spans[1].textContent };
}

function lerGrauVital(container) {
    const label = Array.from(container.querySelectorAll('span'))
        .find(s => s.textContent === 'Grau Vital');
    if (!label) throw new Error('"Grau Vital" não encontrado.');
    return label.nextElementSibling.textContent.trim();
}

// Badge "Poder: X" ao lado do label "Vida (HP)" em LinhaVital — usa a ficha
// REAL/toggled (não o clone de potencial máximo), continuando reativa ao
// estado de ativa/equipado/ativo.
function lerPoderBadgeVida() {
    const labelInput = screen.getByDisplayValue('Vida (HP)');
    const headerRow = labelInput.closest('div').parentElement;
    return headerRow.children[1].textContent;
}

describe('Marcados — Scouter Holográfico (poderGlobal/vitalidadeGlobal) lê potencial máximo via construirFichaPotencialMaximo', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        window.alert = vi.fn();
    });

    afterEach(() => {
        cleanup();
    });

    it('poder/item/pacto DESLIGADOS (ativa/equipado/ativo=false): Scouter ainda soma os efeitos (potencial máximo), diferente da leitura "sem nenhuma fonte de buff"', () => {
        const fichaDesligada = fichaComFontesDeBuff(false);
        montarMockUseStore(fichaDesligada);
        const { container } = render(<MarcadosPanel />);

        const scouterDesligado = lerScouter(container);
        const grauDesligado = lerGrauVital(container);

        // trueAvg = (vida[9e8+ghost1e8] + mana[9e8+ghost1e9] + aura[9e8+ghost1e9]
        //   + chakra[ghost1e9] + corpo[ghost1e9] + valStatus[1e5]) / 6 = 1.133.350.000
        expect(scouterDesligado.exponencial).toBe('1.13E9');
        expect(grauDesligado).toBe('V2');

        cleanup();

        const fichaSemFontes = fichaBase(); // sem poderes/inventario/seresSelados
        montarMockUseStore(fichaSemFontes);
        const { container: containerSemFontes } = render(<MarcadosPanel />);

        const scouterSemFontes = lerScouter(containerSemFontes);
        const grauSemFontes = lerGrauVital(containerSemFontes);

        // trueAvg = (ghost1e8 + ghost1e9 + ghost1e9 + ghost1e9 + ghost1e9 + 1e5) / 6
        //   = 683.350.000 — nitidamente menor que o caso com as 3 fontes desligadas.
        expect(scouterSemFontes.exponencial).toBe('6.83E8');
        expect(grauSemFontes).toBe('V1');

        expect(scouterDesligado.exponencial).not.toBe(scouterSemFontes.exponencial);
    });

    it('Scouter mostra o MESMO valor com as fontes de buff LIGADAS e DESLIGADAS (não oscila com o toggle real)', () => {
        montarMockUseStore(fichaComFontesDeBuff(false));
        const { container: containerOff } = render(<MarcadosPanel />);
        const scouterOff = lerScouter(containerOff);
        const grauOff = lerGrauVital(containerOff);
        cleanup();

        montarMockUseStore(fichaComFontesDeBuff(true));
        const { container: containerOn } = render(<MarcadosPanel />);
        const scouterOn = lerScouter(containerOn);
        const grauOn = lerGrauVital(containerOn);

        expect(scouterOff.exponencial).toBe('1.13E9');
        expect(scouterOn.exponencial).toBe('1.13E9');
        expect(scouterOff.exponencial).toBe(scouterOn.exponencial);
        expect(scouterOff.cosmico).toBe(scouterOn.cosmico);
        expect(grauOff).toBe('V2');
        expect(grauOn).toBe('V2');
    });

    it('em contraste com o Scouter: a barra "Poder:" de Vida (LinhaVital, ficha real/toggled) MUDA entre ligado e desligado — só o Scouter é blindado', () => {
        montarMockUseStore(fichaComFontesDeBuff(false));
        const { container: containerOff } = render(<MarcadosPanel />);
        const badgeVidaOff = lerPoderBadgeVida();
        const scouterOff = lerScouter(containerOff);
        cleanup();

        montarMockUseStore(fichaComFontesDeBuff(true));
        const { container: containerOn } = render(<MarcadosPanel />);
        const badgeVidaOn = lerPoderBadgeVida();
        const scouterOn = lerScouter(containerOn);

        // LinhaVital usa a ficha real: com o poder desligado, vida.base efetivo
        // não recebe o buff (+900.000.000) — badge muda entre os dois estados.
        expect(badgeVidaOff).not.toBe(badgeVidaOn);
        // O Scouter, alimentado pelo clone de potencial máximo, não muda.
        expect(scouterOff.exponencial).toBe(scouterOn.exponencial);
    });

    it('construirFichaPotencialMaximo não muta a ficha original: ativa/equipado/ativo continuam false no objeto original após a renderização', () => {
        const ficha = fichaComFontesDeBuff(false);
        const poderOriginal = ficha.poderes[0];
        const itemOriginal = ficha.inventario[0];
        const serOriginal = ficha.seresSelados[0];

        montarMockUseStore(ficha);
        render(<MarcadosPanel />);

        expect(ficha.poderes[0]).toBe(poderOriginal);
        expect(ficha.inventario[0]).toBe(itemOriginal);
        expect(ficha.seresSelados[0]).toBe(serOriginal);
        expect(poderOriginal.ativa).toBe(false);
        expect(itemOriginal.equipado).toBe(false);
        expect(serOriginal.ativo).toBe(false);
    });

    it('ficha sem poderes/inventario/seresSelados (chaves ausentes) não lança erro e o Scouter cai no potencial "sem fontes de buff"', () => {
        const ficha = fichaBase(); // poderes/inventario/seresSelados undefined
        montarMockUseStore(ficha);

        expect(() => render(<MarcadosPanel />)).not.toThrow();

        const { container } = render(<MarcadosPanel />);
        const scouter = lerScouter(container);
        expect(scouter.exponencial).toBe('6.83E8');
    });

    it('elementos nulos dentro de poderes/inventario/seresSelados não lançam erro (clone raso preserva null)', () => {
        const ficha = fichaBase();
        ficha.poderes = [null, { nome: 'Kaioken', ativa: false, efeitos: [{ atributo: 'vida', propriedade: 'base', valor: 900000000 }] }];
        ficha.inventario = [null];
        ficha.seresSelados = [null];
        montarMockUseStore(ficha);

        expect(() => render(<MarcadosPanel />)).not.toThrow();
    });
});

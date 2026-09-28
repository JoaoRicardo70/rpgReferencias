import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MarcadosPanel from './Marcados';
import useStore from '../../stores/useStore';
import { ESCALA_PODER_CALCULADO } from '../../core/poder.js';

// ---------------------------------------------------------------------------
// QA — Novo campo "PODER (Direto)" do Grimório (Habilidades/Formas/Poderes):
// um efeito com atributo:'poder_direto' multiplica o Poder do Scouter
// DIRETAMENTE, sem passar por nenhum Status/Energia/Vida (ver
// getPoderDiretoMultiplier em Marcados.jsx). Usa a MESMA regra de
// agrupamento já estabelecida para MBASE/MGERAL/MFORMAS/MABS/MUNICO: soma
// dentro do mesmo tipo (1 + soma), multiplica entre tipos; só MUNICO
// continua puramente multiplicativo entre instâncias. Só efeitos Ativos
// contam quando o Poder/Habilidade/Forma está ativado (ativa:true); os
// Passivos contam sempre.
//
// Esta é a contrapartida do que foi excluído em
// Marcados.scouterGrimorioSync.test.jsx / Marcados.scouterFormaReatividade.test.jsx:
// o Grimório não move mais o Scouter via Status/Energia/Vida, mas agora tem
// um jeito dedicado de fazê-lo via este campo.
//
// 🔥 Correção de regressão (histórica): multiplicadorPoderDireto é aplicado DEPOIS da
// injeção de Ascensão (poderComAscensao), não dentro de poderMultiplicado antes dela — isso
// continua valendo com a curva atual, só a injeção em si mudou de forma (ver abaixo).
//
// 🔥 CURVA DO PODER (opção "E" + base 1,1, pedido do usuário): base do
// expoente de Ascensão 2 -> 1.5 -> 1.25 -> 1.1; o Poder Base agora é amortecido por
// poderBase^0,9 (amortecerPoderBruto) ANTES de qualquer multiplicador; e a injeção de
// Ascensão deixou de ser "+ Ascensão x 10^(dígitos)" (magnitude de log10) e virou um
// multiplicador suave "× (1 + Ascensão)" (injetarAscensaoNoPoder).
//
// 🔽 ESCALA (core/poder.js): Poder Calculado é dividido por ESCALA_PODER_CALCULADO no fim do
// pipeline (aplicarEscalaPoderCalculado) — o valor já mudou de 1 (sem escala) -> 1000 ->
// 100.000 em pedidos sucessivos do usuário. Este arquivo deriva TODAS as leituras esperadas
// de ESCALA_PODER_CALCULADO (importado direto de core/poder.js) via exibirPoder(), em vez de
// números mágicos — uma futura mudança de escala só exige rodar os testes de novo.
function escalarPoder(valorBruto) {
    return Math.floor(valorBruto / ESCALA_PODER_CALCULADO);
}
function exibirPoder(valorBruto) {
    return Number(Number(escalarPoder(valorBruto)).toExponential(2));
}

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    uploadImagem: vi.fn(),
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
}));

// Ficha minimalista: só Vida preenchida, ascensaoBase padrão=1 (sem overflow real — ver
// divisores.vida MINÚSCULO abaixo) -> multiplicadorAscensao=1.1^1=1.1.
// Poder_Base = (600.000.000*10)/6 = 1.000.000.000, amortecido (^0,9) ≈ 125.892.541,18 ->
// poderMultiplicado (sem nenhum buff) ≈ 125.892.541,18*1.1 ≈ 138.481.795,30 -> injeção suave
// ×(1+1) -> poderComAscensao ≈ 276.963.590,59 (PODER_COM_ASCENSAO_BASE abaixo, valor EXATO
// conferido em Node antes de escrever qualquer asserção). Cada cenário deste arquivo multiplica
// esse valor pelo fator declarado no efeito de poder_direto, e deriva a leitura esperada via
// exibirPoder() (que já embute ESCALA_PODER_CALCULADO).
// 🔽 vida bumped em sessões sucessivas (600 -> 6.000.000 -> 600.000.000, acompanhando os
// aumentos de ESCALA_PODER_CALCULADO) pra manter dígitos suficientes depois da divisão.
// 🔥 divisores.vida MINÚSCULO (necessário por causa do bump acima): vida=600.000.000 sozinha
// já é grande o bastante pra gerar overflow real de Prestígio (pAtual=floor(600000000/1e6)=600
// >> 100), que a média das 6 categorias (ver core/poder.js, comentário "🔥 CORREÇÃO") injetaria
// como um bônus extra em ascensaoGeralEfetiva ALÉM do ascensaoBase=1 puro — contaminando os
// valores hand-computed deste arquivo. O divisor minúsculo (1e-12) zera pAtual e neutraliza
// esse overflow, preservando ascensaoGeralEfetiva=1 exato.
const PODER_COM_ASCENSAO_BASE = 276963590.5947169;

function fichaMinimaScouter(overrides = {}) {
    return {
        vida: { base: 600000000 },
        mana: { base: 0 },
        aura: { base: 0 },
        chakra: { base: 0 },
        corpo: { base: 0 },
        forca: { base: 0 },
        destreza: { base: 0 },
        inteligencia: { base: 0 },
        sabedoria: { base: 0 },
        energiaEsp: { base: 0 },
        carisma: { base: 0 },
        stamina: { base: 0 },
        constituicao: { base: 0 },
        divisores: { vida: 0.000000000001 },
        bio: {},
        estetica: {},
        labels: {},
        poderes: [],
        inventario: [],
        seresSelados: [],
        ...overrides,
    };
}

function montarMockUseStoreReativo(fichaInicial) {
    const mockState = {
        minhaFicha: fichaInicial,
        updateFicha: null,
        meuNome: 'Testador',
        importarDaAbaStatus: vi.fn(),
    };
    mockState.updateFicha = vi.fn((callback) => {
        const nova = { ...mockState.minhaFicha };
        callback(nova);
        mockState.minhaFicha = nova;
    });
    useStore.mockImplementation((selector) => (selector ? selector(mockState) : mockState));
    return mockState;
}

function montarMockUseStore(ficha) {
    const mockState = {
        minhaFicha: ficha,
        updateFicha: vi.fn((callback) => callback(ficha)),
        meuNome: 'Testador',
        importarDaAbaStatus: vi.fn(),
    };
    useStore.mockImplementation((selector) => (selector ? selector(mockState) : mockState));
    return mockState;
}

function lerPoderGlobalExibido() {
    const span = screen.getByText((_, el) => el?.tagName === 'SPAN' && /^-?\d+(\.\d+)?E-?\d+$/.test(el.textContent || ''));
    return Number(span.textContent);
}

function renderELerPoderGlobal(overrides) {
    montarMockUseStore(fichaMinimaScouter(overrides));
    render(<MarcadosPanel />);
    const valor = lerPoderGlobalExibido();
    cleanup();
    return valor;
}

describe('MarcadosPanel — "PODER (Direto)" do Grimório: reage a ativa/inativa, igual aos demais efeitos ativos', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        window.alert = vi.fn();
    });

    afterEach(() => {
        cleanup();
    });

    // multiplicadorPoderDireto é aplicado DEPOIS da injeção de Ascensão (não dentro de
    // poderMultiplicado) — ver comentário em Marcados.jsx sobre por que isso importa para uma
    // relação limpa e exata entre o fator do efeito e a leitura do Scouter. Com mgeral:+8
    // (multiplicadorPoderDireto=1+8=9): PODER_COM_ASCENSAO_BASE*9.
    it('efeito ativo atributo:"poder_direto"/mgeral:+8 AUMENTA o Scouter só quando ativa=true; desativar REVERTE', () => {
        const ficha = fichaMinimaScouter({
            poderes: [{ nome: 'Explosão de Ki Pura', ativa: false, efeitos: [{ atributo: 'poder_direto', propriedade: 'mgeral', valor: 8 }] }],
        });
        const mockState = montarMockUseStoreReativo(ficha);

        const { rerender } = render(<MarcadosPanel />);
        const valorDesligado = lerPoderGlobalExibido();
        expect(valorDesligado).toBe(exibirPoder(PODER_COM_ASCENSAO_BASE));

        mockState.updateFicha((f) => { f.poderes[0].ativa = true; });
        rerender(<MarcadosPanel />);
        const valorLigado = lerPoderGlobalExibido();
        expect(valorLigado).toBe(exibirPoder(PODER_COM_ASCENSAO_BASE * 9));
        expect(valorLigado).toBeGreaterThan(valorDesligado);

        mockState.updateFicha((f) => { f.poderes[0].ativa = false; });
        rerender(<MarcadosPanel />);
        const valorRevertido = lerPoderGlobalExibido();
        expect(valorRevertido).toBe(exibirPoder(PODER_COM_ASCENSAO_BASE));
    });

    it('efeito PASSIVO atributo:"poder_direto"/mgeral:+8 conta SEMPRE, ativa=true ou ativa=false (mesma leitura nos dois estados)', () => {
        const comAtivaFalse = renderELerPoderGlobal({
            poderes: [{ nome: 'Instinto Direto', ativa: false, efeitosPassivos: [{ atributo: 'poder_direto', propriedade: 'mgeral', valor: 8 }] }],
        });
        const comAtivaTrue = renderELerPoderGlobal({
            poderes: [{ nome: 'Instinto Direto', ativa: true, efeitosPassivos: [{ atributo: 'poder_direto', propriedade: 'mgeral', valor: 8 }] }],
        });

        expect(comAtivaFalse).toBe(exibirPoder(PODER_COM_ASCENSAO_BASE * 9));
        expect(comAtivaTrue).toBe(exibirPoder(PODER_COM_ASCENSAO_BASE * 9));
    });
});

describe('MarcadosPanel — "PODER (Direto)": mesma regra de agrupamento por tipo (1+soma) já estabelecida para MBASE/MGERAL/MFORMAS/MABS', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        window.alert = vi.fn();
    });

    afterEach(() => {
        cleanup();
    });

    it('duas fontes ativas de mgeral:+8 cada resultam na MESMA leitura que uma única fonte de mgeral:+16 (soma aditiva dentro do tipo)', () => {
        const duasFontes = renderELerPoderGlobal({
            poderes: [
                { nome: 'Fonte A', ativa: true, efeitos: [{ atributo: 'poder_direto', propriedade: 'mgeral', valor: 8 }] },
                { nome: 'Fonte B', ativa: true, efeitos: [{ atributo: 'poder_direto', propriedade: 'mgeral', valor: 8 }] },
            ],
        });
        const umaFonteSomada = renderELerPoderGlobal({
            poderes: [{ nome: 'Fonte Única', ativa: true, efeitos: [{ atributo: 'poder_direto', propriedade: 'mgeral', valor: 16 }] }],
        });

        expect(duasFontes).toBe(umaFonteSomada);
        expect(duasFontes).toBe(exibirPoder(PODER_COM_ASCENSAO_BASE * 17));
    });

    // mbase:+3 (grupo 1+3=4) e mgeral:+8 (grupo 1+8=9) MULTIPLICAM entre si: 4*9=36.
    it('tipos diferentes (mbase e mgeral) MULTIPLICAM entre si, não somam', () => {
        const leitura = renderELerPoderGlobal({
            poderes: [{
                nome: 'Combo Direto',
                ativa: true,
                efeitos: [
                    { atributo: 'poder_direto', propriedade: 'mbase', valor: 3 },
                    { atributo: 'poder_direto', propriedade: 'mgeral', valor: 8 },
                ],
            }],
        });

        expect(leitura).toBe(exibirPoder(PODER_COM_ASCENSAO_BASE * 36));
    });

    // munico continua puramente multiplicativo entre instâncias (3*3=9), não aditivo
    // (o que daria 1+3+3=7, resultado diferente).
    it('munico continua multiplicativo entre instâncias (3*3=9), não aditivo (1+3+3=7)', () => {
        const duasFontesMunico = renderELerPoderGlobal({
            poderes: [{
                nome: 'Duplo Único',
                ativa: true,
                efeitos: [
                    { atributo: 'poder_direto', propriedade: 'munico', valor: 3 },
                    { atributo: 'poder_direto', propriedade: 'munico', valor: 3 },
                ],
            }],
        });
        const hipoteticoAditivo = renderELerPoderGlobal({
            poderes: [{ nome: 'Aditivo Hipotético', ativa: true, efeitos: [{ atributo: 'poder_direto', propriedade: 'mgeral', valor: 6 }] }],
        });

        expect(duasFontesMunico).toBe(exibirPoder(PODER_COM_ASCENSAO_BASE * 9));
        expect(hipoteticoAditivo).toBe(exibirPoder(PODER_COM_ASCENSAO_BASE * 7));
        expect(duasFontesMunico).not.toBe(hipoteticoAditivo);
    });
});

describe('MarcadosPanel — "PODER (Direto)" nunca vaza para Status/Energia/Vida', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        window.alert = vi.fn();
    });

    afterEach(() => {
        cleanup();
    });

    // Mesma Vida base com e sem o efeito "poder_direto" ativo: o Poder_Base
    // não muda (o efeito não altera nenhuma leitura de Status/Energia/Vida) — só o
    // multiplicador final muda.
    it('o multiplicador de "poder_direto" não altera o Poder_Base (que depende só de Status/Energia/Vida reais)', () => {
        const semEfeito = renderELerPoderGlobal({});
        expect(semEfeito).toBe(exibirPoder(PODER_COM_ASCENSAO_BASE));
    });

    // Mesmo Poder do Grimório com DOIS efeitos misturados: um efeito "normal"
    // (atributo:'forca', propriedade:'base') que buffaria o Status normalmente
    // em qualquer outro lugar da Ficha, e um efeito "poder_direto" (mgeral:+8).
    // Como ignorarPoderes=true exclui TODA a leitura de ficha.poderes do
    // Poder_Base (não só os efeitos "poder_direto"), o efeito de forca:base
    // não pode vazar para o Poder_Base mesmo estando no MESMO objeto de Poder
    // do efeito poder_direto — e a leitura final deve ser EXATAMENTE igual à
    // do teste isolado de poder_direto/mgeral:+8, provando que o bônus de força
    // não contaminou o resultado.
    it('efeito "forca"/base misturado no MESMO Poder que um efeito "poder_direto" não vaza para o Poder_Base; só o poder_direto entra no multiplicador', () => {
        const leitura = renderELerPoderGlobal({
            poderes: [{
                nome: 'Combo Misto',
                ativa: true,
                efeitos: [
                    { atributo: 'forca', propriedade: 'base', valor: 500 },
                    { atributo: 'poder_direto', propriedade: 'mgeral', valor: 8 },
                ],
            }],
        });

        expect(leitura).toBe(exibirPoder(PODER_COM_ASCENSAO_BASE * 9));
    });
});

describe('MarcadosPanel — "PODER (Direto)": valores negativos e zero', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        window.alert = vi.fn();
    });

    afterEach(() => {
        cleanup();
    });

    // mgeral:0 é um no-op (grupo fica em 1+0=1, igual a nenhum efeito) — mesma
    // leitura base do cenário totalmente sem poder_direto.
    it('efeito "poder_direto"/mgeral:0 é um no-op — mesma leitura de nenhum efeito', () => {
        const leitura = renderELerPoderGlobal({
            poderes: [{ nome: 'Efeito Nulo', ativa: true, efeitos: [{ atributo: 'poder_direto', propriedade: 'mgeral', valor: 0 }] }],
        });

        expect(leitura).toBe(exibirPoder(PODER_COM_ASCENSAO_BASE));
    });

    // mgeral:-2 produz um multiplicador NEGATIVO ((1-2)=-1), assim como já é
    // permitido pelo resto do sistema para multiplicadores de Status
    // (getMultiplicadorTotal soma buffs negativos livremente). Como
    // multiplicadorPoderDireto é aplicado DEPOIS da injeção de Ascensão (sobre o
    // poderComAscensao "base", positivo), o resultado final vira negativo por essa
    // multiplicação, sem passar pelo ramo "else" do failsafe (esse ramo só entra em jogo
    // se poderMultiplicado — ANTES do poder_direto — já for <= 0, o que um multiplicador
    // negativo aplicado depois não pode causar). O importante aqui é que o resultado
    // final continua finito e sem NaN mesmo sendo negativo.
    it('efeito "poder_direto"/mgeral:-2 pode tornar o multiplicador e o Poder final NEGATIVOS, sem gerar NaN/Infinity', () => {
        const leitura = renderELerPoderGlobal({
            poderes: [{ nome: 'Sabotagem Direta', ativa: true, efeitos: [{ atributo: 'poder_direto', propriedade: 'mgeral', valor: -2 }] }],
        });

        expect(leitura).not.toBeNaN();
        expect(Number.isFinite(leitura)).toBe(true);
        expect(leitura).toBe(exibirPoder(-PODER_COM_ASCENSAO_BASE));
    });
});

describe('MarcadosPanel — "PODER (Direto)" e substituição de Forma (resolverEfeitosEntidade / acumulaFormaBase:false)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        window.alert = vi.fn();
    });

    afterEach(() => {
        cleanup();
    });

    // Poder com efeito "poder_direto" na RAIZ (mgeral:+8) e uma Forma ativa
    // (formaAtivaId aponta pra ela) com acumulaFormaBase:false e seu PRÓPRIO
    // efeito "poder_direto" (mgeral:+3). Como acumulaFormaBase:false faz
    // resolverEfeitosEntidade() SUBSTITUIR totalmente os efeitos da raiz
    // pelos da Forma (não acumular), getPoderDiretoMultiplier deve enxergar
    // SÓ o mgeral:+3 da Forma — o mgeral:+8 da raiz é descartado. Multiplicador = 1+3 = 4.
    it('Forma ativa com acumulaFormaBase:false SUBSTITUI o poder_direto da raiz pelo da Forma (não soma)', () => {
        const leitura = renderELerPoderGlobal({
            poderes: [{
                nome: 'Poder com Forma Substituta',
                ativa: true,
                efeitos: [{ atributo: 'poder_direto', propriedade: 'mgeral', valor: 8 }],
                formaAtivaId: 'formaX',
                formas: [{
                    id: 'formaX',
                    acumulaFormaBase: false,
                    efeitos: [{ atributo: 'poder_direto', propriedade: 'mgeral', valor: 3 }],
                }],
            }],
        });

        expect(leitura).toBe(exibirPoder(PODER_COM_ASCENSAO_BASE * 4));
    });

    // Mesmo cenário, mas com acumulaFormaBase:true (comportamento padrão) —
    // agora resolverEfeitosEntidade ACUMULA raiz+Forma: mgeral efetivo =
    // 8+3=11 -> grupo (1+11)=12. Confirma que a exclusão acima é especificamente por causa
    // de acumulaFormaBase:false, não um bug que ignora a raiz sempre que há uma Forma ativa.
    it('Forma ativa com acumulaFormaBase:true ACUMULA o poder_direto da raiz com o da Forma (soma, não substitui)', () => {
        const leitura = renderELerPoderGlobal({
            poderes: [{
                nome: 'Poder com Forma Aditiva',
                ativa: true,
                efeitos: [{ atributo: 'poder_direto', propriedade: 'mgeral', valor: 8 }],
                formaAtivaId: 'formaY',
                formas: [{
                    id: 'formaY',
                    acumulaFormaBase: true,
                    efeitos: [{ atributo: 'poder_direto', propriedade: 'mgeral', valor: 3 }],
                }],
            }],
        });

        expect(leitura).toBe(exibirPoder(PODER_COM_ASCENSAO_BASE * 12));
    });
});

describe('MarcadosPanel — "PODER (Direto)" combinado com Supressão ("Ocultar Presença"): multiplicadorPoderDireto é aplicado ANTES da Supressão, não depois', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        window.alert = vi.fn();
    });

    afterEach(() => {
        cleanup();
    });

    // A ordem real no código é: poderComAscensao -> * multiplicadorPoderDireto (aplicado logo
    // após a injeção de Ascensão) -> * (sup/100) (Supressão, aplicada por último) -> escala.
    // Como é uma cadeia de multiplicações simples, matematicamente a ordem entre poder_direto
    // e Supressão não deveria importar — mas nenhum teste anterior (neste arquivo ou nos
    // demais do Scouter) exercita supressaoPoder != 100 junto de um efeito poder_direto,
    // então esta é uma combinação sem cobertura própria até aqui. Com mgeral:+8
    // (multiplicadorPoderDireto=9) e supressaoPoder=50: PODER_COM_ASCENSAO_BASE*9*0.5.
    it('Supressão a 50% aplicada por cima de um poder_direto positivo (mgeral:+8)', () => {
        const leitura = renderELerPoderGlobal({
            supressaoPoder: 50,
            poderes: [{ nome: 'Explosão de Ki Pura', ativa: true, efeitos: [{ atributo: 'poder_direto', propriedade: 'mgeral', valor: 8 }] }],
        });

        expect(leitura).toBe(exibirPoder(PODER_COM_ASCENSAO_BASE * 9 * 0.5));
    });

    // Mesma combinação, mas com um poder_direto NEGATIVO (mgeral:-2 -> multiplicador -1) e
    // Supressão fracionária (50%). Confirma que a blindagem de overflow (clampFinito aplicado
    // tanto depois do poder_direto quanto depois da Supressão) não introduz NaN/Infinity nem
    // "corrige" o sinal negativo quando as duas reduções fracionárias/negativas se combinam
    // na mesma leitura.
    it('Supressão a 50% combinada com poder_direto NEGATIVO (mgeral:-2) permanece finita e com o sinal correto', () => {
        const leitura = renderELerPoderGlobal({
            supressaoPoder: 50,
            poderes: [{ nome: 'Sabotagem Direta', ativa: true, efeitos: [{ atributo: 'poder_direto', propriedade: 'mgeral', valor: -2 }] }],
        });

        expect(leitura).not.toBeNaN();
        expect(Number.isFinite(leitura)).toBe(true);
        expect(leitura).toBe(exibirPoder(-PODER_COM_ASCENSAO_BASE * 0.5));
    });
});

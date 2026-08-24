import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MarcadosPanel from './Marcados';
import useStore from '../../stores/useStore';

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
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    uploadImagem: vi.fn(),
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
}));

// Ficha minimalista: só Vida preenchida, ascensaoBase padrão=1 (sem overflow,
// já que as demais 5 categorias ficam zeradas) -> multiplicadorAscensao=2^1=2.
// Poder_Base = (600*10)/6 = 1000 -> poderMultiplicado (sem nenhum buff) =
// 1000*2 = 2000 -> magnitude=3 -> poderComAscensao = 2000 + 1*10^4 = 12000.
function fichaMinimaScouter(overrides = {}) {
    return {
        vida: { base: 600 },
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
        divisores: {},
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

    // poderMultiplicado = 1000*2*9 (multiplicadorPoderDireto=1+8=9) = 18000,
    // magnitude = floor(log10(18000)) = 4, poderComAscensao = 18000+1*10^5 = 118000.
    it('efeito ativo atributo:"poder_direto"/mgeral:+8 AUMENTA o Scouter só quando ativa=true; desativar REVERTE', () => {
        const ficha = fichaMinimaScouter({
            poderes: [{ nome: 'Explosão de Ki Pura', ativa: false, efeitos: [{ atributo: 'poder_direto', propriedade: 'mgeral', valor: 8 }] }],
        });
        const mockState = montarMockUseStoreReativo(ficha);

        const { rerender } = render(<MarcadosPanel />);
        const valorDesligado = lerPoderGlobalExibido();
        expect(valorDesligado).toBe(12000);

        mockState.updateFicha((f) => { f.poderes[0].ativa = true; });
        rerender(<MarcadosPanel />);
        const valorLigado = lerPoderGlobalExibido();
        expect(valorLigado).toBe(118000);
        expect(valorLigado).toBeGreaterThan(valorDesligado);

        mockState.updateFicha((f) => { f.poderes[0].ativa = false; });
        rerender(<MarcadosPanel />);
        const valorRevertido = lerPoderGlobalExibido();
        expect(valorRevertido).toBe(12000);
    });

    it('efeito PASSIVO atributo:"poder_direto"/mgeral:+8 conta SEMPRE, ativa=true ou ativa=false (mesma leitura 118000 nos dois estados)', () => {
        const comAtivaFalse = renderELerPoderGlobal({
            poderes: [{ nome: 'Instinto Direto', ativa: false, efeitosPassivos: [{ atributo: 'poder_direto', propriedade: 'mgeral', valor: 8 }] }],
        });
        const comAtivaTrue = renderELerPoderGlobal({
            poderes: [{ nome: 'Instinto Direto', ativa: true, efeitosPassivos: [{ atributo: 'poder_direto', propriedade: 'mgeral', valor: 8 }] }],
        });

        expect(comAtivaFalse).toBe(118000);
        expect(comAtivaTrue).toBe(118000);
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
    });

    // mbase:+3 (grupo 1+3=4) e mgeral:+8 (grupo 1+8=9) MULTIPLICAM entre si: 4*9=36.
    // poderMultiplicado = 1000*2*36 = 72000, magnitude=4, poderComAscensao = 72000+100000 = 172000.
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

        expect(leitura).toBe(172000);
    });

    // munico continua puramente multiplicativo entre instâncias (3*3=9), não aditivo
    // (o que daria 1+3+3=7, resultado diferente). poderMultiplicado = 1000*2*9=18000,
    // magnitude=4, poderComAscensao=18000+100000=118000 — mesma leitura de mgeral:+8
    // isolado (coincidência numérica esperada: (1+8)=9=3*3), mas comparado abaixo
    // contra o hipotético aditivo (1+3+3=7 -> 114000) para provar que é multiplicativo.
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

        expect(duasFontesMunico).toBe(118000);
        expect(hipoteticoAditivo).toBe(114000);
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

    // Mesma Vida base (600) com e sem o efeito "poder_direto" ativo: o Poder_Base
    // continua 1000 nos dois casos (o efeito não altera nenhuma leitura de Status/
    // Energia/Vida) — só o multiplicador final muda.
    it('o multiplicador de "poder_direto" não altera o Poder_Base (que depende só de Status/Energia/Vida reais)', () => {
        const semEfeito = renderELerPoderGlobal({});
        expect(semEfeito).toBe(12000);
    });

    // Mesmo Poder do Grimório com DOIS efeitos misturados: um efeito "normal"
    // (atributo:'forca', propriedade:'base') que buffaria o Status normalmente
    // em qualquer outro lugar da Ficha, e um efeito "poder_direto" (mgeral:+8).
    // Como ignorarPoderes=true exclui TODA a leitura de ficha.poderes do
    // Poder_Base (não só os efeitos "poder_direto"), o efeito de forca:base
    // não pode vazar para o Poder_Base mesmo estando no MESMO objeto de Poder
    // do efeito poder_direto — e a leitura final deve ser EXATAMENTE igual à
    // do teste isolado de poder_direto/mgeral:+8 (118000), provando que o
    // bônus de força não contaminou o resultado.
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

        expect(leitura).toBe(118000);
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
    // leitura base (12000) do cenário totalmente sem poder_direto.
    it('efeito "poder_direto"/mgeral:0 é um no-op — mesma leitura de nenhum efeito (12000)', () => {
        const leitura = renderELerPoderGlobal({
            poderes: [{ nome: 'Efeito Nulo', ativa: true, efeitos: [{ atributo: 'poder_direto', propriedade: 'mgeral', valor: 0 }] }],
        });

        expect(leitura).toBe(12000);
    });

    // mgeral:-2 produz um multiplicador NEGATIVO ((1-2)=-1), assim como já é
    // permitido pelo resto do sistema para multiplicadores de Status
    // (getMultiplicadorTotal soma buffs negativos livremente). O Poder final
    // vira negativo (poderMultiplicado = 1000*2*(-1) = -2000 <= 0), o que
    // força o ramo "else" do failsafe de log10 (mesma lógica documentada em
    // Marcados.scouterGrimorioSync.test.jsx): poderComAscensao =
    // ascensaoSegura*10 + poderMultiplicado = 1*10 + (-2000) = -1990.
    it('efeito "poder_direto"/mgeral:-2 pode tornar o multiplicador e o Poder final NEGATIVOS, sem gerar NaN/Infinity (ramo else do failsafe)', () => {
        const leitura = renderELerPoderGlobal({
            poderes: [{ nome: 'Sabotagem Direta', ativa: true, efeitos: [{ atributo: 'poder_direto', propriedade: 'mgeral', valor: -2 }] }],
        });

        expect(leitura).not.toBeNaN();
        expect(Number.isFinite(leitura)).toBe(true);
        expect(leitura).toBe(-1990);
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
    // SÓ o mgeral:+3 da Forma — o mgeral:+8 da raiz é descartado. Multiplicador
    // = 1+3 = 4 -> poderMultiplicado = 1000*2*4 = 8000 -> magnitude=3 ->
    // poderComAscensao = 8000 + 1*10^4 = 18000.
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

        expect(leitura).toBe(18000);
    });

    // Mesmo cenário, mas com acumulaFormaBase:true (comportamento padrão) —
    // agora resolverEfeitosEntidade ACUMULA raiz+Forma: mgeral efetivo =
    // 8+3=11 -> grupo (1+11)=12 -> poderMultiplicado = 1000*2*12 = 24000 ->
    // magnitude=4 -> poderComAscensao = 24000 + 1*10^5 = 124000. Confirma que
    // a exclusão acima é especificamente por causa de acumulaFormaBase:false,
    // não um bug que ignora a raiz sempre que há uma Forma ativa.
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

        expect(leitura).toBe(124000);
    });
});

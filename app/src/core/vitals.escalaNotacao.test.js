import { describe, it, expect } from 'vitest';
import { getMaximo, getMaximoSemFormas } from './attributes.js';
import { capturarMaximosAtuais, rescalarVitaisProporcional } from './vitals.js';

// ---------------------------------------------------------------------------
// QA — REGRESSÃO DEFINITIVA do bug "ativar/desativar Formas drena Energia" (5ª e última causa
// raiz encontrada, depois de 4 tentativas anteriores que corrigiam sintomas reais mas não a causa
// de verdade que o jogador estava vendo na tela).
//
// A causa real: "atual" é guardado já na ESCALA DE EXIBIÇÃO comprimida (calcVitalScale/
// mxDisplay), a MESMA notação que StatusSubComponents.jsx/Marcados.jsx/DiarioNPC.jsx usam pra
// mostrar o valor na tela — não no valor bruto de getMaximo. Quando um toggle de Forma empurra o
// máximo bruto através de uma fronteira de dígitos (o limiar que dispara a compressão de
// notação), a escala de exibição muda MESMO QUE O MÁXIMO BRUTO TENHA CRESCIDO — e os componentes
// de exibição, recalculando a escala do zero a cada render, truncavam "atual" (nunca alterado no
// dado bruto) pra caber no novo teto exibido, que podia ser MUITO menor. Nem convertendo "atual"
// pra nova notação (4ª tentativa) resolvia de verdade: a conversão preservava a quantidade
// absoluta, mas o NÚMERO exibido na tela ainda caía (ex.: 90.000.000 -> 9.000.000), e não existe
// nenhum indicador de "casa decimal" na UI pra avisar o jogador que só a notação mudou.
//
// A correção definitiva (5ª rodada): quem decide a ESCALA DE NOTAÇÃO (p) nunca mais é o máximo
// completo — é o máximo ESTÁVEL (getMaximoSemFormas, com o multiplicador de Formas travado fora).
// O máximo COMPLETO (com Formas) continua sendo o numerador do valor exibido. Ativar/desativar uma
// Forma pura nunca muda "p" (o estável não mudou), então o teto exibido só CRESCE ou volta ao
// normal — nunca "pula" de notação e aparenta encolher.
// ---------------------------------------------------------------------------

// Réplica EXATA da lógica de exibição de StatusSubComponents.jsx/Marcados.jsx/DiarioNPC.jsx —
// simula o que o jogador REALMENTE vê na tela, não só o dado bruto armazenado.
function calcVitalScaleLocal(rawMx, key, rawMxParaEscala = rawMx) {
    if (!rawMx || rawMx <= 0) return { p: 0, mxDisplay: 0 };
    const limit = (key === 'vida' || key === 'pv' || key === 'pm') ? 8 : 9;
    const baseEscala = (rawMxParaEscala && rawMxParaEscala > 0) ? rawMxParaEscala : rawMx;
    const strMx = Math.floor(baseEscala).toString();
    const p = Math.max(0, strMx.length - limit);
    const mxDisplay = p > 0 ? Math.floor(rawMx / Math.pow(10, p)) : Math.floor(rawMx);
    return { p, mxDisplay };
}
function oQueOJogadorVe(ficha, key) {
    const rawMx = getMaximo(ficha, key);
    const rawMxEstavel = getMaximoSemFormas(ficha, key);
    const { mxDisplay } = calcVitalScaleLocal(rawMx, key, rawMxEstavel);
    let atual = ficha[key]?.atual ?? mxDisplay;
    if (atual > mxDisplay) atual = mxDisplay;
    return atual;
}

function simulaToggle(ficha, mutarFn, vitais) {
    const oldM = capturarMaximosAtuais(ficha, vitais);
    mutarFn(ficha);
    rescalarVitaisProporcional(ficha, oldM, vitais);
}

describe('core/vitals - REGRESSÃO: mudança de escala de notação (calcVitalScale) ao cruzar fronteira de dígitos', () => {
    it('BUG REAL: ativar uma Forma que empurra o máximo de vida de 8 pra 9 dígitos (cruza a fronteira de compressão) NÃO derruba o valor exibido na tela', () => {
        const ficha = {
            vida: { base: 99999999, atual: 90000000, mFormas: 1.0 }, // 8 dígitos, sem compressão (p=0)
            forca: { base: 100 },
            poderes: [{ id: 'p1', categoria: 'forma', ativa: false, nome: 'Modo Vida',
                efeitos: [{ atributo: 'vida', propriedade: 'mformas', valor: 2 }] }], // empurra pra 9 dígitos
            inventario: [], passivas: [], seresSelados: [], combate: {}
        };

        const rawAntes = getMaximo(ficha, 'vida');
        const exibidoAntes = oQueOJogadorVe(ficha, 'vida');

        simulaToggle(ficha, f => { f.poderes[0].ativa = true; }, ['vida']);

        const rawDepois = getMaximo(ficha, 'vida');
        const exibidoDepois = oQueOJogadorVe(ficha, 'vida');

        expect(rawDepois).toBeGreaterThan(rawAntes); // máximo bruto realmente cresceu
        // O valor exibido não pode cair por causa da mudança de notação — ativar uma Forma que só
        // AUMENTA o máximo nunca deveria fazer a energia exibida cair.
        expect(exibidoDepois).toBeGreaterThanOrEqual(exibidoAntes * 0.99);
    });

    it('CICLO COMPLETO com cruzamento de escala: ativar (cruza fronteira) e desativar de volta preserva a MESMA quantidade exibida no final', () => {
        const ficha = {
            vida: { base: 99999999, atual: 90000000, mFormas: 1.0 },
            forca: { base: 100 },
            poderes: [{ id: 'p1', categoria: 'forma', ativa: false, nome: 'Modo Vida',
                efeitos: [{ atributo: 'vida', propriedade: 'mformas', valor: 2 }] }],
            inventario: [], passivas: [], seresSelados: [], combate: {}
        };

        const exibidoInicial = oQueOJogadorVe(ficha, 'vida');

        simulaToggle(ficha, f => { f.poderes[0].ativa = true; }, ['vida']);
        simulaToggle(ficha, f => { f.poderes[0].ativa = false; }, ['vida']);

        const exibidoFinal = oQueOJogadorVe(ficha, 'vida');
        expect(exibidoFinal).toBe(exibidoInicial);
    });

    it('uma Forma que empurra o máximo COMPLETO através de uma fronteira de dígitos NÃO muda mais a escala de notação (só o máximo ESTÁVEL decide isso)', () => {
        const ficha = {
            mana: { base: 999999999, atual: 500000000, mFormas: 1.0 }, // mana: limite=9, 9 dígitos exatos -> p=0
            forca: { base: 100 },
            poderes: [{ id: 'p1', categoria: 'forma', ativa: false, nome: 'Modo Mana',
                efeitos: [{ atributo: 'mana', propriedade: 'mformas', valor: 10 }] }], // empurraria pra 10 dígitos no máximo COMPLETO
            inventario: [], passivas: [], seresSelados: [], combate: {}
        };

        simulaToggle(ficha, f => { f.poderes[0].ativa = true; }, ['mana']);

        const rawMaxCompletoDepois = getMaximo(ficha, 'mana');
        const rawMaxEstavelDepois = getMaximoSemFormas(ficha, 'mana');
        expect(rawMaxCompletoDepois).toBeGreaterThan(rawMaxEstavelDepois); // a Forma de fato infla o completo...
        expect(rawMaxEstavelDepois).toBe(999999999); // ...mas o estável (sem Formas) nunca muda

        const { p: pDepois } = calcVitalScaleLocal(rawMaxCompletoDepois, 'mana', rawMaxEstavelDepois);
        expect(pDepois).toBe(0); // escala decidida pelo estável -> nunca cruza fronteira só por causa da Forma
        expect(ficha.mana.atual).toBe(500000000); // "atual" nunca é tocado por um toggle puro de Forma
    });

    it('uma mudança ESTÁVEL de verdade (ex.: Prestígio/base crescendo, sem nenhuma Forma envolvida) que cruza uma fronteira de dígitos CONVERTE "atual" pra nova escala, preservando a quantidade ABSOLUTA', () => {
        const ficha = {
            mana: { base: 999999999, atual: 500000000, mFormas: 1.0 }, // limite=9, 9 dígitos exatos -> p=0
            forca: { base: 100 },
            poderes: [], inventario: [], passivas: [], seresSelados: [], combate: {}
        };

        const rawEquivalenteAntes = ficha.mana.atual; // p=0, então atual já é raw-equivalente

        // Simula um crescimento ESTÁVEL de verdade (não uma Forma) empurrando o base pra 10 dígitos.
        simulaToggle(ficha, f => { f.mana.base = 9999999990; }, ['mana']);

        const rawMaxEstavelDepois = getMaximoSemFormas(ficha, 'mana');
        const { p: pDepois } = calcVitalScaleLocal(getMaximo(ficha, 'mana'), 'mana', rawMaxEstavelDepois);
        expect(pDepois).toBe(1); // confirma que a escala realmente mudou neste cenário (crescimento estável)

        // atual (na nova escala, p=1) * 10^1 deve reconstituir a MESMA quantidade raw-equivalente
        // de antes (dentro da margem de floor de calcVitalScale).
        const rawEquivalenteDepois = ficha.mana.atual * Math.pow(10, pDepois);
        expect(rawEquivalenteDepois).toBeCloseTo(rawEquivalenteAntes, -1); // tolerância de arredondamento de notação
    });

    it('sem cruzar fronteira de dígitos (números pequenos, sem compressão), comportamento idêntico ao já validado nas rodadas anteriores', () => {
        const ficha = { vida: { base: 100, atual: 80, mFormas: 1 }, forca: { base: 100 },
            poderes: [], inventario: [], passivas: [], seresSelados: [], combate: {} };
        simulaToggle(ficha, f => { f.vida.mFormas = 2; }, ['vida']); // 100 -> 200, sem cruzar fronteira
        expect(ficha.vida.atual).toBe(80); // continua exatamente igual, sem conversão de notação
    });

    it('desativar (máximo genuinamente encolhe, mesma escala) continua clampando exatamente no novo teto, nunca abaixo dele', () => {
        const ficha = { vida: { base: 100, atual: 200, mFormas: 2 }, forca: { base: 100 },
            poderes: [], inventario: [], passivas: [], seresSelados: [], combate: {} };
        simulaToggle(ficha, f => { f.vida.mFormas = 1; }, ['vida']); // 200 -> 100
        expect(ficha.vida.atual).toBe(100);
    });

    it('DUAS vitais cruzando fronteiras de dígitos DIFERENTES no mesmo toggle não se contaminam — cada uma usa seu próprio p/mxDisplay, isolada da outra', () => {
        const ficha = {
            // vida: limite=8. 99.999.999 (8 dígitos) -> ativar a Forma dobra pra 9 dígitos.
            vida: { base: 99999999, atual: 90000000, mFormas: 1.0 },
            // mana: limite=9. 999.999.999 (9 dígitos) -> ativar a MESMA Forma dobra pra 10 dígitos.
            mana: { base: 999999999, atual: 500000000, mFormas: 1.0 },
            forca: { base: 100 },
            poderes: [{ id: 'p1', categoria: 'forma', ativa: false, nome: 'Modo Duplo',
                efeitos: [
                    { atributo: 'vida', propriedade: 'mformas', valor: 2 },
                    { atributo: 'mana', propriedade: 'mformas', valor: 2 },
                ] }],
            inventario: [], passivas: [], seresSelados: [], combate: {}
        };

        const exibidoVidaAntes = oQueOJogadorVe(ficha, 'vida');
        const exibidoManaAntes = oQueOJogadorVe(ficha, 'mana');

        simulaToggle(ficha, f => { f.poderes[0].ativa = true; }, ['vida', 'mana']);

        const exibidoVidaDepois = oQueOJogadorVe(ficha, 'vida');
        const exibidoManaDepois = oQueOJogadorVe(ficha, 'mana');

        // Nenhuma das duas cai por causa da mudança de notação, cada uma na sua própria escala.
        expect(exibidoVidaDepois).toBeGreaterThanOrEqual(exibidoVidaAntes * 0.99);
        expect(exibidoManaDepois).toBeGreaterThanOrEqual(exibidoManaAntes * 0.99);

        simulaToggle(ficha, f => { f.poderes[0].ativa = false; }, ['vida', 'mana']);

        // Ciclo completo (ativar+desativar) preserva a quantidade exibida final de AMBAS.
        expect(oQueOJogadorVe(ficha, 'vida')).toBe(exibidoVidaAntes);
        expect(oQueOJogadorVe(ficha, 'mana')).toBe(exibidoManaAntes);
    });

    it('getMaximoSemFormas nunca lança e retorna 0 pra uma ficha vazia/sem o vital (fallback seguro pro cálculo de escala)', () => {
        expect(() => getMaximoSemFormas(null, 'vida')).not.toThrow();
        expect(getMaximoSemFormas(null, 'vida')).toBe(0);
        expect(getMaximoSemFormas({}, 'vida')).toBe(0);
        expect(getMaximoSemFormas({ vida: {} }, 'vida')).toBeGreaterThanOrEqual(0);
    });

    it('rescalarVitaisProporcional não lança e não altera nada quando a ficha é null/undefined', () => {
        expect(() => rescalarVitaisProporcional(null, {}, ['vida'])).not.toThrow();
        expect(() => rescalarVitaisProporcional(undefined, {}, ['vida'])).not.toThrow();
    });
});
